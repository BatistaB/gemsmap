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

### Flux sampling: next steps

Flux sampling runs in COBRAGUI since this release (COBRApy's OptGP and ACHR samplers, with progress, *Stop & keep*, distributions in Results and samples datasets in the Map Builder; see [Flux sampling](../cobra-gui/constraint-based-analysis.md#flux-sampling)). Planned next:

- comparing two sampling results in COBRAGUI (shift of each reaction's distribution, overlap), not only as conditions on the map;
- convergence diagnostics for the samples, and guidance on how many samples and how much thinning a model needs.

## COBRAGUI

- Gene knockout simulation (single and double deletions), complementing manual blocking of reactions.
- Better automatic layout for loosely connected sets of reactions sent to the map.

## Map Builder

- Rulers and lasso selection.
- Manual edge control points beyond the single bend handle; obstacle-avoiding routing.
- Multi-panel figure frames; editing legend text.
- WebGL rendering for very large maps.

## Templates

- A **template hub**: a searchable, versioned community library (see [Sharing and reuse](../templates/sharing-and-reuse.md#future-direction-a-community-template-library)).
- Escher maps published by BiGG as templates.
- More pathways: glyoxylate shunt, gluconeogenesis, serine/glycine, methionine/cysteine, branched-chain and aromatic amino acids, mevalonate, β-oxidation, oxidative phosphorylation.
- A testing workbench that applies one template to several GEMs side by side.
- *Find in COBRAGUI* from an open template slot.

## How this page is maintained

When a planned feature is implemented, it moves from this page into the relevant section of the documentation. The repository's `CHANGELOG.md` records what changed in each version.
