# Contributing / development workflow

GEMsMAP is developed as the visualization platform of a PhD project. These conventions keep the
history readable and every result reproducible.

## Setup

```bash
npm install
npm run backend:setup   # creates backend/.venv (COBRApy, FastAPI, uvicorn, pytest)
npm run backend         # terminal 1 — http://127.0.0.1:8765
npm run dev             # terminal 2 — http://localhost:5173
```

Before every commit:

```bash
npm run typecheck
npm run backend:test
```

`npm run build` must also pass before a release. CI (`.github/workflows/ci.yml`) runs the same checks.

How the code is organised (interface layers, backend services, tests) is described in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Branches

- `main` — always builds and passes tests. Releases are tagged here (`v0.3.0`, …).
- `feat/<topic>`, `fix/<topic>`, `docs/<topic>` — short-lived branches merged into `main`.

Working alone, it is fine to commit small, finished steps directly on `main`. Use a branch for
anything that takes more than a day or might be abandoned.

## Commit messages — Conventional Commits

```
<type>(<scope>): <summary in imperative mood, ≤ 72 characters>

<body: what changed and why, wrapped at 72 columns>

<footer: BREAKING CHANGE: … / Refs: #issue>
```

A template is installed with `git config commit.template .gitmessage`.

| type | use for |
|---|---|
| `feat` | new user-visible capability |
| `fix` | bug fix |
| `perf` | faster, same behaviour |
| `refactor` | code change without behaviour change |
| `docs` | README, guides, comments only |
| `test` | tests only |
| `build` | tooling, dependencies, packaging |
| `ci` | GitHub Actions |
| `chore` | housekeeping, releases |

| scope | area |
|---|---|
| `lab` | COBRAGUI frontend (`src/lab/`) |
| `map` | Map Builder (`src/ui`, `src/viz`, `src/layout`, `src/store`) |
| `backend` | COBRApy service (`backend/`) |
| `bridge` | COBRAGUI ⇄ Map Builder integration (`src/lab/bridge.ts`) |
| `data` | importers, datasets, CSV parsing (`src/data`, `src/model`) |
| `tools` | offline scripts (`tools/`) |
| `ui` | shared UI pieces (panels, palette, shortcuts) |
| `docs` | documentation |

Examples:

```
feat(lab): add gene knockout simulation
fix(backend): report infeasible status for loopless FBA
perf(lab): virtualize the medium table
feat(bridge)!: send FVA intervals as range datasets

BREAKING CHANGE: the ds_cobra_fva dataset no longer stores midpoints.
```

**Scientific changes must say so in the body** — for example a different objective value, a new
default tolerance or a changed fold-change rule — and be listed under *Changed* in `CHANGELOG.md`.

## Versioning and releases

Semantic versioning, `MAJOR.MINOR.PATCH`:

- `MINOR` — new features (backwards-compatible `.gemsmap` files and API).
- `PATCH` — fixes only.
- `MAJOR` — incompatible `.gemsmap` format or API change.

Release checklist:

1. Move the *Unreleased* entries of `CHANGELOG.md` under the new version and date.
2. Bump `__version__` in `backend/gemsmap/__init__.py` (PEP 440, for example `0.3.0b1`), `version` in
   `package.json` (npm form, `0.3.0-beta.1`) and `version` and `date-released` in `CITATION.cff`.
   `tools/release/build.py` stops if they disagree.
3. `npm run typecheck && npm run build && npm run backend:test`
4. `git commit -m "chore(release): v0.3.0"` and `git tag -a v0.3.0 -m "v0.3.0"`.

## Private data

Unpublished models, projects and results stay in `my_projects/` (git-ignored) and must never be committed.
Put personal ignore patterns in `.git/info/exclude`, which is never committed either. Before committing,
check that `git status` lists nothing private. Release files are built only from tracked files
(`tools/release/build.py`).
Scripts in `tools/` read their private inputs from environment variables, never from hard-coded paths.
