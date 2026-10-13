# Drawing pathways

There are three ways to put a pathway on the canvas, and they combine freely:

| Approach | Best for | How |
| --- | --- | --- |
| **Insert a template** | Standard pathways (glycolysis, TCA, PPP…) with a recognisable layout | *Elements → Pathway templates*, then review the mapping and click where it goes. See [Linking a map to a model](mapping-model-elements.md#pathway-templates) and [Templates](../templates/index.md). |
| **Grow from the model** | Exploring a neighbourhood, or drawing exactly the reactions a result highlights | Add a metabolite, then its connected reactions; expand upstream / downstream; find paths and routes; or *Add to Map* from COBRAGUI. |
| **Draw by hand** | Custom figures, schemes, or a layout before any model is loaded | Metabolites, slots, arrows and text with the tools. |

## Metabolites and slots

- **Double-click** empty canvas, or use the **Metabolite** tool (++m++), to add a metabolite. With a model loaded, a search dialog binds the new node to a model metabolite.
- A **slot** (++s++, a dashed circle) is a node that is not bound yet. Slots and free arrows can be drawn before any model exists. Each slot can carry compartment-free hints (`g6p`, `glucose 6-phosphate`) so that it binds later; see [Slots and auto-bind](mapping-model-elements.md#slots-and-auto-bind).
- **Appearance** (inspector): label shows the global setting, the ID, the model name or your own text; label position; radius; style *normal*, *exchange* (for boundary metabolites) or *text only*; fill colour; *Locked*.

## Reactions (arrows)

- **Drag from a node's outer ring** to another node to draw an arrow. Dropping on empty canvas creates a new slot and extends the chain, so a linear pathway can be sketched in a few drags. The **Reaction** tool (++r++) does the same.
- An arrow between two bound metabolites is **bound to the model reaction that links them**. If no single reaction does, a series of two reactions can be shown as one *lumped* arrow (for example `ACONTa + ACONTb`, the two half-reactions of aconitase).
- An arrow drawn **against the stoichiometric direction** of its reaction is flagged in the inspector, and its flux sign is flipped for display. *Reverse* turns the arrow around.
- **Participants.** For reactions with many metabolites, the inspector lists which substrates and products this arrow shows; untick one to hide it from this arrow only (the model reaction is unchanged). A `+N` marker on the canvas counts hidden participants. Cofactors are handled separately (below).
- **Routing**: straight, curved (drag the bend handle, or set the curvature) or orthogonal; **line** solid or dashed (dashed is typical for exchange and transport); *Flip label* and *Auto label position*.
- If several arrows draw the same model reaction, the inspector offers **Merge into one arrow**.

## Growing a map from the model

- **Model tab → search**: find metabolites and reactions by ID, name, gene, EC number or pathway; *+* adds a metabolite, or a reaction with its metabolites.
- **Connected reactions.** Select a metabolite: the inspector lists all its model reactions as chips, marked ↑ produces and ↓ consumes (by the written equation). Hover a chip for its name, equation, genes and bounds; click it to add the reaction. With flux data loaded, *Hide zero-flux reactions* keeps only reactions with flux in at least one condition.
- An added reaction brings **its own copies** of its other metabolites; it never silently connects itself to nodes drawn elsewhere. Extra participants start hidden. To join a copy with an existing node of the same metabolite, **drag it onto that node**: a green ring shows *release to merge*.
- **Upstream / Downstream** (inspector, floating toolbar or right-click) adds the reactions around a metabolite: one step from the inspector and the toolbar; 1 or 2 steps upstream and 1, 2 or 5 steps downstream from the right-click menu.
- **Find metabolic path…** (Model tab) draws a shortest path between two metabolites.
- **Routes.** Select a free arrow whose two ends are bound (for example glucose → pyruvate) and choose **Find routes**. The model's alternative routes are listed, shortest first. *Insert* draws every reaction of a route, with new copies of the intermediate metabolites; *Collapsed* inserts the route as one summary arrow. With flux data, *Only routes that carry flux* keeps routes whose every reaction carries flux in the direction the route uses it, in a chosen condition or in any condition.
- From COBRAGUI, **Add to Map** sends reactions, metabolites, a whole subsystem or a selection, laid out automatically. Reactions arrive as a preview that follows the mouse: click where the block goes (++esc++ cancels).

Currency metabolites (ATP, NAD(P)H, H₂O, H⁺, phosphate, CoA, CO₂, O₂, NH₄⁺, …) are skipped when expanding and path-finding, so paths follow carbon rather than shared cofactors. Enzyme pseudo-metabolites of enzyme-constrained models (`prot_…`, `pmet_…`) are never drawn.

## Collapsing detail into one arrow

Select several arrows, or just two metabolites, and choose **Collapse into one arrow**. The sub-network is stored inside one **summary arrow**, and **Expand** restores it. The summary arrow's flux defaults to the **net flux entering the segment**: the sum for parallel reactions, the through-flux for a chain. Sum, mean, minimum and maximum are also available. Use this to simplify a figure without losing what is behind an arrow.

## Layouts, alignment and tidying

With several items selected, the inspector (and the floating toolbar) offers:

| Layout | Use |
| --- | --- |
| Vertical / Horizontal | Linear pathways (glycolysis). |
| Circle | Cycles (TCA, urea cycle). Options: clockwise or counter-clockwise, start east, fixed diameter. |
| Hierarchical | Branching pathways, flowing in one direction. |
| Grid | Many unrelated items. |
| Organic | Force-directed arrangement of a network. |

*Spacing* sets the distance used by the layouts; *Tidy selection* straightens nearly aligned items; *Align & distribute* lines up edges and centres. Layouts only move what is selected.

## Groups, compartments and annotations

- ++ctrl+g++ groups the selection as a **pathway** (with a title); *Group as compartment* draws a compartment box. Groups move as one; *Ungroup* (++ctrl+shift+g++) releases them.
- *Elements → Annotations* adds a **panel label** (a, b, c…), a **figure title**, a **pathway label** or a **compartment box**. Text items have their own size, weight and colour; double-click to edit.

## Styles

The figure inspector (nothing selected) sets the look of the whole figure:

- **Style preset**: *Nature clean*, *Cell graphical*, *Minimal*, *Presentation*, *Dark*, *Print grayscale*. Presets change appearance only, never the data.
- **Labels**: metabolites and reactions by ID, name or none; *Show flux values* next to arrows; **cofactors** hidden or as **inline text** beside their arrow.
- **Sizes**: node radius, edge width, font size, reaction label size.

<div class="gm-next" markdown>
**Next:** [Link the map to a model](mapping-model-elements.md), then [show results on it](displaying-and-comparing-results.md).
</div>
