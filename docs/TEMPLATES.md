# Pathway templates and the mapping engine

A pathway template is a **biologically annotated, compartment-aware pathway specification with its own drawing**. It is not a drawing that contains metabolite IDs. The same template draws Glycolysis in a BiGG model (`g6p_c`), a ModelSEED model (`cpd00079_c0`) or a KEGG-based eukaryote (`C00668[c]`). The layout always stays the same, because the shape of a pathway is part of how people recognise it.

```
canonical library ──► template spec ──► mapping engine ──► review ──► Map Builder
 (entities, IDs)     (biology/rules/      (per model,      (only      (template layout,
                      layout layers)       deterministic)   uncertain)  bound to the model)
```

## Code

| File | Role |
| --- | --- |
| `src/templates/spec.ts` | Engine contract, compiled from template files |
| `src/templates/format/` | Template file format: schema, parse/import, compile, validate, identity rules |
| `src/templates/builtin/*.gemsmap-template.json` | Built-in templates (ordinary template files) |
| `src/templates/pathways.ts` | Loads the built-ins; `validateTemplate` for compiled specs |
| `src/templates/library/registry.ts` | Template library: built-ins + user templates (IndexedDB) |
| `src/templates/design/` | Template Design Mode: drawing ↔ biology, actions, identity search, session |
| `src/templates/mapping/library.ts` | Canonical metabolites: names, synonyms, formula, cross-references, related forms |
| `src/templates/mapping/identifiers.ts` | Cross-reference normalization (`kegg.compound:C00031`, `chebi:17634` …) |
| `src/templates/mapping/compartments.ts` | Canonical compartments, model context, compartment rules |
| `src/templates/mapping/names.ts` | Name keys (stereo-preserving), formula comparison |
| `src/templates/mapping/modelIndex.ts` | Per-model index, transport detection, fingerprint |
| `src/templates/mapping/engine.ts` | Candidates, scoring, joint assignment, statuses, report |
| `src/templates/mapping/profile.ts` | Model mapping profiles (user confirmations) |
| `src/templates/instantiate.ts` | Mapping → glyphs; re-mapping template nodes after a model switch |
| `src/ui/TemplateMapping.tsx` | Review dialog, Inspector resolver, gallery badge |

The engine runs in the browser. The Map Builder works without the Python backend, and the engine is a pure, framework-free module, so it can be moved to a service later without changing it.

## Template schema

```jsonc
{
  "id": "tca", "name": "TCA cycle", "version": "2.0", "author": "GEMsMAP",
  "compartmentRules": {
    "default": { "preferred": ["MITOCHONDRION"], "fallback": ["CYTOSOL", "INTRACELLULAR"],
                 "note": "The TCA cycle is mitochondrial in eukaryotes; …" }
  },
  "biology": {
    "slots": [ { "slot": "cit", "entity": "citrate", "level": "required" } ],
    "reactions": [ { "id": "ACONT", "sources": ["cit"], "targets": ["icit"], "name": "ACONT",
                     "ec": ["4.2.1.3"], "hints": ["ACONT", "ACONTa"], "level": "required" } ],
    "connectors": [ { "slot": "accoa", "direction": "in", "to": "glycolysis" } ]
  },
  "layout": { "kind": "circular", "nodes": { "cit": { "x": 0, "y": -5, "labelPos": "top" } },
              "reactions": { "ACONT": { "routing": "curved", "bend": -12 } } }
}
```

- **Biology**: slots point at library entities. `alternatives` lists other acceptable entities (D-lactate for an L-lactate slot). `level` is `required`, `recommended` or `optional`; only `required` slots count as core coverage.
- **Mapping rules**: compartment rules are preferences, not requirements. They can be set per template, and per slot through `rule`. `INTRACELLULAR` means any intracellular compartment.
- **Layout**: relative coordinates. They are never changed by mapping.
- Model IDs never appear in a template. Reaction `hints` only break ties between model reactions that fit equally well.

`validateTemplate` checks unique IDs, known entities and rules, connected slots, layout completeness and EC syntax. Every built-in template is tested.

## Scoring

For a slot (entity *E*, expected compartment *C*) and a model metabolite *m*:

```
score = identity(m, E) × compartment(m, C) × topology(m, neighbours)      (capped at 0.99)
```

**Identity** is a noisy-OR of independent channels:

| Channel | Weight |
| --- | --- |
| Exact cross-reference in the model annotation | 0.85 (+0.035 per extra database, max 0.92) |
| ID encodes an exact identifier (`C00031[c]`, `cpd00027_c0`, BiGG base `glc__D`) | 0.70 |
| Related form (anomer, ring form, stereo-unspecified) by annotation / ID | 0.60 / 0.50 |
| ID only resembles the BiGG ID (case and `_`/`-` ignored) | 0.45 |
| Exact name or synonym | 0.60 |
| Name equal up to anomeric/ring form | 0.40 |
| Formula consistent (heavy atoms; H ignored for protonation) | +0.25 |

Penalties: a formula conflict ×0.35, a stereo conflict (D vs L, R vs S) ×0.3, and an annotation that names a different compound in a namespace the entity covers ×0.6. A formula only ever supports a match; it never creates one.

**Compartment** factor: 1 for the expected compartment; 0.97 when that compartment is a fallback (the model lacks the preferred one); 0.8 for an unknown compartment; 0.65 for another intracellular compartment; 0.35 outside the cell, because uptake is transport and not pathway chemistry.

**Topology** factor: `0.7 + 0.35·f`, where *f* is the mean link strength to the template neighbours (1 for a direct chemical reaction, 0.6 for a two-step series). Links are searched against the neighbours' candidate pools in pass 1, and against the neighbours' chosen metabolites in pass 2. Transport reactions (the same chemicals on both sides) and currency metabolites are ignored.

**Joint assignment**: user choices are fixed first. Then slots are decided best-first, and a metabolite used by one slot is unavailable to the others.

The score ranks candidates. It is not a probability, so the UI shows High (≥ 0.80), Medium (≥ 0.55) and Low, and gives the number only in the details.

## Statuses

| Status | Meaning | Bound? |
| --- | --- | --- |
| `confirmed` | Chosen by the user, now or earlier (mapping profile) | yes |
| `auto_high` | High confidence, clear winner | yes |
| `provisional` | Medium confidence, clear winner: flagged **?** | yes |
| `ambiguous` | Two candidates within 0.08 of each other, both ≥ Medium | **no**, user chooses |
| `unresolved` | No adequate candidate | **no**, placeholder |
| `absent` | The user says the entity is not in the model | **no**, placeholder |

## Mapping profile

`entity@canonicalCompartment → metaboliteId` (or `null` for absent), keyed by the model's **structural fingerprint**: a hash of metabolite IDs with compartments, and of reaction IDs with stoichiometry. Names, bounds and annotations don't affect it. A profile is reused by every template that shares the entity, never by another model. If a confirmed metabolite disappears from the model, the entry is ignored and reported as stale. Profiles live in browser storage and are embedded in `.gemsmap` projects.

## Adding a template

1. Draw it in the Template Builder (Templates tab) and define every identity. Use identifiers you have verified, and put anomers or stereo-unspecified forms under `related`. A wrong identifier creates a confident wrong match, so leave out any ID you are unsure of.
2. Export it. To ship it as a built-in, put the file in `src/templates/builtin/` and list it in `BUILTIN_TEMPLATE_FILES` (`pathways.ts`).
3. `npm test`: validation, balance, plus mapping on the fixture models. Add expectations for the new template.

## Template Builder

Templates are ordinary files (`*.gemsmap-template.json`; the built-ins are in `src/templates/builtin/`),
created and edited in the Templates workspace. `compileTemplate` turns a file into the spec described above.
See [TEMPLATE_BUILDER.md](TEMPLATE_BUILDER.md).

## Not yet implemented (roadmap)

- MetaNetX/MNXref reconciliation with a local cache. The library deliberately has no MNX IDs until they come from MNXref itself.
- Canonical reaction library; reaction-first fallback (KEGG/Rhea/EC → metabolite support).
- Templates: glyoxylate shunt, gluconeogenesis, serine/glycine, Met/Cys, BCAA, aromatic amino acids, mevalonate, β-oxidation, oxidative phosphorylation.
- Testing workbench across models (one template on several GEMs side by side).
- "Find in COBRAGUI" from an open slot. The review dialog currently searches the loaded model with the Map Builder search.
