# GEMs MAP

**An Interactive Workbench for Genome-Scale Metabolic Models.**

> **Beta.** GEMs MAP 0.3 is in beta testing. It works, but features, file formats and the interface can still
> change before the first stable release. Save your work as `.gemsmap` project files and report problems.

GEMs MAP connects constraint-based computation, model exploration and editable metabolic maps in one application:

- **COBRAGUI**: a graphical front end to [COBRApy](https://opencobra.github.io/cobrapy/). Import SBML, COBRA JSON
  or MATLAB models; set the medium, bounds and objective; run FBA, pFBA, loopless FBA or FVA; inspect, compare and
  export the results.
- **Map Builder**: a canvas for publication-quality pathway figures. Draw or insert pathways, bind them to the
  model, map fluxes to arrow width and colour, compare conditions, export SVG, PNG, PDF or GIF.
- **Templates**: reusable pathway layouts that describe biological identity, not model IDs, matched to any GEM
  with a review of uncertain cases.

## Install and start

Python 3.10 or newer, on Windows, macOS or Linux:

```
pip install gemsmap
gemsmap
```

`gemsmap` starts the application and opens it in your browser at <http://127.0.0.1:8765>. Keep the window open
while you work; press Ctrl+C to stop. Everything runs on your computer: your models are not uploaded anywhere.

Without Python, install [uv](https://docs.astral.sh/uv/) and run `uvx gemsmap`.

Other commands: `gemsmap diagnose` (versions and folders, for bug reports), `gemsmap bigg-data` (optional BiGG
tables for the Template Builder), `gemsmap --help`.

No Python at all? Each [release on GitHub](https://github.com/BatistaB/gemsmap/releases) also has a
`GEMsMAP-<version>.zip`: extract it and double-click *Start GEMs MAP*; the first start prepares everything inside
that folder.

## Feedback

Source code, releases and the issue tracker: <https://github.com/BatistaB/gemsmap>. To report a problem, click
**GEMs MAP <version>** in the COBRAGUI status bar, then *Copy diagnostics*, and paste it into a
[new issue](https://github.com/BatistaB/gemsmap/issues).

## License

MIT. GEMs MAP is an independent project and is not maintained or endorsed by the COBRApy, BiGG, MetaNetX or KEGG
teams.
