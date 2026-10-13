"""Screenshots for the Quick start tutorial (docs/tutorials/quick-start.md), in one continuous session.

    python tools/docs/capture_quickstart.py --model iJO1366.json [--url http://localhost:5173/]

Same requirements and precautions as capture_screenshots.py (a backend on an empty cache, the frontend,
Playwright with the local Edge/Chrome). The script follows the tutorial step by step, so it also tests it:
every step that fails is reported, and quickstart-manifest.json records the values the app displayed.
"""
import argparse
import hashlib
import json
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError, sync_playwright

from capture_screenshots import DEBUG, DSF, ROOT, VIEW, Capture, _git  # noqa: F401  (same folder)

OUT = ROOT / "docs" / "assets" / "images" / "tutorials"


def drag_node(pg, label: str, dx: float, dy: float):
    """Drag a node by its circle, as a person does with the mouse (dx, dy in screen pixels)."""
    g = pg.locator(".center g[data-sel^='node:']", has=pg.locator("text", has_text=re.compile(rf"^({label})$"))).first
    boxes = [b for b in (c.bounding_box() for c in g.locator("circle").all()) if b]
    b = min(boxes, key=lambda b: b["width"])
    x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    pg.mouse.move(x, y)
    pg.mouse.down()
    pg.mouse.move(x + dx / 2, y + dy / 2, steps=5)
    pg.mouse.move(x + dx, y + dy, steps=5)
    pg.mouse.up()


def nudges_to_clear(pg) -> int:
    """How many Shift+Arrow steps (10 units each) move the selection to the right of everything else.
    Reads the dev-mode store (window.gemsmap); without it the pathway stays where it was dropped."""
    js = """(() => { const s = window.gemsmap && window.gemsmap.getState(); if (!s) return 0;
      const sel = new Set(s.selection.filter(k => k.startsWith('node:')).map(k => k.slice(5)));
      let maxOther = -Infinity, minSel = Infinity;
      for (const n of Object.values(s.doc.nodes)) { if (sel.has(n.id)) minSel = Math.min(minSel, n.x); else maxOther = Math.max(maxOther, n.x); }
      return isFinite(maxOther) && isFinite(minSel) ? Math.max(0, Math.ceil((maxOther - minSel + 220) / 10)) : 0; })()"""
    return int(pg.evaluate(js))


def quickstart(c: Capture, model: Path):
    pg = c.pg

    def rename_result(name: str):
        c.section("Results")
        pg.click(".rw-head button:has-text('Rename')")
        box = pg.locator(".rw-head input.title-input")
        box.fill(name)
        box.press("Enter")
        pg.wait_for_timeout(400)

    def run_pfba() -> str:
        return c.run("pFBA")

    # 1 · import ------------------------------------------------------------------------------
    def step_import():
        c.facts["importSeconds"] = c.import_model(model)
        pg.wait_for_timeout(600)
        c.facts["overview"] = c.text(".ov-card")
        c.facts["statistics"] = c.text(".stat-table")
        c.shot("quickstart-01-overview", boxes=[(1, ".ov-card"), (2, ".ov-panel >> nth=0"), (3, ".ov-panel >> nth=1")])

    # 2 · explore -----------------------------------------------------------------------------
    def step_explore():
        c.close_lab_inspector()
        c.section("Explore")
        pg.click(".ex-tabs button:has-text('Reactions')")
        pg.wait_for_timeout(500)
        c.shot("quickstart-02-explore", boxes=[(1, ".ex-tabs"), (2, ".ex-search"), (3, ".subsys"), (4, ".ex-table")])

    def step_metabolite():
        pg.click(".ex-tabs button:has-text('Metabolites')")
        pg.fill("#lab-explorer-search", "pyr_c")
        pg.wait_for_timeout(500)
        pg.click(".ex-table .vt-row:has-text('pyr_c') >> nth=0")
        c.tall(1500)
        c.facts["pyruvateBeforeSimulation"] = c.text(".lab-inspector")[:1500]
        c.shot("quickstart-03-metabolite-inspector", element=".lab-inspector")
        pg.set_viewport_size(VIEW)
        pg.fill("#lab-explorer-search", "")

    # 3 · pFBA with oxygen ------------------------------------------------------------------------
    def step_pfba_o2():
        c.facts["run_o2"] = run_pfba()
        rename_result("run_o2")
        c.close_lab_inspector()
        c.shot("quickstart-04-results-run-o2", boxes=[(1, ".result-list"), (2, ".rw-head"), (3, ".rw-summary"), (4, ".rw-tabs")])

    # 4 · no oxygen ---------------------------------------------------------------------------------
    def step_medium():
        c.section("Medium")
        pg.wait_for_selector(".medium-table .vt-row", timeout=30000)
        pg.click(".lab-page .seg button:has-text('All exchanges')")
        pg.fill(".lab-page .ex-search input", "EX_o2_e")
        pg.wait_for_timeout(400)
        row = pg.locator(".medium-table .vt-row:has-text('EX_o2_e')").first
        inp = row.locator(".med-in")
        inp.fill("0")
        inp.press("Enter")
        pg.wait_for_timeout(1500)
        c.facts["mediumO2"] = c.text(".medium-table")[:600]
        c.shot("quickstart-05-medium-o2", clip={"x": 0, "y": 0, "width": VIEW["width"], "height": 420},
               boxes=[(1, ".lab-page .ex-search"), (2, ".medium-table .vt-row:has-text('EX_o2_e')")])

    def step_pfba_wo2():
        c.facts["run_wo2"] = run_pfba()
        rename_result("run_wo2")

    # 5 · compare -------------------------------------------------------------------------------------
    def step_compare():
        c.section("Compare")
        selects = pg.locator(".cmp-pick select")
        selects.nth(0).select_option(label="run_o2")
        selects.nth(1).select_option(label="run_wo2")
        selects.nth(2).select_option(value="log2fc")
        pg.click(".cmp-pick button:has-text('Compare')")
        pg.wait_for_selector(".cmp-view", timeout=60000)
        pg.wait_for_timeout(600)
        c.facts["compareSummary"] = c.text(".cmp-summary")
        c.facts["compareConfig"] = c.text(".cfg-diff")
        c.shot("quickstart-06-compare", boxes=[(1, ".cmp-pick"), (2, ".cfg-diff"), (3, ".cmp-summary"), (4, ".cmp-view .ex-tabs")])

    def step_categories():
        filt = pg.locator(".cmp-table .ex-toolbar select").first
        filt.select_option(value="activated")
        pg.wait_for_timeout(500)
        c.facts["activated"] = c.text(".cmp-table")[:2500]
        c.shot("quickstart-07-activated")
        filt.select_option(value="inactivated")
        pg.wait_for_timeout(500)
        c.facts["inactivated"] = c.text(".cmp-table")[:2500]
        pg.click(".cmp-view .ex-tabs button:has-text('Exchanges')")
        pg.wait_for_timeout(600)
        c.facts["exchanges"] = c.text(".cmp-table")[:2500]
        c.shot("quickstart-08-exchanges")
        pg.click(".cmp-view .ex-tabs button:has-text('Metabolite turnover')")
        pg.wait_for_timeout(600)
        c.facts["metaboliteTurnover"] = c.text(".cmp-table")[:2000]

    # 6 · subsystems ------------------------------------------------------------------------------------
    def step_subsystems():
        pg.click(".cmp-view .ex-tabs button:has-text('Subsystems')")
        pg.wait_for_selector(".ss-ov-row", timeout=20000)
        pg.locator(".ss-ov-row", has=pg.locator(".ss-ov-name", has_text=re.compile("Glycolysis", re.I))).first.click()
        pg.wait_for_timeout(800)
        c.shot("quickstart-09-glycolysis-list")
        for view, label in (("bars", "Bars"), ("heatmap", "Heatmap"), ("pie", "Donut")):
            pg.click(f".ss-controls .seg button:has-text('{label}')")
            pg.wait_for_timeout(900)
            c.shot(f"quickstart-10-glycolysis-{view}")

    def step_tca():
        pg.click(".ss-controls .seg button:has-text('Bars')")
        pg.locator(".ss-ov-row", has=pg.locator(".ss-ov-name", has_text=re.compile("Citric Acid Cycle", re.I))).first.click()
        pg.wait_for_timeout(600)
        pg.click(".ss-controls .seg button:has-text('Separate')")
        pg.click(".fig-bar .seg button:has-text('Names')")
        pg.wait_for_timeout(900)
        c.shot("quickstart-11-glycolysis-tca-separate", boxes=[(1, ".ss-ov-list"), (2, ".ss-controls"), (3, ".fig-bar .seg >> nth=1"), (4, ".fig-save")])

    # 7 · to the Map Builder ------------------------------------------------------------------------------
    def step_visualize():
        c.workspace("Map Builder")
        pg.click(".menu-btn:has-text('File')")
        pg.click(".dropdown button:has-text('New project')")
        pg.wait_for_timeout(500)
        c.workspace("COBRAGUI")
        c.section("Compare")
        pg.wait_for_selector(".cmp-summary", timeout=20000)
        pg.click(".cmp-summary button:has-text('Visualize comparison')")
        pg.wait_for_selector(".modal", timeout=10000)
        c.shot("quickstart-12-visualize-comparison", element=".modal")
        pg.click(".modal .btn.primary")
        pg.wait_for_timeout(1500)
        pg.click(".tabs button:has-text('Data')")
        c.tall(1200)
        c.shot("quickstart-13-data-panel", element=".panel.left")
        pg.set_viewport_size(VIEW)

    # 8 · central carbon template --------------------------------------------------------------------------
    def step_template():
        pg.click(".tabs button:has-text('Elements')")
        pg.click(".tpl:has-text('Global central carbon')")
        pg.wait_for_selector(".modal:has-text('Create pathway')", timeout=60000)
        pg.wait_for_timeout(500)
        c.facts["centralCarbonReview"] = c.text(".modal")
        c.shot("quickstart-14-central-carbon-review", element=".modal")
        pg.click(".modal button:has-text('Create pathway')")
        pg.wait_for_timeout(600)
        box = pg.locator(".center").bounding_box()
        x, y = box["x"] + box["width"] * 0.3, box["y"] + box["height"] * 0.3
        pg.mouse.move(x - 40, y - 30)
        pg.mouse.move(x, y, steps=5)
        pg.wait_for_timeout(300)
        pg.mouse.click(x, y)
        pg.wait_for_timeout(900)
        pg.keyboard.press("Escape")
        pg.keyboard.press("f")
        pg.wait_for_timeout(900)
        c.shot("quickstart-15-central-carbon-map")

    # 9 · mappings ---------------------------------------------------------------------------------------
    def step_mappings():
        pg.click(".tabs button:has-text('Data')")
        pg.click(".panel.left button:has-text('Metabolite mapping')")
        pg.wait_for_timeout(500)
        last = pg.locator(".panel.left .mapping").last
        last.locator("select").nth(1).select_option(value="fill")
        pg.wait_for_timeout(900)
        c.facts["mappings"] = c.text(".panel.left")[-1500:]
        c.shot("quickstart-16-mappings", boxes=[(1, ".panel.left .mapping >> nth=0"), (2, ".panel.left .mapping >> nth=-1")])

    # 10 · PGK and a bar plot ---------------------------------------------------------------------------
    def step_pgk():
        g = pg.locator(".center g[data-sel^='reaction:'] text").filter(has_text=re.compile(r"^PGK$")).first
        g.click(button="right")
        pg.wait_for_timeout(500)
        c.shot("quickstart-17-pgk-context-menu", keep_hover=True)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(200)
        g.click()
        pg.wait_for_timeout(500)
        c.facts["pgkInspector"] = c.text(".panel.right")[:1500]
        pg.click(".panel.right button:has-text('+ bar')")
        pg.wait_for_timeout(900)
        c.shot("quickstart-18-pgk-bar-plot", boxes=[(1, ".panel.right"), (2, ".bottombar")])

    # 11 · collapse PGM, ENO, PYK -------------------------------------------------------------------------
    def step_collapse():
        pg.keyboard.press("Escape")
        lab = lambda t: pg.locator(".center g[data-sel^='reaction:'] text").filter(has_text=re.compile(rf"^{t}$")).first  # noqa: E731
        lab("PGM").click()
        lab("ENO").click(modifiers=["Shift"])
        lab("PYK").click(modifiers=["Shift"])
        pg.wait_for_timeout(400)
        pg.click(".panel.right button:has-text('Collapse into one arrow')")
        pg.wait_for_timeout(900)
        c.facts["collapsedInspector"] = c.text(".panel.right")[:1200]
        pg.click(".panel.right button:has-text('+ heatmap')")
        pg.wait_for_timeout(900)
        c.shot("quickstart-19-collapsed-heatmap", boxes=[(1, ".panel.right")])

    # 12 · pyruvate and ACLS ---------------------------------------------------------------------------------
    def step_pyruvate():
        pg.keyboard.press("Escape")
        c.click_glyph("node", "pyr_c|pyr|Pyruvate")
        c.tall(1400)
        hide = pg.locator(".panel.right label:has-text('Hide zero-flux reactions') input")
        if hide.count() and not hide.is_checked():
            hide.check()
        pg.wait_for_timeout(500)
        c.facts["pyruvateMapInspector"] = c.text(".panel.right")[-1500:]
        c.shot("quickstart-20-pyruvate-inspector", element=".panel.right")
        pg.set_viewport_size(VIEW)
        pg.wait_for_timeout(400)
        pg.locator(".panel.right .chip:has-text('ACLS')").first.click()
        pg.wait_for_selector(".rx-tip", timeout=5000)
        pg.wait_for_timeout(300)
        c.shot("quickstart-21-acls-card", keep_hover=True)
        pg.click(".rx-tip button:has-text('Add to the map')")
        pg.wait_for_timeout(900)
        drag_node(pg, "alac__S|alac__S_c", dx=-140, dy=-40)
        pg.wait_for_timeout(500)
        pg.keyboard.press("f")
        pg.wait_for_timeout(700)
        c.shot("quickstart-22-acls-added")

    # 13 · OCBT from COBRAGUI ------------------------------------------------------------------------------
    def step_ocbt():
        c.workspace("COBRAGUI")
        c.section("Explore")
        pg.click(".ex-tabs button:has-text('Reactions')")
        pg.click(".ls-view:has-text('Active reactions')")
        pg.fill("#lab-explorer-search", "OCBT")
        pg.wait_for_timeout(500)
        pg.click(".ex-table .vt-row:has-text('OCBT') >> nth=0")
        pg.wait_for_timeout(500)
        c.facts["ocbt"] = c.text(".lab-inspector")[:900]
        c.shot("quickstart-23-ocbt-add", boxes=[(1, ".ls-view:has-text('Active reactions')"), (2, ".ex-search"), (3, ".lab-inspector button:has-text('Add to map')")])
        pg.click(".lab-inspector button:has-text('Add to map')")
        # the Map Builder opens with OCBT as a preview that follows the mouse; a click places it, centred on the
        # click. Click where the direct insertion used to put it (centre of the view, upper third).
        pg.wait_for_selector("text=click where it goes", timeout=10000)
        box = pg.locator(".center").bounding_box()
        x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 3
        pg.mouse.move(x - 40, y - 30)
        pg.mouse.move(x, y, steps=5)
        pg.wait_for_timeout(300)
        pg.mouse.click(x, y)
        pg.wait_for_timeout(600)
        pg.keyboard.press("f")
        pg.wait_for_timeout(700)

    # 14 · amino acid template ------------------------------------------------------------------------------------
    def step_amino_acids():
        pg.click(".tabs button:has-text('Elements')")
        pg.click(".tpl:has-text('Amino acid')")
        pg.wait_for_selector(".modal:has-text('Create pathway')", timeout=60000)
        pg.wait_for_timeout(500)
        c.facts["aminoAcidReview"] = c.text(".modal")
        c.shot("quickstart-24-amino-acid-review", element=".modal")
        pg.click(".modal button:has-text('Create pathway')")
        pg.wait_for_timeout(600)
        box = pg.locator(".center").bounding_box()
        x, y = box["x"] + box["width"] * 0.88, box["y"] + box["height"] * 0.55
        pg.mouse.move(x - 40, y - 30)
        pg.mouse.move(x, y, steps=5)
        pg.wait_for_timeout(300)
        pg.mouse.click(x, y)
        pg.wait_for_timeout(900)
        steps = nudges_to_clear(pg)
        for _ in range(steps):
            pg.keyboard.press("Shift+ArrowRight")
        pg.wait_for_timeout(500)
        pg.keyboard.press("Escape")
        pg.keyboard.press("f")
        pg.wait_for_timeout(900)
        c.shot("quickstart-25-amino-acid-map")

    # 15 · routes for SerA·C·B ---------------------------------------------------------------------------------------
    def step_routes():
        g = pg.locator(".center g[data-sel^='reaction:'] text").filter(has_text=re.compile(r"SerA")).first
        g.click()
        pg.wait_for_timeout(600)
        c.facts["serInspector"] = c.text(".panel.right")[:900]
        pg.click(".panel.right button:has-text('routes')")
        pg.wait_for_selector(".routes", timeout=20000)
        pg.wait_for_timeout(1500)
        c.facts["routes"] = c.text(".routes")[:2000]
        c.shot("quickstart-26-routes", element=".modal")
        collapsed = pg.locator(".route-actions button:has-text('Collapsed')")
        (collapsed.first if collapsed.count() else pg.locator(".route-actions button:has-text('Insert')").first).click()
        pg.wait_for_timeout(1000)
        pg.keyboard.press("Escape")
        pg.keyboard.press("f")
        pg.wait_for_timeout(800)
        c.shot("quickstart-27-route-inserted")

    for title, fn in [
        ("1 import", step_import), ("2 explore", step_explore), ("2 metabolite inspector", step_metabolite),
        ("3 pFBA with oxygen", step_pfba_o2), ("4 medium without oxygen", step_medium), ("4 pFBA without oxygen", step_pfba_wo2),
        ("5 compare", step_compare), ("5 categories, exchanges, turnover", step_categories),
        ("6 subsystem figures", step_subsystems), ("6 add the TCA cycle", step_tca),
        ("7 visualize comparison", step_visualize), ("8 central carbon template", step_template),
        ("9 mappings", step_mappings), ("10 PGK", step_pgk), ("11 collapse", step_collapse),
        ("12 pyruvate and ACLS", step_pyruvate), ("13 OCBT", step_ocbt),
        ("14 amino acid template", step_amino_acids), ("15 routes", step_routes),
    ]:
        c.step(title, fn)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", type=Path, required=True, help="iJO1366.json from BiGG")
    ap.add_argument("--url", default="http://localhost:5173/")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--browser", default="msedge")
    a = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    a.out.mkdir(parents=True, exist_ok=True)
    DEBUG.mkdir(exist_ok=True)
    c = Capture(a.out, [])
    with sync_playwright() as p, tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        kw = {} if a.browser == "chromium" else {"channel": a.browser}
        ctx = p.chromium.launch_persistent_context(profile, headless=not a.headed, viewport=VIEW, device_scale_factor=DSF,
                                                   locale="en-US", timezone_id="UTC", color_scheme="light", **kw)
        pg = ctx.pages[0] if ctx.pages else ctx.new_page()
        c.attach(pg, "quickstart")
        pg.goto(a.url, wait_until="domcontentloaded", timeout=120000)
        pg.wait_for_selector(".ws-switch", timeout=120000)
        try:
            c.facts["backend"] = pg.inner_text(".lab-page .muted.small.center", timeout=60000)
        except PlaywrightError:
            pass
        quickstart(c, a.model.resolve())
        ctx.close()
    manifest = {
        "captured": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "gitCommit": _git("rev-parse", "--short", "HEAD"),
        "appVersion": json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"],
        "backend": c.facts.pop("backend", None),
        "model": {"file": a.model.name, "sha256": hashlib.sha256(a.model.read_bytes()).hexdigest()},
        "images": sorted(c.saved), "failed": c.failed, "pageErrors": c.page_errors, "observed": c.facts,
    }
    (a.out / "quickstart-manifest.json").write_bytes((json.dumps(manifest, indent=1, ensure_ascii=False) + "\n").encode("utf-8"))
    print(f"\n{len(c.saved)} images saved, {len(c.failed)} steps failed, {len(c.page_errors)} page errors")
    for f in c.failed:
        print("  -", f)
    return 1 if c.failed else 0


if __name__ == "__main__":
    sys.exit(main())
