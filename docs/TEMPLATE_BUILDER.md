# Template Builder

> **A template describes biological identity and pathway topology; a GEM provides model-specific identifiers.**
> The template knows what the molecule is. The matcher discovers what that molecule is called in the model.

The Template Builder is the *Templates* workspace. It creates, edits, reviews, imports and exports
model-independent pathway templates (`*.gemsmap-template.json`). It works without any GEM loaded.
Applying a template to a GEM goes through the existing mapping engine and its review dialog
(see [TEMPLATES.md](TEMPLATES.md)).

## Design notes (written before implementation, 2026-10-08)

GEMs MAP already had model-agnostic pathway templates: specs that point at a canonical metabolite library,
a deterministic mapping engine with inspectable evidence, per-model mapping profiles and a review
dialog. The Template Builder extends that system. It does not replace it.

### 1. Reused as-is

| Existing piece | Role in the Template Builder |
| --- | --- |
| Map Builder editor (`Canvas`, `Scene`, the store's commit/undo, selection, copy/paste, align/distribute, groups, texts, bend handles, `layouts.ts`) | The visual editor of Template Design Mode. Same canvas, same gestures, same undo stack. |
| Mapping engine (`templates/mapping/engine.ts`), `modelIndex`, compartments, names, identifiers | Template → GEM matching, unchanged in its scoring. |
| Mapping review dialog and Inspector resolver (`TemplateMapping.tsx`) | Step 4 (human review of correspondences) when a template is applied to a GEM. |
| Mapping profiles (`profile.ts`) | The matching history: `entity@compartment → model metabolite`, per model fingerprint. They stay outside the template. |
| Canonical library (`library.ts`) | The offline identity source of the identity search ("GEMs MAP library"). |
| MetaNetX client with SQLite cache (`backend/.../metanetx.py`) and the normalizers of the Metabolite Review (`annotation_service.py`) | Online identity search: KEGG/ChEBI hits resolved through MNXref, cross-references, formulas. Reaction identity from participants. |

### 2. Generalized

- **Engine entity resolution**: the engine took entities only from the built-in library. Now a compiled
  spec carries its own entities (`spec.entities`), so a user template defines new compounds. The key
  cache is per entity object, and cross-references are normalized (`CHEBI:17634` and `17634` are one ID).
- **Template registry**: `specById` looked into a hard-coded array. Now it reads a registry:
  the bundled files plus the user's library.
- **Instantiation** draws from the template file's layout: several visual instances per metabolite,
  pathway ports and labels.
- **Store**: an optional design layer (`design`) next to the visual document, recorded in the same undo
  snapshots. A workspace swap keeps the user's map out of reach while a template is open, so the map
  autosave is never overwritten.
- **Built-in templates** (central carbon, glycolysis, PPP, TCA) move from TypeScript constants to
  ordinary `*.gemsmap-template.json` files, loaded like user files. No special cases remain in the frontend.

### 3. Schema (`schema_version` 1.0.0)

```
format: "gemsmap-template"   schema_version   metadata { id, name, template_version, scope, authors, … }
biology   ← chemistry only, no coordinates
  compartments  conceptual names (cytosol, mitochondria, …) + fallback policy
  entities      chemical identity: canonical name, synonyms, identifiers{metanetx,kegg,chebi,bigg,seed,metacyc,hmdb}, formula, identity status
  metabolites   tpl_met_###: entity @ compartment (the biological node)
  reactions     tpl_rxn_###: participants with stoichiometry, reversibility, EC, identifiers, identity status
  connectors    tpl_port_###: link to another pathway (not a reaction)
layout    ← drawing only, no chemistry
  nodes         tpl_node_###: visual instance of a metabolite (x, y, label position) — many per metabolite
  ports, reactions (glyph ends, routing, bend, label offsets), groups, labels
validation  snapshot written on export (issues, completeness)
```

Three levels keep identity apart: **entity** (what the molecule is) → **template metabolite**
(that molecule in a compartment) → **visual instance** (where it is drawn). The same glucose entity
can be `glucose [cytosol]` and `glucose [extracellular]`; `glucose [cytosol]` can be drawn three times.

### 4. Template identity vs model identity

- No model ID in a template. Entities hold database identifiers; metabolites hold conceptual
  compartments, not `c`/`m`/`e`. The validator flags identifiers that look like model IDs (`glc__D_c`, `g6p[c]`).
- Identity status (`confirmed / suggested / ambiguous / unresolved`) is about the *template*:
  "is this node really D-glucose?". Mapping status (`auto_high / provisional / ambiguous / …`)
  is about one *application* to one GEM. They are different fields, shown with different words
  ("Template entity" vs "Model metabolite").
- Human > machine: a `confirmed` identity is never changed by Auto Identify or a later suggestion.
  A disagreeing suggestion is recorded as a *potential identity conflict* for review.

### 5. Integration with the existing matcher

`compileTemplate(file)` turns a template file into the engine's `PathwayTemplateSpec`. Template
metabolites become slots, entities become engine entities, conceptual compartments become compartment
rules, main participants become reaction sources/targets, and BiGG reaction IDs become tie-break
hints. The Map Builder gallery, the mapping review dialog, the gallery coverage badges, profiles and
`remapDocTemplates` all consume the compiled spec, so a user template is applied to a GEM like a built-in one.
The migration was checked against the previous TypeScript specs: 520 slot and reaction results on five models
(e_coli_core, a ModelSEED copy, an opaque-ID copy, iJO1366) were identical before and after.

## Using the Template Builder

Open the **Templates** tab of the workspace switcher (COBRAGUI · Map Builder · Templates).

**Library.** The built-in templates (Global central carbon metabolism, Glycolysis, TCA cycle, oxidative PPP)
and your own are listed as cards: preview, pathway, drawn metabolites, reactions, organism scope,
completeness, author and version. *Open*, *Duplicate*, *Export*, *Apply to GEM*, *Delete* (yours only);
*New template* and *Import template* at the top. Drop a `.gemsmap-template.json` file on the window to import it.

**Template Design Mode.** The Map Builder canvas, with the same gestures (drag, box-select, align and distribute
in the floating toolbar, copy/paste, group, labels, curved arrows with the bend handle, undo). The difference is
what a node is: a **template entity** — an abstract biological compound in a conceptual compartment — not a model
metabolite. The blue banner and the Inspector say so.

| Action | How |
| --- | --- |
| New metabolite | double-click empty canvas, or the Metabolite tool (M); the identity search opens at once |
| Define / change identity | double-click the node → type a name or an identifier (C00031, CHEBI:17634, MNXM…, cpd00027) → choose |
| New reaction | drag from a node's outer ring to another node (drop on empty canvas to extend the chain) |
| Reaction identity | double-click the arrow: built-in reactions with the same participants, and MNXref reactions (backend) |
| Cofactors | Inspector → Stoichiometry → *+ side compound* (part of the equation, not drawn) |
| Same metabolite twice | Inspector → *+ Instance* (or copy/paste the node): one biology, several drawings |
| Other compartment | Inspector → *Make independent*, then change its compartment |
| Link to another pathway | select a metabolite → Inspector → *+ Pathway link* (a port, never matched to model reactions) |
| Auto Identify | left panel: every entity that is not confirmed is searched by name and synonyms |
| Add BiGG IDs | left panel: BiGG universal IDs (and BiGG cross-references) where exactly one BiGG metabolite / reaction fits |
| Review queue | table of all elements with identity, status and source; click to select, *review* to open the search |
| Validate template | issue list; click an issue to select the element |
| Save | your templates are saved in the browser (IndexedDB); a built-in is saved as *my version* (the original never changes) |
| Export | one self-contained `.gemsmap-template.json`: identities, annotations, topology, layout, compartments, metadata |
| Apply to GEM | saves, switches to the Map Builder and runs the mapping review dialog against the loaded model |

An unsaved template survives a workspace switch, and a browser reload offers to resume it.

## Identity statuses

| Status | Badge | Meaning |
| --- | --- | --- |
| confirmed | ✓ | chosen or reviewed by a person (curated by hand for the built-ins) |
| suggested | ? | proposed by a database search, Auto Identify or AI; not reviewed yet |
| ambiguous | ! | several plausible candidates are stored; a person must choose |
| unresolved | ○ | identity not defined |

A partial name hit (substring) is never an identity: a suggestion needs an exact name, synonym or identifier.
A **confirmed** identity is never changed by Auto Identify (or, later, by AI generation). If a suggestion disagrees,
the node keeps its identity and gets a red **!** — *potential identity conflict* — with *Keep mine* / *Use the suggestion*.

Imported files keep the statuses of their author. The import report says who confirmed what, and
*Treat every identity as a suggestion* turns them back into suggestions to review.

## Validation

| Check | Severity |
| --- | --- |
| Invalid identifier syntax (per namespace), malformed EC | error |
| Reaction without participants / substrates / products; edge to a missing metabolite; node of a missing metabolite | error |
| Missing or ambiguous metabolite identity; reaction with neither EC nor database identifier | warning |
| Same entity defined twice in one compartment (draw instances instead) | warning |
| Two entities sharing a database identifier; identifier that looks like a model ID (`g6p_c`, `C00031[c]`) | warning |
| Unbalanced reaction (heavy atoms, when every formula is known); same compound on both sides | warning |
| Duplicate reaction (same equation); two irreversible reactions in opposite directions | warning |
| Drawn metabolite not connected; potential identity conflict | warning |
| Suggested identity not reviewed; direction not stated; balance not checkable; pathway summary arrow; AI-generated template; no preferred compartments | note |

**Completeness** is two plain ratios and their mean: metabolites identified, reactions identified.
"Identified" means at least one database identifier (or an EC number for a reaction; the KEGG module for a
pathway summary arrow) and a confirmed or suggested identity. Nothing else enters the number.

**Compartments are optional.** A template says *what* a molecule is; *where* it is gets decided when the template
meets a GEM: the matcher proposes candidates in every compartment and asks the person when several fit (the
review dialog). A preferred compartment (inspector → *Preferred compartment*) only ranks the candidates — e.g. the
built-in TCA prefers the mitochondrion — and the number of metabolites that have one is shown, but it is not part
of the score and a missing one is not a warning.

## File format reference (schema 1.0.0)

```jsonc
{
  "format": "gemsmap-template", "schema_version": "1.0.0",
  "metadata": {
    "id": "glycolysis", "name": "Glycolysis", "pathway": "Glycolysis (Embden–Meyerhof–Parnas)", "description": "…",
    "template_version": "2.0.0",            // version of this pathway, independent of schema_version
    "scope": { "level": "universal", "taxa": [], "note": "Conserved; cytosolic." },
    "authors": ["GEMs MAP"], "created": "…", "modified": "…", "license": "MIT", "tags": ["glycolysis"],
    "citations": [{ "text": "…", "doi": "10.…" }], "derived_from": { "id": "…", "name": "…", "template_version": "…" }
  },
  "biology": {
    "compartments": [{ "id": "mitochondria", "fallback": ["cytosol", "intracellular"], "note": "…" }],
    "entities": [{
      "id": "tpl_ent_001", "name": "D-Glucose", "short": "glc_D", "formula": "C6H12O6", "charge": 0,
      "synonyms": ["glucose", "dextrose"],
      "identifiers": { "kegg.compound": ["C00031"], "chebi": ["17634"], "bigg.metabolite": ["glc__D"], "seed.compound": ["cpd00027"] },
      "related": [{ "note": "anomer of D-glucose", "names": ["alpha-D-glucose"], "identifiers": { "kegg.compound": ["C00267"] } }],
      "identity": { "status": "confirmed", "source": "user", "note": "…", "reviewed": "…" },
      "library": "D-glucose"                 // canonical-library id, when the identity came from it
    }],
    "metabolites": [{ "id": "tpl_met_001", "entity": "tpl_ent_001", "compartment": "cytosol", "level": "required", "label": "Glucose", "aliases": ["glc"] }],
    "reactions": [{
      "id": "tpl_rxn_001", "name": "HEX", "canonicalName": "hexokinase",
      "participants": [{ "metabolite": "tpl_met_001", "coefficient": -1, "main": true }, { "metabolite": "tpl_met_014", "coefficient": -1, "main": false }],
      "reversible": false, "ec": ["2.7.1.1"], "identifiers": { "kegg.reaction": ["R00299"], "bigg.reaction": ["HEX1"] },
      "hints": ["HEX1", "GLCpts"],           // tie-breaks only, never identity
      "level": "required", "identity": { "status": "confirmed" }
    }],
    "connectors": [{ "id": "tpl_port_001", "metabolite": "tpl_met_002", "direction": "out", "target": { "template": "ppp", "pathway": "Pentose phosphate pathway" } }]
  },
  "layout": {
    "nodes": [{ "id": "tpl_node_001", "metabolite": "tpl_met_001", "x": 0, "y": 0, "label_pos": "right" }],
    "ports": [{ "id": "tpl_node_020", "connector": "tpl_port_001", "x": 110, "y": 60, "from": "tpl_node_002" }],
    "reactions": [{ "reaction": "tpl_rxn_001", "sources": ["tpl_node_001"], "targets": ["tpl_node_002"], "routing": "straight" }],
    "groups": [{ "id": "tpl_grp_001", "kind": "pathway", "title": "Glycolysis", "nodes": ["tpl_node_001"] }],
    "labels": [{ "id": "tpl_lbl_001", "x": 0, "y": -30, "text": "Glycolysis", "size": 11, "weight": 600, "kind": "text" }]
  },
  "validation": { "checked": "…", "errors": 0, "warnings": 0, "completeness": { "overall": 1 } }
}
```

Scope levels: universal, prokaryotic, eukaryotic, fungal, yeast, mammalian, plant, species-specific, other
(plus free `taxa`). Compartments: cytosol, mitochondria, mitochondrial_intermembrane, extracellular, periplasm,
peroxisome, nucleus, endoplasmic_reticulum, golgi, vacuole, lysosome, chloroplast, thylakoid, membrane.

How the requested contents map onto the schema: *template_metadata* → `metadata`; *nodes* → `biology.metabolites`
(biological) and `layout.nodes` (visual instances); *reactions* and *edges* → `biology.reactions[].participants`
(stoichiometric edges) and `layout.reactions` (arrow geometry); *compartments* → `biology.compartments`;
*identity_annotations* and *database_crossreferences* → `entities[].identity` / `.identifiers` and
`reactions[].identifiers`; *validation_status* → `validation` and every `identity.status`;
*template_version* → `metadata.template_version`.

Ids are stable and template-scoped (`tpl_ent_`, `tpl_met_`, `tpl_rxn_`, `tpl_port_`, `tpl_node_`, `tpl_grp_`,
`tpl_lbl_`). `aliases` keep maps drawn with older template versions (slot `g6p`) working. Unknown fields of a
newer minor schema version are kept; another major version is refused.

## Applying a template to a GEM

1. *Apply to GEM* (library card or designer) compiles the template and opens the existing mapping review
   dialog in the Map Builder.
2. The matcher scores candidates with every evidence channel: model annotation, identifiers encoded in the ID,
   related forms, names and synonyms (stereochemistry kept), formula, compartment, and reaction topology.
   Arrows are bound to the model reaction (or short series) that connects the mapped ends, preferring the
   template's EC numbers and BiGG IDs.
3. Partial matches are normal: matched (✓), provisional / ambiguous (?), open (○). Ambiguous slots wait for you.
4. Your choices go into the model's mapping profile, which is the matching history and lives outside the template:
   `entity@compartment → model metabolite`, with template id/version and time, keyed by the model fingerprint.
   The template file never stores a model ID.

**Placing it.** After the review (or straight away without a GEM) the template follows the mouse as a light
preview in a dashed frame; click where it goes (Esc or right-click cancels; Space + drag pans). Everything inserted —
metabolites, the cofactors beside the arrows, titles and pathway-link labels — is selected, so it can be dragged as
one piece; cofactors drawn beside an arrow keep following that arrow afterwards.

## BiGG data layer

The universal metabolites and reactions of [BiGG Models](https://bigg.bio) are used as a local knowledge base for
building templates, so that a template carries the BiGG IDs that models downloaded from BiGG use. GEMs MAP does not
talk to the BiGG API: the two published bulk tables are installed once.

```bash
npm run bigg:data                         # downloads bigg.bio/api/v3/download/{metabolites,reactions} once (~19 MB)
npm run bigg:data -- --from <folder>      # or: the two JSON files you downloaded from bigg.bio/data_access
```

They are stored next to the MetaNetX cache (`<cache>/cobragui/bigg/`, outside the repository) and read offline.

- **Identity search** and **Auto Identify**: BiGG universal metabolites are found by BiGG ID (current or superseded,
  with or without compartment suffix), by any cross-referenced identifier, or by name, and merged with the KEGG /
  ChEBI / MetaNetX hits that share an identifier. A candidate carries the union of the cross-references of all charge
  states, and the formula and charge of the neutral form.
- **Reaction identity** uses every participant of the template reaction, cofactors included. Each BiGG universal
  reaction that converts a main substrate into a main product is scored on participant coverage, side, coefficient,
  **compartment** (a mitochondrial TCA template prefers `CSm`, a cytosolic one `CS`), EC agreement and transport
  consistency; extra BiGG compounds (protons, cofactors the template leaves out) only lower the score a little. Every
  point is listed as evidence. MetaNetX stays the reference: MNXref candidates are listed first, BiGG ones after
  them as complementary evidence (the two scores are on different scales).
- **Add BiGG IDs** adds `bigg.metabolite` / `bigg.reaction` (and the BiGG cross-references) only when nothing
  contradicts the template and one candidate stands out. Identifiers are added, never removed; identity statuses do
  not change, and the note records the provenance. Ties (`MDHf` / `MDHm`) are listed for a person to choose.
- **Models downloaded from BiGG** (`*.biggr.json`): their model-specific entries are prefixed `__<model id>__`, and
  most annotations are missing. On import the prefixes are removed (Map Builder and COBRAGUI), and COBRAGUI
  completes the annotations from the BiGG tables (KEGG, ChEBI, MetaNetX, ModelSEED, MetaCyc, HMDB, Rhea, EC).
  The built-in templates map the bigg.bio export of e_coli_core without any annotation (glycolysis 12/13 — glucose
  is extracellular only in that model —, TCA 9/9, PPP 6/6).

## Backend identity search

| Route | |
| --- | --- |
| `GET /api/identity/compounds?q=…&limit=8` | KEGG `find/compound` + ChEBI (EBI OLS4) → MetaNetX: merged candidates with cross-references, formula, charge |
| `POST /api/identity/reactions` | `{participants: [{name, identifiers, coefficient, main, compartment}], ec}` → BiGG universal reactions (when installed) and MNXref reactions converting a main substrate into a main product, with per-participant evidence, EC agreement, direction and KEGG / Rhea / BiGG / SEED / MetaCyc IDs |
| `POST /api/identity/bigg-ids` | `{entities: [{id, identifiers}], reactions: [{id, participants, ec, identifiers}]}` → BiGG IDs when unambiguous (`one` / `known` / `several` / `none`) |
| `GET /api/bigg/status` | whether the BiGG tables are installed, with counts and date |

Answers are cached for 90 days in `identity_cache.sqlite` next to the MetaNetX cache. Without the backend the search
uses the GEMs MAP canonical library only (offline) and says so. MetaNetX IDs are resolved live from KEGG / ChEBI:
MNXref deprecates and splits chemicals between releases (`MNXM41`, the classic D-glucose ID, is deprecated).
VMH links from MNXref are not used (some chemicals carry unrelated VMH entries).

## KEGG-derived templates

Four KEGG pathways and an amino acid overview ship as built-ins, made offline by an AI curator with the pipeline
in `tools/kegg/` and marked **AI-generated — needs review** (`metadata.review_status`) until a person reviews them
(inspector → *Mark as reviewed by me*). KEGG is the biological and topological reference only; every drawing is
GEMs MAP's own, never a copy of a KEGG map, and the file says so (`metadata.source`).

| Template | Section | KEGG | Drawn |
| --- | --- | --- | --- |
| Glycolysis / Gluconeogenesis | KEGG-derived templates | map00010 | 23 metabolites, 31 reactions — 31/31 compounds and 56/56 map reactions handled |
| Citrate cycle (TCA cycle) | KEGG-derived templates | map00020 | 12 metabolites, 13 reactions — 20/20, 29/29 |
| Pentose phosphate pathway | KEGG-derived templates | map00030 | 31 metabolites, 34 reactions — 37/37, 59/59 |
| Alanine, aspartate and glutamate metabolism | KEGG-derived templates | map00250 | 27 metabolites, 36 reactions — 28/28, 47/47 |
| Amino acid biosynthesis (overview) | Central carbon | after map01230 | 32 metabolites, 31 arrows (20 pathway summaries) |

"Handled" means every KEGG compound and reaction of the map is a template entity, a related form (anomers), a
represented reaction (lumped complexes, anomer-specific forms), a variant (same step, other cofactor or donor) or
omitted with a written reason. Per map, `docs/templates/kegg/<map>/` holds the generation report (completeness,
review queue, coverage tables, curator decisions, log), the identity and reaction mapping tables (CSV), the visual
QC and mapping comparison with the hand-made built-in (`qc.md`) and a preview (`preview.svg`).

**Pipeline.** `npm run kegg:template -- map00010` reads KEGG's flat files and KGML (cached for 90 days next to the
BiGG data), applies the curation file `tools/kegg/curation/<map>.py` (entities, cofactors, steps, variants,
omissions, decisions, layout) and writes `src/templates/builtin/<id>.gemsmap-template.json` plus the reports.
Identities come from the app's infrastructure: entities already confirmed in the GEMs MAP library keep their
confirmation; every other identity is a suggestion (`high` when KEGG → one MetaNetX chemical with a consistent
formula and BiGG ID, `probable` otherwise; generic classes are never `high`). BiGG reaction IDs are accepted only
when BiGG's KEGG link *and* every template participant agree (BiGG links some KEGG reactions to unrelated ones).
Each drawn irreversible arrow is checked against KGML's own substrate → product direction.

**Layout helpers** (`tools/kegg/layout.py`) place things the way a person does in the editor, with the app's
geometry: aligned nodes get straight arrows, the others a gentle curve bowing away from the centre of the map;
labels on curves are moved off the visible arc; cofactors are drawn beside their arrow.

**QC and rendering.** `npm run template:qc -- <file> [--compare <builtin id>] [--md out.md]` validates the file and
measures the drawing with the app's own geometry (`src/templates/format/layoutQc.ts`): overlapping labels, arrows
or cofactor curves through labels, crossings, disconnected nodes, long arrows, nodes inside a module box they do not
belong to; with `--compare` it maps both templates on the test models. `npm run template:render -- <file> out.svg
[--png out.png]` renders a template with the app's Scene component (PNG through a local headless Edge / Chrome) — the
picture used for the visual self-review. The tests keep every KEGG-derived layout at zero overlaps and crossings.

### Schema 1.1 additions

| Field | Meaning |
| --- | --- |
| `layout.nodes[].attach: {reaction, side}` | a cofactor drawn small beside an arrow (`in` before the middle, `out` after it). A visual instance of the cofactor's metabolite — ATP is one entity drawn many times — never a pathway slot |
| `biology.reactions[].variants[]` | the same step with another cofactor or donor (GTP-PEPCK, NADP-GAPDH…): not drawn; EC numbers and BiGG IDs help the matcher |
| `biology.reactions[].provenance[]`, `biology.entities[].provenance` | source records (KEGG IDs the element represents) |
| `biology.reactions[].summary` | a whole pathway drawn as one arrow (overview maps); identity = the KEGG module; not atom-balanced; linked to a GEM only when the model makes it in one or two reactions |
| `layout.nodes[].fill` | fill colour of a node (appearance only); `label_pos`, `shape` and `r` already describe the label side, circle / text-only and radius |
| `biology.entities[].generic` | a class of compounds or proteins (phospho-His proteins, quinones, "2-oxo acid") |
| `identity.confidence` | `high` / `probable` for suggestions |
| `metadata.review_status`, `metadata.last_review`, `metadata.source` | AI-generated / AI-validated / human-reviewed; the reference pathway, generation method and date |

## Not implemented yet

- **AI template generation inside the app** (*Generate with AI*). Templates are generated offline by the KEGG
  pipeline above; the identity layer keeps AI output `suggested` and never overrides confirmed identities.
- **Escher maps as templates**: bigg.bio serves Escher maps per model; importing one as a template would reuse its layout.
- **Template Hub**: the library is a list of files with a provenance kind, so a remote source can be added later.
