# ULT.MIX

Score + mixité ultimate frisbee mixte. `index.html` unique — HTML/CSS/JS vanilla, aucun bundler.
CDN : xlsx.full.min.js, api.qrserver.com. Déployé GitHub Pages + Infomaniak (GH Actions FTP). UI FR.

## Directives Claude

- **Vérifier le code deux fois** avant de proposer ou appliquer un changement.
- **Valider par batterie de tests** : après chaque modification, tester les cas nominaux, edge cases et régressions.
- **Commits sans Co-authored-by** — jamais de mention Claude/Anthropic dans les commits.
- **Token-efficient** : réponses courtes, pas de récapitulatif inutile, pas de commentaires évidents.

## State

```js
const state = {
  scoreA, scoreB,
  lineOverride,   // 'F'|'M' — offset ABBA (0 ou 2)
  pt:  { FF, MM, FM, MF, dropF, dropM, incF, incM, stallF, stallM }, // point en cours
  tot: { FF, MM, FM, MF, dropF, dropM, incF, incM, stallF, stallM }, // cumulatif
  lastPass, pointLog, actionLog
}
let receiver = null; // 'F'|'M'|null — hors state
```

`state` = seul objet mutable. Toute action → `render()` en fin. `render()` idempotent.

## Invariants

**ABBA** : `ABBA_SEQ[(totalPoints + (lineOverride==='M' ? 2 : 0)) % 4]` → `['F','M','M','F']`

**Passes** : 1er clic (receiver=null) = init disque (pas de passe). Suivants = `passBall(dest)` → déduit `receiver+dest`, incrémente `pt`+`tot`, `receiver=dest`.

**Undo** : `pushUndo()` avant toute mutation (max 50, Ctrl+Z).

**Save** : auto sur point marqué. Passes/erreurs → indicateur "non sauvegardé".

## Fonctions clés

| Fn | Rôle |
|---|---|
| `passBall(dest)` | 1er: init receiver. Suivants: type+incr pt+tot |
| `addPoint(team)` | snapshot pointLog, reset pt, auto-save |
| `removePoint(team)` | pop pointLog, décrémente score (préférer Ctrl+Z) |
| `addError(type)` | incrémente pt+tot, receiver=null |
| `forceLine(g)` | toggle lineOverride F/M |
| `copySessionLink()` | crée room Render → QR + URL |
| `loadFromURL()` | décode `?s=` au chargement |
| `saveSession()` / `loadSession()` | localStorage `ult_mix_score` |
| `exportXLSX()` | 3 feuilles : Résumé / Points / Journal |

## Live sync (Render)

`server/server.js` — WebSocket relay. `SERVER_URL` dans `index.html`.
- `POST /room` → room 6-char, expire `createdAt + 24h`
- `WS /ws?room=id` → last-write-wins, ping absorbé, `4010`=expiré, `4004`=inconnu
- `syncToServer()` en fin de `render()` (bloqué par `isRemoteUpdate` + `awaitingInitialSync`), ping/10min
- `receiver` inclus dans payload sync
- `connectToRoom(roomId, asCreator)` : créateur pousse son état ; rejoignant attend le snapshot serveur (fallback push 1.5s) — évite l'écrasement par état vide

Déploiement Render : Root Dir `server` → `node server.js`

## Déploiement Infomaniak

`.github/workflows/deploy-infomaniak.yml` — push `main` si `index.html` modifié.
Secrets : `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD`, `FTP_PATH`.

## Nommage

`pt-toF/toM` passes agrégées (FF+MF / FM+MM) · `pt-dropF` erreurs · `st-` stats globales · `bf-/bv-` barres
Passes : `FF` `MM` `FM` `MF` · Erreurs : `dropF` `dropM` `incF` `incM` `stallF` `stallM`

## Bugs & améliorations (index)

### Corrigés
| ID | Fix |
|---|---|
| ~~B0~~ | `forceLine` → jamais null, retombe sur `'F'` |
| ~~B1~~ | `recordPoint.errors` — champ mort supprimé |
| ~~B2~~ | `removePoint` — soustrait passes du point annulé de `tot` via `removed.passes` |
| ~~B3~~ | `loadFromURL` jamais appelée — init `if (!loadFromURL()) loadSession()` |
| ~~B4~~ | `receiver` non propagé en live — inclus dans payload sync |
| ~~B5~~ | Versioning state — `STATE_VERSION=1` + `applySnap()` normalise avec `DEFAULT_COUNTERS` |
| ~~R4~~ | Refresh live propre — `connectToRoom(_, asCreator)` + garde `awaitingInitialSync` : le rejoignant n'écrase plus la partie |
| ~~R5~~ | File d'événements `enqueueAction()` — clics sérialisés, erreur d'une action isolée (try/catch) |
| ~~U5~~ | Scan QR via jsQR (CDN jsDelivr) — `startQRScan/stopQRScan/onQRDecoded`, rejoint via `?room=` |
| ~~R6~~ | Activation robuste boutons jeu — délégation `pointerup` (primaire) + `click` (repli clavier), dédup par `_tapTs` ; tap comptée même si le click est droppé |
| ~~B6~~ | Nom d'équipe — `commitFields()` sur `onchange`/`onblur` : refresh label + `saveSession` + `syncToServer` |
| ~~U6~~ | Zoom double-tap supprimé — `button { touch-action: manipulation }` (pinch-zoom conservé) |
| ~~R1~~ | `saveSession` — try/catch `QuotaExceededError` : pas de crash, indicateur « Sauvegarde impossible » |
| ~~R2~~ (=B7) | Garde CDN xlsx — `if (typeof XLSX === 'undefined')` → alert + return dans `exportXLSX` |
| ~~R3~~ | `forceLine` set explicite (déjà en place) + normalisation `applySnap` : `lineOverride` ∈ {F,M}, jamais null |
| ~~U3~~ | Haptic — `navigator.vibrate(30)` sur point marqué (`_addPoint`) |
| ~~U7~~ | Bouton scan compact en mobile — `#btnScan { flex: 0 0 auto }` (icône seule, ne s'étire plus) |

### Robustesse ouverts
| ID | Bug |
|---|---|
| — | (aucun ouvert) |

### UX ouverts
| ID | Amélioration |
|---|---|
| U1 | Indication visuelle "Qui commence ?" tant que receiver=null |
| U2 | Tooltip sur bouton Gender F présélectionné |
| U4 | Multi-match : export/import session JSON |

### Infra ouverts
| ID | Amélioration |
|---|---|
| I1 | Render cold start : keep-alive externe (UptimeRobot `/ping` /14min) |
| I2 | `copySessionLink` fallback : exclure `actionLog` du `?s=` (URL trop longue) |
| I3 | Persistance room : Redis/KV Cloudflare si Render redémarre |
