# Pentose phosphate pathway (KEGG map00030) — generation report

Source: KEGG map00030 (Pentose phosphate pathway), https://www.genome.jp/pathway/map00030. The biology was taken from KEGG's flat files and KGML;
the drawing is GEMsMAP's own and is **not** an official KEGG map. Status: **AI-generated — needs review**.

## Completeness

```text
KEGG compounds handled:         37/37  (entities 30, related forms 3, omitted with reason 4)
Template entities:              46  (pathway metabolites 31, cofactors / carriers 17)
MetaNetX mapped:                46
BiGG mapped:                    42
ModelSEED mapped:               45
ChEBI mapped:                   46
MetaCyc mapped:                 44

Confirmed (GEMsMAP library):     18
Suggested, high confidence:     26
Suggested, probable:            2
Ambiguous metabolites:          0
Unresolved metabolites:         0
Generic entities:               2  (Quinone, Hydroquinone)

KEGG reactions handled:         59/59  (drawn steps 34, represented 1, variants 12, omitted 12)
Template reactions:             34
Cross-database mapped reactions: 34  (MetaNetX 34, BiGG 25, ModelSEED 33, Rhea 29)
Ambiguous reactions:            0
Unresolved reactions:           0
```

## Review queue

| Kind | Element | Status | Why |
| --- | --- | --- | --- |
| entity | Quinone | suggested (probable) · generic | KEGG C15602; MetaNetX MNXM1776 |
| entity | Hydroquinone | suggested (probable) · generic | KEGG C15603; MetaNetX MNXM4100; BiGG hqn |
| reaction | GDH (glucose dehydrogenase (quinone, PQQ)) | suggested (probable) | KEGG R00305; MetaNetX MNXR106464 |
| reaction | KGUD (2-ketogluconate-6-phosphate reductase) | suggested (probable) | KEGG R02034; MetaNetX MNXR102540; curator: KGML lists R02034 as irreversible in the oxidative direction (6P-gluconate → 2-keto-6P-gluconate), but the 2-ketogluconate route (Pseudomonas KguD) reduces 2-keto-6P-gluconate to 6P-gluconate; drawn in the physiological direction, reversibility left open |

## Reactions without a BiGG cross-reference

Not an error: BiGG's universal namespace has no verified reaction with these participants (bacterial PTS, archaeal / plant
enzymes, phosphatases). The matcher still finds them in a model by MetaNetX / ModelSEED / EC and topology.

| Step | Enzyme | KEGG | MetaNetX |
| --- | --- | --- | --- |
| GDH | glucose dehydrogenase (quinone, PQQ) | R00305 | MNXR106464 |
| GNL | gluconolactonase | R01519 | MNXR147357 |
| GADH | gluconate 2-dehydrogenase | R01741 | MNXR192085 |
| GAD | gluconate dehydratase | R01538 | MNXR139050 |
| KDGA | 2-keto-3-deoxygluconate aldolase | R08570 | MNXR139622 |
| HPS | 3-hexulose-6-phosphate synthase | R05338 | MNXR109495 |
| PHI | 6-phospho-3-hexuloisomerase | R05339 | MNXR109496 |
| SHPK | sedoheptulokinase | R01844 | MNXR147449 |
| R15PI | ribose 1,5-bisphosphate isomerase | R10555 | MNXR191187 |

## KEGG compounds

| KEGG | Name | In the template |
| --- | --- | --- |
| C00022 | Pyruvate | template entity |
| C00031 | D-Glucose | template entity |
| C00085 | D-Fructose 6-phosphate | template entity |
| C00117 | D-Ribose 5-phosphate | template entity |
| C00118 | D-Glyceraldehyde 3-phosphate | template entity |
| C00119 | 5-Phospho-alpha-D-ribose 1-diphosphate | template entity |
| C00121 | D-Ribose | template entity |
| C00197 | 3-Phospho-D-glycerate | omitted — 3-phosphoglycerate: product of GAPN, a glycolysis step drawn in the Glycolysis / Gluconeogenesis template |
| C00198 | D-Glucono-1,5-lactone | template entity |
| C00199 | D-Ribulose 5-phosphate | template entity |
| C00204 | 2-Dehydro-3-deoxy-D-gluconate | template entity |
| C00221 | beta-D-Glucose | related form of a template entity (anomer / specific form) |
| C00231 | D-Xylulose 5-phosphate | template entity |
| C00257 | D-Gluconic acid | template entity |
| C00258 | D-Glycerate | template entity |
| C00279 | D-Erythrose 4-phosphate | template entity |
| C00345 | 6-Phospho-D-gluconate | template entity |
| C00354 | D-Fructose 1,6-bisphosphate | omitted — fructose 1,6-bisphosphate: PFK / FBPase / aldolase are glycolysis steps, drawn in the Glycolysis / Gluconeogenesis template (port at fructose-6P and GAP) |
| C00577 | D-Glyceraldehyde | template entity |
| C00620 | alpha-D-Ribose 1-phosphate | template entity |
| C00631 | 2-Phospho-D-glycerate | template entity |
| C00668 | alpha-D-Glucose 6-phosphate | related form of a template entity (anomer / specific form) |
| C00672 | 2-Deoxy-D-ribose 1-phosphate | template entity |
| C00673 | 2-Deoxy-D-ribose 5-phosphate | template entity |
| C01151 | D-Ribose 1,5-bisphosphate | template entity |
| C01172 | beta-D-Glucose 6-phosphate | related form of a template entity (anomer / specific form) |
| C01182 | D-Ribulose 1,5-bisphosphate | template entity |
| C01218 | 6-Phospho-2-dehydro-D-gluconate | template entity |
| C01236 | D-Glucono-1,5-lactone 6-phosphate | template entity |
| C01801 | Deoxyribose | template entity |
| C02076 | Sedoheptulose | template entity |
| C03752 | 2-Amino-2-deoxy-D-gluconate | omitted — glucosaminate: amino-sugar acid catabolism of a few bacteria entering ED at KDG / KDPG; left out to keep the map readable |
| C04442 | 2-Dehydro-3-deoxy-6-phospho-D-gluconate | template entity |
| C05382 | Sedoheptulose 7-phosphate | template entity |
| C06019 | D-arabino-Hex-3-ulose 6-phosphate | template entity |
| C06473 | 2-Keto-D-gluconic acid | template entity |
| C20589 | D-Glucosaminate-6-phosphate | omitted — glucosaminate 6-phosphate: same glucosaminate route (PTS) |

## KEGG reactions

| KEGG | In the template |
| --- | --- |
| R00305 | drawn step GDH |
| R00756 | omitted — 6-phosphofructokinase: glycolysis step, drawn in the Glycolysis / Gluconeogenesis template |
| R00762 | omitted — fructose-1,6-bisphosphatase: gluconeogenesis step, drawn in the Glycolysis / Gluconeogenesis template |
| R00764 | omitted — PPi-dependent PFK: glycolysis step (variant of PFK in the Glycolysis / Gluconeogenesis template) |
| R01049 | drawn step PRPS |
| R01051 | drawn step RBK |
| R01056 | drawn step RPI |
| R01057 | drawn step PPM |
| R01058 | omitted — non-phosphorylating GAPN: glycolysis step, drawn in the Glycolysis / Gluconeogenesis template |
| R01066 | drawn step DERA |
| R01067 | drawn step TKT |
| R01068 | omitted — fructose-bisphosphate aldolase: glycolysis step, drawn in the Glycolysis / Gluconeogenesis template |
| R01519 | drawn step GNL |
| R01520 | variant of GDH (other cofactor or donor) |
| R01521 | variant of GDH (other cofactor or donor) |
| R01522 | variant of GDH (other cofactor or donor) |
| R01528 | drawn step GND |
| R01529 | drawn step RPE |
| R01538 | drawn step GAD |
| R01541 | drawn step KDGK |
| R01544 | omitted — glucosaminate ammonia-lyase: glucosaminate route, left out (see the omitted compounds) |
| R01621 | drawn step XPK |
| R01641 | drawn step TKT |
| R01737 | drawn step GNTK |
| R01739 | variant of GADH (other cofactor or donor) |
| R01741 | drawn step GADH |
| R01844 | drawn step SHPK |
| R02032 | variant of KGUD (other cofactor or donor) |
| R02034 | drawn step KGUD |
| R02035 | drawn step PGL |
| R02036 | drawn step EDD |
| R02658 | drawn step KGUK |
| R02736 | drawn step G6PDH |
| R02739 | omitted — α-D-glucose 6-P ⇌ β-D-glucose 6-P (anomerase): implicit in the anomer-unspecified glucose 6-P node |
| R02749 | drawn step PPM |
| R02750 | drawn step DRBK |
| R05338 | drawn step HPS |
| R05339 | drawn step PHI |
| R05605 | drawn step EDA |
| R05805 | omitted — ADP-dependent PFK: glycolysis step (variant of PFK in the Glycolysis / Gluconeogenesis template) |
| R06620 | variant of GDH (other cofactor or donor) |
| R06836 | drawn step PRPK |
| R06837 | represented by R1PK (anomer-specific form / part of a lumped complex) |
| R07147 | variant of GDH (other cofactor or donor) |
| R08570 | drawn step KDGA |
| R08571 | variant of GADH (other cofactor or donor) |
| R08572 | drawn step GK |
| R08575 | drawn step TAL |
| R10221 | variant of GND (other cofactor or donor) |
| R10324 | variant of GADH (other cofactor or donor) |
| R10407 | omitted — glucosaminate PTS: glucosaminate route, left out (see the omitted compounds) |
| R10408 | omitted — glucosaminate-6-phosphate ammonia-lyase: glucosaminate route, left out (see the omitted compounds) |
| R10555 | drawn step R15PI |
| R10615 | drawn step GADH |
| R10860 | omitted — NAD-dependent GAPN: glycolysis step (variant of GAPN in the Glycolysis / Gluconeogenesis template) |
| R10907 | variant of G6PDH (other cofactor or donor) |
| R11535 | variant of R1PK (other cofactor or donor) |
| R13089 | drawn step R1PK |
| R13199 | omitted — glucose-6-phosphate isomerase: glycolysis step, drawn in the Glycolysis / Gluconeogenesis template |

## Curation decisions

- The oxidative phase runs left → right across the top (glucose-6P → 6P-gluconolactone → 6P-gluconate → ribulose-5P); the non-oxidative phase is a two-column ladder below ribulose-5P, each transketolase / transaldolase step a symmetric 2 → 2 fork. Aligned nodes are joined by straight arrows, the others by curved arrows.
- Glucose 6-phosphate is anomer-unspecified (C00092) with the α / β anomers kept as related forms; G6PDH acts on the β-anomer in KEGG (R02736), folded onto that node. The KEGG anomerase (R02739) is implicit.
- Glycolysis steps KEGG repeats on this map (PGI, PFK, FBPase, aldolase, GAPN) are not drawn twice: fructose-6P and GAP link to the Glycolysis / Gluconeogenesis template through ports.
- Pentose phosphates repeat as separate visual instances where a second copy avoids crossings (xylulose-5P, fructose-6P, GAP, ribose-5P, pyruvate, gluconate, KDPG) — all instances point to the same entity.
- Organism-specific routes are optional modules around the core: Entner–Doudoroff (bacteria), periplasmic glucose oxidation and the 2-ketogluconate route (bacteria), non- and semi-phosphorylative ED (archaea), ribose / PRPP / deoxyribose salvage, RuMP (methylotrophs), sedoheptulose kinase and phosphoketolase.
- Same step, other cofactor or acceptor → one arrow with variants: G6PDH and GND (NADP / NAD), glucose dehydrogenase (PQQ-quinone / ubiquinone / NAD(P) / glucose oxidase), gluconate 2-dehydrogenase (FAD / NADP), glyceraldehyde dehydrogenase (NADP / ferredoxin / acceptor), ribose-1P kinase (ATP / ADP).
- 2-keto-6P-gluconate reductase is drawn in the physiological direction of the 2-ketogluconate route although KGML lists the oxidative direction as irreversible: reversibility left open and flagged for review.
- The glucosaminate route (C03752, C20589; R01544, R10407, R10408) is left out of the drawing with its reason: a peripheral amino-sugar acid catabolism of a few bacteria.
- Quinone / quinol of glucose dehydrogenase are generic entities, flagged for review. Water and protons are not drawn.
- Compartments are not part of the template: the person chooses them when mapping onto a GEM (cytosol, plastid, glycosome…).

## Generation log

```text
KEGG map00030 — Pentose phosphate pathway: 37 compounds, 59 reactions on the map
BiGG tables: installed, 2441 metabolites / 7322 reactions
Unused side compounds left out: NAD+, NADH
Template written: src/templates/builtin/kegg-map00030.gemsmap-template.json
```
