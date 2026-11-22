"""Contrat de validation : scènes de référence (tests/fixtures/scenes).

Ces fichiers sont partagés avec les tests TypeScript : Python et TS doivent
donner le même verdict structurel sur chacun d'eux.
"""

import pytest

from manipulator_api.schema import validate_document

from .conftest import FIXTURES, load

VALID = sorted((FIXTURES / "valid").glob("*.json"))
EXPECTATIONS = load(FIXTURES / "invalid" / "expectations.json")


def test_fixture_sets_are_complete():
    assert len(VALID) >= 10
    on_disk = {p.name for p in (FIXTURES / "invalid").glob("*.json")} - {"expectations.json"}
    assert on_disk == set(EXPECTATIONS), "Chaque scène invalide doit avoir une attente déclarée (et inversement)."


@pytest.mark.parametrize("path", VALID, ids=lambda p: p.stem)
def test_valid_scenes_pass_without_warnings(path):
    report = validate_document(load(path))
    assert report.ok, report.to_dict()
    assert report.warnings == [], report.to_dict()


@pytest.mark.parametrize("name", sorted(EXPECTATIONS), ids=lambda n: n.removesuffix(".json"))
def test_invalid_scenes_fail_with_exact_codes(name):
    expected = EXPECTATIONS[name]
    report = validate_document(load(FIXTURES / "invalid" / name))
    assert not report.ok
    assert {i.code for i in report.errors} == set(expected["codes"]), report.to_dict()
    layer_is_schema = all(i.code.startswith("schema.") for i in report.errors)
    assert layer_is_schema == (expected["layer"] == "schema")
    for issue in report.errors:
        assert issue.path.startswith("/"), issue
