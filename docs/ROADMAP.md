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

## Phase 1 — Moteur d'animation et rendu Three.js (sans IA)
- [ ] `motion-engine` : `evaluate(scène, t)` pur et déterministe, easings, keyframes, behaviors du registre
- [ ] `layout-solver` : contraintes de mise en page, cadrage caméra automatique
- [ ] `render-three` : texte (opentype.js → extrusion), formes, matériaux, lumières, caméras
- [ ] Polices `builtin:` sous licence OFL embarquées
- [ ] Visionneuse minimale : ouvrir une scène de référence et la jouer
- [ ] Tests : unitaires `evaluate`, déterminisme (hash d'image), références visuelles, fps mesurés

## Phase 2 — Export
- [ ] Rendu image par image hors écran → FFmpeg → MP4 H.264
- [ ] Tests : `ffprobe` (durée, images, codec), mémoire stable sur 60 s

## Phase 3 — IA Director v1
- [ ] Brief → storyboard → opérations → validation → correction (boucle bornée)
- [ ] Édition par conversation (patches RFC 6902)
- [ ] Jeu d'évaluation de 50 prompts, mesures de qualité, coût et latence

## Phase 4 — Éditeur
- [ ] Viewport, prompt, timeline, propriétés, outliner, assistant, undo/redo, sauvegarde
- [ ] Portage TS de la validation sémantique (mêmes scènes invalides)
- [ ] Tests de bout en bout Playwright

## Phase 5 — Stabilisation → alpha du MVP
