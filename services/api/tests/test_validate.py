"""Règles de validation non couvertes directement par les scènes de référence."""

from manipulator_api.schema import validate_document
from manipulator_api.schema.registry import properties_overlap
from manipulator_api.schema.validate import _loc_to_pointer, _pointer


def codes(report):
    return {i.code for i in report.issues}


# --- structure ---------------------------------------------------------------


def test_strict_mode_rejects_numeric_strings(scene):
    scene["materials"][0]["roughness"] = "0.5"
    report = validate_document(scene)
    assert not report.ok
    assert report.errors[0].path == "/materials/0/roughness"


def test_int_accepted_for_float_fields(scene):
    scene["settings"]["duration"] = 5
    assert validate_document(scene).ok


def test_non_object_input_does_not_raise():
    for data in (None, [], "scene", 42):
        report = validate_document(data)
        assert not report.ok and report.issues


def test_missing_required_field_points_to_field(scene):
    title = next(n for n in scene["nodes"] if n["id"] == "title")
    del title["content"]
    report = validate_document(scene)
    assert report.errors[0].path == "/nodes/4/content"
    assert report.errors[0].code == "schema.missing"


# --- JSON Pointer ------------------------------------------------------------


def test_pointer_escapes_rfc6901():
    assert _pointer("a/b", "c~d", 0) == "/a~1b/c~0d/0"


def test_loc_strips_union_tags():
    data = {"nodes": [{"type": "shape", "shape": {"kind": "box"}}]}
    # étiquette 'shape' identique au nom du champ 'shape', puis étiquette 'box', puis champ manquant
    assert _loc_to_pointer(data, ("nodes", 0, "shape", "shape", "box", "size")) == "/nodes/0/shape/size"


def test_loc_tag_equal_to_field_name_keyframes():
    data = {"animations": [{"kind": "keyframes", "keyframes": [{"t": 0, "value": None}]}]}
    loc = ("animations", 0, "keyframes", "keyframes", 0, "value", "float")
    assert _loc_to_pointer(data, loc) == "/animations/0/keyframes/0/value"


def test_union_value_error_points_to_value(scene):
    scene["animations"].append(
        {"id": "o", "kind": "keyframes", "target": "title", "property": "opacity", "keyframes": [{"t": 0, "value": None}]}
    )
    report = validate_document(scene)
    assert report.errors and {i.path for i in report.errors} == {"/animations/2/keyframes/0/value"}


def test_bad_bezier_points_to_ease(scene):
    scene["animations"].append(
        {"id": "o", "kind": "keyframes", "target": "title", "property": "opacity",
         "keyframes": [{"t": 0, "value": 1, "ease": {"type": "bezier", "x1": 5, "y1": 0, "x2": 0, "y2": 1}}]}
    )
    paths = {i.path for i in validate_document(scene).errors}
    assert "/animations/2/keyframes/0/ease/x1" in paths


# --- sémantique ----------------------------------------------------------------


def test_scene_without_camera_warns_but_is_valid(scene):
    scene["active_camera"] = None
    report = validate_document(scene)
    assert report.ok
    assert codes(report) == {"camera.none"}


def test_stagger_without_split_is_a_warning(scene):
    scene["animations"][1]["stagger"] = 0.1
    report = validate_document(scene)
    assert report.ok
    assert "behavior.stagger_ignored" in codes(report)


def test_stagger_end_counts_words_and_lines(scene):
    title = next(n for n in scene["nodes"] if n["id"] == "title")
    title["content"] = "UN DEUX TROIS"  # 3 mots, 11 lettres
    anim = scene["animations"][0]
    anim.update(start=0.0, duration=1.0, split="word", stagger=2.0)  # fin = 1 + 2*2 = 5.0 → OK
    assert validate_document(scene).ok
    anim["stagger"] = 2.01  # fin = 5.02 > 5.0
    assert "anim.out_of_range" in codes(validate_document(scene))
    title["content"] = "A\nB"
    anim.update(split="line", stagger=3.9)  # 2 lignes : fin = 1 + 3.9 = 4.9
    assert validate_document(scene).ok


def test_look_at_cannot_target_itself(scene):
    scene["animations"].append(
        {"id": "aim", "kind": "behavior", "target": "cam_main", "behavior": "look_at", "start": 0, "duration": 1, "params": {"node": "cam_main"}}
    )
    assert "behavior.node_ref_self" in codes(validate_document(scene))


def test_material_color_track_accepts_hex_and_rejects_vec3(scene):
    track = {"id": "c", "kind": "keyframes", "target": "m_chrome", "property": "base_color", "keyframes": [{"t": 0, "value": "#ff0000"}]}
    scene["animations"].append(track)
    assert validate_document(scene).ok
    track["keyframes"][0]["value"] = [1, 0, 0]
    assert "anim.value_type" in codes(validate_document(scene))


def test_enum_param_validation(scene):
    scene["animations"][0]["params"]["style"] = "teleport"
    assert "behavior.param_type" in codes(validate_document(scene))


def test_unknown_param_rejected(scene):
    scene["animations"][0]["params"]["speed"] = 2.0
    assert "behavior.param_unknown" in codes(validate_document(scene))


def test_animation_on_missing_target(scene):
    scene["animations"][0]["target"] = "ghost"
    assert codes(validate_document(scene)) == {"anim.target_missing"}


def test_properties_overlap():
    assert properties_overlap("transform.position", "transform.position.x")
    assert properties_overlap("transform.position.x", "transform.position")
    assert properties_overlap("opacity", "opacity")
    assert not properties_overlap("transform.position.x", "transform.position.y")
    assert not properties_overlap("transform.position", "transform.positions")
