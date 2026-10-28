# Architecture

Developer notes: how the source code is organised and where each responsibility lives. For the development
workflow (setup, tests, commit conventions, releases) see `CONTRIBUTING.md` at the repository root; for how the
parts fit together from a user's point of view, see the [Overview](getting-started/index.md).

## Where things run

GEMsMAP is a web interface (TypeScript, React, Vite) served by a local Python server (FastAPI over COBRApy).
The `gemsmap` command serves both on one address: the API under `/api` and the built interface under `/`
(`backend/gemsmap/server.py`). In development, `npm run dev` serves the interface on port 5173 and forwards `/api`
to the backend started with `npm run backend`.

- **All flux computations run in Python.** The browser never computes fluxes.
- **The Map Builder and the template matcher run in the browser.**
- **The backend is stateless apart from the loaded models.** Model states (bound overrides, objective) belong to
  the frontend and are sent with every request, so results are reproducible from their metadata.
- **Imported files are cached on disk** (`%LOCALAPPDATA%\cobragui\models` on Windows, `~/.cache/cobragui/models`
  elsewhere; override with `COBRAGUI_CACHE`), so a restarted backend reloads them. The original file is never
  modified.
- **All COBRApy work runs on one worker thread**, because GLPK aborts when a problem is used from several threads.

## Repository layout

```
src/
  lab/          COBRAGUI: store, API client, search, bridge to the map, UI
  ui/           Map Builder UI (canvas, panels, inspector, palette) + shared pieces
  model/ data/  GEM types and importers, datasets and CSV parsing
  viz/ layout/  visual mappings, palettes, geometry, layout algorithms
  templates/    template format, built-in templates, library, Template Builder, mapping engine
  store/        Map Builder state, undo/redo, .gemsmap format
  export/       figure export (SVG, PNG, PDF, GIF) and autosave
backend/
  cobragui/     COBRApy service (FastAPI)
  gemsmap/      the installable application: the gemsmap command and the server
  tests/        backend tests (pytest)
tools/          offline scripts (release build, docs screenshots, KEGG templates, BiGG data)
public/         demo examples served by the app
docs/           documentation site (MkDocs, Read the Docs) and technical notes
```

## Frontend

The modules are independent, and data and visuals are never coupled:

| Layer | Path | Responsibility |
|---|---|---|
| COBRAGUI | `src/lab/` | COBRAGUI state, API client, search, model edits, the bridge to the Map Builder (`bridge.ts`) |
| Biology | `src/model/` | `Metabolite`, `Reaction` (stoichiometric hyperedges), `MetabolicModel`; COBRA JSON / SBML import; validation; graph queries (expand, shortest path, currency-aware); fuzzy search |
| Data | `src/data/` | `Dataset`, `Condition`; CSV/TSV parsing (wide, FVA min/max, long-format samples); ID matching; KDE/quantiles |
| Visualization | `src/viz/` | Glyph types (`NodeGlyph`, `ReactionGlyph`, `PlotGlyph`, `PathwayGroup`…), `VisualizationMapping`, palettes, style presets, the pure mapping engine (`evaluate.ts`), geometry |
| Layout | `src/layout/` | Layered vertical/horizontal, circular, grid, hierarchical, organic, align/distribute, tidy |
| Templates | `src/templates/` | Template file format (`format/`), built-in template files, library, Template Design Mode (`design/`), mapping engine (`mapping/`), auto-binding |
| State | `src/store/` | Zustand store, undo/redo snapshots, the `.gemsmap` project format, recovery of autosaved work |
| Rendering/UI | `src/ui/` | SVG scene (attributes only, so the export stays editable), canvas interactions, panels, command palette |
| Export | `src/export/` | Clean SVG builder, PNG with DPI metadata, print-to-PDF, animated GIF, autosave |

Scientific choices in the Map Builder:

- Flux domains are computed across **all** conditions, so switching condition never silently rescales the map.
- Arrows encode direction, so colour defaults to |flux|. Comparisons (Δ, fold change, log₂FC) use diverging palettes.
- Zero flux is drawn thin and muted.
- Concentration and turnover are different dataset kinds and are never conflated.
- Currency metabolites (ATP, NAD(P)H, H₂O, H⁺, Pi, CoA, …) are hidden from maps, expansion and path-finding. They
  can be shown as inline cofactor text.

## Backend

`backend/cobragui/` is a FastAPI service over COBRApy, with one module per concern:

| Module | Responsibility |
|---|---|
| `main.py` | HTTP routes (all under `/api`) and the single COBRApy worker thread |
| `registry.py` | In-memory registry of imported models, backed by the on-disk cache of the original files |
| `errors.py` | Errors the UI can explain (title, message, what to check) and JSON-safe numbers |
| `schemas.py` | Request bodies |
| `services/model_service.py` | Import and validation, UI catalog, applying a model state inside `with model:` |
| `services/medium_service.py` | Medium table, edits and presets through `Model.medium` |
| `services/simulation_service.py` | FBA / pFBA / loopless / FVA, turnover, exchanges, metadata |
| `services/comparison_service.py` | Result-vs-result comparison, turnover contributions |
| `services/search_service.py` | Normalized multi-field search index |
| `services/edit_service.py` | Structural edits of the working model (reactions, metabolites, compartments) |
| `services/export_service.py` | Result JSON/CSV, modified-model SBML/JSON/MAT |
| `services/annotation_service.py` | Metabolite annotation analysis and curation (MetaNetX / MNXref) |
| `services/metanetx.py` | MetaNetX SPARQL client with a local SQLite cache |
| `services/identity_service.py` | Template identity search for the Template Builder, without a GEM |
| `services/bigg_service.py` | Local BiGG tables (installed once, used offline) |

Main route groups: model import and inspection (`/api/models/…`, `/summary`, `/reactions`, `/metabolites`,
`/genes`, `/search`), medium (`/medium/…`), simulation (`/simulate/{method}`, with `/api/jobs/{id}` for progress
and cancellation), structural edits (`/edits/…`), annotation (`/annotation/…`), template identity
(`/api/identity/…`, `/api/bigg/…`) and results (`/api/results/compare`, `/api/results/export`). The complete list is
in `backend/cobragui/main.py`.

Scientific rules enforced in the backend:

- pFBA reports the biological objective value; the minimized total flux is kept separately.
- FVA returns intervals only. Midpoints are never treated as a flux distribution.
- A non-optimal solve never returns fluxes; it reports the solver status and what to check.
- Metabolite turnover is 0.5·Σ|S·v|, labelled as a derived proxy. It shows "—" when there is no flux vector.
- Zero is a configurable numerical threshold, not exact equality.

Indicative timings on iML1515 (2,712 reactions) with GLPK: SBML import about 20–25 s on first load, FBA 0.8 s,
pFBA 4 s, full FVA about 95 s. For a quick FVA on large models, run it on a selection.

## Tests

| Command | What it checks |
|---|---|
| `npm run typecheck` | TypeScript types across the interface |
| `npm test` | Template and mapping tests against e_coli_core, iJO1366, a ModelSEED-namespace copy and an annotation-free copy of e_coli_core (fixtures from `npm run test:fixtures`) |
| `npm run backend:test` | Backend API and service tests (pytest) |
| `mkdocs build --strict` | The documentation site |

CI (`.github/workflows/ci.yml`) runs all four on every push to `main` and on every pull request.
