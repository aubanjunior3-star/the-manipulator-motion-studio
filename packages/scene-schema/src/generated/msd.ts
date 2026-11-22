/* eslint-disable */
/**
 * FICHIER GÉNÉRÉ — ne pas modifier à la main.
 * Source : services/api/manipulator_api/schema/models.py
 * Régénérer : pnpm schema:export && pnpm schema:types
 */

/**
 * Document de scène MSD complet.
 */
export interface SceneDocument {
  msd_version: "0.1.0";
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  meta: Meta;
  settings: Settings;
  active_camera?: string | null;
  assets?: Asset[];
  materials?: Material[];
  nodes?: (GroupNode | TextNode | ShapeNode | ModelNode | CameraNode | LightNode)[];
  animations?: (KeyframeTrack | Behavior)[];
  markers?: Marker[];
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "Meta".
 */
export interface Meta {
  title: string;
  description?: string;
  /**
   * Origine du document : 'manual', 'ai-director/…', etc.
   */
  generator?: string;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "Settings".
 */
export interface Settings {
  fps?: number;
  width?: number;
  height?: number;
  /**
   * Durée en secondes.
   */
  duration: number;
  /**
   * Couleur sRGB hexadécimale #RRGGBB.
   */
  background?: string;
  /**
   * Graine de tout aléatoire du rendu.
   */
  seed?: number;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "Asset".
 */
export interface Asset {
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  kind: "font" | "image" | "model" | "audio";
  /**
   * 'builtin:' = ressource livrée avec le logiciel ; 'project:' = chemin relatif au dossier assets du projet.
   */
  uri: string;
  /**
   * Licence ou provenance de l'asset (traçabilité commerciale).
   */
  license?: string;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "Material".
 */
export interface Material {
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  /**
   * Couleur sRGB hexadécimale #RRGGBB.
   */
  base_color?: string;
  metalness?: number;
  roughness?: number;
  /**
   * Couleur sRGB hexadécimale #RRGGBB.
   */
  emissive?: string;
  emissive_intensity?: number;
  opacity?: number;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "GroupNode".
 */
export interface GroupNode {
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  name?: string;
  /**
   * Identifiant d'un nœud 'group', ou null pour la racine.
   */
  parent?: string | null;
  transform?: Transform;
  visible?: boolean;
  opacity?: number;
  type: "group";
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "Transform".
 */
export interface Transform {
  /**
   * @minItems 3
   * @maxItems 3
   */
  position?: [number, number, number];
  /**
   * Degrés, Euler XYZ.
   *
   * @minItems 3
   * @maxItems 3
   */
  rotation?: [number, number, number];
  /**
   * @minItems 3
   * @maxItems 3
   */
  scale?: [number, number, number];
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "TextNode".
 */
export interface TextNode {
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  name?: string;
  /**
   * Identifiant d'un nœud 'group', ou null pour la racine.
   */
  parent?: string | null;
  transform?: Transform;
  visible?: boolean;
  opacity?: number;
  type: "text";
  content: string;
  /**
   * Asset de type 'font'.
   */
  font: string;
  size?: number;
  /**
   * 0 = texte plat (2D).
   */
  extrude?: number;
  bevel?: number;
  align?: "left" | "center" | "right";
  /**
   * En fraction de la taille.
   */
  letter_spacing?: number;
  line_height?: number;
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  material: string;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "ShapeNode".
 */
export interface ShapeNode {
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  name?: string;
  /**
   * Identifiant d'un nœud 'group', ou null pour la racine.
   */
  parent?: string | null;
  transform?: Transform;
  visible?: boolean;
  opacity?: number;
  type: "shape";
  shape:
    BoxShape | SphereShape | CylinderShape | TorusShape | PlaneShape | RectShape | EllipseShape;
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  material: string;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "BoxShape".
 */
export interface BoxShape {
  kind: "box";
  /**
   * @minItems 3
   * @maxItems 3
   */
  size?: [number, number, number];
  corner_radius?: number;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "SphereShape".
 */
export interface SphereShape {
  kind: "sphere";
  radius?: number;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "CylinderShape".
 */
export interface CylinderShape {
  kind: "cylinder";
  radius_top?: number;
  radius_bottom?: number;
  height?: number;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "TorusShape".
 */
export interface TorusShape {
  kind: "torus";
  radius?: number;
  tube?: number;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "PlaneShape".
 */
export interface PlaneShape {
  kind: "plane";
  /**
   * @minItems 2
   * @maxItems 2
   */
  size?: [number, number];
}
/**
 * Forme 2D (plate, dans le plan XY local).
 *
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "RectShape".
 */
export interface RectShape {
  kind: "rect";
  /**
   * @minItems 2
   * @maxItems 2
   */
  size?: [number, number];
  corner_radius?: number;
}
/**
 * Forme 2D (plate, dans le plan XY local).
 *
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "EllipseShape".
 */
export interface EllipseShape {
  kind: "ellipse";
  /**
   * @minItems 2
   * @maxItems 2
   */
  radii?: [number, number];
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "ModelNode".
 */
export interface ModelNode {
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  name?: string;
  /**
   * Identifiant d'un nœud 'group', ou null pour la racine.
   */
  parent?: string | null;
  transform?: Transform;
  visible?: boolean;
  opacity?: number;
  type: "model";
  /**
   * Asset de type 'model' (glTF/GLB).
   */
  asset: string;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "CameraNode".
 */
export interface CameraNode {
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  name?: string;
  /**
   * Identifiant d'un nœud 'group', ou null pour la racine.
   */
  parent?: string | null;
  transform?: Transform;
  visible?: boolean;
  opacity?: number;
  type: "camera";
  projection?: "perspective" | "orthographic";
  /**
   * Champ vertical en degrés (perspective).
   */
  fov?: number;
  /**
   * Hauteur visible (orthographique).
   */
  ortho_height?: number;
  near?: number;
  far?: number;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "LightNode".
 */
export interface LightNode {
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  name?: string;
  /**
   * Identifiant d'un nœud 'group', ou null pour la racine.
   */
  parent?: string | null;
  transform?: Transform;
  visible?: boolean;
  opacity?: number;
  type: "light";
  light: "ambient" | "directional" | "point" | "spot";
  /**
   * Couleur sRGB hexadécimale #RRGGBB.
   */
  color?: string;
  intensity?: number;
  cast_shadow?: boolean;
  /**
   * Demi-angle du cône (spot), degrés.
   */
  spot_angle?: number;
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "KeyframeTrack".
 */
export interface KeyframeTrack {
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  kind: "keyframes";
  /**
   * Nœud ou matériau animé.
   */
  target: string;
  /**
   * Chemin de propriété animable, ex. 'transform.position.y' (voir registre).
   */
  property: string;
  /**
   * @minItems 1
   */
  keyframes: [Keyframe, ...Keyframe[]];
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "Keyframe".
 */
export interface Keyframe {
  t: number;
  value: number | [number, number, number] | string;
  /**
   * Interpolation du segment qui part de cette clé.
   */
  ease?:
    | (
        | "linear"
        | "hold"
        | "ease_in"
        | "ease_out"
        | "ease_in_out"
        | "ease_in_strong"
        | "ease_out_strong"
        | "ease_in_out_strong"
        | "back_in"
        | "back_out"
      )
    | BezierEase;
}
/**
 * Courbe de Bézier cubique façon CSS : P0=(0,0), P3=(1,1).
 *
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "BezierEase".
 */
export interface BezierEase {
  type: "bezier";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
/**
 * Mouvement paramétrique de la grammaire de mouvement (voir registre).
 *
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "Behavior".
 */
export interface Behavior {
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  kind: "behavior";
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  target: string;
  behavior: string;
  start: number;
  duration: number;
  params?: {
    [k: string]: number | boolean | string | [number, number, number];
  };
  /**
   * Texte uniquement : applique le mouvement par lettre, mot ou ligne.
   */
  split?: "none" | "char" | "word" | "line";
  /**
   * Décalage (s) entre éléments quand split != 'none'.
   */
  stagger?: number;
  order?: "forward" | "reverse" | "center_out" | "random";
}
/**
 * This interface was referenced by `SceneDocument`'s JSON-Schema
 * via the `definition` "Marker".
 */
export interface Marker {
  /**
   * Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.
   */
  id: string;
  t: number;
  label?: string;
}
