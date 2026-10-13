# AI-assisted templates

Drawing a large pathway template by hand means collecting every compound and reaction, finding identifiers, deciding what to omit, and laying it all out legibly. Language models can take over much of this preparatory work. They are also known to produce plausible but wrong identifiers. GEMs MAP therefore uses AI in a narrow, inspectable way: **AI output is always a suggestion, and confirmed human decisions are never overwritten.**

## What exists today

<span class="gm-badge experimental">Offline pipeline · output awaiting review</span>

The KEGG-derived templates in the library (map00010, map00020, map00030, map00250) and the amino acid biosynthesis overview were produced **offline**, outside the application, by an AI curator ("GEMs MAP AI curator (Claude)" on their cards) working with a reproducible pipeline in the repository:

```bash
npm run kegg:template -- map00010
```

1. **Source data.** The pipeline reads the KEGG flat files and KGML of the pathway (cached locally). KEGG is the biological and topological reference only; the drawing is GEMs MAP's own.
2. **Curation file.** The AI curator writes a curation file (`tools/kegg/curation/<map>.py`) that a person can read and edit. It lists the entities, cofactors, steps, variants (the same step with another cofactor), omissions **with a written reason**, decisions, and the layout.
3. **Identities from the application's own infrastructure.** Entities already confirmed in the GEMs MAP library keep their confirmation. Every other identity is a **suggestion**: `high` when KEGG resolves to exactly one MetaNetX chemical with a consistent formula and BiGG ID, `probable` otherwise. Generic classes are never `high`. BiGG reaction IDs are accepted only when BiGG's KEGG link *and* every template participant agree, because BiGG links some KEGG reactions to unrelated ones. Each irreversible arrow is checked against KGML's own direction.
4. **Layout helpers.** Aligned nodes get straight arrows, the others a gentle curve; labels are moved off arcs; cofactors are drawn beside their arrow.
5. **Quality control.** `npm run template:qc` validates the file, measures the drawing with the application's own geometry (overlapping labels, arrows through labels, crossings, disconnected nodes, long arrows) and maps the template on the test models. `npm run template:render` renders it with the application's renderer for a visual check. The automated tests keep every KEGG-derived layout at zero overlaps and crossings.
6. **Reports.** Each template comes with a generation report: completeness, review queue, coverage tables, curator decisions and log. The identity and reaction tables (CSV), the QC results and a preview are in `docs/templates/kegg/<map>/`; see, for example, the [map00010 report](kegg/map00010/report.md).

Every template produced this way carries `review_status: AI-generated` and is labelled **AI-generated — needs review** in the library and in the inspector until a person reviews it and clicks *Mark as reviewed by me*. Individual identities keep their own statuses.

## Safeguards in the identity layer

These rules apply to anything that proposes identities, whether *Auto Identify*, a database search or AI:

- Suggestions are stored as **suggested**, with their source and confidence; they never become *confirmed* without a person.
- A **confirmed identity is never changed** by a later suggestion. A disagreement is recorded as a *potential identity conflict* (red **!**) for review.
- A partial name match is never an identity.
- The validator flags identifiers that look like model IDs, duplicated identifiers, unbalanced equations and AI-generated templates.
- When the template meets a GEM, the matcher still requires evidence from the model, and leaves uncertain slots open.

## What is not implemented

<span class="gm-badge planned">Future direction</span>

There is **no AI feature inside the application** today: no *Generate with AI* button, no chat, no automatic layout from a text description, and no AI involvement in mapping a template onto a model. Possible future uses, all of which would have to go through the safeguards above:

- proposing a first layout from a pathway name or a description;
- listing candidate reactions for a pathway in a given model;
- suggesting identities for unresolved nodes, with the evidence that supports them;
- explaining mapping conflicts in plain language.

## Limits to keep in mind

Model-generated biochemical annotations fail in characteristic ways:

- **Invented or outdated identifiers.** A KEGG, ChEBI or MetaNetX ID that looks right may not exist, or may belong to another compound. MNXref also deprecates and splits chemicals between releases.
- **Stereochemistry and anomers.** D/L forms and α/β anomers are easily confused.
- **Charge and protonation.** Formulas differ with the protonation state; only heavy atoms should be compared.
- **Compartments and organisms.** A reference pathway (KEGG) is not the pathway of a given organism. Isozymes, compartments and cofactor preferences differ, and transport steps are often missing.
- **Direction.** Reference maps often draw reversible steps; the direction that matters is the one in the model and its data.

AI-proposed layouts and identities must therefore be checked against the **model's stoichiometry, compartments and annotations**, which is what the review dialog and the template validator are for.

<div class="gm-next" markdown>
**See also:** [Identity and matching](identity-and-matching.md) · [Roadmap](../reference/roadmap.md).
</div>
