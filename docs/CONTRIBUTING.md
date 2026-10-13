# Contributing to the docs

This site is built with [MkDocs](https://www.mkdocs.org) and [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) and published by [Read the Docs](https://about.readthedocs.com). The sources live in the repository: `mkdocs.yml` at the root, the pages in `docs/`. For the development workflow of the application itself (commits, tests, releases) see `CONTRIBUTING.md` at the repository root.

## Build and preview locally

```bash
python -m venv .venv-docs
```

```bash
.venv-docs/Scripts/pip install -r docs/requirements.txt
```

(on macOS / Linux: `.venv-docs/bin/pip install -r docs/requirements.txt`)

```bash
.venv-docs/Scripts/mkdocs serve
```

Open `http://127.0.0.1:8000`; pages reload as you edit. Before committing, run the same check as Read the Docs:

```bash
.venv-docs/Scripts/mkdocs build --strict
```

`--strict` turns every warning (a broken link, a missing image, an unknown anchor) into an error. The output goes to `site/`, which is not versioned.

## Publish on Read the Docs

The site is live at <https://gemsmap.readthedocs.io/> (project `gemsmap`, connected to `BatistaB/gemsmap`). Read the Docs reads `.readthedocs.yaml` (Python 3.12, `mkdocs.yml`, `docs/requirements.txt`, build fails on warnings) and rebuilds `latest` on every push to `main`; build logs are under *Builds* in the project's dashboard. Pull requests can get preview builds (*Settings → Pull request builds*).

To set it up again elsewhere: sign in at [readthedocs.org](https://readthedocs.org) with the Git provider account, choose *Add project* and select the repository.

The canonical URL is not hard-coded: `mkdocs.yml` takes it from `READTHEDOCS_CANONICAL_URL`, which Read the Docs sets during each build.

## Structure

| Folder | Content |
| --- | --- |
| `docs/getting-started/` | Overview, installation, first look |
| `docs/cobra-gui/` | COBRAGUI |
| `docs/maps/` | The Map Builder |
| `docs/templates/` | Templates and the Template Builder |
| `docs/tutorials/` | Guided tutorials (quick start with iJO1366; more in preparation) |
| `docs/reference/` | Glossary, FAQ, troubleshooting, limitations, roadmap, examples |
| `docs/*.md` (upper case) | Technical notes, also linked from the repository README |
| `docs/assets/images/` | Screenshots made by the capture script, and `capture-manifest.json` |
| `docs/assets/diagrams/` | Hand-written SVG diagrams |
| `docs/assets/brand/` | Logo variants for the site header and favicon |
| `docs/stylesheets/`, `docs/javascripts/` | Site theme and MathJax configuration |

The navigation order is set in `mkdocs.yml` (`nav:`): Home, Getting started, COBRAGUI, Maps, Templates, Tutorials, Reference. A new page must be added there.

## Writing rules

- **Describe only what the application does.** Verify behaviour in the source code or the running app. Planned work goes to `reference/roadmap.md` or is labelled:
  `<span class="gm-badge implemented">Implemented</span>`, `<span class="gm-badge experimental">…</span>`, `<span class="gm-badge planned">Planned</span>`.
- Use the interface's own names (*COBRAGUI*, *Visualize result*, *Create pathway*…) and keep scientific statements precise: units, what a number is and is not, and whether a value comes from one solution among many.
- Each feature page answers: what is it, why does it exist, how does it work, how to interpret it, where next (`<div class="gm-next" markdown>…</div>`).
- Screenshots go in figures, with alt text that describes the content and a caption:

    ```html
    <figure class="gm-shot" markdown>
    ![Alt text describing what is visible.](../assets/images/name.png)
    <figcaption markdown="span">Caption with *Markdown* and [links](../maps/index.md).</figcaption>
    </figure>
    ```

    Add `gm-narrow` or `gm-medium` to the figure class for panels and dialogs. For an annotated screenshot, add a numbered list `<ol class="gm-callouts" markdown>` right below it, in the order of the numbers.
- Never fabricate a screenshot or a number. If a state cannot be captured, write a visible TODO that names the missing state.

## Updating the screenshots

All screenshots come from `tools/docs/capture_screenshots.py`, which drives the running application with Playwright and the local Microsoft Edge or Google Chrome. Each of its four phases (`lab`, `maps`, `templates`, `metanetx`) runs in a fresh, temporary browser profile, so your own autosave is never touched.

1. Install the capture tools (once): `pip install -r tools/docs/requirements.txt`.
2. Download the example model: `http://bigg.ucsd.edu/static/models/iML1515.json` (check its SHA-256 against [About the examples](reference/examples.md)).
3. Start a backend with an **empty cache**, so that neither your own models nor an earlier metabolite curation are involved, and an interface that talks to it:

    ```bash
    COBRAGUI_CACHE=/tmp/gemsmap-docs-cache npm run backend -- --port 8767
    ```

    ```bash
    VITE_COBRA_API=http://127.0.0.1:8767/api npx vite --port 5177
    ```

    (On Windows, set the variables first with `set` or `$env:`.) Copy the BiGG tables into `<cache parent>/bigg` if you want BiGG candidates in the identity search.

4. Run the capture:

    ```bash
    python tools/docs/capture_screenshots.py --model path/to/iML1515.json --url http://localhost:5177/
    ```

    It writes `docs/assets/images/*.png` (plus `*-annotated.png` copies with numbered callouts at the real element positions) and `capture-manifest.json`, with the software versions, the model checksum and the values the app displayed. Failed steps leave a screenshot in the temporary folder `gemsmap-capture-debug`.

5. Compare the new manifest with the numbers quoted in the pages (`git diff docs/assets/images/capture-manifest.json`), update the text where values changed, and rebuild with `--strict`.

`--phases maps` runs one phase; `--only maps-` saves only matching images.

**Tutorial screenshots** come from `tools/docs/capture_quickstart.py`, which plays the [quick start](tutorials/quick-start.md) step by step in one session and so also tests it. It needs `iJO1366.json` from BiGG (`http://bigg.ucsd.edu/static/models/iJO1366.json`) and writes `docs/assets/images/tutorials/` with `quickstart-manifest.json`:

```bash
python tools/docs/capture_quickstart.py --model path/to/iJO1366.json --url http://localhost:5177/
```

When the tutorial text quotes a number (growth rates, counts, fluxes), take it from that manifest, and recapture whenever the steps change. The MetaNetX phase runs last because the matches it accepts are written into the model's annotation in the backend cache, which changes later template matching. To repeat the `maps` phase afterwards, start again from an empty cache.

## Keeping the docs in step with the code

| Last audit | Commit | Notes |
| --- | --- | --- |
| 13 Oct 2026 | `v0.3.0b1` | First public version. The site was written and audited on the earlier, local development history (10 to 13 October 2026: first version, COBRAGUI rename, redrawn brand, clean start-up, the C / V / mouse-wheel habit) and describes version 0.3.0b1, including the installation with pip, uv or the zip. |

When revisiting the docs:

1. `git log --oneline v0.3.0b1..HEAD` (replace with the last audited commit or tag) and the *Unreleased* section of `CHANGELOG.md` list what changed.
2. Update the affected pages; move implemented items out of `reference/roadmap.md`.
3. Recapture screenshots whose interface changed, and check the manifest values.
4. `mkdocs build --strict`, then add a row to the table above.
