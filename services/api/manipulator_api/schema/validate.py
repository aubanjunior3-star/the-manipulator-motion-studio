"""Validation d'un document MSD en deux couches.

1. Structure : modèle Pydantic strict (équivalent au JSON Schema exporté).
2. Sémantique : références croisées, hiérarchie, cohérence temporelle, propriétés
   animables, paramètres de behaviors.

Chaque problème est un `Issue` avec un code stable, un chemin JSON Pointer
(RFC 6901) et un message lisible. Le code et le chemin sont destinés à la boucle
de correction automatique de l'IA (phase 3) et à l'interface (surlignage du champ).
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from pydantic import ValidationError

from .models import (
    Behavior,
    CameraNode,
    GroupNode,
    KeyframeTrack,
    ModelNode,
    SceneDocument,
    ShapeNode,
    TextNode,
)
from .registry import ANIMATABLE, BEHAVIORS, BUILTIN_ASSETS, properties_overlap

Severity = Literal["error", "warning"]


@dataclass(frozen=True)
class Issue:
    code: str
    path: str
    message: str
    severity: Severity = "error"


@dataclass
class Report:
    issues: list[Issue] = field(default_factory=list)
    document: SceneDocument | None = None

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "warning"]

    @property
    def ok(self) -> bool:
        return not self.errors

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "issues": [asdict(i) for i in self.issues]}


def _pointer(*parts: Any) -> str:
    def esc(p: Any) -> str:
        return str(p).replace("~", "~0").replace("/", "~1")

    return "/" + "/".join(esc(p) for p in parts)


_TAG_FIELDS = ("type", "kind")


def _loc_to_pointer(data: Any, loc: tuple[Any, ...]) -> str:
    """Convertit un `loc` Pydantic en JSON Pointer vers le document réel.

    Pydantic insère dans `loc` des segments qui n'existent pas dans le document :
    - l'étiquette d'une union discriminée, juste à l'entrée de l'objet
      (('nodes', 4, 'text', 'id') → '/nodes/4/id'), y compris quand l'étiquette porte
      le même nom qu'un champ ({"type": "shape", "shape": {…}}) ;
    - le nom du membre essayé dans une union simple ('float', 'BezierEase'…).
    Un segment final absent d'un objet est un champ manquant : il est conservé.
    """
    parts: list[Any] = []
    cur: Any = data
    tag_consumed = False
    last = len(loc) - 1
    for idx, part in enumerate(loc):
        if isinstance(cur, dict):
            if not tag_consumed and any(cur.get(f) == part for f in _TAG_FIELDS):
                tag_consumed = True  # étiquette de variante
                continue
            if part in cur:
                parts.append(part)
                cur, tag_consumed = cur[part], False
            elif idx == last:
                parts.append(part)  # champ manquant
            # sinon : nom de membre d'union, ignoré
        elif isinstance(cur, list) and isinstance(part, int) and 0 <= part < len(cur):
            parts.append(part)
            cur, tag_consumed = cur[part], False
        # sinon : nom de membre d'union sur une valeur scalaire, ignoré
    return _pointer(*parts) if parts else "/"


# ---------------------------------------------------------------------------
# Point d'entrée
# ---------------------------------------------------------------------------


def validate_document(data: Any) -> Report:
    """Valide un document (dict issu de JSON). Ne lève jamais d'exception pour un document invalide."""
    report = Report()
    try:
        doc = SceneDocument.model_validate(data)
    except ValidationError as exc:
        for err in exc.errors():
            report.issues.append(
                Issue(
                    code=f"schema.{err['type']}",
                    path=_loc_to_pointer(data, err["loc"]),
                    message=err["msg"],
                )
            )
        return report

    report.document = doc
    _check_semantics(doc, report.issues)
    return report


# ---------------------------------------------------------------------------
# Règles sémantiques
# ---------------------------------------------------------------------------


def _check_semantics(doc: SceneDocument, out: list[Issue]) -> None:
    duration = doc.settings.duration

    # --- unicité des identifiants (tout le document partage un seul espace) ---
    seen: dict[str, str] = {}
    collections: list[tuple[str, list[Any]]] = [
        ("assets", doc.assets),
        ("materials", doc.materials),
        ("nodes", doc.nodes),
        ("animations", doc.animations),
        ("markers", doc.markers),
    ]
    for coll_name, items in collections:
        for i, item in enumerate(items):
            path = _pointer(coll_name, i, "id")
            if item.id in seen:
                out.append(Issue("id.duplicate", path, f"Identifiant '{item.id}' déjà utilisé en {seen[item.id]}."))
            else:
                seen[item.id] = path

    assets = {a.id: a for a in doc.assets}
    materials = {m.id: m for m in doc.materials}
    nodes = {n.id: n for n in doc.nodes}

    # --- ressources intégrées : doivent exister dans le catalogue, avec le bon type ---
    for i, asset in enumerate(doc.assets):
        if asset.uri.startswith("builtin:"):
            entry = BUILTIN_ASSETS.get(asset.uri.removeprefix("builtin:"))
            path = _pointer("assets", i, "uri")
            if entry is None:
                out.append(
                    Issue(
                        "ref.builtin_unknown",
                        path,
                        f"Ressource intégrée '{asset.uri}' inconnue. Disponibles : "
                        + ", ".join(f"builtin:{k}" for k in sorted(BUILTIN_ASSETS)),
                    )
                )
            elif entry["kind"] != asset.kind:
                out.append(
                    Issue("ref.builtin_kind", path, f"'{asset.uri}' est de type '{entry['kind']}', pas '{asset.kind}'.")
                )

    # --- nœuds : références ---
    for i, node in enumerate(doc.nodes):
        if node.parent is not None:
            parent = nodes.get(node.parent)
            if parent is None:
                out.append(Issue("ref.parent_missing", _pointer("nodes", i, "parent"), f"Parent '{node.parent}' introuvable."))
            elif not isinstance(parent, GroupNode):
                out.append(
                    Issue(
                        "ref.parent_not_group",
                        _pointer("nodes", i, "parent"),
                        f"Le parent '{node.parent}' est de type '{parent.type}' ; seul un 'group' peut avoir des enfants.",
                    )
                )
        if isinstance(node, (TextNode, ShapeNode)) and node.material not in materials:
            out.append(Issue("ref.material_missing", _pointer("nodes", i, "material"), f"Matériau '{node.material}' introuvable."))
        if isinstance(node, TextNode):
            _check_asset_ref(assets, node.font, "font", _pointer("nodes", i, "font"), out)
        if isinstance(node, ModelNode):
            _check_asset_ref(assets, node.asset, "model", _pointer("nodes", i, "asset"), out)
        if isinstance(node, CameraNode) and node.near >= node.far:
            out.append(Issue("camera.near_far", _pointer("nodes", i, "near"), "'near' doit être strictement inférieur à 'far'."))

    # --- hiérarchie : cycles ---
    for i, node in enumerate(doc.nodes):
        visited = {node.id}
        cur = node.parent
        while cur is not None and cur in nodes:
            if cur in visited:
                out.append(Issue("hierarchy.cycle", _pointer("nodes", i, "parent"), f"Cycle de parenté passant par '{node.id}'."))
                break
            visited.add(cur)
            cur = nodes[cur].parent

    # --- caméra active ---
    if doc.active_camera is not None:
        cam = nodes.get(doc.active_camera)
        if cam is None:
            out.append(Issue("camera.active_missing", "/active_camera", f"Caméra '{doc.active_camera}' introuvable."))
        elif not isinstance(cam, CameraNode):
            out.append(Issue("camera.active_not_camera", "/active_camera", f"'{doc.active_camera}' n'est pas une caméra."))
    elif any(n.type in ("text", "shape", "model") for n in doc.nodes):
        out.append(
            Issue(
                "camera.none",
                "/active_camera",
                "Aucune caméra active : le rendu utilisera une caméra par défaut.",
                "warning",
            )
        )

    # --- animations ---
    tracks_by_target: dict[str, list[tuple[int, KeyframeTrack]]] = {}
    for i, anim in enumerate(doc.animations):
        base = ("animations", i)
        target_type = _target_type(anim.target, nodes, materials)
        if target_type is None:
            out.append(Issue("anim.target_missing", _pointer(*base, "target"), f"Cible '{anim.target}' introuvable."))
            continue
        if isinstance(anim, KeyframeTrack):
            _check_track(anim, i, target_type, duration, out)
            tracks_by_target.setdefault(anim.target, []).append((i, anim))
        else:
            _check_behavior(anim, i, target_type, nodes, duration, out)

    # --- conflits : deux pistes sur la même propriété (ou une propriété et sa composante) ---
    for target, tracks in tracks_by_target.items():
        for a in range(len(tracks)):
            for b in range(a + 1, len(tracks)):
                (ia, ta), (ib, tb) = tracks[a], tracks[b]
                if properties_overlap(ta.property, tb.property):
                    out.append(
                        Issue(
                            "anim.conflict",
                            _pointer("animations", ib, "property"),
                            f"'{tb.property}' entre en conflit avec la piste '{ta.id}' ('{ta.property}') sur '{target}'.",
                        )
                    )

    # --- marqueurs ---
    for i, m in enumerate(doc.markers):
        if m.t > duration:
            out.append(Issue("marker.out_of_range", _pointer("markers", i, "t"), f"Marqueur à {m.t}s au-delà de la durée ({duration}s)."))


def _check_asset_ref(assets: dict[str, Any], ref: str, kind: str, path: str, out: list[Issue]) -> None:
    asset = assets.get(ref)
    if asset is None:
        out.append(Issue("ref.asset_missing", path, f"Asset '{ref}' introuvable."))
    elif asset.kind != kind:
        out.append(Issue("ref.asset_kind", path, f"L'asset '{ref}' est de type '{asset.kind}', '{kind}' attendu."))


def _target_type(target: str, nodes: dict[str, Any], materials: dict[str, Any]) -> str | None:
    if target in nodes:
        return nodes[target].type
    if target in materials:
        return "material"
    return None


def _value_matches(value: Any, expected: str) -> bool:
    if expected == "scalar":
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    if expected == "vec3":
        return isinstance(value, list) and len(value) == 3 and all(math.isfinite(v) for v in value)
    if expected == "color":
        return isinstance(value, str)
    return False


def _check_track(track: KeyframeTrack, i: int, target_type: str, duration: float, out: list[Issue]) -> None:
    props = ANIMATABLE.get(target_type, {})
    expected = props.get(track.property)
    if expected is None:
        out.append(
            Issue(
                "anim.property_unknown",
                _pointer("animations", i, "property"),
                f"'{track.property}' n'est pas animable sur un '{target_type}'. Possibles : {', '.join(sorted(props))}.",
            )
        )
        return
    prev_t: float | None = None
    for k, kf in enumerate(track.keyframes):
        kp = ("animations", i, "keyframes", k)
        if not _value_matches(kf.value, expected):
            out.append(Issue("anim.value_type", _pointer(*kp, "value"), f"Valeur de type '{expected}' attendue pour '{track.property}'."))
        if kf.t > duration:
            out.append(Issue("anim.out_of_range", _pointer(*kp, "t"), f"Clé à {kf.t}s au-delà de la durée ({duration}s)."))
        if prev_t is not None and kf.t <= prev_t:
            out.append(Issue("anim.keyframe_order", _pointer(*kp, "t"), "Les clés doivent être en temps strictement croissant."))
        prev_t = kf.t


def _split_count(node: Any, split: str) -> int:
    if not isinstance(node, TextNode) or split == "none":
        return 1
    if split == "char":
        return max(1, sum(1 for c in node.content if not c.isspace()))
    if split == "word":
        return max(1, len(node.content.split()))
    return max(1, len(node.content.splitlines()))


def _check_behavior(b: Behavior, i: int, target_type: str, nodes: dict[str, Any], duration: float, out: list[Issue]) -> None:
    base = ("animations", i)
    spec = BEHAVIORS.get(b.behavior)
    if spec is None:
        out.append(
            Issue(
                "behavior.unknown",
                _pointer(*base, "behavior"),
                f"Behavior '{b.behavior}' inconnu. Disponibles : {', '.join(sorted(BEHAVIORS))}.",
            )
        )
        return
    if target_type not in spec["targets"]:
        out.append(
            Issue(
                "behavior.target_type",
                _pointer(*base, "target"),
                f"'{b.behavior}' ne s'applique pas à un '{target_type}' (accepte : {', '.join(spec['targets'])}).",
            )
        )

    params_spec: dict[str, Any] = spec["params"]
    for name, value in b.params.items():
        p = params_spec.get(name)
        ppath = _pointer(*base, "params", name)
        if p is None:
            out.append(Issue("behavior.param_unknown", ppath, f"Paramètre '{name}' inconnu pour '{b.behavior}'."))
            continue
        ptype = p["type"]
        if ptype == "number":
            if not _value_matches(value, "scalar"):
                out.append(Issue("behavior.param_type", ppath, f"'{name}' doit être un nombre."))
            elif not (p["min"] <= value <= p["max"]):
                out.append(Issue("behavior.param_range", ppath, f"'{name}' doit être entre {p['min']} et {p['max']}."))
        elif ptype == "enum":
            if value not in p["values"]:
                out.append(Issue("behavior.param_type", ppath, f"'{name}' doit valoir l'une de : {', '.join(p['values'])}."))
        elif ptype == "vec3":
            if not _value_matches(value, "vec3"):
                out.append(Issue("behavior.param_type", ppath, f"'{name}' doit être un vecteur [x, y, z]."))
        elif ptype == "bool":
            if not isinstance(value, bool):
                out.append(Issue("behavior.param_type", ppath, f"'{name}' doit être un booléen."))
        elif ptype == "node_ref":
            if not isinstance(value, str) or value not in nodes:
                out.append(Issue("behavior.node_ref_missing", ppath, f"'{name}' doit référencer un nœud existant."))
            elif value == b.target:
                out.append(Issue("behavior.node_ref_self", ppath, f"'{name}' ne peut pas référencer la cible elle-même."))
    for name, p in params_spec.items():
        if p.get("required") and name not in b.params:
            out.append(Issue("behavior.param_missing", _pointer(*base, "params"), f"Paramètre obligatoire '{name}' manquant."))

    target = nodes.get(b.target)
    if b.split != "none" and not isinstance(target, TextNode):
        out.append(Issue("behavior.split_not_text", _pointer(*base, "split"), "Le découpage (split) ne s'applique qu'aux textes."))
    elif b.split != "none" and spec.get("splittable", True) is False:
        out.append(
            Issue(
                "behavior.split_unsupported",
                _pointer(*base, "split"),
                f"'{b.behavior}' s'applique à l'objet entier, pas lettre par lettre (split doit valoir 'none').",
            )
        )
    if b.split == "none" and b.stagger > 0:
        out.append(
            Issue("behavior.stagger_ignored", _pointer(*base, "stagger"), "'stagger' est ignoré quand split vaut 'none'.", "warning")
        )

    end = b.start + b.duration + b.stagger * (_split_count(target, b.split) - 1)
    if end > duration + 1e-9:
        out.append(
            Issue(
                "anim.out_of_range",
                _pointer(*base, "start"),
                f"Le behavior se termine à {end:.3f}s, au-delà de la durée ({duration}s).",
            )
        )
