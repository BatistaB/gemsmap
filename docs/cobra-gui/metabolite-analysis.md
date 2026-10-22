# Metabolite analysis

A flux vector describes reactions. Many biological questions are about **metabolites**: where does the cell's pyruvate come from? What happens to acetyl-CoA when oxygen is removed? Answering that from a stoichiometric matrix with thousands of columns, or from a list of reaction IDs you would have to memorise, is slow and error-prone. GEMs MAP offers two complementary tools:

| Tool | Where | Question it answers |
| --- | --- | --- |
| **Metabolite inspector** | Click any metabolite (Explore, an equation, a search, the local network) | How does this metabolite participate in the network, and in the current flux solution? |
| **Turnover explanation** | Compare → *Metabolite turnover* → click a metabolite | Which reactions account for the change in a metabolite's turnover between two results? |
| **Metabolite analysis** section | Sidebar → *Metabolite analysis* | Which chemical is each model metabolite, and which database identifiers are missing from its annotation? |

The first two are about **flux**; the third is about **identity**. All three are described below.

## Reading one metabolite

<figure class="gm-shot gm-narrow" markdown>
![The inspector of pyruvate (pyr_c) in iML1515 after aerobic pFBA: formula C3H3O3, charge −1, compartment cytosol, turnover 12.4614 mmol gDW⁻¹ h⁻¹; eight producing reactions led by GLCptspp (10), eight consuming reactions led by PDH (9.68969), 54 reactions without flux, and a local network with producers on the left and consumers on the right.](../assets/images/cobra-gui-metabolite-inspector.png)
<figcaption markdown="span">Pyruvate (`pyr_c`) after pFBA on iML1515, aerobic glucose medium. The value next to each reaction is the reaction's flux; hover it to see its contribution to pyruvate (coefficient × flux).</figcaption>
</figure>

The metabolite inspector shows:

- **Formula, charge and compartment.** In a GEM, the same chemical in two compartments is two different metabolites: `pyr_c` (cytosol), `pyr_p` (periplasm) and `pyr_e` (extracellular) each have their own reactions.
- **Turnover**, a derived quantity explained [below](#turnover-what-it-is-and-what-it-is-not).
- **Producing** and **Consuming** reactions. With an active flux result, a reaction is listed as producing when the metabolite's coefficient times the flux is positive (\(S_{ij}\,v_j > 0\)), and as consuming when it is negative. This uses the **direction the reaction actually runs**, not the side of the equation it is written on. Reactions below the zero threshold are folded under *No flux*. Without a result, the lists show the reactions by the side of the written equation (*Produced by / Consumed by (as written)*), and ⇌ marks reversible reactions that could run either way.
- Lists are sorted by the size of the contribution; each reaction is a link, and right-clicking it offers the usual actions.
- A **local network** with producers on the left and consumers on the right (see [Exploring a model](exploring-models.md#the-local-network)).
- *Connected reactions* opens all reactions of the metabolite in the Explorer table, where they can be sorted, filtered, selected and added to a map.

### Worked example: pyruvate in iML1515

In the aerobic pFBA solution above, pyruvate takes part in 70 reactions. Only 16 carry flux: 8 produce and 8 consume it.

- The largest producer is the glucose phosphotransferase system `GLCptspp` (flux 10), which converts phosphoenolpyruvate to pyruvate while importing glucose. The classic pyruvate kinase reaction `PYK` is not among the producers in this solution; pyruvate-kinase reactions with other nucleotides (`PYK2` with UDP, `PYK3` with GDP) carry small fluxes.
- The largest consumer is pyruvate dehydrogenase `PDH` (9.68969), which feeds acetyl-CoA into the TCA cycle.
- `ALATA_L` (alanine transaminase) is listed as a **consumer with a negative flux**. It is written `akg + ala__L ⇌ glu__L + pyr` and runs backwards here, turning pyruvate into alanine. The list follows the direction of the flux, not the written equation.
- `ACLS` (acetolactate synthase) uses **two** pyruvate per reaction. Its flux is 0.766817; its contribution to pyruvate consumption is 2 × 0.766817.

Production and consumption balance, as steady state requires. The eight producing contributions add up to 12.4614 mmol gDW⁻¹ h⁻¹, and so do the consuming contributions, counting ACLS twice. That number is the turnover shown at the top.

!!! warning "One solution among many"
    pFBA picks one flux distribution among the optimal ones, and that choice is not always the same. While these pages were prepared, the same pFBA problem was solved twice. Growth (0.876997 h⁻¹), total flux and pyruvate turnover were identical, but in one run `DHAPT` carried 1.18705 and `PYK6` 0.0229 mmol gDW⁻¹ h⁻¹, while in the other `DHAPT` carried 1.21 and `PYK6` nothing. Parallel reactions are typical places where the choice is arbitrary. Run [FVA](constraint-based-analysis.md#fva-flux-variability-analysis) on the reactions of interest before drawing biological conclusions from which producer "wins".

## Connectivity is not flux

The inspector shows two different kinds of information side by side, and they answer different questions.

| | Connectivity (structure) | Flux (a solution) |
| --- | --- | --- |
| Source | The stoichiometric matrix: which reactions contain the metabolite | One result: which of those reactions carry flux, in which direction, how much |
| Changes with | Model edits | Medium, bounds, objective, method |
| Example for `pyr_c` | 70 reactions | 17 active reactions, turnover 12.46 |

Neither number is a property of the living cell:

- **Degree is not importance.** Many reactions per metabolite (high *degree*) is typical of cofactors and hubs such as ATP, NAD(H), H₂O or H⁺, which is why GEMs MAP hides them in the local network and on maps by default. A metabolite with few reactions can still be essential.
- **Turnover is not concentration.** Fluxes are rates; constraint-based models contain no concentrations at all.
- **Neither is essentiality.** Whether a metabolite or reaction is required for growth is a separate question; GEMs MAP does not test it (gene and reaction deletion analyses are [planned](../reference/roadmap.md)).

## Turnover: what it is and what it is not

For metabolite \(i\) and flux vector \(v\), GEMs MAP reports

\[
\text{turnover}_i = \tfrac{1}{2} \sum_j \left| S_{ij}\, v_j \right|
\]

in mmol gDW⁻¹ h⁻¹. At steady state the producing terms and the consuming terms have the same total, so the turnover equals the **total rate at which the metabolite is produced** (and consumed) in that solution. It is labelled a *derived proxy* in the interface:

- it is computed from **one flux vector**; for FVA results, which have no single flux vector, no turnover is computed and "—" is shown;
- it inherits the non-uniqueness of the flux solution;
- it says nothing about pool size or concentration.

Turnover is available in the Metabolites table (sort or *Hide zero turnover*), in *Results → Metabolites*, in comparisons, and on maps, where it can scale node size.

## Why did turnover change? Explaining a comparison

When two results are [compared](results-and-export.md#comparing-two-results), the *Metabolite turnover* tab lists the change for every metabolite. Clicking one opens **Why did … turnover change?**, which splits the change into per-reaction contributions \(\tfrac{1}{2}|S_{ij} v_j|\) in A and B.

<figure class="gm-shot" markdown>
[![Compare view, Metabolite turnover tab, with acetyl-CoA selected: turnover 10.296 in A and 18.262 in B. The side panel "Why did acetyl-CoA turnover change?" lists PFL +9.1224 (inactive → produces), PDH −4.84484 (produces → inactive), ACALD +4.37288 (inactive → consumes), PTAr +4.11429 (produces → consumes, direction reversed), CS −3.37181 and ACACT1r −0.25604.](../assets/images/cobra-gui-turnover-explain.png)](../assets/images/cobra-gui-turnover-explain.png)
<figcaption markdown="span">Acetyl-CoA (`accoa_c`) in iML1515, pFBA, aerobic (A) versus oxygen uptake closed (B). Each bar is a reaction's change in contribution, with its role in A → B.</figcaption>
</figure>

In this example the acetyl-CoA turnover rises from 10.296 to 18.262 mmol gDW⁻¹ h⁻¹ without oxygen. Pyruvate formate-lyase (`PFL`) takes over from pyruvate dehydrogenase (`PDH`) as the source of acetyl-CoA. Acetaldehyde dehydrogenase (`ACALD`) starts consuming it, on the way to ethanol, and phosphotransacetylase (`PTAr`) reverses direction towards acetate. This is the textbook fermentative pattern of *E. coli*, but the panel itself only decomposes two flux vectors. It is **descriptive, not a causal inference**, and both vectors are single pFBA solutions.

## Curating identifiers with MetaNetX

The **Metabolite analysis** section answers a different question: *which chemical is each metabolite?* Model metabolites are identified by model-specific IDs (`pyr_c`, `cpd00020_c0`, `C00022[c]`) and by whatever cross-references their authors added. Missing or inconsistent cross-references make models hard to compare and templates hard to match.

<figure class="gm-shot" markdown>
[![The Metabolite analysis section for iML1515: options "Apply confident matches", "Fill missing formulas" and "Suggest by exact name"; a status bar reading 1,877 metabolites in 2.9 s with MetaNetX/MNXref and local BiGG tables; 1,577 metabolites curated with 4,645 added cross-references; tabs Needs review (300), Confident (1577), Unmapped (0), Curated (1577), All; and a table of metabolites with their proposed MetaNetX chemical.](../assets/images/cobra-gui-metabolite-analysis.png)](../assets/images/cobra-gui-metabolite-analysis.png)
<figcaption markdown="span">Metabolite analysis of iML1515: 1,577 metabolites matched confidently and curated automatically (+4,645 cross-references), 300 waiting for review, none unmapped. The selected case, `prbatp_c`, is left for review because its annotated identifiers point to three different MetaNetX chemicals; the panel lists every identifier and every candidate.</figcaption>
</figure>

**How it works.** *Analyze metabolites* (on the Overview card or in the section) resolves every metabolite to a [MetaNetX/MNXref](https://www.metanetx.org) chemical through the identifiers **already in the model**: annotations such as KEGG, ChEBI, BiGG, ModelSEED, MetaCyc, HMDB or VMH IDs, written in any common form, and, as weaker evidence, identifiers encoded in the metabolite ID itself (`C00031[c]`, `cpd00027_c0`, `glc__D_c`). Metabolites with no identifier hit can get an exact-name lookup, which only ever produces a suggestion. If the BiGG tables are installed, they are used as a second, offline source. MetaNetX remains the reference.

**Statuses.**

| Status | Meaning |
| --- | --- |
| Confident | The identifiers agree on one chemical (or the metabolite's own ID and at least two databases agree), or an ID-only match is confirmed by formula or name. |
| Review | Databases disagree, the ID and the annotation disagree, the formula conflicts, or the match came only from the ID string or the name. |
| Unmapped | No identifier or exact name known to MetaNetX. |
| Skipped | Pseudo-metabolites: enzyme-constrained model proteins, protein pools, biomass components. |

Formulas are compared on heavy atoms only, because protonation states differ between databases. A candidate whose composition conflicts with the model formula is set aside, but still listed.

**What is written.** With *Apply confident matches* on, confident matches add the missing cross-references to the metabolite annotation under COBRApy/identifiers.org keys (`metanetx.chemical`, `kegg.compound`, `chebi`, `bigg.metabolite`, `seed.compound`, `metacyc.compound`, `hmdb`, `inchikey`, …). With *Fill missing formulas* on, a formula and charge are added **only where the model has none**; these MetaNetX values are at pH 7.3. For *Review* cases you decide: accept a candidate or *Keep original*. Existing values are never removed or rewritten, every accepted match can be undone, and *Revert all* restores the original annotation. Click a column title to sort the table; click again to reverse, and a third time for the original order.

**The same compound in other compartments.** `pyr_c`, `pyr_m` and `pyr_e` are three metabolites of the model but one chemical, so a decision about the identity of one of them is meant for all of them. GEMs MAP recognises these siblings conservatively:

- the same ID once the compartment part is removed (`pyr_c`, `M_pyr_c`, `pyr[c]`, ModelSEED `cpd00020_c0`) **and** a compatible name;
- for numbered IDs without a compartment part (yeast-GEM `s_1399`, `s_1401`), the same name without its compartment tag ("pyruvate [cytoplasm]");
- never two siblings in one compartment: if two metabolites of one compartment look the same, no group is formed.

The *Comp.* column shows siblings as `c +2` (hover for their IDs). When you select a metabolite, the panel lists *Same compound in other compartments* with a checkbox for each. *Apply*, *Keep original* and *Undo* act on the selected metabolite and every checked sibling, and the buttons show how many, for example *Apply MNXM23 (+2)*. A sibling whose own identifiers point to another chemical, or that is already curated as another one, starts unchecked and shows why (⚠).

**Where it goes.** Accepted matches form a **curation layer** stored next to the model in the backend cache and re-applied whenever the model is loaded. *Export curated model* (or *Save as model*) writes them into a new file, as SBML MIRIAM annotations, with a provenance note. The imported file is unchanged. MetaNetX answers are cached locally for 90 days, so only the first analysis of a model needs the internet. For iML1515 the first analysis took about 35 seconds while preparing these pages; repeating it took about 3 seconds.

The technical specification, including the rules for structureless ChEBI entries and the BiGG bridge, is in [Metabolite annotation curation](../METABOLITE_ANALYSIS.md).

<div class="gm-next" markdown>
**Next:** [Results, comparison and export](results-and-export.md) · or see these metabolites on a pathway in [Maps](../maps/index.md).
</div>
