# Glycolysis / Gluconeogenesis (KEGG map00010) — quality check

## Validation

```text
Errors:    0
Warnings:  0
Notes:     47
Completeness: metabolites 40/40 · reactions 31/31 · compartments 0/40 · overall 100%
Identities: confirmed 24 · suggested high 13 · suggested probable 3 · ambiguous 0 · unresolved 0 · generic 3
```

## Visual QC

```text
Drawing:                24 metabolite nodes, 49 attached cofactors, 31 arrows, 4 pathway ports, 1234 × 1372 px
Label overlaps:         0
Arrows through labels:  0
Arrow crossings:        0
Cofactor crossings:     0
Cofactor curves through labels: 0
Disconnected nodes:     0
Long arrows (> 280 px): 0
Nodes in a foreign box: 0
```

## Mapping comparison with the built-in "Glycolysis"

Nodes = drawn metabolites mapped / total; Core = required metabolites; Arrows = template reactions found in the model;
Amb = ambiguous metabolites (a person chooses); Prov = provisional matches.

```text
Model                Template                           Nodes   Core    Arrows  Amb  Prov  Quality
e_coli_core          Glycolysis / Gluconeogenesis (KEGG 15/23   11/12   18/31   0    1     medium
                     Glycolysis                         12/13   10/11   11/12   0    0     high
                     shared metabolites: 12 same choice, 1 different (tpl_met_014: — vs lac__D_c)
iJO1366              Glycolysis / Gluconeogenesis (KEGG 19/23   12/12   25/31   0    0     high
                     Glycolysis                         13/13   11/11   12/12   0    0     high
                     shared metabolites: 13 same choice, 0 different
seed_core            Glycolysis / Gluconeogenesis (KEGG 15/23   11/12   18/31   0    1     medium
                     Glycolysis                         12/13   10/11   11/12   0    0     high
                     shared metabolites: 12 same choice, 1 different (tpl_met_014: — vs cpdx0045_c0)
kegg_names           Glycolysis / Gluconeogenesis (KEGG 15/23   11/12   18/31   0    15    medium
                     Glycolysis                         12/13   10/11   11/12   0    12    medium
                     shared metabolites: 12 same choice, 1 different (tpl_met_014: — vs m0046_c)
```

