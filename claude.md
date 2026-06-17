# ULT.MIX

Suivi score + mixité ultimate frisbee mixte. `index.html` unique — HTML/CSS/JS vanilla, aucun bundler.
Dépendances CDN : xlsx.full.min.js (export Excel), api.qrserver.com (QR code).
Déployé sur GitHub Pages (`main`) et Infomaniak (via GitHub Actions FTP). UI en français.

## State

```js
const state = {
  scoreA, scoreB,
  lineOverride,   // 'F'|'M' — décalage ABBA (offset 0 ou 2)
  pt:  { FF, MM, FM, MF, dropF, dropM, incF, incM, stallF, stallM }, // point en cours
  tot: { FF, MM, FM, MF, dropF, dropM, incF, incM, stallF, stallM }, // cumulatif
  lastPass, pointLog, actionLog
}
let receiver = null; // 'F'|'M'|null — qui a le disque actuellement, hors state
```

`state` est le seul objet mutable. Toute action appelle `render()` en fin. `render()` est idempotent.

## Invariants critiques

**ABBA** : `ABBA_SEQ[( totalPoints + (lineOverride==='M' ? 2 : 0) ) % 4]` → `['F','M','M','F']`

**Passes** : 2 boutons `→ F` / `→ M`. Premier clic du point (receiver=null) = initialise qui a le disque (pas de passe comptée). Clics suivants = `passBall(dest)` déduit le type `receiver+dest` (`FF`|`FM`|`MF`|`MM`), incrémente `pt`+`tot`, met à jour `receiver=dest`.

**Undo** : `pushUndo()` avant toute mutation de `state` (max 50 snapshots, Ctrl+Z).

**Save** : `saveSession()` auto sur chaque point marqué. Passes/erreurs → indicateur "non sauvegardé".

## Fonctions clés

| Fonction | Rôle |
|---|---|
| `passBall(dest)` | 1er clic: init receiver. Suivants: déduit type, incrémente pt+tot |
| `addPoint(team)` | snapshot pointLog, reset pt, auto-save |
| `removePoint(team)` | pop pointLog, décrémente score (pas de restore pt — préférer Ctrl+Z) |
| `addError(type)` | incrémente pt+tot, reset receiver à null |
| `forceLine(g)` | toggle lineOverride F/M (null si toggle off → bug visuel, voir ci-dessous) |
| `copySessionLink()` | crée room Render → QR + URL |
| `loadFromURL()` | décode `?s=` au chargement (fallback sans SERVER_URL) |
| `saveSession()` / `loadSession()` | localStorage `ult_mix_score` |
| `exportXLSX()` | 3 feuilles : Résumé / Points / Journal |

## Live sync (Render)

`server/server.js` — Node.js WebSocket relay. `SERVER_URL` à configurer dans `index.html`.

```js
const SERVER_URL = 'https://ultmix-relay.onrender.com'; // à remplacer après déploiement
```

- `POST /room` → crée room (6-char ID), expire strictement à `createdAt + 24h`
- `WS /ws?room=id` → relay last-write-wins, `type: 'ping'` absorbé, `4010` = expiré, `4004` = inconnu
- Front : `syncToServer()` en fin de `render()` (bloqué par `isRemoteUpdate`), keep-alive ping/10min
- `receiver` inclus dans le payload sync

Déploiement Render : New Web Service → Root Directory: `server` → Start: `node server.js`

## Déploiement auto Infomaniak

`.github/workflows/deploy-infomaniak.yml` — déclenché sur push `main` si `index.html` modifié.
Secrets GitHub requis : `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD`, `FTP_PATH` (dossier, ex: `/web/`).

## Conventions de nommage

`pt-toF` / `pt-toM` — compteurs passes vers F/G sur le bouton (agrégés : FF+MF / FM+MM)  
`pt-dropF` etc. — IDs erreurs  
`st-` — stats globales (`st-total`, `st-pct`…)  
`bf-` / `bv-` — barres progression (fill / value)  
Types de passes : `FF` `MM` `FM` `MF` — Erreurs : `dropF` `dropM` `incF` `incM` `stallF` `stallM`

## Bugs corrigés (cette session)

- ~~`forceLine` → null~~ : toggle retombe sur `'F'` (jamais `null`)
- ~~`recordPoint.errors`~~ : champ mort supprimé
- ~~`removePoint`~~ : soustrait maintenant les passes du point annulé de `tot` via `removed.passes`
- ~~`loadFromURL` jamais appelée~~ : init utilise `if (!loadFromURL()) loadSession()`
- ~~`receiver` non propagé en live~~ : inclus dans payload `syncToServer`

## Idées d'amélioration

### Bugs / robustesse
- ~~**Versioning state**~~ : `STATE_VERSION=1` + `applySnap()` normalise `pt`/`tot` avec `DEFAULT_COUNTERS` spread
- **localStorage quota** : `setItem` peut lever `QuotaExceededError` — pas de try/catch dans `saveSession`
- **Guard CDN xlsx** : si cdnjs indisponible, export silencieusement cassé — ajouter `if (typeof XLSX === 'undefined') { alert(...); return; }`
- **`forceLine` null** : remplacer toggle par set explicite (`lineOverride = lineOverride === g ? 'F' : g`)
- **update au partage de connexion** : pas de refresh parfait à la connexion ou à l'action d'un des partage de connexion

### UX
- **Premier clic du point** : actuellement le 1er clic initialise le disque sans compter de passe — envisager une indication visuelle claire ("Qui commence ?") tant que receiver=null
- **Bouton Gender F présélectionné** : cohérent avec ABBA par défaut, mais peu évident — tooltip ou label explicatif
- **Score flash** : l'animation score est bonne, envisager vibration haptic (`navigator.vibrate`) sur mobile lors d'un point
- **Multi-match** : bouton pour exporter/importer la session JSON et reprendre sur un autre appareil
- **scan QR** : possibilité de scanner un QR code pour switcher/ou simplement se connecter à une sessioin

### Infra
- **Render cold start** : retry 3× côté front, mais 20s/tentative peut frustrater — envisager un keep-alive externe (ex: UptimeRobot ping `/ping` toutes les 14 min)
- **`copySessionLink` sans SERVER_URL** : fallback base64 inclut `actionLog` → URL très longue. Exclure `actionLog` du payload `?s=`
- **Room expiry** : purge toutes les heures → une room peut vivre jusqu'à ~25h. Acceptable
- **Pas de persistance room** : si le serveur Render redémarre (déploiement, crash), toutes les rooms en mémoire sont perdues — envisager Redis ou KV Cloudflare pour les sessions actives

## TODO

- Multi-match : bouton copier/envoyer session, tester mobile terrain
- Scan QR