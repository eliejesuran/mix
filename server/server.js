const { WebSocketServer } = require('ws');
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const ROOM_TTL = 24 * 3600 * 1000; // 24h strictes

// rooms: Map<id, { clients: Set<ws>, snapshot: object|null, createdAt: number, at: number }>
const rooms = new Map();

function genId() { return crypto.randomBytes(3).toString('hex'); } // 6-char hex

function isExpired(room) { return Date.now() - room.createdAt > ROOM_TTL; }

// Purge toutes les rooms expirées toutes les heures, ferme les connexions actives
setInterval(() => {
  for (const [id, r] of rooms) {
    if (isExpired(r)) {
      for (const c of r.clients) c.close(4010, 'Room expired');
      rooms.delete(id);
    }
  }
}, 3600000);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pong');
    return;
  }

  if (req.method === 'POST' && req.url === '/room') {
    const id = genId();
    const createdAt = Date.now();
    rooms.set(id, { clients: new Set(), snapshot: null, createdAt, at: createdAt });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ roomId: id, expiresAt: createdAt + ROOM_TTL }));
    return;
  }

  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const roomId = new URL(req.url, 'http://x').searchParams.get('room');

  if (!roomId || !rooms.has(roomId)) {
    ws.close(4004, 'Room not found'); return;
  }

  const room = rooms.get(roomId);

  // Refuser la connexion si la room est expirée
  if (isExpired(room)) {
    ws.close(4010, 'Room expired');
    rooms.delete(roomId);
    return;
  }

  room.clients.add(ws);

  // Envoyer le dernier snapshot au nouvel arrivant
  if (room.snapshot) {
    ws.send(JSON.stringify({ type: 'sync', payload: room.snapshot }));
  }

  // Envoyer le TTL restant pour que le client puisse avertir l'utilisateur
  ws.send(JSON.stringify({
    type: 'ttl',
    expiresAt: room.createdAt + ROOM_TTL
  }));

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'ping') return; // keep-alive, rien à faire
      if (msg.type !== 'sync') return;
      room.snapshot = msg.payload;
      room.at = Date.now();
      for (const c of room.clients)
        if (c !== ws && c.readyState === 1)
          c.send(JSON.stringify({ type: 'sync', payload: room.snapshot }));
    } catch {}
  });

  ws.on('close', () => room.clients.delete(ws));
  ws.on('error', () => ws.close());
});

server.listen(PORT, () => console.log(`ULT.MIX relay running on :${PORT}`));
