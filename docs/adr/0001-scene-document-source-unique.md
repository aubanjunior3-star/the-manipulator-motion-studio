# ADR 0001 — Le Scene Document (MSD) est la source unique de vérité

- **Statut :** acceptée — 2026-11-21

## Contexte
Plusieurs acteurs lisent et modifient une même animation : l'IA (génération, retouches par
conversation), l'utilisateur (timeline, panneau de propriétés), plusieurs moteurs de rendu
(Three.js pour l'aperçu et l'export local, Blender dans le cloud plus tard). Si chacun a
sa propre représentation, les divergences sont inévitables et les retouches par conversation
obligent à tout régénérer.

## Options
1. L'IA génère directement du code (script Blender, code Three.js) — rapide à prototyper,
   mais invérifiable, non modifiable finement, dangereux à exécuter, lié à un moteur.
2. Chaque module a son modèle, synchronisé par des convertisseurs — duplication, dérive.
3. **Un document déclaratif unique, versionné, validé, que tous lisent et que l'on modifie
   par patches.**

## Décision
Option 3 : le **MSD (Manipulator Scene Description)**, document JSON :
- liste à plat de nœuds avec `parent` (plus simple à patcher qu'un arbre imbriqué) ;
- identifiants stables et uniques dans tout le document ;
- deux niveaux d'animation : **pistes de keyframes** (édition manuelle) et **behaviors**
  paramétriques (grammaire de mouvement que l'IA compose) ;
- toute modification = **patch JSON (RFC 6902)** → historique, annulation, retouches minimales.

## Conséquences
- Le rendu doit être une fonction pure `evaluate(document, t)` (phase 1) : même document,
  même instant ⇒ même image, quel que soit le moteur.
- Le format doit être versionné avec migrations (`msd_version`).
- Un moteur qui ne sait pas exécuter une partie du document doit le **signaler**, jamais
  l'ignorer silencieusement.
