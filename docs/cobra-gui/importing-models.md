# Importing models

## Supported formats

| Format | Extensions | Read with |
| --- | --- | --- |
| SBML (with the FBC package for bounds, objective and gene associations) | `.xml`, `.sbml` | `cobra.io.validate_sbml_model`, which also reports SBML validation messages |
| COBRA JSON (COBRApy, BiGG, Escher-compatible models) | `.json` | `cobra.io.load_json_model` |
| MATLAB COBRA Toolbox structure | `.mat` | `cobra.io.load_matlab_model` |

The format is recognised from the extension, or from the first bytes of the file when the extension is missing.

## How to import

- **Drop the file** anywhere on the COBRAGUI window, or
- click **Import model** on the start screen (or *File → Import GEM into COBRAGUI*), or
- open one of the **examples bundled with COBRApy**: *E. coli* core (`textbook`, 95 reactions) or *E. coli* iJO1366 (2,583 reactions, with subsystems). These need no download.

COBRApy reads the file in the backend; for a genome-scale SBML model this takes some seconds (importing iML1515 as COBRA JSON took about 12–20 s on the computer used for these pages). The backend then keeps a fast JSON copy in its cache, so reloading the same model later, for example after restarting the backend, is quicker. Importing the very same file again is recognised by its SHA-256 checksum and reuses the loaded model.

!!! tip "Models downloaded from BiGG"
    Models exported by the new BiGG site (bigg.bio, files such as `iML1515.biggr.sbml` or `*.biggr.json`) prefix model-specific identifiers with `__<model id>__` and carry few annotations. GEMsMAP removes the prefixes on import, and COBRAGUI completes the annotations from the local BiGG tables when they are [installed](../getting-started/installation.md#optional-bigg-tables-for-templates). These exports may also lack subsystems: the bigg.bio export of iML1515 has none, while the classic BiGG JSON used in these pages has a subsystem for every reaction (see [About the examples](../reference/examples.md)).

## The overview: what the model contains

After the import the **Overview** shows the model card (name, file, format, checksum, size, objective, solver, active state) and two panels.

**Model statistics** classify the reactions:

| Class | Definition |
| --- | --- |
| Exchange, Demand, Sink | Boundary reactions, as defined by COBRApy (`model.exchanges`, `model.demands`, `model.sinks`) |
| Transport | Non-boundary reactions whose metabolites lie in more than one compartment |
| Internal | All other reactions |
| Reversible / Irreversible | From the bounds (`lower < 0 < upper` is reversible) |
| Blocked by bounds | `lower = upper = 0` |

Each line opens the Explorer filtered to those reactions. After a simulation, the panel also counts active and zero-flux reactions.

**Import & validation** lists non-blocking quality notes. Each one expands to the IDs involved and can open them in the Explorer:

| Note | What is checked |
| --- | --- |
| No objective | The file defines no objective; FBA-based methods need one. |
| Disconnected metabolites | Metabolites not used by any reaction. |
| Dead-end metabolites | Metabolites that, with the current bounds, can only be produced or only be consumed. This is a quick structural check, not a full gap analysis. |
| No gene association | Non-boundary reactions without a gene–reaction rule. |
| Blocked by bounds | Reactions with `lower = upper = 0`. |
| No formula | Metabolites without a chemical formula. |
| Elementally unbalanced | Reactions whose element balance is not zero. Boundary and objective (biomass) reactions are excluded, and reactions with a metabolite lacking a formula are skipped. Charge is not part of this check. |
| SBML messages | Errors reported by the SBML validator; the raw COBRApy reader messages are also available. |

For iML1515 the overview reports 128 dead-end metabolites, 109 non-boundary reactions without gene association, 1 reaction blocked by its bounds and 2 elementally unbalanced reactions. None of these prevents a simulation; they are pointers for curation.

## Importing results instead of models

COBRAGUI also accepts **result files**: result JSON exported by GEMsMAP (or the earlier GEM Explorer), and CSV/TSV flux or FVA tables, for example runs made with other tools. Drop them on the window or use *Results → Import*. They are matched to the loaded model by reaction ID; the result records its source file and how many IDs matched. See [Results, comparison and export](results-and-export.md#importing-results).

## Importing a model into the Map Builder only

*File → Import GEM into the map only* reads a COBRA JSON or SBML model directly in the browser, without the backend. That is enough to draw and bind maps, but not to simulate. Models imported in COBRAGUI reach the Map Builder automatically when you add something to the map.

<div class="gm-next" markdown>
**Next:** [Explore the model](exploring-models.md).
</div>
