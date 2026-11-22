# MSD 0.1 — Manipulator Scene Description

Référence du format de scène. Source de vérité : `services/api/manipulator_api/schema/`
(ADR 0002). Schéma machine : `packages/scene-schema/generated/msd.schema.json`.

> **État :** le format et sa validation sont opérationnels. Le **rendu** des scènes arrive en
> phase 1 : aucun moteur ne les joue encore.

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
- Behaviors spécifiés en 0.1 : `enter`, `exit`, `spin`, `float`, `pulse`, `wiggle`, `orbit`,
  `dolly`, `look_at` — paramètres, bornes et cibles dans `generated/registry.json`.

## Validation
```bash
uv --directory services/api run python -m manipulator_api.schema chemin/scene.json
```
Chaque problème : `code` stable, `path` JSON Pointer, `message`, `severity` (`error` / `warning`).
Catalogue des codes : voir `tests/fixtures/scenes/invalid/expectations.json` et `validate.py`.
