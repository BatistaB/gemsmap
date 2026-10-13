# Metabolite analysis (MetaNetX curation)

*COBRAGUI → Metabolite analysis* (or the card on the Overview) maps every metabolite of the loaded model to a [MetaNetX / MNXref](https://www.metanetx.org) chemical. Three things come out of it:

- Confident matches add the missing cross-references to the annotation, and a formula where the model has none.
- Uncertain matches are listed for review, each with its evidence.
- The curated model is exported by *Save as model*.

The goal is curation: make a model better annotated without silently changing what its author wrote.

## How a metabolite is resolved

1. **Inputs**: the identifiers already in the annotation (KEGG, ChEBI, BiGG, ModelSEED, MetaCyc, HMDB, VMH, MetaNetX …), normalized whatever their spelling (`CHEBI:17634`, `CHEBI/17634`, identifiers.org URLs). Identifiers encoded in the ID itself (`C00031[c]`, `cpd00027_c0`, `glc__D_c`) are a separate, weaker source. Names never go to the ID mapper.
2. **MetaNetX**: the identifiers are resolved to MNX chemicals through the SPARQL endpoint (`rdf.metanetx.org/sparql`), in batches of 150, with four parallel requests. The name, formula, charge, InChIKey and cross-references of each chemical are then fetched.
3. **Optional name lookup**: metabolites with no identifier hit at all get an exact MetaNetX name lookup. A hit is only ever a suggestion.

Every answer, "not found" included, is cached in `metanetx_cache.sqlite`, next to the model cache, for 90 days. A second analysis of the same model makes no network request.

## Statuses

| Status | When |
| --- | --- |
| **Confident** | All annotated identifiers agree on one chemical. Or: the metabolite's own ID and ≥ 2 databases agree, while other annotated IDs (often extra ChEBI entries for the acid, anion or a parent class) point elsewhere. Or: only the ID string matched, and the formula or name confirms it. |
| **Needs review** | Databases disagree (e.g. BiGG `f6p` → β-D-fructose 6-phosphate, KEGG C00085 → D-fructose 6-phosphate). Or the metabolite ID and the annotation disagree, the formula conflicts, the match came only from the ID string, or only from the name. |
| **Unmapped** | No identifier or exact name known to MetaNetX (typically model-specific IDs such as `DGDG[c]`). |
| **Skipped** | Pseudo-metabolites: ecModel enzymes (`prot_…`), the protein pool, biomass components. |

Two rules keep the noise out:

- **Formula check**: candidates whose heavy-atom composition differs from the model formula are set aside but still listed. Annotations often drag in salts and hydrates ("Citric acid monohydrate"). H is not compared, because protonation states differ.
- **Structureless twins**: MNXref keeps some ChEBI entries as chemicals without a structure, e.g. `CHEBI:17634` → `MNXM735623` "D-glucose". When such an entry has the same name as the structured chemical, it does not count as a disagreement.

## BiGG local tables (offline knowledge base)

When the BiGG universal tables are installed (`npm run bigg:data`, see [TEMPLATE_BUILDER.md](TEMPLATE_BUILDER.md)), the analysis uses them next to MetaNetX. **MetaNetX stays the reference and decides**; BiGG is offline enrichment. GEMs MAP never calls the BiGG API.

- **Bridge**: each metabolite is resolved to BiGG universal metabolites through its annotation and its own ID, superseded BiGG IDs included (`glc_D` → `glc__D`). BiGG's MetaNetX links are often from an older MNX release (glutathione: `MNXM57` in BiGG, `MNXM490899` in MNXref 4). So they are used only when the metabolite's own identifiers resolve nothing in MetaNetX, for example BiGG IDs unknown to MNXref, or MetaNetX unreachable. Bridged inputs are shown as evidence and never count as an extra independent database.
- **Enrichment**: an accepted match also gets its BiGG ID and BiGG's curated cross-references (KEGG, ChEBI, ModelSEED, HMDB, InChIKey), if the BiGG metabolite has the same composition. When several BiGG entries share an identifier (`g6p` and `M01389`), only the one the model itself uses is written. If the model uses none of them, no BiGG ID is written.
- **Offline**: with MetaNetX unreachable and an empty cache, the BiGG tables still resolve what they know (in tests: 55 of 72 e_coli_core metabolites confident). A MetaNetX ID known only through BiGG is not written until MetaNetX confirms it.

On the test models, adding BiGG changes no status and no chosen chemical. It adds cross-references: +15 on e_coli_core.

## What is written to the model

For an accepted match, the chemical's cross-references are added under COBRApy / identifiers.org keys: `metanetx.chemical`, `kegg.compound`, `chebi` (`CHEBI:n`), `bigg.metabolite`, `seed.compound`, `metacyc.compound`, `hmdb`, `vmhmetabolite`, `sabiork.compound`, `lipidmaps`, `slm`, `kegg.glycan`, `inchikey`.

- **Never** removed or rewritten: existing values. Values already present are not duplicated.
- **Not written**: KEGG *drug* entries, and MetaCyc IDs when MetaNetX lists more than two for one chemical. Those are compound classes merged into the chemical (D-glucose → "Soyasapogenol-B-Monoglucosides").
- **Formula and charge**: only when the model has no formula, and only with *Fill missing formulas* on. The MetaNetX values are at pH 7.3.

Accepted matches form a **curation layer** (`<model id>.curation.json` in the model cache). It records the original formula and charge, so every metabolite can be undone (*Undo*, *Revert all*). *Keep original* records that you looked at a suggestion and declined it, and later analyses respect that. The layer is re-applied whenever the model is loaded, and exported files carry it, with a `GEMs MAP curation` note in the model notes. The imported file itself is never modified.

## API

| Route | |
| --- | --- |
| `POST /api/models/{id}/annotation/analyze` | `{useNames, autoApply, fillFormulas}`; starts a background job |
| `GET /api/models/{id}/annotation?full=false` | job progress + curation summary (cheap to poll) |
| `GET /api/models/{id}/annotation` | the full analysis (every metabolite, evidence, candidates) |
| `POST /api/models/{id}/annotation/apply` | `{items: [{id, mnx?, fillFormula?}]}` |
| `POST /api/models/{id}/annotation/reject` | `{ids}` |
| `POST /api/models/{id}/annotation/revert` | `{ids}`; `null` reverts everything |

The endpoint can be changed with the `METANETX_SPARQL` environment variable.
