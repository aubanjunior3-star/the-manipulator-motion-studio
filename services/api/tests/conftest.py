import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "scenes"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def scene():
    """Copie fraîche de la scène de référence 01 (modifiable par le test)."""
    return load(FIXTURES / "valid" / "01-title-rise-3d.json")
