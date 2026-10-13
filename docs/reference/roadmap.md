# Roadmap

<span class="gm-badge planned">Planned — not implemented</span>

This page lists features that are **planned or under consideration**. Nothing on this page is available in the current version; the rest of the documentation describes only what is implemented. Priorities can change.

## New features in development

### Solver selection

Today every simulation uses **COBRApy's default solver** in the backend environment (GLPK in a standard installation). The backend already detects which solvers are installed, and every result records the solver it used, but the interface offers no choice.

Planned:

- choose the solver in COBRAGUI (globally or per run) among the optlang interfaces installed in the backend environment, for example GLPK, Gurobi, CPLEX or optlang's hybrid HiGHS/OSQP interface;
- show the active solver next to the *Run* button, and keep recording it in each result's provenance;
- explain when a solver is unavailable, for example a commercial solver without a license.

Different solvers can return different optimal flux distributions for the same problem (see [alternative optima](../cobra-gui/metabolite-analysis.md#worked-example-pyruvate-in-iml1515)), and their tolerances differ. Comparisons between results computed with different solvers will say so, as they already do for different models or methods.

### Sampling methods in the analysis

GEMs MAP does not sample the flux space yet. Sampling distributions made elsewhere can already be imported into the Map Builder and shown as density or box plots, which is how the built-in example works.

Planned:

- **flux sampling** as a fourth kind of analysis in the Simulation section, with COBRApy's samplers (for example OptGP and ACHR), the number of samples, thinning and the fraction of optimum as options;
- progress and *Stop* like FVA, and results stored with full provenance (state, medium, sampler, parameters, seed);
- results as **distributions per reaction**: summaries in the Results tables, comparisons between conditions, and direct transfer to the Map Builder as density and box plots;
- guidance on interpretation: samples describe the feasible space under the constraints, they are not measurements, and their quality depends on convergence.

## COBRAGUI

- Gene knockout simulation (single and double deletions), complementing manual blocking of reactions.
- Better automatic layout for loosely connected sets of reactions sent to the map.

## Map Builder

- Rulers and lasso selection.
- Manual edge control points beyond the single bend handle; obstacle-avoiding routing.
- Multi-panel figure frames; editing legend text.
- WebGL rendering for very large maps.

## Templates

- *Generate with AI* inside the application, for example from a KEGG map or from an image of a pathway, under the safeguards described in [AI-assisted templates](../templates/ai-assisted-templates.md).
- A **template hub**: a searchable, versioned community library (see [Sharing and reuse](../templates/sharing-and-reuse.md#future-direction-a-community-template-library)).
- Escher maps published by BiGG as templates.
- More pathways: glyoxylate shunt, gluconeogenesis, serine/glycine, methionine/cysteine, branched-chain and aromatic amino acids, mevalonate, β-oxidation, oxidative phosphorylation.
- A testing workbench that applies one template to several GEMs side by side.
- *Find in COBRAGUI* from an open template slot.

## How this page is maintained

When a planned feature is implemented, it moves from this page into the relevant section of the documentation. The repository's `CHANGELOG.md` records what changed in each version.
