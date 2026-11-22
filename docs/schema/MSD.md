# MSD 0.1 — Manipulator Scene Description

Référence du format de scène. Source de vérité : `services/api/manipulator_api/schema/`
(ADR 0002). Schéma machine : `packages/scene-schema/generated/msd.schema.json`.

> **État :** format, validation, moteur d'animation (`packages/motion-engine`) et rendu
> Three.js (`packages/render-three`) opérationnels. Visionneuse : `pnpm viewer`.

## Structure

```jsonc
{
  "msd_version": "0.1.0",
  "id": "title_rise_3d",
  "meta":     { "title": "…", "description": "", "generator": "manual" },
  "settings": { "fps": 30, "width": 1920, "height": 1080, "duration": 5.0, "background": "#0e0f11", "seed": 7 },
  "active_camera": "cam_main",
  "assets":     [ { "id": "font_display", "kind": "font", "uri": "builtin:fonts/display-bold.ttf", "license": "OFL-1.1" } ],
  "materials":  [ { "id": "m_chrome", "base_color": "#d9dde3", "metalness": 1, "roughness": 0.18 } ],
  "nodes":      [ /* group | text | shape | model | camera | light, liste à plat avec "parent" */ ],
  "animations": [ /* keyframes | behavior */ ],
  "markers":    [ { "id": "mk_in", "t": 0.3, "label": "entrée" } ]
}
```

## Matériaux
`shading` : `lit` (éclairé, PBR : `metalness`, `roughness`, `emissive`…) ou `flat` (couleur
exacte, sans éclairage : typographie, aplats, couleurs de charte). Couleurs `#RRGGBB` sRGB,
interpolées en espace linéaire.

## Nœuds
Champs communs : `id`, `name`, `parent` (un `group` ou `null`), `transform` (`position`,
`rotation` en degrés XYZ, `scale`), `visible`, `opacity`.

| `type` | Champs propres |
|---|---|
| `group` | — (conteneur, seul type pouvant avoir des enfants) |
| `text` | `content`, `font` (asset font), `size`, `extrude` (0 = plat), `bevel`, `align`, `letter_spacing`, `line_height`, `material` |
| `shape` | `shape` : `box` (`size`, `corner_radius`), `sphere`, `cylinder` (rayon haut 0 = cône), `torus`, `plane`, `rect` et `ellipse` (2D) ; `material` |
| `model` | `asset` (asset model, glTF/GLB) |
| `camera` | `projection` (`perspective` / `orthographic`), `fov`, `ortho_height`, `near`, `far` |
| `light` | `light` (`ambient`, `directional`, `point`, `spot`), `color`, `intensity`, `cast_shadow`, `spot_angle` |

Les lumières `directional` et `spot` visent l'origine du monde, ou la cible d'un `look_at`
actif. Caméras : axe de visée −Z, ou `look_at`.

## Animations

**Piste de keyframes** — édition manuelle :
```json
{ "id": "cube_pos", "kind": "keyframes", "target": "cube", "property": "transform.position",
  "keyframes": [ { "t": 0, "value": [-3, 0, 0], "ease": { "type": "bezier", "x1": 0.7, "y1": 0, "x2": 0.2, "y2": 1.4 } },
                 { "t": 1.5, "value": [3, 0, 0], "ease": "hold" } ] }
```
- `target` : un nœud **ou un matériau** ; `property` : voir le registre (`animatable`).
- Valeur : nombre, `[x, y, z]` ou couleur `#RRGGBB` selon la propriété.
- `ease` : interpolation du segment qui **part** de la clé — préréglage ou Bézier.
- Deux pistes ne peuvent pas viser la même propriété (ni `transform.position` et
  `transform.position.x` en même temps).

**Behavior** — mouvement paramétrique composé par l'IA :
```json
{ "id": "title_in", "kind": "behavior", "target": "title", "behavior": "enter",
  "start": 0.2, "duration": 0.8, "params": { "style": "rise", "distance": 0.6, "ease": "back_out" },
  "split": "char", "stagger": 0.05, "order": "center_out" }
```
- `split` (texte uniquement) : par lettre, mot ou ligne ; `stagger` : décalage entre éléments ;
  la fin effective `start + duration + stagger × (n − 1)` doit tenir dans la durée.
- Paramètres, bornes et cibles : `generated/registry.json`. Sémantique exacte (moteur) :

| Behavior | Effet |
|---|---|
| `enter` | Avant `start` l'élément est **caché** dans son état de départ. `fade` : opacité 0→1. `rise` / `drop` : monte / descend de `distance` jusqu'à sa place. `slide_left` / `slide_right` : glisse vers la gauche / la droite. `scale_up` : échelle 0→1. `pop` : échelle 0,4→1 avec rebond. Les styles en mouvement ajoutent un fondu sur les 60 premiers % |
| `exit` | Miroir d'`enter` ; après la fin, l'élément reste caché. `scale_down` : échelle 1→0 |
| `spin` | `revolutions` tours autour de l'axe local `axis` |
| `float` | Oscillation verticale (`amplitude`, `frequency`) + légère rotation |
| `pulse` | Échelle × (1 + `amount` · oscillation) |
| `wiggle` | Bruit déterministe (graine du projet + identifiant du behavior) sur la position |
| `orbit` | Tourne la position **et** l'orientation de `degrees` autour de `center` |
| `dolly` | Avance de `distance` le long de l'axe de visée |
| `look_at` | Oriente vers le nœud `node` pendant la fenêtre du behavior |

`float`, `pulse` et `wiggle` démarrent et s'arrêtent en douceur (pas de saut aux bornes).
Les behaviors s'additionnent dans l'ordre du tableau ; `orbit`, `dolly` et `look_at`
s'appliquent à l'objet entier (pas de `split`).

## Validation
```bash
uv --directory services/api run python -m manipulator_api.schema chemin/scene.json
```
Chaque problème : `code` stable, `path` JSON Pointer, `message`, `severity` (`error` / `warning`).
Catalogue des codes : voir `tests/fixtures/scenes/invalid/expectations.json` et `validate.py`.
