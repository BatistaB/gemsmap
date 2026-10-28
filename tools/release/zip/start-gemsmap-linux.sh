#!/bin/bash
# GEMsMAP {{VERSION}}: start it from a terminal in this folder with:  bash start-gemsmap-linux.sh
exec bash "$(cd "$(dirname "$0")" && pwd)/app/start-unix.sh" "$@"
