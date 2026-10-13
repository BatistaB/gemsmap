# Creating templates

The **Template Builder** (the *Templates* workspace) creates, edits, reviews, imports and exports model-independent templates. No GEM is needed: you draw a pathway and define what each node is. Applying the template to a model comes later, through the same matcher and review dialog as the built-ins.

## Template Design Mode

Open a template from the library (*Open*), make your own copy of a built-in (*Duplicate*), or start from scratch (*New template*). The canvas is the Map Builder's, with the same gestures; the blue banner reminds you that **nodes are template entities, not model metabolites**.

<figure class="gm-shot" markdown>
[![Template Design Mode with the built-in TCA cycle: the circular layout with a green check on every node, the left panel with tools, Add, Identity (Auto Identify, Add BiGG IDs, Review queue — all confirmed, Validate template — no problems), completeness 19/19 metabolites and 8/8 reactions identified, and Save as my version; the right panel shows the template metadata and the mitochondria compartment with fallback cytosol.](../assets/images/templates-design-mode.png)](../assets/images/templates-design-mode.png)
<figcaption markdown="span">The built-in *TCA cycle* in Template Design Mode. Green checks mark confirmed identities. Built-ins are read-only; *Save as my version* keeps the original unchanged.</figcaption>
</figure>

| Action | How |
| --- | --- |
| New metabolite | Double-click empty canvas, or the Metabolite tool (++m++); the identity search opens at once |
| Define or change an identity | Double-click the node, type a name or an identifier (`C00031`, `CHEBI:17634`, `MNXM…`, `cpd00027`), choose |
| New reaction | Drag from a node's outer ring to another node; drop on empty canvas to extend the chain |
| Reaction identity | Double-click the arrow: built-in reactions with the same participants, and MNXref / BiGG reactions (with the backend) |
| Cofactors | Inspector → *Stoichiometry* → *+ side compound* (part of the equation, not drawn) |
| Same metabolite twice | Inspector → *+ Instance*, or copy and paste the node: one biology, several drawings |
| Other compartment | Inspector → *Make independent*, then change its compartment |
| Link to another pathway | Select a metabolite → *+ Pathway link* (a port, never matched to model reactions) |
| Group, compartment box, labels | *Add* section of the left panel |
| How a node or arrow looks | Inspector → *Appearance*: label position, circle or text only, radius and fill colour for a metabolite; routing, curvature, *Reverse*, *Flip label* and *Auto label position* for a reaction. Saved in the template, so the map drawn from it looks the same |
| Fold the panels | Click a section title in either side panel to fold it; *Expand all* / *Collapse all* at the top |

## Defining identities

<figure class="gm-shot gm-medium" markdown>
![The "Define identity — template entity" dialog for the citrate node of the TCA template: display name, compartment, the current confirmed identity Citrate with KEGG C00158 and ChEBI 16947 and 30769, a search box with "Citrate", and candidates: Citrate (GEMs MAP library, BiGG, KEGG, MetaNetX) with MetaNetX, KEGG, ChEBI, BiGG and ModelSEED identifiers, followed by unrelated ChEBI hits such as "gallium citrate ga 67" and "citrate-coated silver nanoparticle".](../assets/images/templates-identity-dialog.png)
<figcaption>The identity search merges the GEMs MAP library, the BiGG tables, and KEGG and ChEBI resolved through MetaNetX. Free-text searches also return loosely related compounds, which is why a person confirms the identity.</figcaption>
</figure>

The search looks in the **GEMs MAP library** (offline), the **BiGG tables** (offline, if installed) and **KEGG and ChEBI** resolved through **MetaNetX** (online, through the backend; answers cached for 90 days). Each candidate shows its identifiers, formula, sources and why it matched. Without the backend the search uses the library only and says so.

**Identity statuses** belong to the template, not to any model:

| Status | Badge | Meaning |
| --- | --- | --- |
| confirmed | ✓ | Chosen or reviewed by a person (curated by hand for the built-ins) |
| suggested | ? | Proposed by a search, *Auto Identify* or AI; not reviewed |
| ambiguous | ! | Several plausible candidates stored; a person must choose |
| unresolved | ○ | Not defined |

A partial name hit (a substring) is never an identity; a suggestion needs an exact name, synonym or identifier.

- **Auto Identify** searches every entity that is not confirmed, by name and synonyms. **A confirmed identity is never changed** by Auto Identify or by any later suggestion. If a suggestion disagrees, the node keeps its identity and gets a red **!**, a *potential identity conflict*, with *Keep mine* / *Use the suggestion*.
- **Add BiGG IDs** adds `bigg.metabolite` / `bigg.reaction` identifiers, plus BiGG's cross-references, where exactly one BiGG entry fits and nothing contradicts the template. This lets templates match models downloaded from BiGG. Ties (for example `MDHf` / `MDHm`) are listed for you to choose; identifiers are added, never removed.
- The **Review queue** lists every element with its identity, status and source; click to select, *review* to open the search.

## Validating

**Validate template** lists issues; click one to select the element.

| Severity | Examples |
| --- | --- |
| Error | Invalid identifier syntax or EC number; a reaction without participants; an edge to a missing metabolite |
| Warning | Missing or ambiguous identity; the same entity twice in one compartment (draw instances instead); two entities sharing an identifier; an identifier that looks like a model ID (`g6p_c`, `C00031[c]`); an unbalanced reaction (heavy atoms, when all formulas are known); duplicate or contradictory reactions; an unconnected node; a potential identity conflict |
| Note | Suggested identities not yet reviewed; direction not stated; balance not checkable; an AI-generated template |

**Completeness** is two plain ratios and their mean: metabolites identified and reactions identified. "Identified" means at least one database identifier (or an EC number for a reaction) and a confirmed or suggested identity. Preferred compartments are optional and not part of the score: the person applying the template chooses compartments when several fit.

## Saving, exporting, applying

- **Save** (++ctrl+s++): your templates live in the browser (IndexedDB). A built-in is saved as *my version*; the original never changes. An unsaved template survives a workspace switch, and a browser reload offers to resume it.
- **Export** (++ctrl+e++) writes one self-contained `.gemsmap-template.json`: identities, annotations, topology, layout, compartments and metadata (version, scope, authors, license, citations). *Export figure of the template…* exports a picture.
- **Apply to GEM…** saves, switches to the Map Builder and opens the [mapping review](../maps/mapping-model-elements.md#pathway-templates) against the model loaded there.

The file format (schema 1.1) and all fields are documented in the [Template Builder technical notes](../TEMPLATE_BUILDER.md#file-format-reference-schema-100).

<div class="gm-next" markdown>
**Next:** [Sharing and reuse](sharing-and-reuse.md).
</div>
