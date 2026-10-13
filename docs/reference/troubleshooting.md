# Troubleshooting

## Installation and start

`gemsmap diagnose` prints the versions, the solvers and the data folder; paste its output into any [report](https://github.com/BatistaB/gemsmap/issues/new/choose).

- **`gemsmap` is not recognized / command not found.** The folder where pip puts commands is not on your PATH, or the environment where you installed GEMs MAP is not active. Run `python -m gemsmap` instead, or activate the environment first.
- **`pip` says *externally-managed-environment*** (Ubuntu, Debian and other Linux systems), or **`python -m venv` says *ensurepip is not available***. The system Python does not allow installing packages for everyone. Use [uv](../getting-started/installation.md#install) (`uv tool install gemsmap`), or install the venv module (`sudo apt install python3-venv`) and use a virtual environment.
- **pip finds no matching version, or says it *requires a different Python***. GEMs MAP needs Python 3.10 or newer. Use a newer Python, or uv, which brings its own.
- **Port 8765 is in use.** Another program, or another GEMs MAP, uses it. If it is GEMs MAP, `gemsmap` just opens the browser on it. Otherwise start on another port: `gemsmap --port 8766` (the Map Builder autosave belongs to the address, so prefer one port).
- **The page does not open by itself.** Open http://127.0.0.1:8765 in your browser; `gemsmap --no-browser` never opens it.
- **Zip on Windows: *the path of this folder is too long***. Move the extracted folder somewhere short, such as `C:\GEMsMAP`, and start again.
- **Zip on Windows: *Windows protected your PC***. Click *More info*, then *Run anyway*.
- **Zip on macOS: the *.command* file cannot be opened.** macOS blocks files downloaded from the internet the first time: right-click it, choose *Open*, then *Open*.
- **Zip: the first start stopped half-way** (no internet, the computer went to sleep). Start again; it resumes. If it keeps failing, delete the `runtime` folder inside the extracted folder and start again.

## COBRAGUI says "Backend offline"

The status bar shows *Backend offline — retry* instead of the COBRApy version, and the start screen shows *COBRApy backend is not running*. The backend stops when the window where `gemsmap` runs is closed.

1. Start GEMs MAP again (`gemsmap`, or *Start GEMs MAP* in the zip folder) and keep its window open.
2. Click *Retry connection*.

In a development checkout, the backend is `npm run backend` (the first time, `npm run backend:setup` creates its environment). If it warns that `backend/.venv` was not found, it falls back to the system Python, which usually lacks COBRApy: run `npm run backend:setup`. If the backend runs on another port, start the interface with `VITE_COBRA_API` pointing to it (see [Installation](../getting-started/installation.md#configuration)).

## A model does not import

- **"Unsupported model format"**: use `.xml`/`.sbml`, `.json` or `.mat`. The format is detected from the extension or the first bytes.
- **"SBML model could not be read"**: the SBML validator found a fatal error; the error card shows the first message. Check the file with another tool, or export it again from its source.
- **A very large SBML file is slow**: the first import parses the SBML; later imports of the same file use the cached JSON copy.
- **IDs look like `__iML1515__…`**: a BiGG export; GEMs MAP removes these prefixes on import. If they remain, two entries would collide after removal and the IDs are kept as they are.

## A simulation returns "Infeasible"

No flux distribution satisfies the constraints, so no fluxes are shown (they do not exist). The error card lists what to check, with buttons:

- **Medium**: is an essential substrate (carbon, nitrogen, phosphate, sulfur, oxygen if required) available?
- **Objective**: can the objective reaction carry flux?
- **Modified bounds**: the *Modified bounds* view lists every change of the state; *Revert* in the *Modified* menu restores the model file.
- **Forced fluxes**: reactions with a lower bound above zero (for example ATP maintenance) must carry flux and may be impossible to satisfy.

## A simulation returns "Unbounded"

The objective can grow without limit: a reaction on its path, or an uptake, has an infinite bound. Set finite bounds (for example the uptake of the carbon source).

## FVA takes very long

A full FVA solves two linear programs per reaction (5,424 for iML1515). Run it on a selection (*FVA on selection* in the Explorer, or *FVA on subsystem*), raise *Processes* in the advanced options, or stop it with *Stop & keep* to save the intervals computed so far. Loopless FVA is much slower.

## The metabolite analysis does not start or stays empty

It needs the backend and, for the first analysis of a model, access to `rdf.metanetx.org`. Behind a proxy or offline, only cached answers and the local BiGG tables (if installed) are used. Repeated analyses are fast because answers are cached for 90 days.

## Data imported into the Map Builder do not show

- Check *Data → n % matched*. A low value means the file's IDs do not match the map's model; the import report lists the unmatched IDs and lets you map them by hand.
- Arrows must be **bound** to model reactions to receive data. Unbound arrows say so in the inspector.
- A mapping must be enabled and its dataset visible (eye icon).
- FVA intervals are drawn only with *range* plots, not as arrow widths.

## The map looks different after switching condition

It should not rescale: domains are computed over all conditions. If a mapping has a manual *min*/*max* domain, values outside it are clipped. Check the mapping's scale settings.

## The PDF export opens a print dialog

That is how the PDF is made: choose *Save as PDF* as the printer. For a vector file without the print dialog, export SVG.

## The template identity search finds only the GEMs MAP library

The online search (KEGG, ChEBI via MetaNetX) needs the backend; BiGG candidates need the [BiGG tables](../getting-started/installation.md#optional-bigg-tables-for-templates). Without them, the search says it is offline.

## Something else

The **Activity log** (COBRAGUI status bar) lists imports, runs, exports and errors with times. Error cards have *Show details* with the technical message.
