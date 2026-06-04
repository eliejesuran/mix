# ULT.MIX

Suivi score + mixité ultimate frisbee mixte. Fichier unique `index.html` — HTML/CSS/JS vanilla, aucun bundler. Seule dépendance externe : xlsx.full.min.js (CDN) pour l'export Excel.

Déployé sur GitHub Pages (`main`) et Infomaniak (statique). UI en français.

## State

```js
const state = {
  scoreA, scoreB,
  lineOverride,   // 'F'|'M' — décalage séquence ABBA (offset 0 ou 2)
  pt:  { FF, MM, FM, MF, dropF, dropM, incF, incM, stallF, stallM }, // point en cours
  tot: { FF, MM, FM, MF, dropF, dropM, incF, incM, stallF, stallM }, // cumulatif
  lastPass, pointLog, actionLog
}
let receiver = null; // 'F'|'M'|null — lanceur courant, hors state
```

`state` est le seul objet mutable. Toute action appelle `render()` en fin. `render()` est idempotent : relit `state` entièrement, ne jamais muter le DOM ailleurs.

## Invariants critiques

**ABBA** : `ABBA_SEQ[( totalPoints + (lineOverride==='M' ? 2 : 0) ) % 4]` → `['F','M','M','F']`

**Undo** : appeler `pushUndo()` avant toute mutation de `state` (max 50 snapshots, Ctrl+Z déclenche `undo()`).

**Receiver** : déduit de la dernière passe — FF/MF → receiver=F, MM/FM → receiver=M. Filtre les boutons via `.dim`. Remis à null après chaque point.

**Save** : `saveSession()` auto sur chaque point marqué. Sur passes/erreurs, indicateur "non sauvegardé" uniquement.

## Fonctions clés

| Fonction | Rôle |
|---|---|
| `addPass(type)` | incrémente pt+tot, met à jour receiver, marque non-sauvegardé |
| `addPoint(team)` | enregistre pointLog, remet pt à zéro, auto-save |
| `removePoint(team)` | pop pointLog, décrémente score |
| `addError(type)` | incrémente pt+tot, reset receiver |
| `forceLine(g)` | toggle lineOverride F/M |
| `copySessionLink()` | encode state en base64 → `?s=<payload>` |
| `loadFromURL()` | décode `?s=` au chargement |
| `saveSession()` / `loadSession()` | localStorage `ult_mix_score` |
| `exportXLSX()` | 3 feuilles : Résumé / Points / Journal |

## Bugs connus

### ~~Critique~~ ✓ Corrigé
~~**`loadFromURL()` n'est jamais appelée**~~ — Init remplacé par `if (!loadFromURL()) loadSession();`.

### Mineurs
- **Wake lock non demandé au chargement initial** — `requestWakeLock()` n'est déclenchée que sur `visibilitychange`, pas au premier chargement. Fix : appeler `requestWakeLock()` dans Init.
- **`recordPoint` : champ `errors` inutile** — `errors: { ...state.pt }` est une copie de `pt` identique à `passes`. Le champ `errors` n'est jamais lu (l'export XLSX lit tout depuis `pt.passes`). C'est de la donnée morte.
- **`forceLine` peut mettre `lineOverride` à `null`** — toggle sur le bouton déjà actif → `null`, qui est fonctionnellement identique à `'F'` dans `abbaLine` mais n'active aucun bouton dans l'UI. Comportement visuellement trompeur.
- **`removePoint` ne restaure pas `pt`** — après `-1`, `pt` est à 0 (remis à zéro par `addPoint`). Le bouton `-1` est une correction de score, pas un vrai undo : préférer Ctrl+Z. Documenter ce comportement si c'est intentionnel.
- ~~**`receiver` non propagé en session live**~~ ✓ corrigé — `receiver` ajouté au payload `syncToServer` et restauré dans `ws.onmessage` via `'receiver' in snap ? snap.receiver : receiver` (préserve `null`).

## Robustesse — pistes d'amélioration

- **Pas de versioning du state** — si le schéma de `state` évolue, un `localStorage` ancien peut corrompre silencieusement l'app. Ajouter un champ `version` dans le snap et migrer à `loadSession`.
- **localStorage sans gestion d'erreur de quota** — `localStorage.setItem` peut lever une exception `QuotaExceededError` (limite 5 Mo). Entourer `saveSession()` d'un try/catch avec fallback.
- **`loadSession` / `loadFromURL` : `Object.assign` superficiel** — si un snapshot est incomplet (clé manquante dans `pt`/`tot`), les valeurs manquantes restent `undefined` et créent des `NaN` silencieux dans les stats. Ajouter une normalisation (`snap.state.pt = { ...defaultPt, ...snap.state.pt }`).
- **`copySessionLink` inclut `actionLog`** — le journal complet est dans le payload URL, ce qui fait exploser la taille pour les longs matchs. Exclure `actionLog` du partage URL (il est déjà dans l'export XLSX).
- **Dépendance CDN unique** — si cdnjs est indisponible, l'export XLSX est silencieusement cassé. Ajouter un guard `if (typeof XLSX === 'undefined') { alert(...); return; }` dans `exportXLSX`.
- **`render()` interroge le DOM à chaque action** — acceptable pour l'instant, mais si le pointLog devient long, `renderLog()` reconstruit tout le HTML à chaque passe. Optimisation possible : ne mettre à jour `renderLog` que quand `pointLog` change.

## Conventions de nommage

| Préfixe | Usage |
|---|---|
| `pt-` | IDs compteurs par point (`pt-FF`, `pt-dropF`…) |
| `tot-` | IDs totaux cumulés (`tot-FF`…) |
| `st-` | IDs stats globales (`st-total`, `st-pct`…) |
| `bf-` / `bv-` | IDs barres de progression (fill / value) |
| `btn` | Boutons nommés (`btnF`, `btnM`, `btnUndo`…) |
| `lbl` | Labels équipe (`lblA`, `lblB`) |

Types de passes : `FF` `MM` `FM` `MF` — Erreurs : `dropF` `dropM` `incF` `incM` `stallF` `stallM` — Genres : `'F'` filles, `'M'` garçons

## TODO

- **Multi-match** : bouton pour copier/envoyer la session ; vérifier le fonctionnement sur mobile

## Partage de session

**Problème actuel** : `?s=` encode `state` complet (actionLog inclus) en base64 → URL très longue, snapshot figé, pas de QR.

**v1.5 — fix rapide (sans serveur)**
- Exclure `actionLog` du payload → réduction ×5
- LZ-String (CDN) pour compresser le JSON avant base64 → −60 % supplémentaire
- QR code client-side via qrcode.js (CDN)

**v2 — live sync (implémenté, à déployer)**  
Serveur : `server/server.js` — Node.js WebSocket relay, sans base de données, déployable sur Render (Free tier).

Configurer `SERVER_URL` dans `index.html` après déploiement :
```js
const SERVER_URL = 'https://ultmix-relay.onrender.com'; // à remplacer
```

Flux :
1. Scoreur A clique "Lien session" → `POST /room` → room `abc123` → `?room=abc123`
2. QR code généré (via api.qrserver.com) + URL copiée dans le presse-papier
3. Scoreur B scanne → `connectToRoom('abc123')` → reçoit l'état courant via WS
4. Chaque `render()` appelle `syncToServer()` → broadcast aux autres clients de la room
5. Anti-boucle : flag `isRemoteUpdate` bloque le re-sync sur réception
6. Reconnexion auto : `ws.onclose` retente toutes les 3s si `currentRoom` est défini
7. Badge "● abc123" dans l'UI indique la connexion live ; clic ré-ouvre le QR

Déploiement Render :
- New Web Service → repo GitHub → Root Directory : `server`
- Build command : `npm install` — Start command : `node server.js`
- Free tier suffisant (le serveur reste éveillé pendant le match)
