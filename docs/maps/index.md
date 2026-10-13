# Maps

The **Map Builder** is a visual design canvas for metabolic networks. You draw or insert pathways the way you would arrange shapes in a drawing tool: click, drag, align, group, style. Underneath, every node and arrow can be bound to a metabolite or reaction of the loaded model, so data from COBRAGUI, or from a file, colour and size the figure correctly.

<figure class="gm-shot" markdown>
[![The Map Builder with the Global central carbon metabolism template placed on E. coli iML1515 and coloured by an aerobic pFBA result: glycolysis drawn vertically with thick arrows from GAPD to ENO, the oxidative pentose phosphate pathway to the left, a circular TCA cycle; numbered callouts mark the left panel, the canvas, the inspector and the condition bar.](../assets/images/maps-iml1515-pfba-annotated.png)](../assets/images/maps-iml1515-pfba-annotated.png)
<figcaption markdown="span">The *Global central carbon metabolism* template placed on iML1515 and coloured by the aerobic pFBA result. Arrow width and colour encode |flux|; the yellow **?** on `r5p` marks a mapping that still needs a review.</figcaption>
</figure>

<ol class="gm-callouts" markdown>
<li><strong>Left panel</strong>: <em>Elements</em> (tools, templates, annotations), <em>Model</em> (search the GEM, find paths) and <em>Data</em> (datasets, conditions, visual mappings).</li>
<li><strong>Canvas</strong>: infinite, with zoom, grid, smart guides and a minimap.</li>
<li><strong>Inspector</strong>: properties of the selection, or of the whole figure when nothing is selected.</li>
<li><strong>Condition bar</strong>: switch, animate and compare conditions.</li>
</ol>

## Your first five minutes in the canvas

This is a short orientation, not the full tutorial. The [canvas page](canvas-and-side-panel.md) covers each control in detail.

1. **Open the example.** *File → Open example (central carbon metabolism)* loads the built-in figure shown on the [home page](../index.md). Press ++f++ to fit it to the window.
2. **Move around.** Press ++c++ (the hand) and drag to move the map, press ++v++ to go back to selecting, and use the **mouse wheel** to zoom. Switching between ++c++ and ++v++ is the recommended way to work (see the tip below). The minimap in the corner shows where you are.
3. **Select and move.** Click a metabolite or an arrow; drag to move it; drag on empty canvas to select several. Arrows follow the nodes they connect, and smart guides help you align them.
4. **Inspect.** With one item selected, the inspector on the right shows its model identity, its value in each condition, and its appearance. Click empty canvas to see the settings of the whole figure.
5. **Switch condition.** Click *P10*, *P12*, *P26* or *P28* in the bottom bar (or press ++bracket-left++ / ++bracket-right++) and watch widths, colours and plots change. Press ▶ to animate.
6. **Undo anything** with ++ctrl+z++.
7. **Start your own.** *File → New project*, then insert a pathway template from the *Elements* tab, or draw: double-click the canvas for a metabolite, drag from a node's outer ring to draw a reaction.

!!! tip "Move with C, work with V, zoom with the wheel"
    This habit is fundamental in the Map Builder. ++c++ turns the pointer into a **hand**: drag anywhere to move around, without selecting or moving anything by accident. ++v++ brings back the **Select** tool to work on the map. The **mouse wheel** zooms around the pointer. Keep one hand on the keyboard and switch between ++c++ and ++v++ all the time; holding ++space++ while dragging, or dragging with the right or middle mouse button, also moves the view.

## Design principles

A pathway map is a **communication device**. Four principles keep it scientifically honest.

**1. A layout is an abstraction, not the cell.** Glycolysis is drawn as a vertical chain and the TCA cycle as a circle because readers recognise those shapes. Positions on the canvas carry no spatial meaning, and GEMs MAP never moves your nodes when data or models change. Compartments drawn as boxes are visual groupings that you choose.

**2. A metabolite may be drawn many times.** Cofactors such as ATP, NAD(H) or H₂O take part in hundreds of reactions; connecting all of them to a single node would turn any figure into a hairball. GEMs MAP hides these *currency metabolites* by default (ATP, ADP, NAD(P)(H), H₂O, H⁺, phosphate, CoA, CO₂, O₂, NH₄⁺ and similar, recognised by ID and name), can show them as small text beside the arrow, and lets you draw any metabolite more than once. Every drawing still points to the **same model metabolite**, so all copies show the same data.

![Diagram: two drawings of ATP beside the HEX1 and PFK arrows both refer to the model metabolite atp_c; the ATP produced by ATP synthase in the mitochondrion refers to atp_m; atp_c and atp_m are the same chemical entity, ATP (KEGG C00002), in different compartments.](../assets/diagrams/visual-instances.svg){ .gm-diagram }

**3. Identity is not the label.** A node's label is editable text for the reader. What the node *is* comes from its binding to a model metabolite, whose ID is only unique inside that model, and from the annotations of that metabolite. The same chemical in another compartment is a different model metabolite: `pyr_c` and `pyr_p` are not interchangeable. When a template is applied, this identity is resolved and shown with its evidence (see [Identity and matching](../templates/identity-and-matching.md)).

**4. An arrow is not a measured flux.** An arrow drawn on the canvas represents a model reaction, or nothing at all until it is bound. Its direction and thickness come from data you load, never from the drawing. With flux data, the arrowhead follows the **sign of the flux** in the active condition, zero flux is drawn thin and grey, and values come from a model simulation or a file, not from a measurement, unless your data say otherwise. An arrow drawn against the stoichiometric direction of its reaction is flagged, and its flux sign is flipped for display.

## In this section

<div class="grid cards" markdown>

-   [**Canvas and side panels**](canvas-and-side-panel.md)

    The window, navigation, selection, the inspector, shortcuts.

-   [**Drawing pathways**](drawing-pathways.md)

    Metabolites, reactions, connected reactions, routes, layouts, groups, labels and styles.

-   [**Linking a map to a model**](mapping-model-elements.md)

    Binding nodes and arrows to a GEM, templates, slots, unbound elements.

-   [**Displaying and comparing results**](displaying-and-comparing-results.md)

    Datasets, conditions, mappings to width and colour, comparisons, mini-plots, legend, animation.

-   [**Saving and exporting**](saving-and-exporting.md)

    Projects, autosave, SVG, PNG, PDF and animated GIF.

</div>
