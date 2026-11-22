# ADR 0005 — L'IA produit des opérations validées, jamais du code exécutable

- **Statut :** acceptée — 2026-11-21

## Contexte
L'IA doit concevoir des animations originales, pas seulement remplir des templates. La
tentation est de lui faire écrire du code (Python Blender, JavaScript). C'est la voie la
plus expressive, mais aussi la plus fragile et la plus dangereuse.

## Décision
1. L'IA agit **uniquement par appels d'outils typés** (`add_node`, `apply_behavior`,
   `set_material`, `camera_move`…) qui produisent des **patches** du MSD.
2. Chaque patch passe la validation (structure + sémantique). Les erreurs (code + chemin)
   sont renvoyées à l'IA pour correction, en boucle bornée.
3. **L'IA décide de l'intention, le moteur calcule la géométrie** : positions, cadrage
   caméra et mise en page sont résolus par le code (`layout-solver`, phase 1) à partir
   de contraintes (« tiers supérieur », « plan serré sur X »), car les modèles de langage
   raisonnent mal sur des coordonnées.
4. L'originalité vient de la **composition** : primitives × behaviors × paramètres ×
   découpage texte (lettre/mot/ligne) × décalage × ordre × caméra × lumière × matériaux.
5. Le traducteur vers Blender (V2) est du **code déterministe**, pas de l'IA.

## Conséquences
- Sécurité : aucun code arbitraire n'est jamais exécuté.
- Retouches par conversation = patches minimaux, annulables.
- Enrichir les capacités de l'IA = ajouter des behaviors/primitives au registre (avec leurs
  tests), pas ajuster des prompts.
