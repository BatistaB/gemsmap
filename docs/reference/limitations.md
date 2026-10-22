# Limitations

GEMs MAP makes constraint-based results easier to produce, inspect and draw. It does not make them more true than the model and constraints behind them. This page collects the main limitations, scientific and technical.

## Scientific

- **Optimal solutions are rarely unique.** FBA and pFBA return one flux distribution among possibly many with the same objective value, and repeated solves can return different ones (an example is described in [Metabolite analysis](../cobra-gui/metabolite-analysis.md#worked-example-pyruvate-in-iml1515)). Conclusions about individual fluxes need FVA, or sampling done elsewhere.
- **Fluxes are predictions under assumptions**: steady state, the chosen objective, the medium and the bounds. They are not measurements, and a map drawn from them shows a model's answer, not the cell's state.
- **FVA intervals are independent.** They are not a joint distribution; their midpoints are not a solution.
- **Metabolite turnover** is a derived proxy from one flux vector. It is not a concentration, and constraint-based models contain no concentrations.
- **Comparisons are descriptive.** Fold changes, Δ, and the turnover explanation decompose differences between two solutions; they do not establish cause.
- **Structure is not activity.** Template coverage, graph degree and connectivity describe the model's structure, not whether reactions carry flux or are essential.
- **Identity matching is heuristic.** Scores rank candidates and are not probabilities. A match is only as good as the model's identifiers and annotations; review provisional and open slots before publishing a figure.
- **Model quality is inherited.** Validation notes (dead ends, unbalanced reactions, missing gene associations) are pointers, not a full quality assessment.

## Not implemented

- Choosing the solver from the interface (COBRApy's default is used and recorded).
- Flux sampling, gene and reaction deletion analyses, dynamic, kinetic or thermodynamic analyses other than loopless FBA/FVA.
- A community template hub; importing Escher maps as templates.

No AI is built into the application, by design: templates can be drafted with the LLM of your choice outside GEMs MAP and reviewed in the Template Builder (see [Templates drafted with an LLM](../templates/ai-assisted-templates.md)).

See the [Roadmap](roadmap.md).

## Technical

- **Local, single-user application.** The backend listens on `127.0.0.1` only and has no user accounts; it is not designed to be exposed on a network.
- **Browser storage.** COBRAGUI sessions, your templates and the Map Builder autosave live in one browser profile. Clearing site data removes them; save projects and export results to keep them.
- **One solve at a time.** All COBRApy work runs on one worker thread, because GLPK cannot be used from several threads at once. A single FBA, pFBA or loopless solve cannot be interrupted; a cancelled one finishes in the background and is discarded.
- **Large maps.** The canvas is SVG; maps with thousands of elements stay usable but slower. WebGL rendering for very large maps is planned.
- **PDF export** goes through the browser's print dialog.
- **Online identifier services.** The first metabolite analysis and online identity searches depend on MetaNetX, KEGG and ChEBI being reachable; answers are then cached.
- **Platforms.** Developed and tested on Windows 11; automated tests and builds also run on Ubuntu. Other systems are expected to work but are not routinely tested.
