"""Start the COBRAGUI backend: python backend/run.py [--port 8765] [--reload]"""
import argparse
import os
import sys

import uvicorn

if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, here)
    os.chdir(here)
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=int(os.environ.get("COBRAGUI_PORT", 8765)))
    p.add_argument("--reload", action="store_true")
    a = p.parse_args()
    uvicorn.run("cobragui.main:app", host=a.host, port=a.port, reload=a.reload, log_level="info")
