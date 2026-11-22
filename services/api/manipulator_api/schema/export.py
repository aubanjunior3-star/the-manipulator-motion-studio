"""Exporte le JSON Schema et le registre MSD vers packages/scene-schema/generated/.

Usage :
    uv run python -m manipulator_api.schema.export           # écrit les fichiers
    uv run python -m manipulator_api.schema.export --check   # échoue si les fichiers ne sont pas à jour

Ces fichiers générés sont la seule chose que le frontend connaît du schéma
(docs/adr/0002). Ils sont versionnés pour que l'écart soit visible en revue.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .models import MSD_VERSION, SceneDocument
from .registry import registry_as_json

REPO_ROOT = Path(__file__).resolve().parents[4]
OUT_DIR = REPO_ROOT / "packages" / "scene-schema" / "generated"


def _strip_field_titles(node: object) -> None:
    """Pydantic ajoute un `title` à chaque champ ; les générateurs de types en font des
    alias inutiles (Id1, Id2…). On ne garde que les titres des modèles ($defs)."""
    if isinstance(node, dict):
        props = node.get("properties")
        if isinstance(props, dict):
            for prop in props.values():
                if isinstance(prop, dict):
                    prop.pop("title", None)
        for value in node.values():
            _strip_field_titles(value)
    elif isinstance(node, list):
        for value in node:
            _strip_field_titles(value)


def render() -> dict[str, str]:
    schema = SceneDocument.model_json_schema(mode="validation")
    _strip_field_titles(schema)
    schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": f"https://manipulator.studio/schema/msd/{MSD_VERSION}.json",
        **schema,
    }
    registry = {"msd_version": MSD_VERSION, **registry_as_json()}
    dump = lambda obj: json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=False) + "\n"  # noqa: E731
    return {"msd.schema.json": dump(schema), "registry.json": dump(registry)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="Vérifie sans écrire.")
    args = parser.parse_args()

    files = render()
    stale = []
    for name, content in files.items():
        path = OUT_DIR / name
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current != content:
            stale.append(name)
            if not args.check:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8", newline="\n")

    if args.check and stale:
        print(f"Fichiers générés obsolètes : {', '.join(stale)}. Lancez l'export.", file=sys.stderr)
        return 1
    print("À jour." if not stale else f"Écrits : {', '.join(stale)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
