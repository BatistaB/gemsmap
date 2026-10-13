"""Beta test guide as one PDF: a cover, then pages of the built documentation site, printed by a local browser.

    mkdocs build -d <site>
    python tools/docs/beta_guide_pdf.py --site <site> --version 0.3.0b1 --form-url https://forms.gle/... --out guide.pdf

Needs the packages of tools/docs/requirements.txt plus pypdf, and Microsoft Edge or Google Chrome (as for the
screenshots). Tabs (pip / uv / zip ...) are printed one after the other, each under its own title.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import html
import io
from pathlib import Path

from playwright.sync_api import sync_playwright
from pypdf import PdfReader, PdfWriter

PAGES = [("Part 1 · Install GEMs MAP", "getting-started/installation/index.html"),
         ("Part 2 · Quick start tutorial", "tutorials/quick-start/index.html")]

# print every tab of a tab set, each under its label; drop navigation-only elements
EXPAND_TABS = """
for (const set of document.querySelectorAll('.tabbed-set')) {
  const labels = [...set.querySelectorAll(':scope > .tabbed-labels > label')].map((l) => l.textContent.trim());
  set.querySelectorAll(':scope > .tabbed-content > .tabbed-block').forEach((b, i) => {
    const h = document.createElement('p'); h.className = 'gm-print-tab'; h.textContent = labels[i] || ''; b.before(h);
  });
}
for (const el of document.querySelectorAll('.gm-next, .md-source-file, .md-feedback, .headerlink')) el.remove();
"""
PRINT_CSS = """
.tabbed-labels, .tabbed-set > input { display: none !important; }
.tabbed-content, .tabbed-block { display: block !important; }
.gm-print-tab { font-weight: 700; margin: 1.2em 0 0.3em; border-bottom: 1px solid #ccc; }
.md-typeset figure img { max-height: 190mm; width: auto; }
"""


def cover(version: str, form_url: str, site: Path) -> str:
    # inline: a page built with set_content may not load file:// images
    logo = "data:image/svg+xml;base64," + base64.b64encode((site / "assets/brand/gemsmap-mark-light.svg").read_bytes()).decode()
    form = f'<a href="{html.escape(form_url)}">{html.escape(form_url)}</a>' if form_url else "the link sent with this guide"
    today = dt.date.today().strftime("%d %B %Y")
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
    body {{ font-family: Inter, 'Segoe UI', Arial, sans-serif; color: #1f2430; margin: 0; }}
    .wrap {{ padding: 18mm 16mm; }}
    img {{ width: 34mm; }}
    h1 {{ font-size: 26pt; margin: 6mm 0 1mm; }}
    .sub {{ color: #5b6270; font-size: 12pt; margin-bottom: 10mm; }}
    .beta {{ border-left: 4px solid #e8a33d; background: #fdf6ea; padding: 3mm 5mm; margin: 6mm 0; }}
    ol li {{ margin: 2.2mm 0; }}
    h2 {{ font-size: 13pt; margin-top: 9mm; }}
    code {{ background: #f1f2f5; padding: 0 1.5mm; border-radius: 1mm; }}
    .small {{ color: #5b6270; font-size: 9.5pt; }}
    </style></head><body><div class="wrap">
    <img src="{logo}" alt="">
    <h1>GEMs MAP {html.escape(version)}</h1>
    <div class="sub">Beta test guide · {today}</div>
    <p>Thank you for testing GEMs MAP, an interactive workbench for genome-scale metabolic models: COBRApy analyses,
    editable metabolic maps and pathway templates in one application.</p>
    <div class="beta"><b>This is a beta.</b> It works, but features and file formats can still change. Save your work
    as <code>.gemsmap</code> files. Everything runs on your computer; your models are not uploaded anywhere.</div>
    <h2>What we ask of you (about one hour)</h2>
    <ol>
      <li><b>Install GEMs MAP</b> (Part 1). Note how long it took and anything unexpected.</li>
      <li><b>Follow the quick start</b> (Part 2) with the <i>E. coli</i> model iJO1366, step by step.</li>
      <li><b>Explore freely</b>, if you can with a model of your own.</li>
      <li><b>Answer the feedback form:</b> {form}</li>
    </ol>
    <h2>When something goes wrong</h2>
    <p>In COBRAGUI, click <b>GEMs MAP {html.escape(version)}</b> in the bottom bar, then <b>Copy diagnostics</b>, and paste
    it into the form or into an issue at <a href="https://github.com/BatistaB/gemsmap/issues">github.com/BatistaB/gemsmap/issues</a>,
    with what you did and what happened. A screenshot helps.</p>
    <p class="small">Documentation: gemsmap.readthedocs.io · Source code: github.com/BatistaB/gemsmap · MIT License. The screenshots in this guide
    come from the application itself; numbers in your run can differ slightly (alternative optima of pFBA).</p>
    </div></body></html>"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", type=Path, required=True, help="folder of the built documentation (mkdocs build -d ...)")
    ap.add_argument("--version", required=True)
    ap.add_argument("--form-url", default="")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--channel", default="msedge", help="msedge or chrome")
    a = ap.parse_args()
    site = a.site.resolve()
    writer = PdfWriter()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=a.channel)
        page = browser.new_page()
        page.set_content(cover(a.version, a.form_url, site), wait_until="load")
        writer.append(PdfReader(io.BytesIO(page.pdf(format="A4", print_background=True))))
        for title, rel in PAGES:
            footer = (f'<div style="font-size:8px;color:#888;width:100%;padding:0 12mm;display:flex;justify-content:space-between">'
                      f'<span>GEMs MAP {html.escape(a.version)} · Beta test guide · {html.escape(title)}</span>'
                      '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>')
            page.goto((site / rel).as_uri(), wait_until="load")
            page.evaluate(EXPAND_TABS)
            page.add_style_tag(content=PRINT_CSS)
            page.wait_for_timeout(500)
            pdf = page.pdf(format="A4", print_background=True, display_header_footer=True, header_template="<span></span>",
                           footer_template=footer, margin={"top": "14mm", "bottom": "16mm", "left": "12mm", "right": "12mm"})
            n = len(writer.pages)
            writer.append(PdfReader(io.BytesIO(pdf)))
            writer.add_outline_item(title, n)
            print(f"{title}: {len(writer.pages) - n} pages")
        browser.close()
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with open(a.out, "wb") as f:
        writer.write(f)
    print(f"{a.out} ({len(writer.pages)} pages)")


if __name__ == "__main__":
    main()
