# Sharing and reuse

## What you can do today

<span class="gm-badge implemented">Implemented</span>

Templates are **ordinary files**. A `.gemsmap-template.json` file contains everything a template is: metadata (name, pathway, description, template version, organism scope, authors, license, citations, tags, the template it was derived from), the biology (entities with identifiers, template metabolites with conceptual compartments, reactions with stoichiometry, EC numbers and identifiers, pathway links) and the layout. It contains no model IDs, so it works with any GEM.

- **Share**: *Export* in the library or the designer, then send the file, put it in a repository, or attach it to a paper.
- **Reuse**: *Import template* (or drop the file on the Templates workspace). The import report checks the schema and says who confirmed which identity; *Treat every identity as a suggestion* turns them back into suggestions for you to review. Unknown fields of a newer minor schema version are kept; a different major version is refused.
- **Adapt**: *Duplicate* any template ("TCA cycle — Aspergillus version"), then change compartments, branches, labels or identities. The copy records which template it was derived from.
- **Apply**: the same file maps a BiGG, a ModelSEED or a KEGG-namespace model. Missing parts stay open instead of failing, and the [review](identity-and-matching.md) shows what was matched and why.

The built-in templates are such files too (`src/templates/builtin/`), loaded with no special cases. Adding one to the application is a matter of placing the file there and listing it; the automated tests then validate it and check its mapping on the test models (see [Pathway templates and the mapping engine](../TEMPLATES.md#adding-a-template)).

Two simpler mechanisms also exist in the Map Builder: **Save as template** on a selection (stored in the browser under *My templates*, with compartment-free hints for [auto-bind](../maps/mapping-model-elements.md#slots-and-auto-bind)), and projects, which carry their template mappings.

## Future direction: a community template library

<span class="gm-badge planned">Not implemented — vision</span>

The long-term aim is a **searchable, versioned library of pathway layouts** that scientists create, review and reuse, so that a well-drawn pathway does not have to be redrawn for every model, organism and paper. Nothing below exists yet; there is no upload, publishing, moderation or synchronisation in GEMs MAP today.

What such a library would need, building on what the file format already records:

| Need | Already in the file today | Still missing |
| --- | --- | --- |
| Authorship and credit | `authors`, `citations` | Stable identities for contributors, DOIs per version |
| License | `license` | A policy for contributions |
| Provenance | `derived_from`, `source`, per-element `provenance` | A public history of changes |
| Organism and context | `scope` (universal, prokaryotic, eukaryotic, fungal…; taxa), compartments with fallbacks | Search by organism and model |
| Identity quality | Identity status per element, completeness, `review_status` (AI-generated / AI-validated / human-reviewed) | Community review and endorsement |
| Validation | Validator, mapping tests on fixture models | Automatic tests on many public GEMs before publication |
| Versions | `template_version`, `schema_version` | Hosting, discovery, updates |

The template library in the application is already a list of files with a provenance kind, so a remote source could be added later without changing how templates are mapped.

<div class="gm-next" markdown>
**Next:** [Templates drafted with an LLM](ai-assisted-templates.md).
</div>
