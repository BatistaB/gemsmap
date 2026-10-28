# About the examples

The screenshots and numbers in this documentation come from real runs of GEMsMAP, captured automatically from the running application. Nothing is mocked or edited, except that transient notifications are hidden and numbered callouts are added to some images. This page records what was used, so that every value can be reproduced and checked.

## The model: *E. coli* iML1515

| | |
| --- | --- |
| Organism | *Escherichia coli* str. K-12 substr. MG1655 |
| Model | iML1515 (Monk *et al.*, 2017), from [BiGG Models](https://bigg.bio/models/iML1515) |
| File | `iML1515.json`, the classic BiGG COBRA JSON export (`http://bigg.ucsd.edu/static/models/iML1515.json`; BiGG lists it as last updated 31 Oct 2019) |
| SHA-256 | `b0f9199f048779bb08a14dfa6c09ec56d35b8750d2f99681980d0f098355fbf5` |
| Size in GEMsMAP | 2,712 reactions · 1,877 metabolites · 1,516 genes · 3 compartments · 40 subsystems |
| Objective | maximise `BIOMASS_Ec_iML1515_core_75p37M` (from the file) |
| Medium | from the file: 24 compounds may be taken up; D-glucose ≤ 10 mmol gDW⁻¹ h⁻¹; O₂ and the other compounds ≤ 1000 |

iML1515 is a published model by its authors; it is used here only as a well-known, openly available example.

!!! note "Which iML1515 file?"
    The new BiGG site also offers `iML1515.biggr.sbml` / `*.biggr.json` exports. These carry fewer annotations and **no subsystems**, so the *Subsystems* views would be empty. The classic JSON used here has a subsystem on every reaction.

## Software

| | |
| --- | --- |
| GEMsMAP | development version of 12 October 2026, just before 0.3.0b1 (the manifests record the build) |
| COBRApy | 0.32.1 |
| Solver | GLPK (COBRApy's default in the backend environment) |
| Browser | Microsoft Edge (Chromium), headless, 1600 × 900 px at 1.5× |
| Date | 10 October 2026, recaptured on 12 October 2026 |

The complete record of every capture, including the text the application displayed for the key values, is in `docs/assets/images/capture-manifest.json`. The capture script is `tools/docs/capture_screenshots.py` (see [Contributing to the docs](../CONTRIBUTING.md)).

## Values shown in the pages

| Run | Configuration | Displayed result |
| --- | --- | --- |
| pFBA, aerobic | Base model (file medium and bounds), fraction of optimum 1 | Optimal; objective 0.876997 h⁻¹; Σ\|flux\| 769.79; 431 of 2,712 reactions active |
| pFBA, anaerobic | State *Anaerobic* = Base model with *Anaerobic* medium preset (`EX_o2_e` uptake 1000 → 0) | Optimal; objective 0.15754 h⁻¹; Σ\|flux\| 414.634; 433 reactions active |
| Comparison | A = aerobic pFBA, B = anaerobic pFBA, zero threshold 10⁻⁹, no pseudocount | 392 changed, 24 activated from zero, 22 inactivated to zero, 13 direction reversals, 4 unchanged |
| FVA | 14 reactions of subsystem *Citric Acid Cycle*, fraction of optimum 1, Base model | Optimal; objective 0.876997 |
| Pyruvate (`pyr_c`) | aerobic pFBA | turnover 12.4614 mmol gDW⁻¹ h⁻¹; 70 reactions, 16 with flux |
| Acetyl-CoA (`accoa_c`) | aerobic → anaerobic | turnover 10.296 → 18.262 mmol gDW⁻¹ h⁻¹ |
| Template | *Global central carbon metabolism* on iML1515, before MetaNetX curation | 25 mapped, 1 to review (D-ribose 5-phosphate → `r5p_c`, Medium), 0 open |
| Metabolite analysis | MetaNetX + local BiGG tables, default options | 1,577 confident and curated (+4,645 cross-references), 300 to review, 0 unmapped |

!!! warning "Reproducibility of individual fluxes"
    Objective values are reproducible. Individual fluxes of FBA and pFBA solutions, and the counts derived from them, can differ between runs because of alternative optima. Two captures of the same comparison gave 391 and 392 *changed* reactions. Treat the per-reaction numbers as one valid solution.

## The tutorial model: *E. coli* iJO1366

The [quick start tutorial](../tutorials/quick-start.md) uses **iJO1366** (Orth *et al.*, 2011), the predecessor of iML1515, from the classic BiGG export `http://bigg.ucsd.edu/static/models/iJO1366.json` (SHA-256 `9376a93f62ad430719f23e612154dd94c67e0d7c9545ed9d17a4d0c347672313`): 2,583 reactions, 1,805 metabolites, 1,367 genes, 39 subsystems. With the medium of the file, pFBA gives 0.982372 h⁻¹ with oxygen and 0.241502 h⁻¹ with the oxygen uptake set to 0. All values displayed during the tutorial capture are in `docs/assets/images/tutorials/quickstart-manifest.json`.

## Reference

Orth JD, Conrad TM, Na J, Lerman JA, Nam H, Feist AM, Palsson BØ (2011). A comprehensive genome-scale reconstruction of *Escherichia coli* metabolism—2011. *Molecular Systems Biology* 7:535. [doi:10.1038/msb.2011.65](https://doi.org/10.1038/msb.2011.65)

Monk JM, Lloyd CJ, Brunk E, *et al.* (2017). iML1515, a knowledgebase that computes *Escherichia coli* traits. *Nature Biotechnology* 35:904–908. [doi:10.1038/nbt.3956](https://doi.org/10.1038/nbt.3956)

King ZA, Lu J, Dräger A, *et al.* (2016). BiGG Models: a platform for integrating, standardizing and sharing genome-scale models. *Nucleic Acids Research* 44:D515–D522. [doi:10.1093/nar/gkv1049](https://doi.org/10.1093/nar/gkv1049)
