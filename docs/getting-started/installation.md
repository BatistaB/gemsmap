# Installation

GEMs MAP is run from its source code. There is no installer yet: you start two local processes, the COBRApy backend and the web interface, and open the interface in a browser.

## Requirements

| Component | Requirement | Notes |
| --- | --- | --- |
| Node.js | 18 or newer | Runs the interface (Vite dev server, React). Continuous integration uses Node 20. |
| Python | 3 with `venv` and `pip` | Runs the backend (COBRApy, FastAPI, uvicorn). Continuous integration uses Python 3.12. |
| Browser | A current Chromium-based browser, Firefox or Safari | The interface stores your work in the browser (local storage and IndexedDB). |
| Internet | Only for installation and identifier lookups | Simulations run offline. |

GEMs MAP is developed and tested on Windows 11; the automated tests and the production build also run on Ubuntu. Other systems with Node.js and Python should work but are not routinely tested.

## Install

From the root of the repository:

```bash
npm install
```

```bash
npm run backend:setup
```

The first command installs the interface dependencies. The second creates a Python virtual environment in `backend/.venv` and installs the backend requirements (`backend/requirements.txt`: COBRApy, FastAPI, uvicorn, python-multipart, SciPy, and pytest/httpx for the tests).

!!! note "If `python` is not on your PATH"
    `npm run backend:setup` calls `python`. On systems where the interpreter is called `python3`, run `python3 backend/setup_env.py` instead; it does the same thing.

## Start

Open two terminals in the repository root.

=== "Terminal 1 · backend"

    ```bash
    npm run backend
    ```

    The COBRApy backend starts on `http://127.0.0.1:8765` and keeps running. Leave this terminal open.

=== "Terminal 2 · interface"

    ```bash
    npm run dev
    ```

    The interface is served on `http://localhost:5173` and forwards `/api` requests to the backend.

Open **http://localhost:5173** in your browser. The status bar at the bottom of COBRAGUI shows a green dot and the COBRApy version and solver (for example `COBRApy 0.32.1 · GLPK`) when the backend is reachable. If it shows *Backend offline*, see [Troubleshooting](../reference/troubleshooting.md#cobragui-says-backend-offline).

<figure class="gm-shot" markdown>
![The COBRAGUI start screen: a drop zone reading "Drop a metabolic model here", the accepted formats SBML, COBRA JSON and MATLAB .mat, an Import model button, links to two example models bundled with COBRApy, and the line "COBRApy 0.32.1 · solver GLPK · backend ready".](../assets/images/cobra-gui-import.png)
<figcaption>COBRAGUI when the backend is running: drop a model file or open one of the two examples bundled with COBRApy (<em>E. coli</em> core and iJO1366).</figcaption>
</figure>

## Optional: BiGG tables for templates

The template identity tools and the metabolite analysis can use the universal metabolite and reaction tables of [BiGG Models](https://bigg.bio) as an offline knowledge base. Install them once (about 19 MB):

```bash
npm run bigg:data
```

Or use the two JSON files you downloaded yourself from the BiGG data-access page:

```bash
npm run bigg:data -- --from path/to/folder
```

The tables are stored next to the model cache, outside the repository. GEMs MAP reads them locally and never calls the BiGG API.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `COBRAGUI_PORT` | `8765` | Port of the backend (`npm run backend -- --port 8766` also works). |
| `COBRAGUI_CACHE` | `%LOCALAPPDATA%/cobragui/models` (Windows) or `~/.cache/cobragui/models` | Folder for cached model files, curation layers and edit logs. The MetaNetX cache and BiGG tables live in its parent folder. |
| `VITE_COBRA_API` | `/api` (proxied to port 8765) | Backend URL used by the interface, e.g. `http://127.0.0.1:8766/api` for a second backend. |
| `METANETX_SPARQL` | `https://rdf.metanetx.org/sparql` | MetaNetX endpoint used by the metabolite analysis. |

## Production build

```bash
npm run build
```

The static interface is written to `dist/`. `npm run preview` serves that build locally, again forwarding `/api` to the backend on port 8765.

## Check the installation

```bash
npm test
```

```bash
npm run backend:test
```

`npm test` runs the template and placement tests of the interface; `npm run backend:test` runs the backend API tests on the *E. coli* core model bundled with COBRApy.

<div class="gm-next" markdown>
**Next:** take the [first look](first-look.md) at the window, or go straight to [importing a model](../cobra-gui/importing-models.md).
</div>
