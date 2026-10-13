# Medium, bounds and objective

A constraint-based simulation answers a question that is defined by three things: **what the cell can take up** (the medium), **how far each reaction may run** (its bounds), and **what is optimised** (the objective). COBRAGUI keeps these settings in named **model states**, so the question behind every result stays explicit and a second scenario is one click away.

## Model states

A *model state* is a set of changes on top of the imported model: reaction bounds that differ from the file, and optionally a different objective. The imported model itself is never modified.

- The **State** button in the top bar shows the active state (*Base model* after import) and lists all states: switch, rename, duplicate, delete, *New state from the model file*, *Compare states…*.
- **Duplicate state** is the quickest way to prepare a comparison: duplicate, change one condition (for example close oxygen uptake), and run the same method again.
- The **Modified · n** button lists every change of the active state with time, old → new value and note. It offers *Undo*, *Redo*, *Revert* (back to the model file), *Export modifications* (a JSON file of bounds, objective and change history) and *Save as model…*.
- Each result remembers the exact state it was computed with; *Restore configuration* on a result creates a state with that configuration again.

<figure class="gm-shot" markdown>
[![The Medium section of iML1515: preset buttons (Model file, Minimal, Rich, Anaerobic, Save current as preset), a search box, a switch between "Available only", "All exchanges" and "All boundary", and a table of compounds with their exchange reaction, maximum uptake, maximum secretion and the model-file value; D-glucose (EX_glc__D_e) has a maximum uptake of 10.](../assets/images/cobra-gui-medium-annotated.png)](../assets/images/cobra-gui-medium-annotated.png)
<figcaption markdown="span">The medium stored in the iML1515 file: 24 compounds may be taken up; glucose is limited to 10 mmol gDW⁻¹ h⁻¹, the other compounds (including O₂) to 1000, which is effectively unlimited.</figcaption>
</figure>

<ol class="gm-callouts" markdown>
<li><strong>Presets</strong>: model file, minimal, rich, anaerobic, and your own.</li>
<li><strong>Which rows</strong>: compounds available in the medium, all exchange reactions, or all boundary reactions.</li>
<li><strong>Maximum uptake</strong>: type a value and press Enter; empty means unbounded (∞).</li>
</ol>

## Medium

The medium is the set of **uptake limits of exchange reactions**, read and written through COBRApy's `model.medium`. The table lists each compound with its exchange reaction, maximum uptake, maximum secretion and the value in the model file (highlighted when changed). Untick a compound to forbid its uptake; edit *Max uptake* to change the limit. Values are in mmol gDW⁻¹ h⁻¹ and must be ≥ 0.

!!! info "Sign convention"
    In COBRApy an exchange reaction is written `X <=>`, so a **negative** flux imports X. Uptake limits are therefore stored as negative lower bounds. GEMs MAP shows uptake and secretion as positive amounts and leaves the sign convention to COBRApy, so it is never re-derived in the interface. Medium edits are stored in the model state as ordinary bound changes.

| Preset | What it does |
| --- | --- |
| **Model file** | Restores the uptake limits of the imported file. |
| **Minimal** | COBRApy `minimal_medium`: the smallest **total uptake flux** that still reaches the current optimum of the objective, and sets the limits to exactly those fluxes. It minimises total uptake, not the number of compounds. Fails with an explanation if the objective cannot carry flux. |
| **Rich** | Every exchange reaction allows an uptake of at least 10 mmol gDW⁻¹ h⁻¹. |
| **Anaerobic** | The current medium with oxygen uptake closed. Oxygen exchanges are recognised by metabolite ID, formula `O2` or name; if none is found, you are asked to close it by hand. |
| **Your presets** | *Save current as preset* stores the current medium under a name, per model. |

Only exchange reactions belong to COBRApy's medium. Demand and sink reactions are listed under *All boundary*, but their bounds are edited like any other reaction.

## Reaction bounds

Every reaction has a lower and an upper bound (`lb ≤ v ≤ ub`). An empty bound means unbounded (−∞ or ∞). Many models use ±1000 as a practical "unbounded" value.

- In the **inspector** of a reaction: edit *Lower* and *Upper*, then *Apply*. *Block* sets both to 0; *Allow reversible* sets the bounds to ±(the largest bound used in the model, typically ±1000); *Reset original* restores the file values. When a bound differs from the file, the inspector shows *original → current*.
- In the **Explorer** table: double-click an LB or UB cell. Modified cells are highlighted; the *modified* filter and the *Modified bounds* view list them all.
- On a **selection** of reactions: *Block…* (with a confirmation) or *Reset bounds*.

A lower bound greater than the upper bound is refused. Changing bounds can make the problem infeasible; the simulation then reports it instead of returning fluxes (see [Solver status](constraint-based-analysis.md#solver-status-when-there-is-no-answer)).

## Objective

The **objective** is the linear function the optimisation maximises or minimises, usually a biomass reaction.

- *Change objective* (Overview, Simulation, or the command palette) opens the editor: add reactions by searching their ID or name, set a weight for each term, and choose **Maximize** or **Minimize**. Multi-term objectives are allowed, for example `1 × biomass + 0.2 × product export`. *Advanced: edit as text* accepts `reaction:weight` pairs.
- *Set as objective* in a reaction's inspector replaces the objective by that single reaction.
- *Reset to model objective* returns to the objective stored in the file.

The objective is part of the model state and of the provenance of each result. A result's objective value is always the value of this function for the returned fluxes (for pFBA, see the [note on reported values](constraint-based-analysis.md#pfba-parsimonious-fba)).

## Saving the modified model

*Save as model…* (in the *Modified* menu, or the command palette) writes a **new** SBML, COBRA JSON or MATLAB file with the active state applied permanently, plus any [structural edits](editing-models.md) and [metabolite curation](metabolite-analysis.md#curating-identifiers-with-metanetx). The notes of the exported model record the edits and the curation with the original file name and checksum. The imported file is never touched.

<div class="gm-next" markdown>
**Next:** [Edit the model structure](editing-models.md), or go straight to [running a simulation](constraint-based-analysis.md).
</div>
