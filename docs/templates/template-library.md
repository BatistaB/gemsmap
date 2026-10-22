# Template library

The **Templates** workspace opens on the **Template Library**: every template GEMs MAP knows, built-in and your own, grouped by section.

<figure class="gm-shot" markdown>
[![The Template Library: a search box, Import template and New template buttons, a BiGG data notice, the GEM currently in the Map Builder, and two sections of template cards — Central carbon (Global central carbon metabolism, Glycolysis, TCA cycle, Pentose phosphate (oxidative), Amino acid biosynthesis overview) and KEGG-derived templates (map00010, map00020, map00030, map00250) — each with a preview, description, size, scope, completeness, author and version, and buttons Open, Duplicate, Export and Apply to GEM.](../assets/images/templates-library.png)](../assets/images/templates-library.png)
<figcaption>The Template Library. AI-generated templates carry an orange "needs review" label until a person reviews them.</figcaption>
</figure>

Each card shows a preview, the pathway, the number of **drawn** metabolites and reactions (side compounds such as ATP are not counted), the organism scope, **completeness**, the author and the template version. *Open* shows it in Template Design Mode; *Duplicate* makes your own editable copy; *Export* writes the file; *Apply to GEM* maps it onto the model in the Map Builder; *Delete* removes your own templates. A banner tells whether the [BiGG tables](../getting-started/installation.md#optional-bigg-tables-for-templates) are installed and which GEM is currently in the Map Builder. Drop a `.gemsmap-template.json` file on the window to import it.

## Built-in templates

### Central carbon

These four were drawn and curated by hand. Their identities are confirmed in the GEMs MAP library, and their equations are complete (cofactors included) and checked for heavy-atom balance, with KEGG reaction IDs checked against the KEGG equations.

| Template | Drawn | Reactions | Compartments | Notes |
| --- | --- | --- | --- | --- |
| **Glycolysis** | glucose → G6P → F6P → FBP → DHAP / GAP → 1,3-BPG → 3PG → 2PG → PEP → pyruvate, plus lactate and acetyl-CoA | HEX, PGI, PFK, FBA, TPI, GAPD, PGK, PGM, ENO, PYK, LDH (optional branch), PDH | Cytosol; acetyl-CoA in the mitochondrion (cytosol as fallback) | Drawn vertically. Links to the PPP (from G6P) and to the TCA cycle (from acetyl-CoA). |
| **TCA cycle** | acetyl-CoA, citrate, isocitrate, 2-oxoglutarate, succinyl-CoA, succinate, fumarate, L-malate, oxaloacetate | CS, ACONT, ICDH, AKGDH, SUCOAS, SDH, FUM, MDH | Mitochondrion, with the cytosol as fallback | Drawn as a circle. |
| **Pentose phosphate (oxidative)** | G6P, 6-phosphogluconolactone, 6-phosphogluconate, ribulose 5-P, ribose 5-P, xylulose 5-P | G6PDH, PGL, GND, RPI, RPE | Cytosol | Oxidative branch only. |
| **Global central carbon metabolism** | The three above, composed (26 drawn metabolites) | 25 | Cytosol + mitochondrion | Used in the examples of these pages. |

**Compartments are expectations, not requirements.** The TCA cycle prefers the mitochondrion, because it is mitochondrial in eukaryotes. In a model without mitochondria, such as the bacterium *E. coli*, the matcher falls back to the cytosol and says so in the review dialog. A template is therefore *adapted* to each model; it is not assumed to be universally correct. A eukaryotic model with a cytosolic acetyl-CoA pool, or a bacterium with an incomplete TCA cycle, will show open or low-confidence slots that need a person to decide.

**How they map.** On iML1515 the global template maps 25 of its 26 slots with high confidence and one with medium confidence: D-ribose 5-phosphate, which iML1515 names as the α-anomer (see [Identity and matching](identity-and-matching.md#a-worked-example-ribose-5-phosphate-in-iml1515)). Coverage on iML1515 is 25/25 core metabolites and 23/23 core reactions. The automated tests map the built-ins on *E. coli* core, iJO1366, a ModelSEED-namespace copy and an annotation-free copy of *E. coli* core, and check that the results do not change.

### Amino acid biosynthesis (overview) and KEGG-derived templates

| Template | Section | Reference | Drawn |
| --- | --- | --- | --- |
| Amino acid biosynthesis (overview) | Central carbon | KEGG map01230 | 32 metabolites, 31 arrows, 20 of them pathway summaries |
| Glycolysis / Gluconeogenesis | KEGG-derived templates | KEGG map00010 | 23 metabolites, 31 reactions |
| Citrate cycle (TCA cycle) | KEGG-derived templates | KEGG map00020 | 12 metabolites, 13 reactions |
| Pentose phosphate pathway | KEGG-derived templates | KEGG map00030 | 31 metabolites, 34 reactions |
| Alanine, aspartate and glutamate metabolism | KEGG-derived templates | KEGG map00250 | 27 metabolites, 36 reactions |

<span class="gm-badge experimental">AI-generated — needs review</span> These templates were drafted **with an LLM (Claude Opus 5.5), outside the application**, with a reproducible pipeline (see [Templates drafted with an LLM](ai-assisted-templates.md)), and remain marked *AI-generated — needs review* until a person reviews them. KEGG is used as the biological and topological reference only; every drawing is GEMs MAP's own and is **not an official KEGG map**. Every KEGG compound and reaction of each map is drawn, folded (anomers, lumped complexes, cofactor variants) or omitted with a written reason. Per-map generation reports, identity and reaction tables, layout QC and previews are in the repository under `docs/templates/kegg/<map>/`, for example the [map00010 report](kegg/map00010/report.md).

<div class="gm-next" markdown>
**Next:** how a template finds its way into a model: [Identity and matching](identity-and-matching.md).
</div>
