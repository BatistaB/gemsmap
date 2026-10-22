# Templates drafted with an LLM

Drawing a large pathway template by hand means collecting every compound and reaction, finding identifiers, deciding what to omit, and laying it all out legibly. A large language model (LLM) can do much of this preparatory work for you.

**GEMs MAP does not talk to any AI service.** There is no AI built into the application: no chat, no *Generate with AI* button, no API key. It does not need one. A template is an open, declarative file drawn on the same canvas a person uses, and GEMs MAP is open source, so you can ask the LLM of your choice (Claude, GPT, Codex and others) to draw a template from a reference map, such as a KEGG pathway, and then review the draft in the Template Builder. This usually gives a good first draft. LLMs are also known to produce plausible but wrong identifiers, so **an LLM draft is always a suggestion, and confirmed human decisions are never overwritten.**

## How to draft a template with an LLM

1. **Pick a reference.** A KEGG pathway (for example `map00020`, the citrate cycle) or an image of a pathway you are allowed to use.
2. **Give the LLM the format.** The template file format is described in the developer notes of the repository ([`docs/TEMPLATE_BUILDER.md`](https://github.com/BatistaB/gemsmap/blob/main/docs/TEMPLATE_BUILDER.md), section *File format reference*), and the built-in templates in [`src/templates/builtin/`](https://github.com/BatistaB/gemsmap/tree/main/src/templates/builtin) are complete examples. An LLM working in a clone of the repository can read both directly.
3. **Ask for a `.gemsmap-template.json` file**, with the identities as suggestions and the file marked for review. For example:

    > Read docs/TEMPLATE_BUILDER.md and two templates in src/templates/builtin/. Draw KEGG map00020 as a GEMs MAP template (.gemsmap-template.json). Give every entity its database identifiers, with the identity status `suggested` and the source `ai`; set `review_status` to `ai-generated`. Draw it top to bottom, with straight arrows between aligned nodes and gentle curves otherwise, and the cofactors beside their arrows. Do not invent identifiers: leave an identity unresolved when you are not sure.

4. **Open it in the Template Builder:** *Import template*, or drop the file on the Templates workspace. The import report lists any problem with the file.
5. **Review it:** *Validate template* for errors and warnings, the *Review queue* for identities that are not confirmed yet, the identity search (double-click a node) to check each identity against the GEMs MAP library, MetaNetX and the BiGG tables, and the canvas to fix the layout. When you are satisfied, click *Mark as reviewed by me* in the inspector.

## The pipeline used for the built-in KEGG templates

<span class="gm-badge experimental">Drafted outside the application · awaiting review</span>

The KEGG-derived templates in the library (map00010, map00020, map00030, map00250) and the amino acid biosynthesis overview were drafted this way, by an LLM (Claude Opus 5.5, Anthropic) working in a clone of the repository with a reproducible pipeline. Their cards say "Drafted with an LLM (Claude Opus 5.5)". The same pipeline works with any LLM that can read and write files:

```bash
npm run kegg:template -- map00010
```

1. **Source data.** The pipeline reads the KEGG flat files and KGML of the pathway (cached locally). KEGG is the biological and topological reference only; the drawing is GEMs MAP's own.
2. **Curation file.** The LLM writes a curation file (`tools/kegg/curation/<map>.py`) that a person can read and edit. It lists the entities, cofactors, steps, variants (the same step with another cofactor), omissions **with a written reason**, decisions, and the layout.
3. **Identities from the application's own infrastructure.** Entities already confirmed in the GEMs MAP library keep their confirmation. Every other identity is a **suggestion**: `high` when KEGG resolves to exactly one MetaNetX chemical with a consistent formula and BiGG ID, `probable` otherwise. Generic classes are never `high`. BiGG reaction IDs are accepted only when BiGG's KEGG link *and* every template participant agree, because BiGG links some KEGG reactions to unrelated ones. Each irreversible arrow is checked against KGML's own direction.
4. **Layout helpers.** Aligned nodes get straight arrows, the others a gentle curve; labels are moved off arcs; cofactors are drawn beside their arrow.
5. **Quality control.** `npm run template:qc` validates the file, measures the drawing with the application's own geometry (overlapping labels, arrows through labels, crossings, disconnected nodes, long arrows) and maps the template on the test models. `npm run template:render` renders it with the application's renderer for a visual check. The automated tests keep every KEGG-derived layout at zero overlaps and crossings.
6. **Reports.** Each template comes with a generation report: completeness, review queue, coverage tables, curation decisions and log. The identity and reaction tables (CSV), the QC results and a preview are in `docs/templates/kegg/<map>/`; see, for example, the [map00010 report](kegg/map00010/report.md).

Every template drafted this way carries `review_status: "ai-generated"` and is labelled **AI-generated — needs review** in the library and in the inspector until a person reviews it and clicks *Mark as reviewed by me*. Individual identities keep their own statuses.

## Safeguards in the identity layer

These rules apply to anything that proposes identities, whether *Auto Identify*, a database search or a file drafted with an LLM:

- Suggestions are stored as **suggested**, with their source and confidence; they never become *confirmed* without a person.
- A **confirmed identity is never changed** by a later suggestion. A disagreement is recorded as a *potential identity conflict* (red **!**) for review.
- A partial name match is never an identity.
- The validator flags identifiers that look like model IDs, duplicated identifiers, unbalanced equations and AI-generated templates.
- When the template meets a GEM, the matcher still requires evidence from the model, and leaves uncertain slots open.

## Limits to keep in mind

Model-generated biochemical annotations fail in characteristic ways:

- **Invented or outdated identifiers.** A KEGG, ChEBI or MetaNetX ID that looks right may not exist, or may belong to another compound. MNXref also deprecates and splits chemicals between releases.
- **Stereochemistry and anomers.** D/L forms and α/β anomers are easily confused.
- **Charge and protonation.** Formulas differ with the protonation state; only heavy atoms should be compared.
- **Compartments and organisms.** A reference pathway (KEGG) is not the pathway of a given organism. Isozymes, compartments and cofactor preferences differ, and transport steps are often missing.
- **Direction.** Reference maps often draw reversible steps; the direction that matters is the one in the model and its data.

Layouts and identities drafted with an LLM must therefore be checked against the **model's stoichiometry, compartments and annotations**, which is what the review dialog and the template validator are for.

<div class="gm-next" markdown>
**See also:** [Creating templates](creating-templates.md) · [Identity and matching](identity-and-matching.md) · [Roadmap](../reference/roadmap.md).
</div>
