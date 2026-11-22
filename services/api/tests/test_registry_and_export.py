"""Cohérence du registre et des fichiers générés pour le frontend."""

import json
from typing import get_args

import pytest

from manipulator_api.schema import BEHAVIORS, EASE_PRESETS, MSD_VERSION, SceneDocument
from manipulator_api.schema.export import OUT_DIR, render
from manipulator_api.schema.models import Node


def test_generated_files_are_up_to_date():
    for name, content in render().items():
        on_disk = (OUT_DIR / name).read_text(encoding="utf-8")
        assert on_disk == content, f"{name} obsolète : lancez `pnpm schema:export`."


def test_schema_declares_current_version():
    schema = json.loads(render()["msd.schema.json"])
    assert schema["properties"]["msd_version"]["const"] == MSD_VERSION
    assert MSD_VERSION in schema["$id"]


def test_ease_presets_match_model():
    assert EASE_PRESETS and "linear" in EASE_PRESETS and "hold" in EASE_PRESETS


@pytest.mark.parametrize("name", sorted(BEHAVIORS))
def test_behavior_spec_defaults_are_valid(name):
    spec = BEHAVIORS[name]
    assert spec["description"] and spec["targets"]
    for pname, p in spec["params"].items():
        t = p["type"]
        assert t in {"number", "enum", "vec3", "bool", "node_ref"}, pname
        if t == "number":
            assert p["min"] <= p["default"] <= p["max"], pname
        elif t == "enum":
            assert p["default"] in p["values"], pname
        elif t == "vec3":
            assert len(p["default"]) == 3, pname
        elif t == "node_ref":
            assert "default" not in p, pname


def test_behavior_targets_are_real_node_types():
    node_types = {m.model_fields["type"].annotation.__args__[0] for m in get_args(get_args(Node)[0])}
    for name, spec in BEHAVIORS.items():
        assert set(spec["targets"]) <= node_types, name


def test_document_model_title():
    assert SceneDocument.model_json_schema()["title"] == "SceneDocument"
