# ADR 0003 — Conventions de scène

- **Statut :** acceptée — 2026-11-21

| Sujet | Convention | Raison |
|---|---|---|
| Repère | Main droite, **Y vers le haut**, caméra regardant vers −Z | Convention Three.js et glTF ; Blender (Z haut) est converti par le traducteur |
| Unités | 1 unité ≈ 1 mètre | Cohérent avec glTF, lumières physiques |
| Rotations | **Degrés**, Euler ordre **XYZ** | Lisible par un humain et par l'IA (90 plutôt que 1.5708) |
| Temps | **Secondes** (décimal), indépendant du fps | Changer le fps ne casse pas l'animation ; le rendu échantillonne aux instants `frame / fps` |
| Couleurs | `#RRGGBB` sRGB | Format universel ; l'interpolation se fera en espace linéaire (phase 1) |
| Identifiants | `^[a-z][a-z0-9_-]{0,63}$`, **uniques dans tout le document** | L'IA et les patches désignent un élément sans ambiguïté |
| Aléatoire | Toujours dérivé de `settings.seed` | Rendu reproductible au pixel près |
| Assets | `builtin:` (livré avec le logiciel) ou `project:` (dossier du projet) | Jamais de chemin absolu ni d'URL : projet portable, rien n'est téléchargé à l'insu de l'utilisateur |
| Erreurs | Code stable + chemin **JSON Pointer** (RFC 6901) + message | Exploitable par l'IA (correction) et l'interface (surlignage) |

Formes 2D (`rect`, `ellipse`) : géométrie plate dans le plan XY local d'un nœud 3D. Une scène
« 2D » est une scène dont la caméra est orthographique.

## Ajout (phase 1) — orientation des lumières
Les lumières `directional` et `spot` **visent l'origine du monde** ; si un behavior
`look_at` est actif sur elles, elles visent le nœud ciblé. Leur rotation propre est ignorée
pour la visée. Raison : c'est le cas d'usage dominant (éclairer le sujet au centre) et l'IA
n'a pas à calculer d'angles. Les caméras, elles, suivent leur rotation (axe −Z) ou leur `look_at`.
