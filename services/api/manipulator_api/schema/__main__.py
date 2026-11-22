"""Valide des fichiers de scène en ligne de commande.

    uv run python -m manipulator_api.schema scene.json [autre.json …]

Code de sortie 0 si tous les documents sont valides, 1 sinon.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .validate import validate_document


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    failed = False
    for arg in argv:
        path = Path(arg)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"✗ {path} : lecture impossible ({exc})")
            failed = True
            continue
        report = validate_document(data)
        print(f"{'✓' if report.ok else '✗'} {path}")
        for issue in report.issues:
            print(f"    [{issue.severity}] {issue.code} {issue.path} — {issue.message}")
        failed |= not report.ok
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
