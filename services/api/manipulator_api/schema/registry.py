"""Registres MSD v0 : propriétés animables et behaviors (grammaire du mouvement).

Ce module est une *spécification* : il dit ce qu'un document a le droit de demander.
L'exécution des behaviors arrive en phase 1 (moteur `motion-engine`) ; tant qu'un
behavior n'y est pas implémenté et testé, le moteur doit le refuser explicitement
plutôt que de l'ignorer (règle : pas de fonctionnalité simulée).

Le registre est exporté en JSON (`packages/scene-schema/generated/registry.json`)
pour que le frontend utilise exactement les mêmes définitions.
"""

from __future__ import annotations

from typing import Any, Literal, get_args

from .models import EasePreset

EASE_PRESETS: list[str] = list(get_args(EasePreset))

ValueType = Literal["scalar", "vec3", "color"]

# ---------------------------------------------------------------------------
# Propriétés animables par type de cible
# ---------------------------------------------------------------------------

_VEC3_PROPS = ("transform.position", "transform.rotation", "transform.scale")


def _transform_props() -> dict[str, ValueType]:
    props: dict[str, ValueType] = {}
    for base in _VEC3_PROPS:
        props[base] = "vec3"
        for axis in "xyz":
            props[f"{base}.{axis}"] = "scalar"
    props["opacity"] = "scalar"
    return props


_COMMON = _transform_props()

ANIMATABLE: dict[str, dict[str, ValueType]] = {
    "group": dict(_COMMON),
    "text": {**_COMMON, "size": "scalar", "letter_spacing": "scalar"},
    "shape": dict(_COMMON),
    "model": dict(_COMMON),
    "camera": {**_COMMON, "fov": "scalar", "ortho_height": "scalar"},
    "light": {**_COMMON, "intensity": "scalar", "color": "color", "spot_angle": "scalar"},
    "material": {
        "base_color": "color",
        "metalness": "scalar",
        "roughness": "scalar",
        "emissive": "color",
        "emissive_intensity": "scalar",
        "opacity": "scalar",
    },
}


def properties_overlap(a: str, b: str) -> bool:
    """Deux chemins se recouvrent s'ils sont égaux ou si l'un est le parent de l'autre
    ('transform.position' et 'transform.position.x')."""
    return a == b or a.startswith(b + ".") or b.startswith(a + ".")


# ---------------------------------------------------------------------------
# Behaviors
# ---------------------------------------------------------------------------
# Chaque paramètre : {"type": number|enum|vec3|bool|node_ref, "default": …, contraintes}
# "targets" : types de nœud acceptés.

_ALL_VISUAL = ["group", "text", "shape", "model"]
_MOVABLE = ["group", "text", "shape", "model", "camera", "light"]

_ENTER_STYLES = ["fade", "rise", "drop", "slide_left", "slide_right", "scale_up", "pop"]
_EXIT_STYLES = ["fade", "rise", "drop", "slide_left", "slide_right", "scale_down"]

BEHAVIORS: dict[str, dict[str, Any]] = {
    "enter": {
        "description": "Apparition de l'élément (ou de chaque lettre/mot si split).",
        "targets": _ALL_VISUAL,
        "params": {
            "style": {"type": "enum", "values": _ENTER_STYLES, "default": "rise"},
            "distance": {"type": "number", "min": 0.0, "max": 100.0, "default": 0.5},
            "ease": {"type": "enum", "values": EASE_PRESETS, "default": "ease_out_strong"},
        },
    },
    "exit": {
        "description": "Disparition de l'élément (ou de chaque lettre/mot si split).",
        "targets": _ALL_VISUAL,
        "params": {
            "style": {"type": "enum", "values": _EXIT_STYLES, "default": "fade"},
            "distance": {"type": "number", "min": 0.0, "max": 100.0, "default": 0.5},
            "ease": {"type": "enum", "values": EASE_PRESETS, "default": "ease_in_strong"},
        },
    },
    "spin": {
        "description": "Rotation continue autour d'un axe local.",
        "targets": _ALL_VISUAL,
        "params": {
            "axis": {"type": "enum", "values": ["x", "y", "z"], "default": "y"},
            "revolutions": {"type": "number", "min": -100.0, "max": 100.0, "default": 1.0},
            "ease": {"type": "enum", "values": EASE_PRESETS, "default": "linear"},
        },
    },
    "float": {
        "description": "Flottement doux (oscillation verticale et légère rotation).",
        "targets": _ALL_VISUAL,
        "params": {
            "amplitude": {"type": "number", "min": 0.0, "max": 10.0, "default": 0.1},
            "frequency": {"type": "number", "min": 0.01, "max": 10.0, "default": 0.5},
        },
    },
    "pulse": {
        "description": "Pulsation d'échelle périodique.",
        "targets": _ALL_VISUAL,
        "params": {
            "amount": {"type": "number", "min": 0.0, "max": 2.0, "default": 0.08},
            "frequency": {"type": "number", "min": 0.01, "max": 10.0, "default": 1.0},
        },
    },
    "wiggle": {
        "description": "Bruit procédural (déterministe, seedé) sur la position.",
        "targets": _MOVABLE,
        "params": {
            "amplitude": {"type": "number", "min": 0.0, "max": 10.0, "default": 0.05},
            "frequency": {"type": "number", "min": 0.01, "max": 30.0, "default": 2.0},
        },
    },
    "orbit": {
        "description": "Orbite autour d'un point (souvent la caméra autour du sujet).",
        "targets": _MOVABLE,
        "params": {
            "center": {"type": "vec3", "default": [0.0, 0.0, 0.0]},
            "degrees": {"type": "number", "min": -3600.0, "max": 3600.0, "default": 45.0},
            "axis": {"type": "enum", "values": ["x", "y", "z"], "default": "y"},
            "ease": {"type": "enum", "values": EASE_PRESETS, "default": "ease_in_out"},
        },
    },
    "dolly": {
        "description": "Déplacement de caméra le long de son axe de visée.",
        "targets": ["camera"],
        "params": {
            "distance": {"type": "number", "min": -1000.0, "max": 1000.0, "default": 1.0},
            "ease": {"type": "enum", "values": EASE_PRESETS, "default": "ease_in_out"},
        },
    },
    "look_at": {
        "description": "Oriente la cible vers un autre nœud pendant toute la durée.",
        "targets": ["camera", "light", "group", "shape", "model"],
        "params": {
            "node": {"type": "node_ref", "required": True},
        },
    },
}


# ---------------------------------------------------------------------------
# Ressources livrées avec le logiciel (URI "builtin:<clé>")
# ---------------------------------------------------------------------------
# Fichiers dans assets/builtin/. Licence obligatoire et compatible usage commercial.
# Les polices sont des sous-ensembles « latin » (latin de base + latin-1 : français,
# espagnol, allemand…).

BUILTIN_ASSETS: dict[str, dict[str, str]] = {
    "fonts/display-bold": {
        "kind": "font",
        "file": "fonts/SpaceGrotesk-Bold.woff",
        "family": "Space Grotesk Bold",
        "license": "OFL-1.1",
        "license_file": "fonts/OFL-SpaceGrotesk.txt",
    },
    "fonts/ui-regular": {
        "kind": "font",
        "file": "fonts/Inter-Regular.woff",
        "family": "Inter Regular",
        "license": "OFL-1.1",
        "license_file": "fonts/OFL-Inter.txt",
    },
}


def registry_as_json() -> dict[str, Any]:
    return {
        "ease_presets": EASE_PRESETS,
        "animatable": ANIMATABLE,
        "behaviors": BEHAVIORS,
        "builtin_assets": BUILTIN_ASSETS,
    }
