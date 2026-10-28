# Glossary

Annotation
:   Cross-references attached to a model metabolite, reaction or gene, for example `kegg.compound: C00031` or `chebi: CHEBI:17634`. They connect a model-specific ID to shared databases. See [Metabolite analysis](../cobra-gui/metabolite-analysis.md#curating-identifiers-with-metanetx).

Bounds
:   The lower and upper limits of a reaction's flux, \(lb \le v \le ub\). An irreversible reaction has \(lb = 0\); a blocked one has \(lb = ub = 0\). Many models use ±1000 as "unbounded". See [Medium, bounds and objective](../cobra-gui/constraints.md#reaction-bounds).

COBRA, COBRApy
:   COnstraint-Based Reconstruction and Analysis, the family of methods for genome-scale models; [COBRApy](https://opencobra.github.io/cobrapy/) is its Python implementation, which runs every simulation in GEMsMAP.

Compartment
:   A cellular location in a model (cytosol, mitochondrion, periplasm, extracellular space…). The same chemical in two compartments is two different model metabolites (`pyr_c`, `pyr_p`). Templates use *conceptual* compartments (cytosol, mitochondria…) with fallbacks.

Constraint-based modelling
:   Describing what a metabolic network *can* do with constraints (mass balance, bounds) instead of kinetic equations, and analysing that space by optimisation. See [Constraint-based analysis](../cobra-gui/constraint-based-analysis.md).

Currency metabolite (cofactor)
:   A metabolite that takes part in very many reactions, such as ATP, ADP, NAD(P)(H), H₂O, H⁺, phosphate, CoA, CO₂, O₂ or NH₄⁺. GEMsMAP hides them in maps, path-finding and the local network by default.

Entity (template entity)
:   In a template, the chemical a node stands for, identified by names, formula and database identifiers, independently of any model. See [Identity and matching](../templates/identity-and-matching.md).

Exchange, demand and sink reactions
:   Boundary reactions with metabolites on one side only. An *exchange* connects an extracellular metabolite to the environment (uptake or secretion); a *demand* irreversibly removes a metabolite; a *sink* supplies or removes one artificially. GEMsMAP follows COBRApy's definitions.

FBA (flux balance analysis)
:   Linear programming that maximises or minimises an objective subject to \(S v = 0\) and the bounds. Returns one optimal flux vector, usually one of many.

Flux
:   The rate of a reaction, in mmol gDW⁻¹ h⁻¹ (millimoles per gram dry weight per hour) in genome-scale models. The sign gives the direction relative to the written equation.

FVA (flux variability analysis)
:   For each reaction independently, the minimum and maximum flux compatible with the constraints at (a fraction of) the optimal objective. Intervals are not a joint flux distribution.

GEM (genome-scale metabolic model)
:   A model of an organism's metabolism with its reactions, metabolites, genes and gene–reaction rules, usually reconstructed from the genome and literature, for example *E. coli* iML1515.

Gene–reaction rule (GPR)
:   A Boolean rule linking genes to a reaction, for example `b3916 or b1723` (isozymes) or `b0726 and b0727` (subunits of a complex).

Identifier mapping
:   Finding, for each node of a template, the model metabolite or reaction that represents the same biochemical entity. GEMsMAP does this with a scored, evidence-based matcher and a review dialog.

Loopless FBA
:   An optimal flux distribution without thermodynamically infeasible internal cycles (COBRApy `loopless_solution`, CycleFreeFlux).

Mapping profile
:   Your confirmed template mappings for one model (`entity @ compartment → model metabolite`), reused by every template on that model and never on another.

Medium
:   The uptake limits of a model's exchange reactions (COBRApy `model.medium`): which compounds the cell can take up, and how fast.

Metabolite
:   A chemical species in a compartment of a model, with an ID, name, formula and charge.

Model state
:   In GEMsMAP, a named set of bound changes and an optional objective on top of the imported model, such as *Base model* or *Anaerobic*.

Objective
:   The linear function an optimisation maximises or minimises, typically a biomass reaction representing growth.

pFBA (parsimonious FBA)
:   FBA followed by minimisation of the total absolute flux at (a fraction of) the optimum.

Reaction
:   A transformation of metabolites with a stoichiometry, bounds, and optionally a gene–reaction rule, subsystem and EC numbers.

Slot
:   An unbound node on a map: a placeholder to be bound to a model metabolite later.

Stoichiometric matrix (S)
:   A matrix with one row per metabolite and one column per reaction, holding the coefficients of each metabolite in each reaction (negative for substrates, positive for products).

Subsystem
:   A pathway label attached to reactions in many models (for example *Citric Acid Cycle*).

Template
:   A reusable pathway layout that stores biological identity and topology, not model IDs. See [Templates](../templates/index.md).

Turnover (metabolite)
:   In GEMsMAP, \(\tfrac{1}{2}\sum_j |S_{ij} v_j|\): the total production (= consumption) rate of a metabolite in one flux solution. A derived proxy, not a concentration.
