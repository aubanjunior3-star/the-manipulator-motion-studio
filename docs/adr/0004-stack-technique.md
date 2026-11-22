# ADR 0004 — Stack technique

- **Statut :** acceptée — 2026-11-21

## Contraintes
Développement sous Windows, i7, 8 Go de RAM, GPU Intel intégré. Produit commercialisable,
évolutif vers le rendu cloud.

## Choix
| Domaine | Choix | Écarté (raison) |
|---|---|---|
| Interface | React + TypeScript + Vite | Svelte (écosystème timeline/3D plus pauvre) |
| 3D temps réel | Three.js, adaptateur maison | Babylon.js (plus lourd) ; React-Three-Fiber (réconciliation React inutile pour une scène pilotée par `evaluate(t)`) |
| Moteur d'animation | Maison (TypeScript, pur, déterministe) | GSAP (temps réel/DOM, pas de modèle de document) ; Theatre.js (impose son modèle) |
| Composition 2D | Même moteur (caméra orthographique) | **Remotion** : second pipeline de rendu à synchroniser, et licence commerciale payante au-delà des petites structures, avec conditions particulières pour les produits qui génèrent des vidéos pour leurs utilisateurs |
| Backend | Python + FastAPI | Node seul (Blender, Whisper et l'audio sont en Python) |
| IA | API Claude, derrière une interface `LLMProvider` | Modèles locaux (qualité insuffisante avec 8 Go) |
| Encodage | FFmpeg (binaire, sous-processus) | Bibliothèques de liaison (fragiles sous Windows) |
| Rendu haute qualité | Blender headless dans le cloud (V2) | Blender local obligatoire (trop lourd pour la machine cible) |
| Bureau | Web local, puis Tauri (WebView2) | Electron (~150 Mo de RAM en plus) |
| Outillage | pnpm (workspaces), uv (Python) | npm/pip (plus lents, pas de lockfile Python fiable) |

## Versions de départ (phase 0)
Node 22, Python ≥ 3.11 (CI en 3.12), Pydantic 2.14.4, Ajv 8.20.0, TypeScript 7.0.2,
Vitest 4.1.12 (la 5.x, sortie il y a quelques jours, est jugée trop récente),
json-schema-to-typescript 16.0.0, pytest 8.4.2. Versions exactes, lockfiles versionnés.

## Règle d'ajout de dépendance
Avant toute nouvelle dépendance : licence compatible avec un usage commercial, maintenance
active, poids, compatibilité Windows, et absence d'alternative déjà présente. Décision notée
dans l'ADR concernée.

## Ajouts phase 1
Three.js 0.187.0, opentype.js 2.0.0 (MIT ; pas de types fournis → déclaration minimale locale ;
sa mise en forme avancée plante sur certaines polices, d'où la conversion caractère par caractère),
Vite 8.3.5, Playwright 1.63.0, pixelmatch 7.1.0, pngjs 7.0.0. Polices : Space Grotesk et Inter
(OFL-1.1) via Fontsource 5.3.0, sous-ensemble latin.
