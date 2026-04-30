# CLAUDE.md — ULT.MIX : Score & Mixité Ultimate Frisbee

> Documentation technique destinée aux LLMs pour comprendre, maintenir et étendre ce projet.

**Auteur :** Elie JESURAN  
**Date :** 2026-04-17  
**Licence :** GPL  
**Fichier principal :** `index.html` (application monopage, zéro dépendance serveur)

---

## Vue d'ensemble

Application web monopage (HTML/CSS/JS vanilla) de **suivi de score et de statistiques de mixité** pour des matchs d'Ultimate Frisbee en format mixte. Elle tourne entièrement dans le navigateur, sans backend ni framework JS.

**Objectif principal :** Permettre à un statisticien en bord de terrain de :
1. Suivre le score en temps réel
2. Enregistrer chaque passe selon son type de genre (F→F, G→G, F→G, G→F)
3. Enregistrer les erreurs (drops, passes incomplètes, stalls) par genre
4. Visualiser les stats de mixité en direct
5. Exporter les données en XLSX après le match

---

## Architecture du fichier

Le projet est un **unique fichier `index.html`** structuré en trois blocs :

```
index.html
├── <head>          → imports (Google Fonts, XLSX lib), variables CSS, styles
├── <body>          → structure HTML (6 sections)
└── <script>        → état applicatif, logique métier, rendu DOM
```

### Dépendance externe unique
- **SheetJS (xlsx 0.18.5)** via CDN : `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`
  - Utilisée uniquement dans `exportXLSX()`

---

## Structure HTML (sections dans l'ordre)

| Élément | Classe / ID | Rôle |
|---|---|---|
| Header | `.header` | Logo, boutons save/thème, inputs nom équipes + date |
| Scoreboard | `.scoreboard` | Score A / VS / Score B avec boutons +1/−1 |
| Barre de ligne | `.line-bar` | Badge ABBA courant + boutons override F/G |
| Zone principale | `.main` | Grille 2 colonnes : gauche (passes/erreurs) + droite (stats) |
| Colonne gauche | `.left-col` | Tabs Passes/Erreurs + barre receveur + barre actions |
| Colonne droite | `.right-col` | Stats globales, barres, camembert, journal des points |

---

## État applicatif (`state`)

Objet JS central, **source unique de vérité** :

```javascript
const state = {
  scoreA: 0,           // score équipe A
  scoreB: 0,           // score équipe B
  lineOverride: 'F',   // 'F' | 'M' — décalage ABBA ; initialisé à 'F' par défaut

  // Compteurs PAR POINT (remis à 0 après chaque point)
  pt: {
    FF, MM, FM, MF,                          // types de passes
    dropF, dropM, incF, incM, stallF, stallM // types d'erreurs
  },

  // Compteurs CUMULATIFS sur tout le match
  tot: { /* mêmes clés que pt */ },

  lastPass: null,   // dernier type de passe du point en cours ('FF'|'MM'|'FM'|'MF')
  pointLog: [],     // tableau de snapshots par point marqué (voir structure ci-dessous)
  actionLog: []     // journal complet action par action (passes + erreurs avec timestamp)
}
```

### Structure d'une entrée `pointLog`
```javascript
{
  num: Number,        // numéro du point (totalPoints avant ce point)
  team: 'A' | 'B',
  teamName: String,
  scoreA: Number,     // score AU MOMENT du point
  scoreB: Number,
  lastPass: String,   // type de la dernière passe avant le score
  line: 'F' | 'M',   // ligne ABBA active
  passes: { ...pt },  // copie des compteurs pt au moment du point
  errors: { ...pt }   // idem (note: même objet, les deux sont des copies de pt)
}
```

> ⚠️ **Bug connu :** `passes` et `errors` dans `pointLog` sont tous deux copiés depuis `state.pt` (qui contient les deux). Dans l'export XLSX, les colonnes d'erreurs par point lisent `pt.passes.dropF` etc. — c'est correct car `passes` contient bien toutes les clés.

### Variable globale complémentaire
```javascript
let receiver = null; // 'F' | 'M' | null — qui tient le disque actuellement
```
`receiver` n'est **pas** dans `state` et n'est donc pas persisté dans le journal des points, mais est sauvegardé dans `localStorage`.

---

## Logique ABBA (règle de mixité)

La séquence ABBA détermine quelle ligne (majorité filles ou garçons) joue à chaque point :

```javascript
const ABBA_SEQ = ['F', 'M', 'M', 'F']; // cycle de 4

function abbaLine() {
  const idx = (totalPoints() + offset) % 4;
  return ABBA_SEQ[idx];
}
```

- `totalPoints()` = `scoreA + scoreB` = nombre de points **déjà joués**
- **Point 0** (début) → index 0 → ligne F
- **Point 1** → index 1 → ligne M
- **Point 2** → index 2 → ligne M  
- **Point 3** → index 3 → ligne F
- **Point 4** → index 0 → ligne F (cycle recommence)

> ℹ️ **Note :** `state.lineOverride` vaut `'F'` par défaut (décalage +0, neutre) et `'M'` pour un décalage de +2 dans le cycle. `currentLine()` appelle `abbaLine()` qui intègre ce décalage. Les boutons F/G dans `.line-bar` sont donc fonctionnels et visuellement actifs. Le bouton F est présélectionné (rouge) dès le chargement et après chaque réinitialisation.

---

## Flux de données principal

```
Utilisateur clique "passe" 
  → addPass(type)
    → pushUndo()         ← snapshot avant mutation
    → state.pt[type]++, state.tot[type]++
    → state.lastPass = type
    → receiver = catcher déduit (FF/MF → F ; MM/FM → M)
    → marquer "non sauvegardé"
    → render()

Utilisateur clique "erreur"
  → addError(type)
    → pushUndo()         ← snapshot avant mutation
    → state.pt[type]++, state.tot[type]++
    → receiver = null    ← remet "Reçoit : —", 4 boutons actifs
    → render()

Utilisateur clique "+1 point"
  → addPoint(team)
    → pushUndo()         ← snapshot avant mutation
    → recordPoint(team)  ← snapshot dans pointLog
    → state.scoreX++
    → réinitialiser state.pt + lastPass + receiver
    → saveSession()      ← auto-save localStorage
    → render()

Utilisateur clique "↩ Annuler" (ou Ctrl+Z)
  → undo()
    → pop undoStack      ← restaure state + receiver
    → render()

render()
  → met à jour TOUS les éléments DOM depuis state
  → appelle renderPie(), renderLog(), updatePassButtons()
```

---

## Fonctions clés

| Fonction | Description |
|---|---|
| `render()` | Redessine tout le DOM depuis `state`. À appeler après chaque mutation d'état. |
| `addPoint(team)` | Enregistre un point, snapshote les stats, remet à zéro les compteurs du point. |
| `removePoint(team)` | Annule le dernier point (décrémente score + pop pointLog). |
| `addPass(type)` | Incrémente les compteurs de passe, déduit le nouveau `receiver`. |
| `addError(type)` | Incrémente les compteurs d'erreur, remet `receiver` à `null`. |
| `setReceiver(g)` | Force manuellement le receveur ('F', 'M', ou null). |
| `updatePassButtons()` | Active/désactive (classe `.dim`) les boutons de passes selon `receiver`. |
| `pushUndo()` | Pousse un snapshot `{state, receiver}` sur `undoStack` (max 50 entrées). |
| `undo()` | Dépile le dernier snapshot et restaure `state` + `receiver`. Raccourci Ctrl+Z/Cmd+Z. |
| `saveSession()` | Sérialise tout dans `localStorage` sous la clé `'ult_mix_score'`. |
| `loadSession()` | Restaure depuis `localStorage` au chargement de la page. |
| `forceLine(g)` | Toggle `state.lineOverride` entre 'F', 'M' (décale l'index ABBA). |
| `exportXLSX()` | Génère un fichier `.xlsx` avec 3 feuilles via SheetJS. |
| `toggleTheme()` | Bascule classe `.light` sur `<body>` + persiste dans `localStorage`. |
| `renderPie(p, total)` | Dessine le camembert sur `<canvas id="pieChart">` (100×100px). Vide la légende si `total === 0`. |
| `renderLog()` | Génère le HTML du journal des points dans `#logList`. |

---

## Système de thème

Deux thèmes via variables CSS sur `:root` et `body.light` :

- **Sombre (défaut)** : fond `#0f1117`, accents vifs
- **Clair** : fond `#f4f5f7`, accents assombris

Toutes les couleurs passent par des variables CSS (`--bg`, `--text`, `--pink`, `--blue`, `--green`, `--amber`, `--red` + variantes `-dim`). Modifier les couleurs = modifier uniquement les variables.

Persistance : `localStorage.getItem('ult_theme')`.

---

## Export XLSX (3 feuilles)

1. **Résumé** : infos match, scores, tableau passes avec %, tableau erreurs
2. **Points** : une ligne par point avec stats du point (passes + erreurs)
3. **Journal** : chaque action (passe/erreur) avec timestamp ISO, type, ligne ABBA

Nom du fichier : `ultimate_{équipeA}_vs_{équipeB}_{date}.xlsx`

---

## Persistance localStorage

Clé : `'ult_mix_score'`  
Format :
```javascript
{
  state: { /* copie profonde de state */ },
  receiver: null | 'F' | 'M',
  nameA: String,
  nameB: String,
  matchDate: String, // 'YYYY-MM-DD'
  at: String         // timestamp ISO de la sauvegarde
}
```

Auto-save déclenché à chaque `addPoint()`. Save manuel via bouton en header (indicateur dot : amber = non sauvegardé, vert = sauvegardé). `resetAll()` supprime la clé avec `localStorage.removeItem()` pour garantir un rechargement propre.

---

## Responsive / Mobile

Breakpoint unique : `@media (max-width: 640px)`

Adaptations mobiles :
- Header en colonne, inputs en flex-wrap
- `.main` passe de 2 colonnes à 1 colonne (passes en premier)
- Grille d'erreurs : 3 → 2 colonnes
- Score réduit : 80px → 60px
- Barre receveur intégrée dans le panneau passes (pas dans `.line-bar`)

---

## Pistes d'amélioration identifiées

### Bugs résolus ✅
- [x] **Undo/Redo** : stack de 50 snapshots, couvre passes, erreurs et points. Raccourci Ctrl+Z/Cmd+Z.
- [x] **`receiver` non remis à zéro** sur `resetAll()` et après une erreur.
- [x] **Légende camembert** non vidée au reset.
- [x] **`localStorage` non effacé** au reset (rechargement restaurait l'ancien match).
- [x] **Bouton Gender F** présélectionné visuellement dès le chargement et après reset.

### Bugs / incohérences restants
- [ ] **`errors` dans `pointLog`** : `passes` et `errors` sont deux copies identiques de `state.pt`. Séparer les compteurs de passes et d'erreurs dans `state.pt` ou enregistrer explicitement.
- [ ] **`receiver` non persisté dans `pointLog`** : on ne sait pas qui avait le disque lors du score.

---

## 🚀 Prochaine étape prioritaire : Export & Collaboratif

L'application tourne aujourd'hui en silo dans un seul navigateur. La prochaine évolution majeure est de permettre **l'export de session et le suivi collaboratif en temps réel**, pour que plusieurs personnes (stats, coach, arbitre) puissent suivre ou saisir simultanément.

### Export de session partageable
- **Export JSON** de `state` complet (bouton "Partager la session") → génère un fichier ou une URL encodée (base64) à copier
- **Import JSON** → coller/déposer un fichier pour reprendre une session sur un autre appareil
- Permettrait de passer la main entre deux statisticiens sans perdre les données

### Collaboratif temps réel
Plusieurs approches possibles selon les contraintes d'infrastructure :

| Option | Complexité | Infra requise |
|---|---|---|
| **URL partagée** (state en hash/query param) | Faible | Aucune — lecture seule pour les autres |
| **WebSocket maison** (Node.js + ws) | Moyenne | Serveur Node dédié |
| **Firebase Realtime DB / Firestore** | Faible-Moyenne | Compte Firebase (gratuit en dev) |
| **Supabase Realtime** | Faible-Moyenne | Compte Supabase (open-source) |
| **Partykit / Liveblocks** | Faible | Service SaaS spécialisé collaboration |

**Recommandation :** commencer par Firebase Realtime DB — intégration JS sans backend, temps réel natif, gratuit pour ce volume de données. Le `state` JSON est déjà bien structuré pour être synchronisé tel quel.

### Autres fonctionnalités à ajouter
- [ ] **Multi-match** : gérer plusieurs matchs dans le même tournoi
- [ ] **Noms des joueurs** : associer les passes à des joueurs individuels
- [ ] **Timer** : chronomètre par point / par mi-temps
- [ ] **Mode tournoi** : bracket + classement mixité global
- [ ] **Export PDF** : rapport visuel du match
- [ ] **PWA** : `manifest.json` + service worker pour utilisation hors-ligne
- [ ] **i18n** : l'interface est en français, ajouter support anglais/espagnol

---

## Conventions de nommage

| Préfixe | Usage |
|---|---|
| `pt-` | IDs des compteurs par point (ex: `pt-FF`) |
| `tot-` | IDs des totaux (ex: `tot-FF`) |
| `st-` | IDs des stats globales (ex: `st-total`) |
| `bf-` / `bv-` | IDs des barres de progression (fill / value) |
| `btn` | Classes des boutons (btnF, btnM, rcvF...) |
| `lbl` | Labels d'équipe (lblA, lblB) |

Types de passes : `FF` `MM` `FM` `MF`  
Types d'erreurs : `dropF` `dropM` `incF` `incM` `stallF` `stallM`  
Genres : `'F'` = filles, `'M'` = garçons (masculin)

---
## Multi-match
`<button class="btn-action link" id="btnLink" onclick="copySessionLink()">Lien session</button>`

`function copySessionLink() {
  const snap = {
    state: JSON.parse(JSON.stringify(state)),
    receiver,
    nameA: document.getElementById('nameA').value,
    nameB: document.getElementById('nameB').value,
    matchDate: document.getElementById('matchDate').value,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(snap))));
  const url = location.href.split('?')[0] + '?s=' + encoded;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('btnLink');
    btn.textContent = '✓ Copié !';
    setTimeout(() => btn.textContent = 'Lien session', 2000);
  }).catch(() => {
    prompt('Copie ce lien :', url);
  });
}`

