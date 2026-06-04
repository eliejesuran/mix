const { WebSocketServer } = require('ws');
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;

// rooms: Map<id, { clients: Set<ws>, snapshot: object|null, at: number }>
const rooms = new Map();

function genId() { return crypto.randomBytes(3).toString('hex'); } // 6-char hex

// Purge empty rooms older than 24h
setInterval(() => {
  const cutoff = Date.now() - 86400000;
  for (const [id, r] of rooms)
    if (!r.clients.size && r.at < cutoff) rooms.delete(id);
}, 3600000);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check (also prevents Render free tier cold start if pinged)
  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pong');
    return;
  }

  // Create room
  if (req.method === 'POST' && req.url === '/room') {
    const id = genId();
    rooms.set(id, { clients: new Set(), snapshot: null, at: Date.now() });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ roomId: id }));
    return;
  }

  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const roomId = new URL(req.url, 'http://x').searchParams.get('room');
  if (!roomId || !rooms.has(roomId)) {
    ws.close(4004, 'Room not found');
    return;
  }

  const room = rooms.get(roomId);
  room.clients.add(ws);

  // Send last known snapshot to newcomer
  if (room.snapshot) {
    ws.send(JSON.stringify({ type: 'sync', payload: room.snapshot }));
  }

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type !== 'sync') return;
      room.snapshot = msg.payload;
      room.at = Date.now();
      // Broadcast to all OTHER clients in room
      for (const c of room.clients)
        if (c !== ws && c.readyState === 1)
          c.send(JSON.stringify({ type: 'sync', payload: room.snapshot }));
    } catch {}
  });

  ws.on('close', () => room.clients.delete(ws));
  ws.on('error', () => ws.close());
});

server.listen(PORT, () => console.log(`ULT.MIX relay running on :${PORT}`));
