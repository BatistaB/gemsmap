# FAQ

**Do I need to know Python?**
:   No. Every analysis in COBRAGUI runs through the interface. COBRApy does the work in the background, and results can be exported as JSON or CSV for your own scripts.

**Is my model uploaded anywhere?**
:   No. The backend runs on your computer (`127.0.0.1`) and keeps a copy of imported files in a local cache. Network access is used only for identifier lookups (MetaNetX, KEGG, ChEBI) and for the one-time download of the BiGG tables. See [Overview](../getting-started/index.md#where-things-run).

**Which model formats are supported?**
:   SBML (with FBC), COBRA JSON and MATLAB `.mat` in COBRAGUI; COBRA JSON and SBML in the Map Builder alone. See [Importing models](../cobra-gui/importing-models.md).

**Why does FBA give a different flux distribution than another tool, or than last time?**
:   Most models have many optimal flux distributions. FBA and even pFBA return one of them, and which one can depend on the solver and its state. The optimal objective value is reproducible; individual fluxes may not be. Use FVA to see how much a flux can vary at the optimum. This happened while these pages were being prepared: see the warning in [Metabolite analysis](../cobra-gui/metabolite-analysis.md#worked-example-pyruvate-in-iml1515).

**Why is the pFBA "objective" not the minimised total flux?**
:   GEMsMAP reports the biological objective (for example growth) as the objective value, and the minimised Σ|flux| separately as *Total flux (pFBA)*. See [pFBA](../cobra-gui/constraint-based-analysis.md#pfba-parsimonious-fba).

**Can I choose the solver?**
:   Not yet. GEMsMAP uses COBRApy's default solver in the backend environment (GLPK in a standard installation) and records it in every result. Solver selection is on the [Roadmap](roadmap.md).

**Can I run flux sampling or gene knockouts?**
:   Flux sampling, yes: choose *Flux sampling* in COBRAGUI's Simulation section (COBRApy's OptGP or ACHR samplers; see [Flux sampling](../cobra-gui/constraint-based-analysis.md#flux-sampling)); the distributions open in Results and go to the Map Builder as density or box plots. Gene knockouts are [planned](roadmap.md): to explore one by hand, block the gene's reactions in a model state.

**My model has no *Subsystems* tab.**
:   The model has no subsystem annotations. The export of iML1515 from the new BiGG site (`iML1515.biggr.sbml`), for example, carries none, while the classic BiGG JSON has a subsystem for every reaction. See [About the examples](examples.md).

**The template coverage badge says 25/25. Does that mean the pathway is active?**
:   No. Coverage says how much of the template exists in the model's structure. Whether it carries flux depends on a simulation.

**Why is a template slot left open instead of matched?**
:   Because the evidence was insufficient or contradictory, for example two equally plausible anomers. GEMsMAP prefers an open slot to a wrong one; you decide in the review dialog. See [Identity and matching](../templates/identity-and-matching.md#statuses-after-matching).

**Can the same metabolite appear several times on a map?**
:   Yes. Repeated drawings, typical for cofactors, are visual copies of one model metabolite and always show the same data. See [Maps](../maps/index.md#design-principles).

**Where is my work saved?**
:   COBRAGUI sessions (states, results) and the Map Builder's autosave live in the browser; structural edits and curation in the backend cache. Save projects (`.gemsmap`) and export models and results to keep them safely. See [Saving and exporting](../maps/saving-and-exporting.md).

**Is GEMsMAP affiliated with COBRApy, BiGG, MetaNetX or KEGG?**
:   No. It uses their software or data and cites them; it is an independent project.

**How do I cite GEMsMAP, or this documentation?**
:   Cite the software version you used and, once it is published, the article that describes GEMsMAP. Each version will have its own DOI on Zenodo; the documentation is released with the software, so the version DOI covers it too. To point to one page, give its address and the date you read it. See [How to cite](how-to-cite.md), which also lists the tools to cite with it (COBRApy and, when used, MetaNetX, BiGG and KEGG).
