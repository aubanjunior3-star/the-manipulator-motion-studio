"""MSD — Manipulator Scene Description, version 0.1.

Source de vérité unique du format de scène (voir docs/adr/0001 et 0002).
Ce module décrit la *structure* du document. Les règles qui demandent de
croiser plusieurs parties du document (références, cohérence temporelle,
propriétés animables…) sont dans `validate.py`.

Conventions (docs/adr/0003) :
- repère main droite, Y vers le haut, unités de scène (~1 unité = 1 mètre) ;
- rotations en degrés, Euler ordre XYZ ;
- temps en secondes (float), indépendant du fps ;
- couleurs en hexadécimal sRGB "#RRGGBB" ;
- identifiants uniques dans tout le document.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

MSD_VERSION = "0.1.0"

# ---------------------------------------------------------------------------
# Types de base
# ---------------------------------------------------------------------------

Id = Annotated[
    str,
    Field(
        pattern=r"^[a-z][a-z0-9_\-]{0,63}$",
        description="Identifiant stable : minuscules, chiffres, '_' ou '-', commence par une lettre.",
    ),
]
Color = Annotated[
    str,
    Field(pattern=r"^#[0-9a-fA-F]{6}$", description="Couleur sRGB hexadécimale #RRGGBB."),
]
Vec3 = Annotated[list[float], Field(min_length=3, max_length=3)]
Unit = Annotated[float, Field(ge=0.0, le=1.0)]
Seconds = Annotated[float, Field(ge=0.0)]


class Strict(BaseModel):
    """Base commune.

    - extra="forbid" : aucun champ inconnu n'est toléré (l'IA ne peut pas inventer de champ) ;
    - strict=True : pas de conversion implicite ("0.5" n'est pas un nombre), pour que la
      validation Python et la validation JSON Schema (TypeScript) donnent le même verdict.
    """

    model_config = ConfigDict(extra="forbid", strict=True)


# ---------------------------------------------------------------------------
# Projet
# ---------------------------------------------------------------------------


class Meta(Strict):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    description: Annotated[str, Field(max_length=2000)] = ""
    generator: Annotated[str, Field(max_length=100)] = Field(
        default="manual", description="Origine du document : 'manual', 'ai-director/…', etc."
    )


class Settings(Strict):
    fps: Annotated[int, Field(ge=1, le=120)] = 30
    width: Annotated[int, Field(ge=16, le=8192)] = 1920
    height: Annotated[int, Field(ge=16, le=8192)] = 1080
    duration: Annotated[float, Field(gt=0.0, le=600.0, description="Durée en secondes.")]
    background: Color = "#0e0f11"
    seed: Annotated[int, Field(ge=0, le=2**31 - 1, description="Graine de tout aléatoire du rendu.")] = 0


# ---------------------------------------------------------------------------
# Assets (référencés, jamais intégrés au JSON)
# ---------------------------------------------------------------------------

AssetUri = Annotated[
    str,
    Field(
        pattern=r"^(builtin|project):[A-Za-z0-9_\-./]+$",
        description="'builtin:' = ressource livrée avec le logiciel ; 'project:' = chemin relatif au dossier assets du projet.",
    ),
]


class Asset(Strict):
    id: Id
    kind: Literal["font", "image", "model", "audio"]
    uri: AssetUri
    license: Annotated[str, Field(max_length=200)] = Field(
        default="", description="Licence ou provenance de l'asset (traçabilité commerciale)."
    )


# ---------------------------------------------------------------------------
# Matériaux (sous-ensemble PBR compatible glTF / Three.js / Blender)
# ---------------------------------------------------------------------------


class Material(Strict):
    id: Id
    shading: Literal["lit", "flat"] = Field(
        default="lit",
        description="'lit' : éclairé (PBR). 'flat' : couleur exacte sans éclairage (aplats 2D, typographie, charte).",
    )
    base_color: Color = "#ffffff"
    metalness: Unit = 0.0
    roughness: Unit = 0.5
    emissive: Color = "#000000"
    emissive_intensity: Annotated[float, Field(ge=0.0, le=100.0)] = 0.0
    opacity: Unit = 1.0


# ---------------------------------------------------------------------------
# Nœuds de scène (liste à plat + `parent`, plus simple à patcher qu'un arbre)
# ---------------------------------------------------------------------------


class Transform(Strict):
    position: Vec3 = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    rotation: Vec3 = Field(default_factory=lambda: [0.0, 0.0, 0.0], description="Degrés, Euler XYZ.")
    scale: Vec3 = Field(default_factory=lambda: [1.0, 1.0, 1.0])


class NodeBase(Strict):
    id: Id
    name: Annotated[str, Field(max_length=120)] = ""
    parent: Id | None = Field(default=None, description="Identifiant d'un nœud 'group', ou null pour la racine.")
    transform: Transform = Field(default_factory=Transform)
    visible: bool = True
    opacity: Unit = 1.0


class GroupNode(NodeBase):
    type: Literal["group"]


class TextNode(NodeBase):
    type: Literal["text"]
    content: Annotated[str, Field(min_length=1, max_length=2000)]
    font: Id = Field(description="Asset de type 'font'.")
    size: Annotated[float, Field(gt=0.0, le=100.0)] = 1.0
    extrude: Annotated[float, Field(ge=0.0, le=50.0)] = Field(default=0.0, description="0 = texte plat (2D).")
    bevel: Annotated[float, Field(ge=0.0, le=5.0)] = 0.0
    align: Literal["left", "center", "right"] = "center"
    letter_spacing: Annotated[float, Field(ge=-0.5, le=2.0)] = Field(default=0.0, description="En fraction de la taille.")
    line_height: Annotated[float, Field(ge=0.5, le=4.0)] = 1.2
    material: Id


class BoxShape(Strict):
    kind: Literal["box"]
    size: Vec3 = Field(default_factory=lambda: [1.0, 1.0, 1.0])
    corner_radius: Annotated[float, Field(ge=0.0)] = 0.0


class SphereShape(Strict):
    kind: Literal["sphere"]
    radius: Annotated[float, Field(gt=0.0)] = 0.5


class CylinderShape(Strict):
    kind: Literal["cylinder"]
    radius_top: Annotated[float, Field(ge=0.0)] = 0.5
    radius_bottom: Annotated[float, Field(ge=0.0)] = 0.5
    height: Annotated[float, Field(gt=0.0)] = 1.0


class TorusShape(Strict):
    kind: Literal["torus"]
    radius: Annotated[float, Field(gt=0.0)] = 0.5
    tube: Annotated[float, Field(gt=0.0)] = 0.15


class PlaneShape(Strict):
    kind: Literal["plane"]
    size: Annotated[list[float], Field(min_length=2, max_length=2)] = Field(default_factory=lambda: [1.0, 1.0])


class RectShape(Strict):
    """Forme 2D (plate, dans le plan XY local)."""

    kind: Literal["rect"]
    size: Annotated[list[float], Field(min_length=2, max_length=2)] = Field(default_factory=lambda: [1.0, 1.0])
    corner_radius: Annotated[float, Field(ge=0.0)] = 0.0


class EllipseShape(Strict):
    """Forme 2D (plate, dans le plan XY local)."""

    kind: Literal["ellipse"]
    radii: Annotated[list[float], Field(min_length=2, max_length=2)] = Field(default_factory=lambda: [0.5, 0.5])


Shape = Annotated[
    Union[BoxShape, SphereShape, CylinderShape, TorusShape, PlaneShape, RectShape, EllipseShape],
    Field(discriminator="kind"),
]


class ShapeNode(NodeBase):
    type: Literal["shape"]
    shape: Shape
    material: Id


class ModelNode(NodeBase):
    type: Literal["model"]
    asset: Id = Field(description="Asset de type 'model' (glTF/GLB).")


class CameraNode(NodeBase):
    type: Literal["camera"]
    projection: Literal["perspective", "orthographic"] = "perspective"
    fov: Annotated[float, Field(gt=1.0, lt=179.0, description="Champ vertical en degrés (perspective).")] = 35.0
    ortho_height: Annotated[float, Field(gt=0.0, description="Hauteur visible (orthographique).")] = 10.0
    near: Annotated[float, Field(gt=0.0)] = 0.1
    far: Annotated[float, Field(gt=0.0)] = 1000.0


class LightNode(NodeBase):
    type: Literal["light"]
    light: Literal["ambient", "directional", "point", "spot"]
    color: Color = "#ffffff"
    intensity: Annotated[float, Field(ge=0.0, le=1000.0)] = 1.0
    cast_shadow: bool = False
    spot_angle: Annotated[float, Field(gt=0.0, le=90.0, description="Demi-angle du cône (spot), degrés.")] = 30.0


Node = Annotated[
    Union[GroupNode, TextNode, ShapeNode, ModelNode, CameraNode, LightNode],
    Field(discriminator="type"),
]


# ---------------------------------------------------------------------------
# Animation
# ---------------------------------------------------------------------------

EasePreset = Literal[
    "linear",
    "hold",
    "ease_in",
    "ease_out",
    "ease_in_out",
    "ease_in_strong",
    "ease_out_strong",
    "ease_in_out_strong",
    "back_in",
    "back_out",
]


class BezierEase(Strict):
    """Courbe de Bézier cubique façon CSS : P0=(0,0), P3=(1,1)."""

    type: Literal["bezier"]
    x1: Unit
    y1: Annotated[float, Field(ge=-2.0, le=3.0)]
    x2: Unit
    y2: Annotated[float, Field(ge=-2.0, le=3.0)]


Ease = Union[EasePreset, BezierEase]

KeyValue = Union[float, Vec3, Color]


class Keyframe(Strict):
    t: Seconds
    value: KeyValue
    ease: Ease = Field(default="ease_in_out", description="Interpolation du segment qui part de cette clé.")


class KeyframeTrack(Strict):
    id: Id
    kind: Literal["keyframes"]
    target: Id = Field(description="Nœud ou matériau animé.")
    property: Annotated[str, Field(min_length=1, max_length=64)] = Field(
        description="Chemin de propriété animable, ex. 'transform.position.y' (voir registre)."
    )
    keyframes: Annotated[list[Keyframe], Field(min_length=1)]


ParamValue = Union[float, bool, str, Vec3]


class Behavior(Strict):
    """Mouvement paramétrique de la grammaire de mouvement (voir registre)."""

    id: Id
    kind: Literal["behavior"]
    target: Id
    behavior: Annotated[str, Field(min_length=1, max_length=64)]
    start: Seconds
    duration: Annotated[float, Field(gt=0.0)]
    params: dict[str, ParamValue] = Field(default_factory=dict)
    split: Literal["none", "char", "word", "line"] = Field(
        default="none", description="Texte uniquement : applique le mouvement par lettre, mot ou ligne."
    )
    stagger: Annotated[float, Field(ge=0.0, le=10.0)] = Field(
        default=0.0, description="Décalage (s) entre éléments quand split != 'none'."
    )
    order: Literal["forward", "reverse", "center_out", "random"] = "forward"


Animation = Annotated[Union[KeyframeTrack, Behavior], Field(discriminator="kind")]


class Marker(Strict):
    id: Id
    t: Seconds
    label: Annotated[str, Field(max_length=200)] = ""


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------


class SceneDocument(Strict):
    """Document de scène MSD complet."""

    model_config = ConfigDict(extra="forbid", strict=True, title="SceneDocument")

    msd_version: Literal["0.1.0"]
    id: Id
    meta: Meta
    settings: Settings
    active_camera: Id | None = None
    assets: list[Asset] = Field(default_factory=list)
    materials: list[Material] = Field(default_factory=list)
    nodes: list[Node] = Field(default_factory=list)
    animations: list[Animation] = Field(default_factory=list)
    markers: list[Marker] = Field(default_factory=list)
