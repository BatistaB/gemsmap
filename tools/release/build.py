"""Build the GEMs MAP release files from a clean copy of the repository.

    python tools/release/build.py                 -> release/gemsmap-<version>-py3-none-any.whl and .tar.gz (PyPI)
                                                     and release/GEMsMAP-<version>.zip (double-click download)
    python tools/release/build.py --keep          keep the temporary build folder (for inspection)

The zip holds the wheel and the launchers of tools/release/zip/ (Windows .bat + PowerShell, macOS .command, Linux
.sh, README-FIRST.txt): the first start installs uv (pinned UV_VERSION, only if absent), Python ZIP_PYTHON and the
wheel into the extracted folder.

Privacy by construction: only the files git tracks, plus new files that are not git-ignored, are copied to a
temporary folder, and everything is built there. Git-ignored private data (my_projects/, local projects under
public/ or tests/) therefore never reaches a release, even though Vite copies all of public/ into the build.
The archives are then checked: no private-looking file name, the web interface present, one version everywhere.
Personal name patterns can be added, one regular expression per line, in .git/info/release-private-patterns
(local, never committed).

Steps in the copy: npm ci, npm run build (type check + Vite), dist/ -> backend/gemsmap/web/, python -m build.
Needs Node 18+ and, in the Python that runs this script, the `build` package (pip install build).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "release"
UV_VERSION = "0.13.0"  # the uv installer the zip launchers download when uv is not installed
ZIP_PYTHON = "3.12"  # the Python the zip launchers install (uv-managed, inside the extracted folder)
CRLF = {".bat", ".ps1", ".txt"}  # Windows files and the readme; the shell scripts must stay LF
EXECUTABLE = {".sh", ".command"}
# file names that must never be in a release (local projects and data), plus personal patterns kept out of git
_LOCAL = ROOT / ".git" / "info" / "release-private-patterns"
_EXTRA = [ln.strip() for ln in _LOCAL.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.startswith("#")] if _LOCAL.is_file() else []
PRIVATE = re.compile(r"(?i)(my_projects|analysis_test|\.gemsmap$|\.metmap$" + "".join("|" + x for x in _EXTRA) + ")")


def python_version() -> str:
    text = (ROOT / "backend/gemsmap/__init__.py").read_text(encoding="utf-8")
    return re.search(r'__version__ = "([^"]+)"', text).group(1)


def npm_version(pep440: str) -> str:
    """0.3.0b1 -> 0.3.0-beta.1, 0.3.0rc2 -> 0.3.0-rc.2, 0.3.0 -> 0.3.0 (package.json uses SemVer)."""
    m = re.fullmatch(r"(\d+\.\d+\.\d+)(?:(a|b|rc)(\d+))?", pep440)
    if not m:
        sys.exit(f"Unsupported version {pep440!r}: use X.Y.Z, X.Y.ZaN, X.Y.ZbN or X.Y.ZrcN")
    base, kind, n = m.groups()
    label = {"a": "alpha", "b": "beta", "rc": "rc"}.get(kind or "")
    return f"{base}-{label}.{n}" if label else base


def tracked_files() -> list[str]:
    out = subprocess.run(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=ROOT,
                         check=True, capture_output=True).stdout.decode("utf-8")
    return sorted({f for f in out.split("\0") if f and (ROOT / f).is_file()})


def run(cmd: list[str], cwd: Path) -> None:
    print(f"\n$ {' '.join(cmd)}", flush=True)
    subprocess.run(cmd, cwd=cwd, check=True)


def make_zip(template: Path, wheel: Path, version: str) -> Path:
    """GEMsMAP-<version>.zip: one folder with the launchers, README-FIRST.txt and app/<wheel>."""
    top = f"GEMsMAP-{version}"
    dest = wheel.parent / f"{top}.zip"
    subst = {"{{VERSION}}": version, "{{WHEEL}}": wheel.name, "{{UV_VERSION}}": UV_VERSION, "{{PYTHON}}": ZIP_PYTHON}
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for src in sorted(p for p in template.rglob("*") if p.is_file()):
            text = src.read_text(encoding="utf-8")
            for k, v in subst.items():
                text = text.replace(k, v)
            if "{{" in text:
                sys.exit(f"Unfilled placeholder in {src.name}")
            text = text.replace("\r\n", "\n")
            if src.suffix in CRLF:
                text = text.replace("\n", "\r\n")
            info = zipfile.ZipInfo(f"{top}/{src.relative_to(template).as_posix()}", time.localtime()[:6])
            info.create_system = 3  # Unix attributes, so macOS and Linux keep the executable bit
            info.external_attr = (0o100755 if src.suffix in EXECUTABLE else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, text.encode("utf-8"))
        z.write(wheel, f"{top}/app/{wheel.name}")
    return dest


def check_archive(path: Path, version: str) -> list[str]:
    if path.suffix == ".zip":
        names = zipfile.ZipFile(path).namelist()
        problems = [f"private-looking file: {n}" for n in names if PRIVATE.search(n)]
        top = f"GEMsMAP-{version}/"
        need = ["Start GEMs MAP (Windows).bat", "Start GEMs MAP (macOS).command", "start-gemsmap-linux.sh", "README-FIRST.txt",
                "app/start-windows.ps1", "app/start-unix.sh", f"app/gemsmap-{version}-py3-none-any.whl"]
        return problems + [f"missing {top}{n}" for n in need if top + n not in names]
    names = zipfile.ZipFile(path).namelist() if path.suffix == ".whl" else [m.name for m in tarfile.open(path).getmembers()]
    problems = [f"private-looking file: {n}" for n in names if PRIVATE.search(n)]
    need = ["gemsmap/web/index.html", "gemsmap/cli.py", "cobragui/main.py"]
    problems += [f"missing {n}" for n in need if not any(x.endswith(n) for x in names)]
    if path.suffix == ".whl":
        meta = next((n for n in names if n.endswith(".dist-info/METADATA")), None)
        text = zipfile.ZipFile(path).read(meta).decode("utf-8") if meta else ""
        if f"\nVersion: {version}\n" not in text:
            problems.append(f"wheel metadata does not say Version: {version}")
        if not any(n.endswith("entry_points.txt") for n in names):
            problems.append("no entry_points.txt (the gemsmap command)")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--keep", action="store_true", help="keep the temporary build folder")
    a = ap.parse_args()

    version = python_version()
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    if pkg != npm_version(version):
        sys.exit(f"Version mismatch: backend/gemsmap/__init__.py says {version}, package.json says {pkg} (expected {npm_version(version)})")
    npm = shutil.which("npm")
    if not npm:
        sys.exit("npm not found: install Node.js 18 or newer")
    try:
        import build  # noqa: F401
    except ImportError:
        sys.exit(f"The `build` package is missing: {sys.executable} -m pip install build")

    files = tracked_files()
    leaked = [f for f in files if PRIVATE.search(f)]
    if leaked:
        sys.exit("Refusing to build: private-looking files are tracked or not ignored:\n  " + "\n  ".join(leaked))

    tmp = Path(tempfile.mkdtemp(prefix="gemsmap-release-"))
    print(f"GEMs MAP {version}: copying {len(files)} files to {tmp}")
    try:
        for f in files:
            dst = tmp / f
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / f, dst)
        run([npm, "ci", "--no-audit", "--no-fund"], tmp)
        run([npm, "run", "build"], tmp)
        web = tmp / "backend/gemsmap/web"
        shutil.copytree(tmp / "dist", web)
        dist_private = [str(p.relative_to(web)) for p in web.rglob("*") if PRIVATE.search(p.relative_to(web).as_posix())]
        if dist_private:
            sys.exit("Private-looking files in the web build:\n  " + "\n  ".join(dist_private))
        run([sys.executable, "-m", "build", "--outdir", str(tmp / "out"), str(tmp)], tmp)
        wheel = next((tmp / "out").glob("*.whl"))
        print(f"\nzip: {make_zip(tmp / 'tools/release/zip', wheel, version).name}")

        OUT.mkdir(exist_ok=True)
        ok = True
        for art in sorted((tmp / "out").iterdir()):
            problems = check_archive(art, version)
            for p in problems:
                print(f"  PROBLEM {art.name}: {p}")
            ok &= not problems
            dest = OUT / art.name
            shutil.copy2(art, dest)
            digest = hashlib.sha256(dest.read_bytes()).hexdigest()
            print(f"  {dest.relative_to(ROOT)}  {dest.stat().st_size / 1e6:.2f} MB  sha256 {digest}")
        if not ok:
            print("\nThe release files have problems (see above): do not publish them.")
            return 1
        print(f"\nRelease files for GEMs MAP {version} are in {OUT.relative_to(ROOT)}/")
        return 0
    finally:
        if a.keep:
            print(f"(build folder kept: {tmp})")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    sys.exit(main())
