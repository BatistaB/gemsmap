# Identity and matching

A template can be reused across models only if it says **what** each node is, independently of any model's naming. This page explains how GEMs MAP represents that identity and how it finds the corresponding metabolites and reactions in a GEM, including what it does when it is not sure.

## Three levels of identity in a template

| Level | Example | Meaning |
| --- | --- | --- |
| **Entity** | D-glucose 6-phosphate: KEGG `C00092`, BiGG `g6p`, ModelSEED `cpd00079`, synonyms, formula | What the molecule is. |
| **Template metabolite** | D-glucose 6-phosphate @ cytosol | That molecule in a conceptual compartment: what a slot stands for. |
| **Visual instance** | the G6P node at the top of glycolysis | Where it is drawn. One template metabolite can be drawn several times. |

Template files never contain model IDs (`g6p_c`, `C00092[c]`); the validator warns when an identifier looks like one. Compartments are conceptual names such as *cytosol*, *mitochondria* or *extracellular*, each with a fallback for models that lack it.

A template **reaction** is defined by its participants, stoichiometry and direction, plus EC numbers and database identifiers when known, not by its name, which varies between models. Side compounds (ATP, NAD⁺, …) complete the equation without being drawn.

## Which identifiers are used

The matcher reads identifiers from the model's metabolite **annotations**: KEGG, ChEBI, BiGG, ModelSEED, MetaCyc, HMDB and others, written as `kegg.compound:C00031`, `CHEBI:17634`, identifiers.org URLs and other common spellings. It also reads identifiers encoded in the **metabolite ID** itself (`C00031[c]`, `cpd00027_c0`, `glc__D_c`), names and synonyms (keeping stereochemistry: D ≠ L), the **formula** (heavy atoms; hydrogen is ignored because protonation states differ), the **compartment**, and whether a chemical reaction links a candidate to the neighbouring slots.

Template identities themselves come from the GEMs MAP canonical library (offline), from KEGG and ChEBI resolved through MetaNetX (online, through the backend), and from the local BiGG tables when installed (see [Creating templates](creating-templates.md#defining-identities)).

!!! note "Annotations decide how much can be matched"
    A model whose metabolites carry no cross-references can still be matched through ID patterns, names, formulas and topology, but with less certainty. Curating a model's annotations with [MetaNetX](../cobra-gui/metabolite-analysis.md#curating-identifiers-with-metanetx) before applying templates usually raises confidence. In the example below, after the MetaNetX curation of iML1515 the same template mapped all 26 slots with high confidence.

## How a candidate is scored

For a slot (entity *E* in expected compartment *C*) and a model metabolite *m*:

\[
\text{score} = \text{identity}(m, E) \times \text{compartment}(m, C) \times \text{topology}(m, \text{neighbours}) \qquad (\le 0.99)
\]

- **Identity** combines independent channels: an exact cross-reference in the annotation is the strongest (0.85, more with several databases agreeing), followed by an identifier encoded in the ID (0.70), an exact name or synonym (0.60), related forms such as anomers (0.50–0.60), and weaker ID resemblance or name variants. A consistent formula adds support but never creates a match on its own. Conflicts reduce the score: a different formula (× 0.35), opposite stereochemistry (× 0.3), or an annotation naming another compound (× 0.6).
- **Compartment** is 1 for the expected compartment, 0.97 for a fallback (the model lacks the preferred one), 0.8 for an unknown compartment, 0.65 for another intracellular compartment and 0.35 outside the cell, because uptake is transport, not pathway chemistry.
- **Topology** rewards candidates linked by a real chemical reaction to the candidates of neighbouring slots (`0.7 + 0.35·f`). Transport reactions and currency metabolites do not count.

Slots are then decided best-first, and a metabolite used by one slot is not available to another. Choices you made earlier are fixed first. The complete tables are in the [technical notes](../TEMPLATES.md#scoring).

!!! info "A score ranks; it is not a probability"
    The interface shows **High** (score ≥ 0.80), **Medium** (≥ 0.55) and **Low**, and gives the number only next to the evidence. A high score means many independent pieces of evidence agree, not that the identity is certain.

## Statuses after matching

| Status | Meaning | Drawn bound? |
| --- | --- | --- |
| Confirmed | Chosen by you, now or earlier (mapping profile) | Yes |
| Mapped automatically | High confidence and a clear winner | Yes |
| Provisional (yellow **?**) | Medium confidence, clear winner | Yes, flagged for review |
| Ambiguous | Two candidates within 0.08 of each other, both at least Medium | **No**: you choose |
| Unresolved | No adequate candidate | **No**: placeholder |
| Absent | You said the model does not contain it | **No**: placeholder |

**Mapping never silently invents biochemical identity.** When evidence is weak or contradictory, the slot stays open, and an open slot is preferred to a wrong one. Pathway coverage (how much of the template exists in the model) is reported separately from mapping confidence.

## A worked example: ribose 5-phosphate in iML1515

Applying *Global central carbon metabolism* to iML1515 leaves one slot for review: **D-Ribose 5-phosphate**, provisionally mapped to `r5p_c` with Medium confidence. The evidence explains why:

| Evidence | Result |
| --- | --- |
| ID `r5p_c` is the BiGG identifier `r5p` | ✓ supports |
| Name "Alpha-D-Ribose 5-phosphate" matches D-ribose 5-phosphate (up to the anomeric form) | ✓ supports |
| Formula C5H9O8P is consistent (H not compared) | ✓ supports |
| Annotation names MetaCyc `CPD-15318` and ChEBI `18189`, which the template does not list for D-ribose 5-phosphate | ✗ conflict |
| Compartment: cytosol, as expected | ✓ |
| Linked to D-ribulose 5-phosphate (`ru5p__D_c`) by `RPI`, as in the template | ✓ |
| **Score** | identity 0.55 × compartment 1 × topology 1.05 = **0.57** → Medium |

The model names `r5p_c` as the α-anomer and annotates it with identifiers that the template does not associate with the generic D-ribose 5-phosphate. That is not necessarily wrong, only different. The matcher proposes `r5p_c` but leaves the decision to a person, who can confirm it in one click. After the [MetaNetX curation](../cobra-gui/metabolite-analysis.md#curating-identifiers-with-metanetx) of iML1515, `r5p_c` also carries the generic identifiers (KEGG `C00117`, ModelSEED `cpd00101`), and the same slot is matched with high confidence.

## Pitfalls the matcher is designed around

- **Anomers and generic forms.** α-D-glucose, β-D-glucose and D-glucose are distinct entries in most databases. Templates list such forms as *related*, so they support a match without being treated as identical. When a model contains two candidate forms, for example both anomers feeding glycolysis, the slot becomes ambiguous and you choose.
- **Stereochemistry.** D- and L-forms are never merged; a stereo conflict strongly lowers the score.
- **Protonation and charge.** Models differ in protonation state (pyruvate as `C3H3O3`, charge −1, or as the neutral acid). Formulas are compared on heavy atoms only, and charge is not used.
- **Compartments.** The same chemical in two compartments is two model metabolites. The compartment factor keeps the cytosolic metabolite for a cytosolic slot, and periplasmic or extracellular copies drop to Low. Transport reactions do not count as links between pathway steps.
- **Synonyms and names.** Names are useful but not unique; a name-only match is never High. Partial name hits are never identities.
- **Direction.** Template arrows are bound to the model reaction (or a series of two) that connects the mapped ends, preferring the template's EC numbers and BiGG IDs. A reaction written in the opposite direction is drawn as in the template and its flux sign is flipped for display.

## Mapping profiles

Your decisions are stored as `entity @ compartment → model metabolite` (or *absent*) in a **mapping profile** keyed by a **structural fingerprint** of the model, a hash of its metabolite and reaction IDs and stoichiometry. Names, bounds and annotations do not change the fingerprint. A profile is:

- reused by **every template** that contains the same entity on the same model;
- **never applied to another model**;
- saved in the browser and inside `.gemsmap` projects;
- reported as stale for an entry whose metabolite no longer exists after a model change.

### The same entity in other compartments

A template can draw one entity in several compartments, for example pyruvate in the cytosol and in the mitochondrion. When you choose a model metabolite for one of these slots, in the review dialog or in the inspector, GEMs MAP also maps the other compartments to the [same compound](../cobra-gui/metabolite-analysis.md#curating-identifiers-with-metanetx) in the model: choosing `pyr_c` maps the mitochondrial slot to `pyr_m`. Such slots are confirmed with the method *same compound as pyr_c*.

- A slot you chose yourself, or one mapped with high confidence, is never changed this way.
- In the review dialog, changing or clearing a choice also undoes the slots that followed it.
- The siblings are saved in the mapping profile too, so another template that draws pyruvate in the mitochondrion of the same model finds `pyr_m` already confirmed.

*Export report* in the review dialog writes every mapping with its evidence, method and software versions as JSON, for the methods section of a paper.

<div class="gm-next" markdown>
**Next:** [Create your own templates](creating-templates.md).
</div>
