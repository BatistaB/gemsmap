"""The `gemsmap` command.

    gemsmap                      start GEMs MAP and open it in the browser (http://127.0.0.1:8765)
    gemsmap --port 8766          another port (the Map Builder's autosave belongs to the address, so keep one port)
    gemsmap --no-browser         start without opening the browser
    gemsmap diagnose             versions, solvers and folders, to paste into a bug report
    gemsmap bigg-data            install the BiGG tables once (~19 MB download; --from <folder> for local files)
    gemsmap --version

Output is plain ASCII so that it prints in every console.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
from typing import Optional

from . import __version__

DEFAULT_PORT = int(os.environ.get("GEMSMAP_PORT", 8765))


def _get(url: str, timeout: float = 1.5) -> Optional[tuple[str, bytes]]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as res:
            return res.headers.get("content-type", ""), res.read(65536)
    except Exception:
        return None


def _probe(base: str) -> Optional[str]:
    """What answers at this address: 'gemsmap' (API and interface), 'backend' (API only), or None."""
    health = _get(base + "/api/health")
    if not health:
        return None
    try:
        if json.loads(health[1]).get("status") != "ok":
            return None
    except ValueError:
        return None
    page = _get(base + "/")
    return "gemsmap" if page and page[0].startswith("text/html") else "backend"


def _port_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


def _open_when_ready(base: str) -> None:
    for _ in range(240):  # up to a minute: the first start imports COBRApy
        if _get(base + "/api/health", timeout=0.5):
            webbrowser.open(base)
            return
        time.sleep(0.25)


def run(host: str, port: int, open_browser: bool) -> int:
    base = f"http://{'127.0.0.1' if host in ('0.0.0.0', '') else host}:{port}"
    found = _probe(base)
    if found == "gemsmap":
        print(f"GEMs MAP is already running at {base}")
        if open_browser:
            webbrowser.open(base)
        return 0
    if found == "backend":
        print(f"Port {port} is used by a GEMs MAP backend without the interface (a development backend?).\n"
              f"Stop it, or start on another port: gemsmap --port {port + 1}")
        return 1
    if not _port_free(host, port):
        print(f"Port {port} is in use by another program. Start on another port: gemsmap --port {port + 1}")
        return 1

    print(f"Starting GEMs MAP {__version__} ...", flush=True)
    import uvicorn

    from .server import app, has_web
    if not has_web():
        print("Note: the web interface is not part of this installation (development checkout?). "
              "Only the API runs; use `npm run dev` for the interface.")
    if open_browser and has_web():
        threading.Thread(target=_open_when_ready, args=(base,), daemon=True).start()
    print(f"GEMs MAP {__version__} is running at {base}\n"
          "Keep this window open while you use it. Press Ctrl+C to stop.", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="warning")
    return 0


def diagnose() -> str:
    """Everything a bug report needs, one fact per line."""
    lines = [f"GEMs MAP {__version__}",
             f"Python {platform.python_version()} ({platform.python_implementation()}) at {sys.executable}",
             f"System {platform.platform()} ({platform.machine()})"]
    try:
        import cobra
        import optlang
        solvers = sorted(k for k, v in optlang.available_solvers.items() if v)
        default = str(cobra.Configuration().solver.__name__).split(".")[-1].replace("_interface", "").upper()
        lines.append(f"COBRApy {cobra.__version__}, optlang {optlang.__version__}, solvers: {', '.join(solvers) or 'none'} (default {default})")
    except Exception as e:  # a broken scientific stack is exactly what this command must report
        lines.append(f"COBRApy: not importable ({type(e).__name__}: {e})")
    try:
        import fastapi
        import uvicorn
        lines.append(f"FastAPI {fastapi.__version__}, uvicorn {uvicorn.__version__}")
    except Exception as e:
        lines.append(f"FastAPI/uvicorn: not importable ({type(e).__name__}: {e})")
    web = Path(__file__).with_name("web") / "index.html"
    lines.append(f"Web interface: {'included' if web.is_file() else 'not included (development checkout)'}")
    try:
        from cobragui import registry
        from cobragui.services import bigg_service
        lines.append(f"Data folder: {registry.cache_dir().parent}")
        st = bigg_service.status()
        lines.append(f"BiGG tables: installed {st.get('installed', '')}, {st.get('metabolites')} metabolites, {st.get('reactions')} reactions"
                     if st.get("available") else "BiGG tables: not installed (optional; run: gemsmap bigg-data)")
    except Exception as e:
        lines.append(f"Data folder: unknown ({type(e).__name__}: {e})")
    return "\n".join(lines)


def bigg_data(folder: Optional[Path]) -> int:
    from cobragui.services import bigg_service
    try:
        st = bigg_service.install_from(folder, log=lambda m: print(m.replace("…", "..."), flush=True))
    except (bigg_service.BiggDataError, OSError) as e:
        print(f"BiGG data not installed: {e}")
        return 1
    print(f"BiGG data installed in {bigg_service.data_dir()}: {st['metabolites']} universal metabolites, {st['reactions']} reactions.\n"
          "A running GEMs MAP uses them from its next search.")
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    # Windows pipes use the legacy code page (cp1252, cp949...): a folder name it cannot encode must not crash us
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="backslashreplace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(prog="gemsmap", description="GEMs MAP: an interactive workbench for genome-scale metabolic models.")
    ap.add_argument("--version", action="version", version=f"GEMs MAP {__version__}")
    ap.add_argument("--host", default="127.0.0.1", help="address to listen on (default 127.0.0.1: this computer only)")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port (default {DEFAULT_PORT})")
    ap.add_argument("--no-browser", action="store_true", help="do not open the browser")
    sub = ap.add_subparsers(dest="command", metavar="command")
    sub.add_parser("diagnose", help="print versions, solvers and folders for a bug report")
    bd = sub.add_parser("bigg-data", help="install the BiGG universal tables once (optional, ~19 MB)")
    bd.add_argument("--from", dest="folder", type=Path, help="folder with BiGG metabolite and reaction JSON files you downloaded")
    a = ap.parse_args(argv)
    if a.command == "diagnose":
        print(diagnose())
        return 0
    if a.command == "bigg-data":
        return bigg_data(a.folder)
    try:
        return run(a.host, a.port, not a.no_browser)
    except KeyboardInterrupt:
        return 0
