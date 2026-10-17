# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [SemVer](https://semver.org/), written the Python way for the package ([PEP 440](https://peps.python.org/pep-0440/): 0.3.0b1 = 0.3.0-beta.1).

## [Unreleased]

### Added
- Every COBRAGUI table sorts by clicking a column title, including the Medium table and the metabolite analysis table (click again to reverse, a third time for the original order).
- The documentation is published at <https://gemsmap.readthedocs.io/> (Read the Docs, rebuilt on every push to
  `main`): linked from the README (with a badge), the PyPI page (next release), the zip's README-FIRST.txt, the
  release notes and the beta test guide.
- `tools/docs/beta_guide_pdf.py`: the beta test guide as one PDF (cover, Installation, quick start), printed from the
  built documentation site.
- **Interface size** for small and large screens: File → *Interface size* (80–175 %), `Ctrl Alt +` / `Ctrl Alt −` /
  `Ctrl Alt 0`, or the command palette. It scales panels, menus, tables, dialogs and text in every workspace and is
  remembered per browser; the map, its figures and exports do not change. The browser's default font size is
  respected too. The stylesheets are now in rem (`src/ui/uiScale.ts`), and the window breakpoints are container
  queries, so they follow the chosen size.

### Changed
- **Side panels fit the window.** Until a panel is dragged, it takes its usual width but at most 22 % of the window;
  a dragged width is kept, capped at 40 % of the window. Dragging and double-click-to-reset work as before. On a
  1366×768 laptop with Windows at 125 % the map now gets 56 % of the width instead of 49 %.
- **Narrow windows hide side panels** and bring them back when the window widens (the Map Builder and Template
  Builder inspector below 1000 px, their left panel below 760 px, the COBRAGUI inspector below 1150 px; the COBRAGUI
  sidebar shows icons only below 1100 px). A panel the user opens or closes stays that way; a one-time notice says
  how to reopen them.
- **Minimum text size 11 px** (at 100 %): labels, tags, hints and badges that were 8.5–10.5 px are now 11 px.
- The minimap never covers more than a fifth of the map's width or a quarter of its height; the File menu no longer
  wraps its items.
- **Installation guide for beginners:** *Step by step: install with pip* on the Installation page walks through
  opening a terminal, checking Python, making a folder, creating and activating a virtual environment, updating
  pip, installing and starting GEMs MAP, with Windows / macOS / Linux tabs (linked, so one choice applies to the
  whole site) and what each step should print. The quick start tutorial opens with the same sequence; the
  troubleshooting page covers `python` missing on Windows and PowerShell blocking the activation script.
- **README** rewritten for people arriving at the project: what GEMs MAP is and why it exists, screenshots,
  installation, a quick start, its scientific principles, links to the documentation, project status, help and
  contributing. Maintainer notes (private-data handling, backend modules and routes, project layout) moved out of
  it: private-data rules stay in `CONTRIBUTING.md`, the code organisation is in the new technical note
  `docs/ARCHITECTURE.md` (updated with every current backend service and route group).

### Fixed
- The narrow-window rules for the side panels never applied (the remembered panel width always won).

## [0.3.0b1] — 2026-10-13

First beta, and the first public version: installable with `pip install gemsmap`.

### Added
- **Installable package** `gemsmap` (version **0.3.0b1**, the first beta): `pip install gemsmap`, then the command
  `gemsmap` starts the application and opens it in the browser at http://127.0.0.1:8765. The package contains the
  COBRAGUI backend and the built web interface, served together by FastAPI (`backend/gemsmap/`: `cli.py`,
  `server.py`); one version for backend, interface and package (`backend/gemsmap/__init__.py`, PEP 440).
  - Commands: `gemsmap --port/--host/--no-browser`, `gemsmap diagnose` (versions, solvers, folders for bug
    reports), `gemsmap bigg-data [--from <folder>]` (the BiGG tables; `npm run bigg:data` uses the same code).
    If GEMs MAP already runs on the port, `gemsmap` only opens the browser; a busy port gets a clear message.
  - `pyproject.toml` (hatchling), `PYPI_README.md`; `tools/release/build.py` builds the wheel and sdist from a
    copy of the files git tracks, so git-ignored private data can never be packaged, and checks the archives;
    `tools/release/smoke_test.py` installs-and-runs a build (interface, health, textbook FBA = 0.8739).
  - Tested: Windows 11 with Python 3.12 (pip) and Ubuntu (WSL) with Python 3.14 (uv); wheel 0.5 MB.
  - COBRAGUI status bar: **GEMs MAP <version>** opens the version and a *Copy diagnostics* block for bug reports
    (versions, system, browser; no model or file names). `/api/health` also reports Python and the platform.
- **Double-click zip** `GEMsMAP-<version>.zip` (built with the wheel): launchers for Windows (`.bat` + PowerShell),
  macOS (`.command`) and Linux (`.sh`) and `README-FIRST.txt`. The first start installs uv (pinned, only when it is
  missing), Python 3.12 and the wheel **inside the extracted folder**; deleting the folder uninstalls. On Windows a
  folder path over 90 characters is refused with an explanation (Windows' 260-character path limit). Tested on
  Windows (folder with a space and an accent) and Ubuntu (WSL).
- **GitHub release workflow** (`.github/workflows/release.yml`): on a version tag, builds the files, installs the
  wheel with pip on Linux, Windows and macOS with Python 3.10, 3.12 and 3.14, runs the zip's first start on the
  three systems, smoke-tests each, publishes to PyPI with Trusted Publishing and drafts a GitHub release. CI also
  builds the documentation (`mkdocs build --strict`) and runs the genome-scale template tests on generated
  fixtures. New issue template *Installation report*; bug reports ask for the diagnostics block.
- **Appearance in the Template Builder**: the inspector has the Map Builder's appearance options — label position,
  circle or text only, radius and fill colour for metabolites; routing, curvature, *Reverse*, *Flip label* and
  *Auto label position* for reactions. They are saved in the template (`layout.nodes[].fill` is new) and kept when
  the template is drawn on a map.
- Both side panels of the Template Builder fold section by section (click a title; *Expand all* / *Collapse all*).
- **History page** in the documentation (`docs/history.md`, a top-level *History* tab): how GEMs MAP started, told
  by its author, with links to the papers and tools it mentions and a table of other GEM visualisation tools. The
  roadmap now names KEGG maps and pathway images as possible sources for in-app AI template generation.
- **Documentation site** (MkDocs + Material for MkDocs, Read the Docs): `mkdocs.yml`, `.readthedocs.yaml`, pinned
  `docs/requirements.txt`. Home page, getting started, COBRAGUI, Maps and Templates sections, a reserved Tutorials
  section (planned iML1515 walkthrough) and reference pages (glossary, FAQ, troubleshooting, limitations, roadmap
  with solver selection and flux sampling, examples). The existing technical notes are part of the site.
  - 33 real screenshots of *E. coli* iML1515 (BiGG), 8 with numbered callouts at the real element positions,
    made by `tools/docs/capture_screenshots.py` (Playwright with the local Edge/Chrome, four isolated phases,
    `capture-manifest.json` with versions, model checksum and the values shown); two original SVG diagrams.
  - `docs/CONTRIBUTING.md`: local preview, Read the Docs setup, writing rules, screenshot updates, audit log.
  - **Quick start tutorial** (`docs/tutorials/quick-start.md`): *E. coli* iJO1366 from BiGG, pFBA with and without
    oxygen (`run_o2`, `run_wo2`), comparison, subsystem figures, then the Map Builder (Visualize comparison, central
    carbon and amino acid templates, mappings, linked plots, collapse, connected reactions, routes), 18 steps with
    "the idea behind it" notes. Its 29 screenshots come from `tools/docs/capture_quickstart.py`, which plays the
    tutorial in the app and records the values shown in `quickstart-manifest.json`.
- **Place templates with the mouse**: inserting a pathway or shape template (Map Builder list, command palette, or
  *Create pathway* in the mapping review) first shows a light preview that follows the cursor inside a dashed
  frame; a click drops it there, Esc or a right-click cancels, Space + drag still pans.
- **KEGG-derived templates**, curated and drawn by an AI curator and marked *AI-generated — needs review*:
  Glycolysis / Gluconeogenesis (map00010), Citrate cycle (map00020), Pentose phosphate pathway (map00030) and
  Alanine, aspartate and glutamate metabolism (map00250) in a new *KEGG-derived templates* library section, and an
  **Amino acid biosynthesis overview** (after map01230) in *Central carbon*. Every KEGG compound and reaction of each
  map is drawn, folded (anomers, lumped complexes, cofactor variants) or omitted with a reason; identities come from
  the GEMs MAP library, MetaNetX and the BiGG tables; layouts have no overlapping labels or crossings.
  - Pipeline `npm run kegg:template -- <map>` (`tools/kegg/`), per-map reports in `docs/templates/kegg/`.
  - `npm run template:qc` (validation, visual QC with the app's geometry, mapping comparison on the test models)
    and `npm run template:render` (SVG / PNG with the app's Scene).
- Template schema 1.1: cofactors drawn beside their arrows (attached nodes, repeated per reaction), reaction
  variants, provenance, pathway summary arrows, generic entities, identity confidence, review status and source.
  The library groups templates by section and shows the review status; the inspector shows origin, variants and
  provenance, with *Mark as reviewed by me*.
- **Structural model editor** in COBRAGUI: edit reactions (ID, name, bounds, reversibility, objective
  coefficient, subsystem, GPR, annotations, notes and the stoichiometry, in a Reactants | Products table kept in
  sync with a text equation), build new reactions, and add metabolites from the model, from the databases
  (KEGG / ChEBI resolved by MetaNetX, plus the local BiGG tables; low-confidence matches must be confirmed) or by
  hand. New metabolites and compartments are created in the same transaction as the reaction.
  - One-step **Exchange / Sink / Demand** from the inspector or the right-click menu, with bound presets (no
    uptake unless chosen), duplicate detection and a warning for non-extracellular exchanges.
  - Live mass and charge balance and a preview; IDs suggested from the model's own convention.
  - Validation before every change (duplicate IDs, unknown metabolites or compartments, invalid coefficients,
    bounds or GPR); duplicate metabolites / reactions reported; unbalanced reactions allowed with a warning.
  - Edits change the real cobra.Model used by FBA, FVA, the medium and exports; failed edits roll back.
  - Undo / redo (Ctrl+Z / Ctrl+Shift+Z, shared with state changes), a "Model changes" history, *Validate
    model*, *Export patch* (model_patch.json) and an unsaved-changes prompt. The edit log is kept per model and
    re-applied on load; exported files and simulation results record the edits.
  - Backend: `edit_service.py`, `/api/models/{id}/edits*` and `/api/models/{id}/validate`; tests in
    `tests/test_edits.py`.
- **Template Builder** (new *Templates* workspace): create, edit, duplicate, validate, import and export
  model-independent pathway templates (`*.gemsmap-template.json`, schema 1.0.0) without loading a GEM.
  - Own file format with separate layers: metadata (template version, scope, authors, license, citations),
    biology (conceptual compartments with fallbacks, entities with multi-database identities, metabolites as
    entity @ compartment, reactions with stoichiometry, cofactors, reversibility, EC and database IDs, pathway links)
    and layout (several visual instances per metabolite, ports, arrow geometry, groups, labels). Stable `tpl_*` ids.
  - Template Design Mode reuses the Map Builder canvas; a node is a *template entity*, not a model metabolite.
    Double-click → identity search (GEMs MAP library offline; KEGG + ChEBI resolved through MetaNetX with the backend);
    reaction identity from its participants (built-in reactions and MNXref).
  - Identity statuses confirmed / suggested / ambiguous / unresolved on the canvas, review queue, Auto Identify,
    potential-identity-conflict handling (a confirmed identity is never overwritten).
  - Validation (identities, duplicates, broken edges, heavy-atom balance, model-like IDs, direction) and a transparent
    completeness score; import report with schema check; unsaved drafts survive workspace switches and reloads.
  - Templates are applied to a GEM through the existing mapping engine and review dialog; user templates appear
    in the Map Builder gallery. Backend: `GET /api/identity/compounds`, `POST /api/identity/reactions`.
- **BiGG data layer** for templates (`npm run bigg:data`, installed once from the bigg.bio bulk tables or from local
  files; GEMs MAP does not call the BiGG API). BiGG universal metabolites join the identity search and Auto Identify;
  reaction identity scores BiGG universal reactions on every participant (cofactors included), coefficient,
  compartment, EC and transport; *Add BiGG IDs* adds unambiguous BiGG IDs to a template's entities and reactions.
  Models exported by bigg.bio lose their `__<model>__` ID prefixes on import, and COBRAGUI completes their
  annotations from the BiGG tables. Backend: `GET /api/bigg/status`, `POST /api/identity/bigg-ids`.
- **Metabolite analysis uses the BiGG tables** (when installed) as a second, offline knowledge base. MetaNetX still
  decides: BiGG IDs (current or superseded) bridge to MetaNetX only when the model's own identifiers resolve nothing
  there, never count as an extra independent database, and an MNX ID known only through BiGG (often an older MNX
  release) is not written. Accepted matches also get the BiGG ID and BiGG's curated cross-references (KEGG, ChEBI,
  ModelSEED, HMDB, InChIKey) when one BiGG metabolite fits unambiguously.
- Glycolysis, TCA, PPP and the global central carbon template are now ordinary template files with full
  equations (cofactors added, heavy-atom balanced) and KEGG reaction IDs checked against the KEGG equations.
  Their mapping on five test models is unchanged (520 slot and reaction results compared).
- **Collapsible inspector sections** in the Map Builder and COBRAGUI: click a section title to fold it,
  *Expand all / Collapse all* at the top; the state is remembered per panel and section.
- **Routes carrying flux**: with flux data loaded, *Find routes* keeps only routes whose every reaction carries flux
  in the direction it is used (in a chosen condition, or any condition per step); untick to see all routes.
- **Animated GIF export** (Export → GIF): one frame per chosen condition (in the Data → Conditions order)
  with optional smooth transitions that interpolate arrow widths, colours and node sizes, the condition name
  stamped on each frame, adjustable hold time, resolution in dpi (300 / **600 default** / 900, applied to the
  export size in mm; frames capped at 8000 px / 36 MP) and a smooth loop back to the first condition. Frames are
  rendered and encoded one at a time, so high resolutions do not exhaust memory.
  Uses the same area / size / margin options as the static export. Encoder: `gifenc` (MIT).
- **Stop a running simulation** (Stop button in the top bar, the status bar and the Simulation page). FVA now runs
  as COBRApy calls over chunks of reactions with the same constraints, so it shows progress (reactions done / total)
  and stops within one chunk. *Stop & keep* saves the intervals already computed as a result marked
  "stopped at N/M". A single FBA/pFBA/loopless solve cannot be interrupted inside the solver: the request is
  dropped and the backend discards the answer. Backend: `jobId` in the simulate request, `GET /api/jobs/{id}`,
  `POST /api/jobs/{id}/cancel`.
- **Select a whole subsystem** in the Explorer's subsystem browser (checkbox; partial selections show as
  indeterminate) to run *FVA on selection*, block, export or add to the map. The subsystem inspector adds
  *Select reactions* and *FVA on subsystem*.
- **Publication figures for subsystems** (Results and Compare → Subsystems): *Bars*, *Heatmap* and *Donut* views
  next to the interactive list, per reaction or per subsystem total (Σ|flux|), together or as lettered panels.
  Results figures can include other flux results (e.g. imported runs of other models), compared by reaction id.
  Journal widths (89 / 120 / 183 mm), font size, IDs or names, values, notes and the map's palettes; saved as
  SVG, vector PDF or PNG at 300 / 600 dpi. FVA results are drawn as intervals only; donut captions state that
  slices are shares of Σ|flux|, not a mass balance; a reaction missing from a result is drawn as n/a, never 0.
- **Metabolite analysis** in COBRAGUI (new section, plus a card on the Overview): every metabolite is mapped to
  MetaNetX / MNXref through its existing identifiers (SPARQL, batched, cached in SQLite, so re-runs work offline).
  - **Confident** matches add the missing cross-references to the annotation (MetaNetX, KEGG, ChEBI, BiGG,
    ModelSEED, MetaCyc, HMDB, VMH, SABIO-RK, InChIKey) and, optionally, a missing formula and charge.
  - **Needs review** covers identifiers that disagree, formula conflicts, and matches found only through the ID
    string or an exact name. Each candidate shows its evidence and the cross-references it would add.
  - The curation is a reversible layer on top of the imported file. It is re-applied on reload and included in
    *Save as model*, with a provenance note in the model notes.
  - Backend: `annotation_service.py`, `metanetx.py`, `/api/models/{id}/annotation*` routes, tests with a fake
    MetaNetX endpoint.
- Backend responses are gzip-compressed (genome-scale catalogs and analyses are several MB of JSON).
- **Hide zero-flux reactions** (Inspector → Connected reactions, when flux data are loaded): shows only reactions
  with non-zero flux in at least one condition.
- **Resizable legend**: drag a corner of the selected legend (opposite corner stays put) or use Inspector → Size.
- **Condition order**: drag ⋮⋮ or use ↑ ↓ in Data → Conditions; plots, inspector values, the legend and the
  condition bar follow the new order.
- **Model-agnostic pathway templates** (Glycolysis, TCA cycle, oxidative PPP, central carbon). Slots reference a
  canonical metabolite library (KEGG, ChEBI, BiGG, ModelSEED, MetaCyc and HMDB identifiers, synonyms, formulas,
  anomeric "related forms") instead of model IDs. Each template keeps its own layout.
- **Template mapping engine** (`src/templates/mapping/`): identifier, compartment and name normalization;
  candidate generation; interpretable scores from identity × compartment × reaction topology; joint assignment
  (one metabolite never fills two slots); statuses confirmed / auto_high / provisional / ambiguous / unresolved /
  absent. Ties and weak matches are left open, never forced.
- **Mapping review dialog** with "why this match?" evidence, manual model search, *Mark absent* and a JSON
  **mapping report** with provenance. Open slots can be resolved from the Inspector or the context menu, and
  UI-only **?** badges mark them on the canvas (never exported).
- **Model mapping profiles**: confirmed choices are stored per model fingerprint, reused across templates and
  saved in `.gemsmap` projects. The gallery shows template coverage per model.
- SBML import reads MIRIAM annotations (identifiers.org URIs).
- `npm test`: template tests on e_coli_core, iJO1366, a ModelSEED-namespace and an annotation-free copy
  (`npm run test:fixtures` builds them from the COBRApy package data).

### Changed
- **The app always opens clean.** The map is autosaved to a temporary session every 5 minutes (when it changed) and
  is never reopened automatically; a welcome banner offers *Continue last session*, *Download it (.gemsmap)* and
  *Reopen COBRAGUI model*. COBRAGUI no longer restores its last model at start-up either. A session that freezes
  the page (e.g. a very large model sent to the map) can therefore no longer lock the app on every reload. The
  previous temporary session is kept as a spare (`gemsmap.autosave.previous`).
- **The Model Lab is now COBRAGUI** (COBRA graphical user interface), with its own logo: *cobra* with a small
  network in the *o*, *GUI* with the cobra as the *I*, and a screen showing the GEMs MAP gem and charts. The logo
  sits at the left of the COBRAGUI header row, the workspace switcher reads *COBRAGUI · Map Builder · Templates*,
  and the interface, the README and the documentation use the new name (`docs/brand/` has the logo files; the
  master is in `logo/`).
- **The project is now GEMs MAP** (formerly MetMap), with a new logo: a gem drawn as a metabolic network, its edges
  coloured like a flux map, and the COBRA cobra around the **P**. The top bar shows the gem on its own, the
  browser tab has a favicon, `docs/brand/` holds the logo files and a short brand guide, and `logo/` the masters;
  `tools/brand/make_brand.py` regenerates every logo file and the vector gem from them.
  - Projects are saved as `.gemsmap` and templates as `*.gemsmap-template.json` (format tags `gemsmap` and
    `gemsmap-template`). `.metmap` projects and `*.metmap-template.json` templates still open; imported and stored
    templates get the new tag.
  - Browser storage moves to the new name on the first start: localStorage keys `metmap.*` / `metmap-*` become
    `gemsmap.*` / `gemsmap-*` (the autosaved map included), and the IndexedDB databases `metmap` / `metmap-lab`
    are copied to `gemsmap` / `gemsmap-lab` (the old ones are kept as a backup).
  - npm package `gemsmap`; tools read `GEMSMAP_DATA_DIR` (`METMAP_DATA_DIR` still works); exported models carry
    `GEMs MAP curation` / `GEMs MAP structural edits` notes; dev handles `window.gemsmap` / `window.gemsmapLab`.
- **Compartments are optional in templates**: the person chooses them when mapping onto a GEM. A missing
  compartment is no longer a warning nor part of the completeness score; a preferred compartment still ranks the
  matcher's candidates.
- The top bar has two floors: project row (logo, workspace, File, project name, search, Export) above the tool row
  (map tools or COBRAGUI header), so they never overlap; the project name stays visible on narrow windows.
- Sending a result or a comparison from COBRAGUI to the Map Builder sends **only the data**: no reactions are
  drawn any more (draw specific reactions with *Add to map*).
- The File menu ships only the central-carbon example; private projects live in the git-ignored `my_projects/`
  folder (open them with *File → Open project…*).
- FVA progress: chunked COBRApy calls give the same intervals as one call (tested).
- The pan tool shortcut is now **C** (next to V); H no longer switches tools. Pan sits next to Select in the toolbars.
- Template arrows prefer reactions matching the step's EC number and avoid cross-compartment transporters.
- An intracellular template slot is no longer bound to an extracellular metabolite (e.g. `glc__D_e` in
  e_coli_core); the candidate is listed, and the choice is yours.
- **Subsystems tab in Results**: ranked bars of Σ|flux|, active reactions or mean |flux| per subsystem
  (Σ FVA width / variable reactions for FVA). Selected subsystems open their reactions as signed
  diverging bars (blue = as written, red = reverse), together on one scale or as separate panels with a
  shared or own scale. Hover tooltips, add a subsystem to the map from its panel.
- **Subsystems tab in Compare**: dumbbell A → B of Σ|flux| per subsystem, ranked by |Δ| or log₂ ratio,
  with counts of changed / activated / inactivated / reversed reactions taken from the comparison;
  paired A/B bars per reaction. The subsystem selection is shared between Results and Compare.
- Example model **E. coli iJO1366** (bundled with COBRApy, 37 subsystems).
- **Import results** in COBRAGUI (Results → Import, Ctrl K, or drop the files): JSON exported by
  GEMs MAP or by the legacy GEM Explorer, and CSV/TSV flux tables (`reaction,flux`, wide tables with one
  result per column) or FVA tables (`minimum/maximum`, `_min/_max`). Imported results are tagged, keep
  their source model in the provenance and can be compared with any other result by reaction id —
  also across different models ("Only in one result" category). Turnover and exchanges missing from a
  file are derived by COBRApy only when the file belongs to the loaded model (`POST /api/models/{id}/derive`).
- **Map Builder → Data** imports result JSON files as conditions of the COBRA datasets.
- **ecModel families** (GECKO): split copies (`r101_EXP_1`, `r101_REV_EXP_2`, `r262_REV`) are folded into their
  parent reaction. Arrows show the net flux (Σ forward − Σ reverse; samples element-wise, FVA as outer bound),
  missing parents are rebuilt as virtual reactions (never exported), enzyme pseudo-metabolites are hidden.
- Large models (> 2 MB) are autosaved to IndexedDB instead of being dropped from the autosave.
- **Drag to merge**: dropping a metabolite on another node of the same metabolite merges them (arrows, plots and groups follow).

### Fixed
- **COBRAGUI status bar popovers** (*Zero threshold*, the new version popover) opened below the bottom edge of the
  window, out of sight; they now open upwards.
- Messages that told users to run `npm run backend` or `npm run bigg:data` now name the installed commands
  (`gemsmap`, `gemsmap bigg-data`) first; the development commands are still mentioned.
- `gemsmap diagnose` crashed when its output went to a pipe whose Windows code page cannot encode the folder name
  (seen with cp949 and a folder named with "Á"); characters that cannot be encoded are now escaped.
- **Freeze after sending large-model results to the map.** The template gallery maps every built-in template when
  the Elements tab shows; on large enzyme-constrained models the amino-acid template took minutes, because every
  graph query re-tested ~20 cofactor name patterns per metabolite. Cofactor checks and metabolite neighbourhoods are
  now cached per model: all nine built-in templates map in under 1 s on such models (regression test on iJO1366).
- The "Drop a template / model / file here" overlay could stay on screen for good after dragging a text selection or
  a label inside the app, or after a drag that ended outside the window; Esc did not remove it. It now appears only
  for files dragged from the computer and disappears as soon as the drag ends in any way (drop, Esc, leaving the
  window, a click or a mouse move).
- An inserted pathway moves as one piece: its titles, pathway-link labels and the cofactors drawn beside its arrows
  are selected with its metabolites (they used to stay behind when it was dragged). Cofactors drawn beside an
  arrow now follow the arrow whenever it moves — dragging or nudging its metabolites, layouts, changing its bend.
- *Fit* no longer produces a negative zoom when the canvas is narrower than its margins.
- Left-panel tabs switch wherever the label is clicked, also when a browser layer (seen in Opera) swallows the click; Alt+1/2/3 shortcuts.
- Importing a model right after opening the app could be overwritten by the restore of the previous model.
- Removed the "Mini" example, which needed a BiGG download and failed offline.
- Repeated loads of an example model no longer re-parse the SBML (8 s → about 1 s).
- COBRAGUI reconnects by itself when the backend is started after the page.

### Changed
- Adding a reaction from a metabolite (connected-reaction chips, Model search, participant picker) creates new copies of its metabolites instead of linking to nodes already on the map.
- Inserting a route between two metabolites (*Find routes → Insert*) creates new copies of the intermediate metabolites; only the two chosen ends are reused. *Collapsed* insertion is unchanged.
- Legacy GEM Explorer FVA exports are imported as intervals only; their stored midpoints are ignored.

## 0.2.0 — 2026-10-01 (before the public repository)

### Added
- **Model Lab (COBRAGUI)**, a graphical COBRApy workspace:
  - Import SBML / COBRA JSON / MAT with validation notes (dead ends, missing GPRs, mass balance, SBML messages).
  - Virtualized metabolite / reaction / gene explorer: multi-field search, one-click |flux| sort,
    zero-flux filter with a configurable threshold, combinable filters shown as chips, saved views, subsystem browser.
  - Inspector with back/forward navigation, breadcrumbs, clickable equations and GPRs, bounds editor,
    local network preview (1–2 hops), favorites, context menus, and a Ctrl K palette with model search and commands.
  - Model states (scenarios) with change log, undo/redo, revert, export of modifications and *Save as model*.
  - Medium editor through `Model.medium`, with presets (model file, minimal, rich, anaerobic, custom).
  - FBA, pFBA, loopless FBA and FVA with explicit solver status and diagnostics for non-optimal problems.
  - Result history with full provenance; exchange, turnover, gene and FVA-interval views; JSON/CSV export.
  - Comparison studio: configuration diff, Δ / log₂FC / fold change with explicit categories
    (activated, inactivated, direction reversal), optional pseudocount, turnover-change contributions,
    and state-vs-state diff.
- **COBRApy backend** (`backend/`, FastAPI): model, medium, simulation, search, comparison and export services, with API tests.
- **Bridge to the Map Builder**: add reactions / metabolites / subsystems to the map, send results and
  comparisons as datasets with suggested mappings, *Focus in map* / *Inspect in Model Lab*.
- Mouse-resizable side panels in both workspaces (double-click an edge to reset).
- Repository setup: MIT license, contributing guide, changelog, CI workflow, issue and PR templates.

### Changed
- FVA results are intervals only; midpoints are never used as a flux distribution (corrects the legacy GEM Explorer behaviour).
- pFBA reports the biological objective value; the minimized total flux is stored separately.
- Offline scripts in `tools/` read private input paths from environment variables; unpublished data are kept out
  of the repository.

### Removed
- The GLAMM visualization of the legacy Tkinter tool is not part of MetMap (replaced by the Map Builder).

## 0.1.0 — 2026-09-30 (before the public repository)

### Added
- Map Builder: canvas editor for metabolic pathway figures — templates and auto-binding, model-driven
  editing (connected reactions, routes, collapse/expand), CSV flux / FVA / sampling / time-course data,
  width / colour / size mappings, condition comparison and animation, linked mini-plots, legend,
  SVG / PNG / PDF export, `.metmap` projects with autosave.

[Unreleased]: https://github.com/BatistaB/gemsmap/compare/v0.3.0b1...HEAD
[0.3.0b1]: https://github.com/BatistaB/gemsmap/releases/tag/v0.3.0b1
