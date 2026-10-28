"""Install-and-run check of an installed GEMsMAP (standard library only).

    python tools/release/smoke_test.py --python <env python> [--port 8799] [--expect-version 0.3.0b1]

<env python> is the Python of an environment where the wheel was installed (pip install release/gemsmap-*.whl).
The test runs `gemsmap --version` and `gemsmap diagnose`, starts `python -m gemsmap --no-browser --port <port>`,
checks that the interface and /api/health are served, imports COBRApy's E. coli core model (textbook), runs FBA
(growth 0.8739 h-1 expected), then stops the server. Exit code 0 = everything passed.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.request


def http(method: str, url: str, body: dict | None = None, timeout: float = 120) -> tuple[str, bytes]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.headers.get("content-type", ""), res.read()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--python", default=sys.executable, help="Python of the environment where gemsmap is installed")
    ap.add_argument("--port", type=int, default=8799)
    ap.add_argument("--expect-version")
    a = ap.parse_args()
    base = f"http://127.0.0.1:{a.port}"
    failures: list[str] = []

    def check(ok: bool, what: str) -> None:
        print(f"  {'ok  ' if ok else 'FAIL'} {what}", flush=True)
        if not ok:
            failures.append(what)

    v = subprocess.run([a.python, "-m", "gemsmap", "--version"], capture_output=True, text=True)
    check(v.returncode == 0 and "GEMsMAP" in v.stdout, f"gemsmap --version -> {v.stdout.strip() or v.stderr.strip()}")
    if a.expect_version:
        check(a.expect_version in v.stdout, f"version is {a.expect_version}")
    d = subprocess.run([a.python, "-m", "gemsmap", "diagnose"], capture_output=True, text=True)
    print("\n".join("       " + line for line in d.stdout.splitlines()))
    check(d.returncode == 0 and "COBRApy" in d.stdout and "not importable" not in d.stdout, "gemsmap diagnose")
    check("Web interface: included" in d.stdout, "the web interface is included")

    server = subprocess.Popen([a.python, "-m", "gemsmap", "--no-browser", "--port", str(a.port)],
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        started = time.time()
        health = None
        while time.time() - started < 180 and server.poll() is None:
            try:
                health = json.loads(http("GET", base + "/api/health", timeout=2)[1])
                break
            except Exception:
                time.sleep(0.5)
        check(health is not None and health.get("status") == "ok", f"server answers /api/health ({time.time() - started:.1f} s)")
        if health is None:
            return 1
        print(f"       solvers {health.get('solvers')}, default {health.get('defaultSolver')}, Python {health.get('python')}")
        check(bool(health.get("solvers")), "at least one LP solver is available")
        ctype, page = http("GET", base + "/")
        check(ctype.startswith("text/html") and b'id="root"' in page, "the interface is served at /")
        asset = page.split(b'src="', 1)[1].split(b'"', 1)[0].decode() if b'src="' in page else ""
        check(bool(asset) and http("GET", base + asset)[0].startswith(("application/javascript", "text/javascript")), f"its script loads ({asset})")
        model = json.loads(http("POST", base + "/api/models/examples/textbook")[1])
        check(len(model.get("reactions", [])) == 95, "COBRApy textbook model imported (95 reactions)")
        res = json.loads(http("POST", f"{base}/api/models/{model['id']}/simulate/fba", {"state": {"name": "WT"}, "params": {}})[1])
        growth = res.get("objectiveValue") or 0
        check(abs(growth - 0.8739) < 1e-3, f"FBA growth {growth:.4f} h-1 (expected 0.8739)")
    finally:
        server.terminate()
        try:
            out = server.communicate(timeout=20)[0]
        except subprocess.TimeoutExpired:
            server.kill()
            out = server.communicate()[0]
        if failures:
            print("\nServer output:\n" + (out or "").strip())
    print("\nSMOKE TEST " + ("PASSED" if not failures else f"FAILED ({len(failures)}): " + "; ".join(failures)))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
