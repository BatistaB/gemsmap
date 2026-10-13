# First look

Start GEMs MAP with the `gemsmap` command (or *Start GEMs MAP* in the zip folder; see [Installation](installation.md)). It opens in your browser, in **COBRAGUI**. The switcher at the top left moves between the three workspaces; each keeps its state while you work in another.

## COBRAGUI

Without a model, COBRAGUI shows a drop zone. Drop an SBML, COBRA JSON or MATLAB model, click *Import model*, or try one of the two models bundled with COBRApy. After the import, the **Overview** summarises the model and its validation notes.

<figure class="gm-shot" markdown>
[![The COBRAGUI overview of iML1515 with numbered callouts.](../assets/images/cobra-gui-overview-annotated.png)](../assets/images/cobra-gui-overview-annotated.png)
<figcaption>COBRAGUI after importing <em>E. coli</em> iML1515.</figcaption>
</figure>

<ol class="gm-callouts" markdown>
<li>Workspace switcher.</li>
<li>The sections of an analysis, top to bottom.</li>
<li>The active model state (scenario), its modifications and structural edits.</li>
<li>Run the selected method.</li>
<li>The model card.</li>
<li>The inspector, filled by whatever you click.</li>
<li>Backend and solver, active results, zero threshold, activity log.</li>
</ol>

Continue with [COBRAGUI](../cobra-gui/index.md).

## Map Builder: Maps

The Map Builder opens with an **empty canvas** that suggests how to begin. Its button *Open the central carbon demo* (also *File → Open example*) loads the built-in figure with simulated fluxes and flux-sampling distributions for four conditions, the kind of figure GEMs MAP is designed for. If you have worked before, a welcome banner offers to continue your last session.

<figure class="gm-shot" markdown>
[![An empty Map Builder canvas with the hint "Start a pathway figure: double-click to add a metabolite, M metabolite tool, S empty slot, drag from a node's outer ring to draw a reaction, drop on empty space to extend the chain, or insert a template from the left panel, Ctrl K for everything", and a button "Open the central carbon demo".](../assets/images/maps-empty-canvas.png)](../assets/images/maps-empty-canvas.png)
<figcaption>An empty project in the Map Builder.</figcaption>
</figure>

!!! tip "Move with C, work with V, zoom with the wheel"
    This is the most important habit in the Map Builder, and the way it is meant to be used:

    - ++c++ turns the pointer into a **hand**: drag anywhere to move around the map, without selecting or moving anything by accident.
    - ++v++ brings back the **Select** tool: click, drag and box-select to work on the map.
    - The **mouse wheel** zooms in and out around the pointer; ++f++ fits the whole figure in the window.

    Keep one hand on the keyboard and switch between ++c++ and ++v++ all the time. Holding ++space++ while dragging, or dragging with the right or middle mouse button, also moves the view.

Continue with [Maps](../maps/index.md) and its *first five minutes in the canvas*.

## Templates

The third workspace lists the pathway templates and opens them in Template Design Mode. Templates describe *what* each molecule is; applying one to a model happens in the Map Builder.

Continue with [Templates](../templates/index.md).

## Getting help inside the app

- ++ctrl+k++ opens the command palette in every workspace: search the model, the figure or the commands.
- ++question++ lists the Map Builder shortcuts.
- Many controls explain themselves in a tooltip; *Learn more* on each simulation method gives its definition.
- The **Activity log** in the COBRAGUI status bar records imports, runs, exports and errors.

<div class="gm-next" markdown>
**Next:** [Import a model](../cobra-gui/importing-models.md).
</div>
