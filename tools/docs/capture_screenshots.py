"""Capture the documentation screenshots from the running app (Playwright).

    python tools/docs/capture_screenshots.py --model iML1515.json [--url http://localhost:5173/] [--phases lab maps]

Needs the frontend (npm run dev) and the COBRApy backend (npm run backend) running, and
`pip install -r tools/docs/requirements.txt`. The browser is the local Microsoft Edge or Google Chrome
(no Playwright browser download). Every phase runs in a fresh, temporary browser profile, so the
autosave of your own browser is never touched and one phase cannot disturb the next.

Every image is a real state of the app: the script clicks through the UI like a person would. Numbered
callouts on the *-annotated.png copies are drawn at the bounding boxes of the real DOM elements. The run
writes docs/assets/images/capture-manifest.json with the software versions, the model checksum, the values
the app displayed (so captions can be checked against them) and any page errors.

Phases, in order: lab (COBRAGUI), maps (Map Builder), templates (Template Builder), metanetx (metabolite
analysis). The MetaNetX analysis is last on purpose: the matches it accepts are written into the model's
annotation (the curation layer in the backend cache), and that changes what the template matcher sees.
Point the backend at an empty cache (COBRAGUI_CACHE) so neither your own models nor an earlier curation
are involved.
"""
import argparse
import hashlib
import io
import json
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import Error as PlaywrightError, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "assets" / "images"
DEBUG = Path(tempfile.gettempdir()) / "gemsmap-capture-debug"
DSF = 1.5                      # device scale factor: crisp text without huge files
VIEW = {"width": 1600, "height": 900}
BRAND = (71, 69, 196)          # #4745c4, a blue edge of the GEMsMAP logo
PHASES = ("lab", "maps", "templates", "metanetx")


class PageFrozen(Exception):
    """The page stopped responding: the remaining steps of the phase are skipped instead of hanging."""


class Capture:
    """One browser page plus everything the run collects (saved images, failures, observed values)."""

    def __init__(self, out: Path, only: list[str]):
        self.out, self.only = out, only
        self.pg = None
        self.phase = ""
        self.saved: list[str] = []
        self.failed: list[str] = []
        self.page_errors: list[str] = []
        self.facts: dict = {}
        self.frozen = False

    def attach(self, pg, phase: str):
        self.pg, self.phase, self.frozen = pg, phase, False
        pg.on("pageerror", lambda e: self._error(f"pageerror: {str(e)[:400]}"))
        pg.on("crash", lambda: self._error("renderer crashed"))
        pg.on("console", lambda m: m.type == "error" and self._error(f"console: {m.text[:300]}"))
        pg.on("dialog", lambda d: d.accept())
        # transient toasts are hidden with CSS. Never remove React-owned nodes from the DOM: React then fails
        # with "removeChild ... not a child of this node" and unmounts the whole app
        pg.add_init_script("document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style');"
                           " s.textContent = '.toast { display: none !important; }'; document.head.appendChild(s); });")

    def _error(self, text: str):
        self.page_errors.append(f"[{self.phase}] {text}")
        print(f"  ! {text}", flush=True)

    # ------------------------------------------------------------------ helpers
    def wanted(self, name: str) -> bool:
        return not self.only or any(name.startswith(o) for o in self.only)

    def responsive(self, timeout_ms: int = 60000):
        """wait_for_function has a timeout (evaluate has none): a busy page raises instead of hanging."""
        try:
            self.pg.wait_for_function("true", timeout=timeout_ms)
        except PlaywrightError as e:
            raise PageFrozen(f"page did not respond within {timeout_ms / 1000:.0f} s") from e

    def clean(self):
        self.pg.mouse.move(2, VIEW["height"] - 2)  # no stray hover state

    def save(self, name: str, png: bytes, boxes=None, trim: bool = False):
        img = Image.open(io.BytesIO(png)).convert("RGB")
        if trim:
            img = _trim_bottom(img)
        _write(img, self.out / f"{name}.png")
        if boxes:
            _write(_annotate(img.copy(), boxes), self.out / f"{name}-annotated.png")
        self.saved.append(name)
        print(f"  saved {name}.png {img.size[0]}x{img.size[1]}" + (" (+annotated)" if boxes else ""), flush=True)

    def shot(self, name: str, clip=None, element=None, boxes=None, keep_hover=False):
        """Full viewport, a clip {x,y,width,height} in CSS px, or one element. boxes: [(n, selector|dict)]."""
        if not self.wanted(name):
            return
        if not keep_hover:
            self.clean()
        self.pg.wait_for_timeout(250)
        if element is not None:
            el = self.pg.locator(element).first
            origin = el.bounding_box()
            png = el.screenshot()
        else:
            origin = {"x": clip["x"], "y": clip["y"]} if clip else {"x": 0, "y": 0}
            png = self.pg.screenshot(clip=clip) if clip else self.pg.screenshot()
        rects = []
        for n, target in boxes or []:
            b = target if isinstance(target, dict) else self.pg.locator(target).first.bounding_box()
            if b:
                rects.append((n, {k: (b[k] - origin[k[0]] if k in "xy" else b[k]) * DSF for k in ("x", "y", "width", "height")}))
        self.save(name, png, rects, trim=element is not None)

    def step(self, title: str, fn):
        print(f"- {title}", flush=True)
        if self.frozen:
            self.failed.append(f"{self.phase}/{title}: skipped (page frozen earlier)")
            print("  skipped: the page stopped responding earlier", flush=True)
            return
        t0 = time.time()
        try:
            self.responsive()
            fn()
            print(f"  ok ({time.time() - t0:.1f} s)", flush=True)
        except PageFrozen as e:
            self.frozen = True
            self.failed.append(f"{self.phase}/{title}: {e}")
            print(f"  FROZEN: {e}", flush=True)
        except (PlaywrightError, AssertionError, KeyError, StopIteration) as e:
            msg = str(e).splitlines()[0][:200] if str(e) else type(e).__name__
            self.failed.append(f"{self.phase}/{title}: {msg}")
            print(f"  FAILED: {msg}", flush=True)
            slug = re.sub(r"\W+", "-", f"{self.phase}-{title}").strip("-")
            try:
                self.pg.screenshot(path=str(DEBUG / f"failed-{slug}.png"), timeout=15000)
            except PlaywrightError:
                pass
            try:
                self.dismiss()
            except PlaywrightError:
                pass

    def dismiss(self):
        """Close open dialogs (a failed step must not block the next ones)."""
        for _ in range(4):
            if not self.pg.locator(".modal:visible").count():
                return
            close = self.pg.locator(".modal:visible .modal-head .icon-btn, .modal:visible button:has-text('Cancel')")
            if close.count():
                close.first.click()
            else:
                self.pg.keyboard.press("Escape")
            self.pg.wait_for_timeout(300)

    def click_glyph(self, kind: str, label: str, double: bool = False):
        """Click a node or reaction on the canvas by its visible label (exact match). A double-click goes to the
        centre of the node itself, at screen coordinates, as a person would do it."""
        if not double:
            self.pg.locator(f".center g[data-sel^='{kind}:'] text").filter(has_text=re.compile(rf"^({label})$")).first.click()
        else:
            g = self.pg.locator(f".center g[data-sel^='{kind}:']", has=self.pg.locator("text", has_text=re.compile(rf"^({label})$"))).first
            boxes = [b for b in (c.bounding_box() for c in g.locator("circle").all()) if b]
            b = min(boxes, key=lambda b: b["width"])  # the node, not its (larger) invisible handle
            self.pg.mouse.dblclick(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        self.pg.wait_for_timeout(500)

    def tall(self, height: int):
        self.pg.set_viewport_size({"width": VIEW["width"], "height": height})
        self.pg.wait_for_timeout(500)

    def text(self, selector: str) -> str:
        return self.pg.inner_text(selector).strip()

    # ------------------------------------------------------------------ app navigation
    def workspace(self, name: str):
        self.pg.click(f".ws-switch button:has-text('{name}')")
        self.pg.wait_for_timeout(600)

    def section(self, label: str):
        self.pg.click(f".ls-item:has-text('{label}')")
        self.pg.wait_for_timeout(500)

    def close_lab_inspector(self):
        btn = self.pg.locator(".lab-inspector button[title='Close inspector']")
        if btn.count():
            btn.first.click()
            self.pg.wait_for_timeout(200)

    def clear_explorer(self):
        """Remove search, filters and 'hide zero' left over from an earlier step."""
        self.section("Explore")
        clear = self.pg.locator(".filter-chips button:has-text('Clear all')")
        if clear.count():
            clear.first.click()
        for chip in self.pg.locator(".filter-chips .fchip button").all():
            chip.click()
        self.pg.fill("#lab-explorer-search", "")
        self.pg.wait_for_timeout(300)

    # ------------------------------------------------------------------ shared COBRAGUI actions
    def import_model(self, model: Path) -> float:
        pg = self.pg
        pg.wait_for_selector("text=backend ready", timeout=60000)
        with pg.expect_file_chooser() as fc:
            pg.click("text=Import model")
        t0 = time.time()
        fc.value.set_files(str(model))
        pg.wait_for_selector(".ov-title", timeout=300000)
        return round(time.time() - t0, 1)

    def run(self, method_label: str) -> str:
        self.section("Simulation")
        self.pg.click(f".method-card:has-text('{method_label}')")
        self.pg.click(".run-btn")
        self.pg.wait_for_selector(".run-status.ok", timeout=300000)
        return self.text(".run-status.ok")

    def anaerobic_state(self):
        """Duplicate the active state as 'Anaerobic' and close oxygen uptake (Medium preset)."""
        pg = self.pg
        pg.click(".state-btn")
        pg.click(".state-menu button:has-text('Duplicate')")
        pg.wait_for_timeout(300)
        pg.keyboard.press("Control+A")
        pg.keyboard.type("Anaerobic")
        pg.keyboard.press("Enter")
        pg.keyboard.press("Escape")
        self.section("Medium")
        pg.wait_for_selector(".medium-table .vt-row", timeout=30000)
        pg.click(".medium-presets button:has-text('Anaerobic')")
        pg.wait_for_timeout(1500)

    def compare_aerobic_anaerobic(self):
        pg = self.pg
        self.section("Compare")
        selects = pg.locator(".cmp-pick select")
        opts = selects.nth(0).locator("option").all_inner_texts()
        selects.nth(0).select_option(label=next(o for o in opts if o.startswith("pFBA · Base model")))
        selects.nth(1).select_option(label=next(o for o in opts if o.startswith("pFBA · Anaerobic")))
        pg.click(".cmp-pick button:has-text('Compare')")
        pg.wait_for_selector(".cmp-view", timeout=60000)
        pg.wait_for_timeout(600)


def _write(img: Image.Image, path: Path):
    # 256-colour palette without dithering keeps UI text crisp at a fraction of the size
    q = img.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(path, optimize=True)


def _trim_bottom(img: Image.Image, margin: int = int(16 * DSF)) -> Image.Image:
    """Cut the empty background below the content of a tall panel capture (inspectors, side panels)."""
    bg = img.getpixel((img.width - 2, img.height - 2))
    px = img.load()
    for y in range(img.height - 1, -1, -1):
        if any(max(abs(px[x, y][i] - bg[i]) for i in range(3)) > 12 for x in range(0, img.width - 4, 2)):
            return img.crop((0, 0, img.width, min(img.height, y + 1 + margin)))
    return img


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def _annotate(img: Image.Image, rects) -> Image.Image:
    d = ImageDraw.Draw(img)
    r = int(13 * DSF)
    font = _font(int(15 * DSF))
    for n, b in rects:
        x0, y0, x1, y1 = b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"]
        d.rounded_rectangle([x0, y0, x1, y1], radius=int(6 * DSF), outline=BRAND, width=max(2, int(2 * DSF)))
        cx = min(max(x0, r + 2), img.width - r - 2)
        cy = min(max(y0, r + 2), img.height - r - 2)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BRAND, outline="white", width=max(2, int(1.5 * DSF)))
        d.text((cx, cy), str(n), fill="white", font=font, anchor="mm")
    return img


# ====================================================================== phase 1: COBRAGUI

def phase_lab(c: Capture, model: Path):
    pg = c.pg

    def import_screen():
        pg.wait_for_selector("text=Drop a metabolic model here", timeout=60000)
        pg.wait_for_selector("text=backend ready", timeout=60000)
        c.facts["backend"] = c.text(".lab-page .muted.small.center")
        c.shot("cobra-gui-import", clip={"x": 0, "y": 0, "width": VIEW["width"], "height": 470})

    def overview():
        c.facts["importSeconds"] = c.import_model(model)
        pg.wait_for_timeout(500)
        c.facts["overview"] = c.text(".ov-card")
        c.facts["statistics"] = c.text(".stat-table")
        c.shot("cobra-gui-overview", boxes=[
            (1, ".ws-switch"), (2, ".lab-side .ls-group >> nth=0"), (3, ".state-btn"),
            (4, ".run-split"), (5, ".ov-card"), (6, ".lab-inspector"), (7, ".lab-status")])

    def medium():
        c.close_lab_inspector()
        c.section("Medium")
        pg.wait_for_selector(".medium-table .vt-row", timeout=30000)
        c.facts["medium"] = c.text(".medium-table")
        c.shot("cobra-gui-medium", clip={"x": 0, "y": 0, "width": VIEW["width"], "height": 640},
               boxes=[(1, ".medium-presets"), (2, ".lab-page .seg"), (3, ".medium-table .vt-row:has-text('EX_glc__D_e') .med-in")])

    def pfba():
        c.facts["pfba"] = c.run("pFBA")
        c.shot("cobra-gui-simulation", clip={"x": 0, "y": 0, "width": VIEW["width"], "height": 560},
               boxes=[(1, ".method-cards"), (2, ".sim-config"), (3, ".run-btn"), (4, ".run-status.ok")])

    def explorer():
        c.section("Explore")
        pg.click(".ex-tabs button:has-text('Reactions')")
        pg.click(".ls-view:has-text('Active reactions')")
        pg.wait_for_timeout(600)
        c.close_lab_inspector()
        c.shot("cobra-gui-explorer", boxes=[
            (1, ".ex-tabs"), (2, ".ex-search"), (3, ".ex-toolbar.second"), (4, ".subsys"), (5, ".ex-table")])

    def reaction_inspector():
        pg.fill("#lab-explorer-search", "PFK")
        pg.wait_for_timeout(500)
        pg.click(".ex-table .vt-row:has-text('Phosphofructokinase') >> nth=0")
        c.tall(1500)
        c.facts["pfkInspector"] = c.text(".lab-inspector")
        c.shot("cobra-gui-reaction-inspector", element=".lab-inspector")
        pg.set_viewport_size(VIEW)

    def reaction_editor():
        pg.click(".lab-inspector button:has-text('Edit reaction')")
        pg.wait_for_selector(".modal", timeout=20000)
        pg.wait_for_timeout(800)
        c.shot("cobra-gui-reaction-editor", element=".modal")
        c.dismiss()

    def metabolite_inspector():
        pg.fill("#lab-explorer-search", "")
        pg.click(".ex-tabs button:has-text('Metabolites')")
        pg.fill("#lab-explorer-search", "pyr_c")
        pg.wait_for_timeout(500)
        pg.click(".ex-table .vt-row:has-text('pyr_c') >> nth=0")
        c.tall(1500)
        c.facts["pyrInspector"] = c.text(".lab-inspector")
        c.shot("cobra-gui-metabolite-inspector", element=".lab-inspector")
        pg.set_viewport_size(VIEW)
        pg.fill("#lab-explorer-search", "")

    def results():
        c.close_lab_inspector()
        c.section("Results")
        pg.click(".rw-tabs button:has-text('Exchanges')")
        pg.wait_for_timeout(500)
        c.shot("cobra-gui-results-exchanges", boxes=[(1, ".result-list"), (2, ".rw-head"), (3, ".rw-summary"), (4, ".rw-tabs")])
        pg.click(".rw-tabs button:has-text('Subsystems')")
        pg.wait_for_timeout(1200)
        c.shot("cobra-gui-results-subsystems")
        pg.click(".rw-tabs button:has-text('How was this generated?')")
        pg.wait_for_timeout(500)
        c.facts["provenance"] = c.text(".provenance")
        c.shot("cobra-gui-results-provenance", element=".provenance")

    def fva_subsystem():
        c.clear_explorer()
        pg.click(".ex-tabs button:has-text('Reactions')")
        pg.click(".subsys-name:has-text('Citric Acid Cycle')")
        pg.wait_for_timeout(600)
        pg.locator(".lab-inspector .li-actions button:has-text('FVA on subsystem')").click()
        pg.wait_for_selector(".run-status.ok, .error-card", timeout=300000)
        pg.wait_for_timeout(400)
        c.clear_explorer()
        c.close_lab_inspector()
        c.section("Results")
        pg.wait_for_selector(".rw-table", timeout=20000)
        c.facts["fva"] = c.text(".rw-summary") if pg.locator(".rw-summary").count() else ""
        c.shot("cobra-gui-fva")

    def compare():
        c.anaerobic_state()
        c.facts["pfbaAnaerobic"] = c.run("pFBA")
        c.compare_aerobic_anaerobic()
        c.facts["compareSummary"] = c.text(".cmp-summary")
        c.facts["compareConfig"] = c.text(".cfg-diff")
        c.shot("cobra-gui-compare", boxes=[(1, ".cmp-pick"), (2, ".cfg-diff"), (3, ".cmp-summary"), (4, ".cmp-table")])
        pg.click(".cmp-view .ex-tabs button:has-text('Metabolite turnover')")
        pg.wait_for_timeout(500)
        pg.fill(".cmp-table .ex-search input", "accoa_c")
        pg.wait_for_timeout(400)
        pg.click(".cmp-table .vt-row:has-text('accoa_c') >> nth=0")
        pg.wait_for_selector(".explain-rows, .explain", timeout=30000)
        pg.wait_for_timeout(600)
        c.close_lab_inspector()
        c.facts["explain"] = c.text(".cmp-body")[:3000]
        c.shot("cobra-gui-turnover-explain")

    c.step("import screen", import_screen)
    c.step("import model + overview", overview)
    c.step("medium", medium)
    c.step("pFBA", pfba)
    c.step("explorer", explorer)
    c.step("reaction inspector", reaction_inspector)
    c.step("reaction editor", reaction_editor)
    c.step("metabolite inspector", metabolite_inspector)
    c.step("results", results)
    c.step("FVA on a subsystem", fva_subsystem)
    c.step("anaerobic state + compare", compare)


# ====================================================================== phase 2: Maps (Map Builder)

def phase_maps(c: Capture, model: Path):
    pg = c.pg

    def demo():
        # a fresh profile opens on COBRAGUI; the Map Builder holds the built-in example
        c.workspace("Map Builder")
        pg.keyboard.press("f")
        pg.wait_for_timeout(800)
        c.shot("maps-demo", boxes=[(1, ".panel.left .tabs"), (2, ".tb-tools-group"), (3, ".center"), (4, ".panel.right"), (5, ".bottombar")])
        c.shot("maps-toolbar", clip={"x": 0, "y": 0, "width": VIEW["width"], "height": 78})
        c.shot("maps-elements-panel", element=".panel.left")

    def prepare():
        # the COBRAGUI side of this phase: same model (cached by the backend), aerobic and anaerobic pFBA
        c.workspace("COBRAGUI")
        c.import_model(model)
        c.run("pFBA")
        c.anaerobic_state()
        c.run("pFBA")
        c.compare_aerobic_anaerobic()

    def empty_canvas():
        c.workspace("Map Builder")
        pg.click(".menu-btn:has-text('File')")
        pg.click(".dropdown button:has-text('New project')")
        pg.wait_for_timeout(600)
        c.shot("maps-empty-canvas")

    def send_result():
        c.workspace("COBRAGUI")
        c.section("Results")
        pg.click(".rl-item:has-text('pFBA · Base model')")
        pg.click(".rw-head button:has-text('Visualize result')")
        pg.wait_for_selector("text=Send to Map Builder")
        c.shot("maps-visualize-result", element=".modal")
        pg.click("text=Send to Map Builder")
        pg.wait_for_timeout(1500)

    def template_review():
        pg.click(".tabs button:has-text('Elements')")
        pg.click(".tpl:has-text('Global central carbon')")
        pg.wait_for_selector(".modal:has-text('Create pathway')", timeout=60000)
        pg.wait_for_timeout(500)
        c.facts["templateReview"] = c.text(".modal")
        c.shot("templates-mapping-review", element=".modal")
        if not pg.locator(".tm-row").count():
            pg.click(".modal button:has-text('Review all mappings')")
            pg.wait_for_timeout(300)
        row = pg.locator(".tm-row-head:has-text('Ribose 5-phosphate')").first
        if not row.count():
            row = pg.locator(".tm-row-head").first
        row.click()
        pg.wait_for_timeout(400)
        pg.locator(".tm-row.open .tm-cand .link").first.click()
        pg.wait_for_timeout(500)
        c.facts["templateEvidence"] = c.text(".tm-row.open")
        c.shot("templates-mapping-evidence", element=".modal")

    def place():
        pg.click(".modal button:has-text('Create pathway')")
        pg.wait_for_timeout(600)
        box = pg.locator(".center").bounding_box()
        # off-centre: the empty canvas shows an "Open the central carbon demo" button in its middle
        cx, cy = box["x"] + box["width"] * 0.3, box["y"] + box["height"] * 0.3
        pg.mouse.move(cx - 60, cy - 40)
        pg.mouse.move(cx, cy, steps=5)
        pg.wait_for_timeout(500)
        c.shot("maps-template-placing", keep_hover=True)
        pg.mouse.click(cx, cy)
        pg.wait_for_timeout(1000)
        pg.keyboard.press("Escape")
        pg.keyboard.press("f")
        pg.wait_for_timeout(1000)
        c.shot("maps-iml1515-pfba", boxes=[(1, ".panel.left"), (2, ".center"), (3, ".panel.right"), (4, ".bottombar")])

    def inspectors():
        c.click_glyph("reaction", "PFK")
        c.tall(1400)
        c.facts["mapReactionInspector"] = c.text(".panel.right")
        c.shot("maps-reaction-inspector", element=".panel.right")
        pg.set_viewport_size(VIEW)
        c.click_glyph("node", "pyr_c|Pyruvate|pyr")
        c.tall(1400)
        c.shot("maps-metabolite-inspector", element=".panel.right")
        pg.set_viewport_size(VIEW)
        pg.keyboard.press("Escape")

    def data_tab():
        pg.click(".tabs button:has-text('Data')")
        c.tall(1200)
        c.shot("maps-data-panel", element=".panel.left")
        pg.set_viewport_size(VIEW)

    def comparison():
        c.workspace("COBRAGUI")
        c.section("Compare")
        pg.wait_for_selector(".cmp-summary", timeout=20000)
        pg.click(".cmp-summary button:has-text('Visualize comparison')")
        pg.wait_for_selector(".modal", timeout=10000)
        c.shot("maps-visualize-comparison", element=".modal")
        pg.click(".modal .btn.primary")
        pg.wait_for_timeout(1500)
        pg.keyboard.press("f")
        pg.wait_for_timeout(800)
        c.shot("maps-comparison")

    def export_dialog():
        pg.click(".topbar .btn.primary:has-text('Export')")
        pg.wait_for_selector(".modal", timeout=10000)
        c.shot("maps-export-dialog", element=".modal")
        c.dismiss()

    c.step("demo project", demo)
    c.step("prepare results in COBRAGUI", prepare)
    c.step("empty canvas", empty_canvas)
    c.step("send pFBA result to the map", send_result)
    c.step("template mapping review", template_review)
    c.step("place the template", place)
    c.step("map inspectors", inspectors)
    c.step("data panel", data_tab)
    c.step("comparison on the map", comparison)
    c.step("export dialog", export_dialog)


# ====================================================================== phase 3: Templates (Template Builder)

def phase_templates(c: Capture, model: Path):
    pg = c.pg

    def library():
        c.workspace("Templates")
        pg.wait_for_selector("text=Template Library", timeout=20000)
        pg.wait_for_timeout(800)
        c.shot("templates-library")

    def design():
        card = pg.locator(".lib-card", has=pg.locator(".lib-body", has_text="Tricarboxylic acid cycle")).first
        card.locator("button:has-text('Open')").first.click()
        pg.wait_for_timeout(1500)
        pg.keyboard.press("f")
        pg.wait_for_timeout(800)
        c.shot("templates-design-mode")

    def identity():
        c.click_glyph("node", "Citrate|cit", double=True)
        pg.wait_for_selector(".modal", timeout=20000)
        # the identity search also asks the backend (BiGG tables, KEGG / ChEBI via MetaNetX): wait for its answer
        try:
            pg.wait_for_selector(".modal >> text=searching", state="detached", timeout=60000)
        except PlaywrightError:
            pass
        pg.wait_for_timeout(500)
        c.shot("templates-identity-dialog", element=".modal")
        c.dismiss()

    c.step("template library", library)
    c.step("template design mode", design)
    c.step("identity dialog", identity)


# ====================================================================== phase 4: metabolite analysis (MetaNetX)

def phase_metanetx(c: Capture, model: Path):
    pg = c.pg

    def analyse():
        c.import_model(model)
        pg.wait_for_timeout(1000)
        c.close_lab_inspector()
        c.section("Metabolite analysis")
        start = pg.locator(".lab-main button:has-text('Analyze')")
        if start.count():
            start.first.click()
        pg.wait_for_selector(".lab-main .vt-row", timeout=900000)
        pg.wait_for_timeout(1500)
        c.facts["metaboliteAnalysis"] = c.text(".lab-main")[:1500]
        pg.locator(".lab-main .vt-row").first.click()
        pg.wait_for_timeout(800)
        c.facts["metaboliteAnalysisEvidence"] = c.text(".lab-main")[-2500:]
        c.shot("cobra-gui-metabolite-analysis")

    c.step("metabolite analysis (MetaNetX)", analyse)


# ====================================================================== main

def _git(*args) -> str:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", type=Path, required=True, help="model file imported in COBRAGUI (the docs use BiGG iML1515.json)")
    ap.add_argument("--url", default="http://localhost:5173/")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--phases", nargs="*", default=list(PHASES), choices=PHASES)
    ap.add_argument("--only", nargs="*", default=[], help="save only images whose name starts with one of these prefixes")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--browser", default="msedge", help="msedge | chrome | chromium")
    a = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    a.out.mkdir(parents=True, exist_ok=True)
    DEBUG.mkdir(exist_ok=True)
    c = Capture(a.out, a.only)
    runners = {"lab": phase_lab, "maps": phase_maps, "templates": phase_templates, "metanetx": phase_metanetx}
    with sync_playwright() as p:
        kw = {} if a.browser == "chromium" else {"channel": a.browser}
        for phase in [ph for ph in PHASES if ph in a.phases]:
            print(f"\n=== {phase} ===", flush=True)
            with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
                ctx = p.chromium.launch_persistent_context(profile, headless=not a.headed, viewport=VIEW, device_scale_factor=DSF,
                                                           locale="en-US", timezone_id="UTC", color_scheme="light", **kw)
                pg = ctx.pages[0] if ctx.pages else ctx.new_page()
                c.attach(pg, phase)
                pg.goto(a.url, wait_until="domcontentloaded", timeout=120000)
                pg.wait_for_selector(".ws-switch", timeout=120000)
                runners[phase](c, a.model.resolve())
                ctx.close()
    manifest = {
        "captured": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "gitCommit": _git("rev-parse", "--short", "HEAD"),
        "appVersion": json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"],
        "backend": c.facts.get("backend"),
        "browser": a.browser,
        "viewport": {**VIEW, "deviceScaleFactor": DSF},
        "model": {"file": a.model.name, "sha256": hashlib.sha256(a.model.read_bytes()).hexdigest()},
        "phases": [ph for ph in PHASES if ph in a.phases],
        "images": sorted(c.saved),
        "failed": c.failed,
        "pageErrors": c.page_errors,
        "observed": {k: v for k, v in c.facts.items() if k != "backend"},
    }
    if not a.only and set(a.phases) == set(PHASES):
        # bytes, so the file has LF line endings on Windows too (the repository is LF)
        (a.out / "capture-manifest.json").write_bytes((json.dumps(manifest, indent=1, ensure_ascii=False) + "\n").encode("utf-8"))
    print(f"\n{len(c.saved)} images saved, {len(c.failed)} steps failed, {len(c.page_errors)} page errors")
    for f in c.failed:
        print("  -", f)
    if c.failed:
        print(f"debug screenshots of failed steps: {DEBUG}")
    return 1 if c.failed else 0


if __name__ == "__main__":
    sys.exit(main())
