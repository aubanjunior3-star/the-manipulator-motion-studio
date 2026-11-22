# The Manipulator Motion Studio — Étude technique et plan de construction

*Version 1 — 2026-11-21. Les décisions détaillées sont dans [`adr/`](adr/README.md), l'avancement
dans [`ROADMAP.md`](ROADMAP.md).*

## 0. Synthèse

- **Faisable, à une condition :** l'IA ne génère pas de code ; elle produit une **description de
  scène structurée** (MSD), validée, exécutée par des moteurs déterministes (ADR 0001, 0005).
- **Positionnement :** pas « un After Effects complet » (30 ans de fonctionnalités), mais
  **du prompt à une animation professionnelle modifiable en quelques minutes**.
- **Machine cible (i7, 8 Go, GPU Intel intégré) :** adaptée à l'aperçu WebGL temps réel et aux
  exports 1080p de complexité moyenne ; pas au rendu Cycles ni aux simulations, qui iront dans
  le cloud (V2).
- **Stack :** moteur d'animation maison en TypeScript, rendu Three.js (aperçu + export),
  backend Python/FastAPI (IA, audio, FFmpeg), API Claude comme directeur artistique ; Blender
  en V2 pour le rendu haute qualité cloud (ADR 0004).

## 1. Faisabilité

| Fonctionnalité | Faisabilité locale | Version |
|---|---|---|
| Texte 2D/3D animé | Excellente | MVP |
| Objets 3D primitifs et procéduraux | Excellente | MVP |
| Caméras cinématiques (trajectoires calculées) | Excellente | MVP |
| Lumières et matériaux PBR | Bonne (ombres limitées) | MVP simple, V1 |
| Particules stylisées | Bonne (instanciation GPU) | V1 |
| Fumée, feu, explosions stylisés | Moyenne (sprites, shaders de bruit) | V1 |
| Simulations physiques réelles | Mauvaise | V2, cloud |
| Synchronisation voix | Bonne (Whisper int8 sur CPU) | V1 |
| Import glTF/GLB/OBJ | Excellente | V1 |
| Import FBX | Indirecte (conversion) | V2 |
| Édition par conversation | Excellente grâce aux patches | MVP |
| Timeline et éditeur de courbes | Volume de travail, pas de risque technique | MVP / V1 |
| Rendu photoréaliste | Impossible en local en temps raisonnable | V2, cloud |
| Export MP4, WebM alpha, ProRes, GIF, PNG | Excellente (FFmpeg) | MVP (MP4), V1 |

**Risque principal : le raisonnement spatial des modèles de langage.** Réponse : *l'IA décide
de l'intention, le moteur calcule la géométrie* (solveur de mise en page et cadrage automatique).

## 2. Architecture

```
Interface (React/TS) : viewport Three.js · prompt/assistant · timeline · propriétés · outliner
          │ lit / modifie (patches)
          ▼
   SCENE DOCUMENT (MSD) ◄── patches validés ── AI DIRECTOR (Python, API Claude)
          │                                     brief → storyboard → opérations →
          │ evaluate(scène, t) pur, déterministe  validation → critique visuelle
   ┌──────┼──────────────────────┐
   ▼      ▼                      ▼
 Aperçu  Rendu image/image →   Traducteur Blender (V2) → worker cloud
 Three   FFmpeg (MP4…)
```

### Pipeline IA
| Étape | Sortie |
|---|---|
| 1. Brief (intention, ton, durée, format) | `CreativeBrief` |
| 2. Direction artistique (palette, typo, rythme, langage caméra) | `Storyboard` horodaté |
| 3. Construction par appels d'outils typés | Patches MSD |
| 4. Validation structure + sémantique | Erreurs (code + chemin) → correction bornée |
| 5. Critique visuelle sur vignettes | Corrections ciblées |
| 6. Édition conversationnelle | Patch minimal annulable |

Modèle principal : Claude Opus 5.5 ; un modèle plus léger pour les petites retouches est un
arbitrage coût/qualité à décider sur mesures. Abstraction `LLMProvider`, mise en cache des prompts.

### Rendu et export
- Aperçu : Three.js temps réel, résolution adaptative pendant la lecture.
- Export local : rendu image par image exact → FFmpeg.
- Piste d'accélération à évaluer : WebCodecs (encodeur matériel Intel).
- V2 : traducteur déterministe MSD → script Blender, worker GPU dans le cloud.

## 3. Modules

| # | Module | Rôle | Dépend de |
|---|---|---|---|
| M1 | `scene-schema` | Schéma, validation, migrations, types | — |
| M2 | `motion-engine` | `evaluate(t)`, easings, keyframes, behaviors | M1 |
| M3 | `layout-solver` | Mise en page, cadrage caméra | M1 |
| M4 | `render-three` | Adaptateur MSD → Three.js | M1, M2 |
| M5 | `export` | Capture, FFmpeg, préréglages | M4 |
| M6 | `ai-director` | Pipeline IA, outils, critique, édition | M1, M3, M4 |
| M7 | `audio` | TTS, transcription, analyse, marqueurs | M1 |
| M8 | `assets` | Imports, miniatures, bibliothèque | M1 |
| M9 | `editor-ui` | Interface complète | tous |
| M10 | `project-store` | Sauvegarde, historique, versions | M1 |
| M11 | `render-blender` (V2) | Traducteur et worker | M1, M2 |
| M12 | `jobs` (V2) | File de rendus local/cloud | M5, M11 |

## 4. Identité de l'interface
Graphite mat, filets de 1 px plutôt que des ombres, **une seule couleur d'accent** réservée à
l'action, chiffres à chasse fixe pour valeurs et timecode, viewport dominant avec barre de
prompt intégrée (`Ctrl+K`), timeline en bas, propriétés à droite, outliner et assistant à
gauche. L'IA rend son travail visible (nœuds créés qui s'allument, patches visibles dans la
timeline). Aucun contrôle affiché sans fonctionnalité réelle.

## 5. Risques

| Risque | Mitigation |
|---|---|
| Scènes spatialement incohérentes | Solveur de mise en page, validation, critique visuelle |
| Coût de l'API | Cache, patches minimaux, budget affiché, modèle léger si décidé |
| Latence 10–60 s | Construction en direct (streaming) |
| Écart Three.js / Blender | Sous-ensemble PBR commun (glTF), tests de comparaison visuelle |
| Perte de contexte WebGL (GPU Intel) | Reconstruction automatique, plafonds de qualité |
| 8 Go de RAM | Chargements à la demande, export en flux, pas de Blender local obligatoire |
| Licences (Remotion, polices, assets) | Pas de Remotion au cœur, polices OFL, licence tracée par asset |
| Dérive du périmètre | MVP strict, phases conditionnées par les tests |

## 6. MVP
> Décrire une animation de 5 à 20 s, obtenir en moins de 2 minutes une scène animée (texte,
> objets, caméra, lumières), la retoucher en conversation ou dans la timeline, exporter un MP4 1080p.

Exclus du MVP : voix, imports, particules, transitions, éditeur de courbes, Blender, cloud,
autres formats d'export.

## 7. Feuille de route
Phases 0 à 5 détaillées dans [`ROADMAP.md`](ROADMAP.md), MVP estimé à 10–14 semaines.
V1 (+3–4 mois) : voix, audio-réactivité, imports, particules, transitions, courbes, formats,
Tauri. V2 : Blender cloud, FBX, simulations, multi-plans, collaboration.

## 8. Décisions ouvertes
1. Budget IA par génération (choix du ou des modèles).
2. Couleur d'accent et nom définitif.
3. Modèle commercial : application de bureau sous licence ou SaaS (impacte le calendrier
   cloud et l'authentification ; l'architecture permet les deux).
