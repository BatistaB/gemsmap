#!/bin/bash
# GEMs MAP {{VERSION}} for macOS and Linux, started by "Start GEMs MAP (macOS).command" or start-gemsmap-linux.sh.
# The first start prepares a private environment in runtime/ next to this app/ folder: its own copy of uv (pinned),
# Python {{PYTHON}} and GEMs MAP with its libraries. Nothing is installed elsewhere; delete the folder to remove it.
# Options are passed to gemsmap (for example --port 8766); --setup-only prepares the environment and stops.
APP="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$APP")"
RT="$ROOT/runtime"
export UV_PYTHON_INSTALL_DIR="$RT/python" UV_CACHE_DIR="$RT/cache" UV_PYTHON_PREFERENCE=only-managed UV_PYTHON_DOWNLOADS=automatic
PY="$RT/env/bin/python"
READY="$RT/ready-{{VERSION}}"

fail() {
  echo
  echo "GEMs MAP could not be prepared: $1"
  echo "See README-FIRST.txt (Troubleshooting), or report it with the messages above:"
  echo "https://github.com/BatistaB/gemsmap/issues"
  read -r -p "Press Enter to close this window. " _ || true
  exit 1
}

SETUP_ONLY=0
ARGS=()
for a in "$@"; do
  if [ "$a" = "--setup-only" ]; then SETUP_ONLY=1; else ARGS+=("$a"); fi
done

if [ ! -f "$READY" ]; then
  echo "GEMs MAP {{VERSION}}: first start. Preparing a private environment in:"
  echo "  $RT"
  echo "This downloads Python and the scientific libraries once (a few hundred MB) and can take a few minutes."
  echo
  # always the pinned uv in runtime/uv: a uv installed elsewhere may be another version, or configured differently
  echo "[1/3] Getting uv {{UV_VERSION}}"
  UV="$RT/uv/uv"
  if [ ! -x "$UV" ]; then
    command -v curl >/dev/null 2>&1 || fail "the first start needs curl to download uv"
    curl -LsSf "https://astral.sh/uv/{{UV_VERSION}}/install.sh" | env UV_UNMANAGED_INSTALL="$RT/uv" sh || fail "downloading uv failed (check the internet connection)"
    [ -x "$UV" ] || UV="$(find "$RT/uv" -type f -name uv 2>/dev/null | head -n 1)"
    [ -n "$UV" ] && [ -x "$UV" ] || fail "uv was downloaded but not found in $RT/uv"
  fi
  rm -rf "$RT/env"
  echo "[2/3] Getting Python {{PYTHON}}"
  "$UV" venv --quiet --python {{PYTHON}} "$RT/env" || fail "creating the Python environment failed"
  echo "[3/3] Installing GEMs MAP and its libraries"
  "$UV" pip install --quiet --python "$PY" "$APP/{{WHEEL}}" || fail "installing GEMs MAP failed (check the internet connection)"
  date > "$READY"
  echo "GEMs MAP is installed in this folder."
fi

if [ "$SETUP_ONLY" = 1 ]; then
  echo "GEMs MAP {{VERSION}} is ready."
  exit 0
fi
# run through Python (not the gemsmap script), so folder names with spaces never matter
if [ ${#ARGS[@]} -eq 0 ]; then exec "$PY" -m gemsmap; else exec "$PY" -m gemsmap "${ARGS[@]}"; fi
