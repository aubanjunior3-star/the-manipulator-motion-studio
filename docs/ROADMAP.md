# Feuille de route

Règle : une phase n'est terminée que si ses tests passent en CI (Linux et Windows) et que la
fonctionnalité est vérifiée de bout en bout. Aucune interface sans moteur derrière.

## Phase 0 — Fondations ✅ (2026-11-21)
- [x] Monorepo pnpm + projet Python uv, CI Linux/Windows
- [x] ADR 0001 à 0005
- [x] Schéma MSD 0.1 (Pydantic strict) + registre (propriétés animables, 9 behaviors, 10 easings)
- [x] Validation sémantique avec codes d'erreur stables et chemins JSON Pointer
- [x] Export JSON Schema / registre, génération des types TS, contrôle de divergence
- [x] 10 scènes de référence valides, 26 invalides avec erreurs attendues
- [x] Tests : 69 Python, 42 TypeScript

## Phase 1 — Moteur d'animation et rendu Three.js (sans IA) ✅ (2026-11-22)
- [x] `motion-engine` : `evaluate(scène, t)` pur et déterministe, 10 easings + Bézier, keyframes,
      9 behaviors, découpage lettre/mot/ligne, hiérarchie
- [x] `render-three` : texte (opentype.js → extrusion, crénage), 7 formes, matériaux `lit`/`flat`,
      4 types de lumière, ombres, caméras perspective/orthographique, modèles glTF
- [x] Polices `builtin:` embarquées (Space Grotesk, Inter — OFL)
- [x] Visionneuse (`pnpm viewer`) : scènes de référence, ouverture de fichier, lecture, image par image,
      résolution adaptative, avertissements
- [x] Tests : moteur (79), géométrie et texte (22), visionneuse (11), **visuels** (40 : références + déterminisme)
- [ ] Mesure des performances sur la machine cible (i7, GPU Intel) : à faire par l'utilisateur dans la
      visionneuse (compteur i/s) — la CI n'a pas de GPU
- **Reporté en phase 3** : `layout-solver` (mise en page par contraintes, cadrage automatique). Il sert
  l'IA ; sans IA il n'a pas d'utilisateur, et les débordements constatés sur deux scènes de référence
  (corrigés à la main) montrent qu'il sera indispensable.

## Phase 2 — Export
- [ ] Rendu image par image hors écran → FFmpeg → MP4 H.264
- [ ] Tests : `ffprobe` (durée, images, codec), mémoire stable sur 60 s

## Phase 3 — IA Director v1
- [ ] `layout-solver` : contraintes de mise en page, cadrage caméra automatique, contrôle « hors cadre »
- [ ] Brief → storyboard → opérations → validation → correction (boucle bornée)
- [ ] Édition par conversation (patches RFC 6902)
- [ ] Jeu d'évaluation de 50 prompts, mesures de qualité, coût et latence

## Phase 4 — Éditeur
- [ ] Viewport, prompt, timeline, propriétés, outliner, assistant, undo/redo, sauvegarde
- [ ] Portage TS de la validation sémantique (mêmes scènes invalides)
- [ ] Tests de bout en bout Playwright

## Phase 5 — Stabilisation → alpha du MVP
