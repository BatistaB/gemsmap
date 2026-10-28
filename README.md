<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/gemsmap-logo-dark.png">
    <img src="docs/brand/gemsmap-logo.png" alt="GEMsMAP" width="460">
  </picture>
</p>

<h3 align="center">An interactive workbench that links constraint-based analysis, identity-aware pathway templates and editable canvas maps of genome-scale metabolic models</h3>

<p align="center">
  <img src="https://github.com/BatistaB/gemsmap/actions/workflows/ci.yml/badge.svg" alt="CI"> <a href="https://pypi.org/project/gemsmap/"><img src="https://img.shields.io/pypi/v/gemsmap?include_prereleases&label=PyPI" alt="PyPI"></a> <a href="https://gemsmap.readthedocs.io/"><img src="https://readthedocs.org/projects/gemsmap/badge/?version=latest" alt="Documentation"></a> <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
</p>

GEMsMAP takes a genome-scale metabolic model (GEM) from import to a publication-quality figure in one application.
Explore and simulate the model with [COBRApy](https://opencobra.github.io/cobrapy/), compare conditions, then map
the results onto editable pathway figures, without writing every step as code.
Think "Canva for metabolic networks" with COBRApy and pathway-style GEM semantics underneath.
It runs on your own computer, and your models are not uploaded anywhere.

<p align="center">
  <img src="docs/assets/images/maps-demo.png" alt="The Map Builder showing the built-in central carbon example: glycolysis, the oxidative pentose phosphate pathway and a circular TCA cycle, with flux-sampling density plots beside the reactions and a condition bar at the bottom." width="900">
  <br><sub>The built-in central carbon example in the Map Builder: arrow width and colour encode flux, and each density plot shows a flux distribution per condition. The example data are illustrative.</sub>
</p>

## Why GEMsMAP?

Asking a GEM a question is easy with COBRApy; **reading the answer** is harder. Flux vectors are long tables,
identifiers differ between models, and the figures that communicate a result are usually redrawn by hand, outside
the analysis. GEMsMAP keeps these steps together: every result stays inspectable (which medium, objective, bounds
and solver produced it), and the identifiers COBRApy uses are carried onto the map, so results bind to the drawing
without manual matching.

## What it does

The application has three workspaces that share the same model and data, switched at the top left of the window.

### COBRAGUI: explore and simulate the model

The COBRA graphical user interface. Import SBML, COBRA JSON or MATLAB models; explore metabolites, reactions and
genes; set the medium, bounds and objective; run FBA, pFBA, loopless FBA or FVA; compare results and export them.
Metabolite identifiers can be curated against MetaNetX. [More about COBRAGUI](https://gemsmap.readthedocs.io/en/latest/cobra-gui/)

<p align="center">
  <img src="docs/assets/images/cobra-gui-compare.png" alt="COBRAGUI comparing two pFBA results of E. coli iML1515, aerobic and anaerobic: the configuration differences come first, then reactions classified as changed, activated from zero, direction reversal or inactivated to zero, with flux A, flux B, delta and log2 fold change." width="900">
  <br><sub>Comparing two pFBA results of <i>E. coli</i> iML1515, with and without oxygen: reactions are classified before any fold change is taken.</sub>
</p>

### Map Builder: turn results into pathway figures

Draw or insert pathways, bind them to the model, map fluxes to arrow width and colour, switch between conditions or
show their differences (Δ, log₂FC), add small linked plots, and export SVG, PNG, PDF or an animated GIF.
[More about the Map Builder](https://gemsmap.readthedocs.io/en/latest/maps/)

<p align="center">
  <img src="docs/assets/images/maps-iml1515-pfba.png" alt="The Map Builder with the global central carbon metabolism template drawn for E. coli iML1515 and coloured by a pFBA result: glycolysis, the oxidative pentose phosphate pathway and a circular TCA cycle, with arrow width and colour encoding flux, a legend, and the template gallery on the left." width="900">
  <br><sub>The central carbon metabolism template drawn for <i>E. coli</i> iML1515, with arrow width and colour taken from a pFBA result.</sub>
</p>

### Templates: one pathway layout for any GEM

Reusable pathway layouts (central carbon metabolism, glycolysis, TCA cycle, pentose phosphate pathway, …) that
describe biological identity rather than model IDs. A matcher finds what each molecule is called in your GEM and
asks you to review uncertain cases. [More about templates](https://gemsmap.readthedocs.io/en/latest/templates/)

<p align="center">
  <img src="docs/assets/images/templates-design-mode.png" alt="The Templates workspace in Template Design Mode showing the TCA cycle template: each node is a biological identity, marked with a green check when confirmed, and the side panels show completeness (19 of 19 metabolites and 8 of 8 reactions identified) and the template metadata." width="900">
  <br><sub>The TCA cycle template in the template editor: every node is a confirmed biological identity, not a model ID.</sub>
</p>

## Install

> **GEMsMAP 0.3 is in beta.** It works, but features and file formats can still change before the first stable
> release. Save your work as `.gemsmap` project files, and please [report problems](https://github.com/BatistaB/gemsmap/issues).

With Python 3.10 or newer, on Windows, macOS or Linux:

```bash
pip install gemsmap
gemsmap
```

`gemsmap` starts GEMsMAP and opens it in your browser at http://127.0.0.1:8765; keep the window open while you work.
Other ways, without Python:

- [uv](https://docs.astral.sh/uv/): `uvx gemsmap`.
- **Zip:** download `GEMsMAP-<version>.zip` from [Releases](https://github.com/BatistaB/gemsmap/releases), extract it and
  double-click *Start GEMsMAP* (Windows `.bat`, macOS `.command`; Linux: `bash start-gemsmap-linux.sh`). The first
  start prepares Python and GEMsMAP inside that folder; `README-FIRST.txt` explains the rest.

**New to Python environments?** Install GEMsMAP in an environment of its own, so its libraries cannot interfere
with other projects. The [step-by-step guide](https://gemsmap.readthedocs.io/en/latest/getting-started/installation/#step-by-step-install-with-pip) shows how on Windows, macOS and
Linux: create a folder, create the environment, activate it, update pip, install and start.
Requirements and troubleshooting: [Installation guide](https://gemsmap.readthedocs.io/en/latest/getting-started/installation/).

## Quick start

1. Start GEMsMAP with `gemsmap`. It opens in **COBRAGUI**.
2. Drop a model file (SBML, COBRA JSON or MATLAB `.mat`) on the window, or pick one of the example models
   bundled with COBRApy.
3. Adjust the medium, bounds or objective if needed, then run **pFBA** (FBA, loopless FBA and FVA are also
   available). Change a condition, run again, and open **Compare** to see what moved.
4. Click **Visualize comparison** to send the result to the **Map Builder**, insert a pathway template, and export
   the figure.

To see a finished map first, choose **File → Open example** for the central carbon demo shown above.
The [quick-start tutorial](https://gemsmap.readthedocs.io/en/latest/tutorials/quick-start/) walks through all of this with *E. coli* iJO1366 in
about 45 minutes.

## Scientific principles

GEMsMAP aims to make results easy to read without changing what they mean:

- **All flux computations run in COBRApy**, in Python on your computer; the browser never computes fluxes.
- **A failed solve never shows fluxes.** Every analysis reports its solver status; a non-optimal result lists what
  to check (medium, objective, modified bounds, forced fluxes) instead of showing zeros.
- **pFBA reports the biological objective value**; the minimized total flux is kept separately.
  **FVA returns intervals only**; midpoints are never treated as a flux distribution.
- **Every result records its provenance**: model checksum, model state, objective, medium, modified bounds,
  parameters, solver, status and time. The imported model file is never modified.
- **Comparisons classify before they divide**: reactions activated from zero, inactivated to zero or reversing
  direction never get a fold change.
- **Uncertain template matches wait for you**: an unresolved pathway slot is better than a wrong one.

What these analyses can and cannot tell you is described in [Limitations](https://gemsmap.readthedocs.io/en/latest/reference/limitations/).

## Documentation

The user guide is published at **<https://gemsmap.readthedocs.io/>**:

| | |
|---|---|
| [Getting started](https://gemsmap.readthedocs.io/en/latest/getting-started/) | Overview, [installation](https://gemsmap.readthedocs.io/en/latest/getting-started/installation/), [first look](https://gemsmap.readthedocs.io/en/latest/getting-started/first-look/) |
| [COBRAGUI](https://gemsmap.readthedocs.io/en/latest/cobra-gui/) | Importing, exploring and editing models; [constraint-based analysis](https://gemsmap.readthedocs.io/en/latest/cobra-gui/constraint-based-analysis/); results and comparison |
| [Maps](https://gemsmap.readthedocs.io/en/latest/maps/) | Drawing pathways, linking them to a model, displaying results, exporting figures |
| [Templates](https://gemsmap.readthedocs.io/en/latest/templates/) | The template library, identity matching, creating and sharing templates |
| [Reference](https://gemsmap.readthedocs.io/en/latest/reference/) | [Glossary](https://gemsmap.readthedocs.io/en/latest/reference/glossary/), [FAQ](https://gemsmap.readthedocs.io/en/latest/reference/faq/), [troubleshooting](https://gemsmap.readthedocs.io/en/latest/reference/troubleshooting/), [limitations](https://gemsmap.readthedocs.io/en/latest/reference/limitations/), [roadmap](https://gemsmap.readthedocs.io/en/latest/reference/roadmap/) |

## Project status

GEMsMAP 0.3 is a beta. Model import and editing, FBA, pFBA, loopless FBA and FVA, result comparison, the Map
Builder and template matching are implemented. Solver selection, flux sampling and gene knockouts are planned; see
the [roadmap](https://gemsmap.readthedocs.io/en/latest/reference/roadmap/). Changes between versions are listed in [CHANGELOG.md](CHANGELOG.md).

Projects from version 0.2 and earlier, when the application was called *MetMap*, still open: `.metmap` projects,
`*.metmap-template.json` templates and the browser storage of that version are carried over.

## Getting help

To report a problem, click **GEMsMAP &lt;version&gt;** in the COBRAGUI status bar, then *Copy diagnostics*, and
paste it into a [new issue](https://github.com/BatistaB/gemsmap/issues/new/choose) (or run `gemsmap diagnose`).
Feature requests are welcome in the same place.

## Contributing

To run GEMsMAP from source (Node.js 18+ and Python 3.10+):

```bash
npm install
npm run backend:setup   # once: creates backend/.venv with COBRApy, FastAPI, uvicorn
npm run backend         # COBRApy backend on http://127.0.0.1:8765 (keep it running)
npm run dev             # interface on http://localhost:5173 (forwards /api to the backend)
```

- [CONTRIBUTING.md](CONTRIBUTING.md): development workflow, tests, commit conventions and releases.
- [Architecture](docs/ARCHITECTURE.md): how the code is organised (interface, COBRApy backend, templates).
- [Contributing to the docs](docs/CONTRIBUTING.md): building and previewing the documentation site.

## How to cite

Please cite the version of GEMsMAP you used; GitHub's *Cite this repository* button gives the reference from
[CITATION.cff](CITATION.cff). Each version will get its own DOI on Zenodo, and an article describing GEMsMAP is in
preparation. Both will be listed on the [How to cite](https://gemsmap.readthedocs.io/en/latest/reference/how-to-cite/)
page, together with the tools to cite alongside GEMsMAP.

## License and acknowledgements

GEMsMAP is released under the [MIT License](LICENSE).

All simulations run in [COBRApy](https://opencobra.github.io/cobrapy/) (Ebrahim *et al.*, 2013, *BMC Systems
Biology* 7:74). Identifier curation uses [MetaNetX/MNXref](https://www.metanetx.org) and, when installed locally,
the universal tables of [BiGG Models](https://bigg.bio). GEMsMAP is an independent project and is not maintained
or endorsed by the COBRApy, BiGG, MetaNetX or KEGG teams.

The logo is a gem cut from a metabolic network, coloured like a flux map ([brand guide](docs/brand/README.md)).
How the project started: [the story of GEMsMAP](https://gemsmap.readthedocs.io/en/latest/history/).
