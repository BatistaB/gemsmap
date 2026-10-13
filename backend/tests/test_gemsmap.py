"""The gemsmap package: one version everywhere, the command line, and the health report used by the diagnostics."""
import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import cobragui
import gemsmap
from gemsmap import cli

ROOT = Path(__file__).resolve().parents[2]


def test_one_version_everywhere():
    assert cobragui.__version__ == gemsmap.__version__
    m = re.fullmatch(r"(\d+\.\d+\.\d+)(?:(a|b|rc)(\d+))?", gemsmap.__version__)
    assert m, "PEP 440 X.Y.Z[a|b|rcN]"
    base, kind, n = m.groups()
    npm = base if not kind else f"{base}-{ {'a': 'alpha', 'b': 'beta', 'rc': 'rc'}[kind] }.{n}"
    assert json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"] == npm


def test_version_flag(capsys):
    with pytest.raises(SystemExit) as e:
        cli.main(["--version"])
    assert e.value.code == 0
    assert capsys.readouterr().out.strip() == f"GEMs MAP {gemsmap.__version__}"


def test_diagnose_reports_versions_and_folders():
    text = cli.diagnose()
    assert text.startswith(f"GEMs MAP {gemsmap.__version__}\n")
    assert "COBRApy" in text and "solvers:" in text and "not importable" not in text
    assert "Data folder:" in text and "BiGG tables:" in text
    assert not set("…·→—") & set(text)  # our own text is ASCII, so it prints in every console (paths may not be)


def test_output_survives_a_console_that_cannot_encode_the_folder_name():
    """Seen on Windows: a pipe in cp949 and a folder named 'gm zip Á' made `gemsmap diagnose` crash."""
    import io
    import sys
    raw = io.BytesIO()
    narrow = io.TextIOWrapper(raw, encoding="ascii")
    old = sys.stdout
    sys.stdout = narrow
    try:
        cli.main(["diagnose"])  # reconfigures the stream, so the non-ASCII path below cannot raise
        print("C:\\gm zip \u00c1\\runtime")
        narrow.flush()
    finally:
        sys.stdout = old
    assert b"\\xc1" in raw.getvalue()


def test_probe_finds_nothing_on_a_closed_port():
    assert cli._probe("http://127.0.0.1:9") is None


def test_health_reports_python_and_platform():
    from cobragui.main import app
    j = TestClient(app).get("/api/health").json()
    assert j["version"] == gemsmap.__version__ and j["python"] and j["platform"]
