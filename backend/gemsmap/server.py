"""The GEMsMAP application: the COBRAGUI API (/api) and the built web interface (/) on one address.

The interface is the Vite build (`npm run build` → dist/), copied into gemsmap/web/ when the package is built
(tools/release/build.py). In a development checkout there is no web/ folder: Vite serves the interface and proxies
/api to this backend.
"""
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from cobragui.main import app

WEB = Path(__file__).with_name("web")


class _WebFiles(StaticFiles):
    """Static files; the HTML entry point is never cached, so an upgrade never loads stale asset names."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.headers.get("content-type", "").startswith("text/html"):
            response.headers["Cache-Control"] = "no-cache"
        return response


def has_web() -> bool:
    return (WEB / "index.html").is_file()


if has_web():
    # mounted after the API routes, so /api/... is always matched first
    app.mount("/", _WebFiles(directory=WEB, html=True), name="web")
