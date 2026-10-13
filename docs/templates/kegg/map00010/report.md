# Glycolysis / Gluconeogenesis (KEGG map00010) — generation report

Source: KEGG map00010 (Glycolysis / Gluconeogenesis), https://www.genome.jp/pathway/map00010. The biology was taken from KEGG's flat files and KGML;
the drawing is GEMs MAP's own and is **not** an official KEGG map. Status: **AI-generated — needs review**.

## Completeness

```text
KEGG compounds handled:         31/31  (entities 22, related forms 4, omitted with reason 5)
Template entities:              40  (pathway metabolites 23, cofactors / carriers 17)
MetaNetX mapped:                40
BiGG mapped:                    37
ModelSEED mapped:               40
ChEBI mapped:                   37
MetaCyc mapped:                 38

Confirmed (GEMs MAP library):     24
Suggested, high confidence:     13
Suggested, probable:            3
Ambiguous metabolites:          0
Unresolved metabolites:         0
Generic entities:               3  (Protein N(pi)-phospho-L-histidine, Protein N(tau)-phospho-L-histidine, Protein histidine)

KEGG reactions handled:         56/56  (drawn steps 25, represented 10, variants 19, omitted 2)
Template reactions:             31
Cross-database mapped reactions: 31  (MetaNetX 31, BiGG 24, ModelSEED 30, Rhea 25)
Ambiguous reactions:            0
Unresolved reactions:           0
```

## Review queue

| Kind | Element | Status | Why |
| --- | --- | --- | --- |
| entity | Protein N(pi)-phospho-L-histidine | suggested (probable) · generic | KEGG C04261; MetaNetX MNXM90093 |
| entity | Protein N(tau)-phospho-L-histidine | suggested (probable) · generic | KEGG C04262; MetaNetX MNXM93866 |
| entity | Protein histidine | suggested (probable) · generic | KEGG C00615; MetaNetX MNXM3704 |
| reaction | PGAM (phosphoglycerate mutase, priming with 2,3-BPG) | suggested (probable) | KEGG R01516; MetaNetX MNXR107035; BiGG links DPGase to this KEGG reaction but the participants differ — not used |
| reaction | PTS (arbutin PTS (EIIBC^Arb)) | suggested (probable) | KEGG R05132; MetaNetX MNXR109343 |
| reaction | PTS (salicin PTS) | suggested (probable) | KEGG R04394; MetaNetX MNXR108864 |

## Reactions without a BiGG cross-reference

Not an error: BiGG's universal namespace has no verified reaction with these participants (bacterial PTS, archaeal / plant
enzymes, phosphatases). The matcher still finds them in a model by MetaNetX / ModelSEED / EC and topology.

| Step | Enzyme | KEGG | MetaNetX |
| --- | --- | --- | --- |
| GAPN | glyceraldehyde-3-phosphate dehydrogenase (non-phosphorylating) | R01058 | MNXR147145 |
| PGAM | phosphoglycerate mutase, priming with 2,3-BPG | R01516 | MNXR107035 |
| MIPP1 | 2,3-bisphosphoglycerate 3-phosphatase | R09532 | MNXR112951 |
| ACD | acetyl-CoA synthetase (ADP-forming) | R00229 | MNXR106436 |
| G1Pase | glucose-1-phosphatase | R00947 | MNXR106760 |
| PTS | arbutin PTS (EIIBC^Arb) | R05132 | MNXR109343 |
| PTS | salicin PTS | R04394 | MNXR108864 |

## KEGG compounds

| KEGG | Name | In the template |
| --- | --- | --- |
| C00022 | Pyruvate | template entity |
| C00024 | Acetyl-CoA | template entity |
| C00031 | D-Glucose | template entity |
| C00033 | Acetate | template entity |
| C00036 | Oxaloacetate | template entity |
| C00068 | Thiamin diphosphate | omitted — thiamin diphosphate: enzyme-bound cofactor of the TPP-dependent half-reactions, regenerated inside the lumped PDH / PDC steps |
| C00074 | Phosphoenolpyruvate | template entity |
| C00084 | Acetaldehyde | template entity |
| C00085 | D-Fructose 6-phosphate | template entity |
| C00103 | D-Glucose 1-phosphate | template entity |
| C00111 | Glycerone phosphate | template entity |
| C00118 | D-Glyceraldehyde 3-phosphate | template entity |
| C00186 | (S)-Lactate | template entity |
| C00197 | 3-Phospho-D-glycerate | template entity |
| C00221 | beta-D-Glucose | related form of a template entity (anomer / specific form) |
| C00236 | 3-Phospho-D-glyceroyl phosphate | template entity |
| C00267 | alpha-D-Glucose | related form of a template entity (anomer / specific form) |
| C00354 | D-Fructose 1,6-bisphosphate | template entity |
| C00469 | Ethanol | template entity |
| C00631 | 2-Phospho-D-glycerate | template entity |
| C00668 | alpha-D-Glucose 6-phosphate | related form of a template entity (anomer / specific form) |
| C01159 | 2,3-Bisphospho-D-glycerate | template entity |
| C01172 | beta-D-Glucose 6-phosphate | related form of a template entity (anomer / specific form) |
| C01451 | Salicin | template entity |
| C05125 | 2-(alpha-Hydroxyethyl)thiamine diphosphate | omitted — 2-(α-hydroxyethyl)-ThPP: enzyme-bound intermediate of PDH / PDC (lumped) |
| C06186 | Arbutin | template entity |
| C06187 | Arbutin 6-phosphate | template entity |
| C06188 | Salicin 6-phosphate | template entity |
| C15972 | Enzyme N6-(lipoyl)lysine | omitted — lipoamide-E: protein-bound intermediate of the PDH complex (lumped) |
| C15973 | Enzyme N6-(dihydrolipoyl)lysine | omitted — dihydrolipoamide-E: protein-bound intermediate of the PDH complex (lumped) |
| C16255 | [Dihydrolipoyllysine-residue acetyltransferase] S-acetyldihydrolipoyllysine | omitted — S-acetyldihydrolipoamide-E: protein-bound intermediate of the PDH complex (lumped) |

## KEGG reactions

| KEGG | In the template |
| --- | --- |
| R00014 | represented by PDH, PDC (anomer-specific form / part of a lumped complex) |
| R00199 | variant of PPDK (other cofactor or donor) |
| R00200 | drawn step PK |
| R00206 | drawn step PPDK |
| R00229 | drawn step ACD |
| R00235 | drawn step ACS |
| R00341 | drawn step PEPCK |
| R00431 | variant of PEPCK (other cofactor or donor) |
| R00658 | drawn step ENO |
| R00703 | drawn step LDH |
| R00710 | drawn step ALDH |
| R00711 | variant of ALDH (other cofactor or donor) |
| R00726 | variant of PEPCK (other cofactor or donor) |
| R00746 | variant of ADH (other cofactor or donor) |
| R00754 | drawn step ADH |
| R00755 | represented by PDC (anomer-specific form / part of a lumped complex) |
| R00756 | drawn step PFK |
| R00762 | drawn step FBPase |
| R00764 | variant of PFK (other cofactor or donor) |
| R00947 | drawn step G1Pase |
| R00959 | represented by PGM (anomer-specific form / part of a lumped complex) |
| R01015 | drawn step TPI |
| R01058 | drawn step GAPN |
| R01061 | drawn step GAPDH |
| R01063 | variant of GAPDH (other cofactor or donor) |
| R01068 | drawn step FBA |
| R01196 | variant of PDH (other cofactor or donor) |
| R01512 | drawn step PGK |
| R01516 | drawn step PGAM |
| R01518 | drawn step PGAM |
| R01600 | represented by HK (anomer-specific form / part of a lumped complex) |
| R01602 | omitted — α-D-glucose ⇌ β-D-glucose (mutarotation): implicit in the anomer-unspecified D-glucose node |
| R01662 | drawn step BPGM |
| R01786 | represented by HK (anomer-specific form / part of a lumped complex) |
| R01788 | represented by G6Pase (anomer-specific form / part of a lumped complex) |
| R02187 | variant of HK (other cofactor or donor) |
| R02189 | variant of HK (other cofactor or donor) |
| R02569 | represented by PDH (anomer-specific form / part of a lumped complex) |
| R02738 | variant of HK (other cofactor or donor) |
| R02739 | omitted — α-D-glucose 6-P ⇌ β-D-glucose 6-P (anomerase): implicit in the anomer-unspecified glucose 6-P node |
| R03270 | represented by PDH (anomer-specific form / part of a lumped complex) |
| R04394 | drawn step PTS |
| R05132 | drawn step PTS |
| R05133 | drawn step BglA |
| R05134 | drawn step BglB |
| R05198 | variant of ADH (other cofactor or donor) |
| R05805 | variant of PFK (other cofactor or donor) |
| R07159 | variant of GAPN (other cofactor or donor) |
| R07618 | represented by PDH (anomer-specific form / part of a lumped complex) |
| R09085 | variant of HK (other cofactor or donor) |
| R09086 | variant of HK (other cofactor or donor) |
| R09127 | variant of ADH (other cofactor or donor) |
| R09479 | variant of ADH (other cofactor or donor) |
| R09532 | drawn step MIPP1 |
| R10860 | variant of GAPN (other cofactor or donor) |
| R13199 | represented by PGI (anomer-specific form / part of a lumped complex) |

## Curation decisions

- Hexose phosphates are drawn anomer-unspecified (D-glucose C00031, D-glucose 6-phosphate C00092), as most GEMs (BiGG, ModelSEED) encode them. KEGG map00010 draws the α/β anomers (C00267, C00221, C00668, C01172): they are kept as *related forms* of these nodes, so models that use anomers still match (scored as related forms), and the anomer-specific KEGG reactions are listed as the reactions each drawn step represents.
- Enzymes that catalyse the same step with another cofactor or phosphoryl donor are one drawn arrow with *variants* (PEPCK ATP/GTP/ITP, GAPDH NAD/NADP, PFK ATP/PPi/ADP, ADH NAD/NADP/quinone/cytochrome, ALDH NAD/NADP, glucokinases ATP/ADP/polyphosphate/PTS, PDH/PFOR, PPDK/PPS). The drawn stoichiometry is the most widespread form; the variants' EC numbers and IDs help the matcher.
- Routes with different products stay separate arrows: GAPN (GAP → 3-PG directly) next to GAPDH + PGK, the 2,3-BPG shunt, ACS (AMP-forming) and ACD (ADP-forming, the opposite direction).
- Multi-step complexes are drawn as their overall reaction: PDH (R00209; KEGG draws E1/E2/E3 through enzyme-bound lipoyl intermediates) and PDC (R00224; two TPP-dependent half-reactions). The KEGG steps are kept as provenance.
- Compartments are left unspecified: KEGG reference pathways have none, and glycolysis is plastidic as well as cytosolic in plants. The matcher picks the compartment in each GEM.
- Directionality follows the KGML of rn00010 (reversible / irreversible) for every drawn step.
- Cofactors are drawn beside each arrow as small attached nodes — repeated for every reaction, all pointing to the same entity (ATP is one entity drawn many times). Water and protons are left out of the drawing (water stays in the equations, protons are left out of the equations as in all GEMs MAP templates).
- Protein phosphoryl carriers (phospho-histidine proteins of the PTS and of the 2,3-BPG-primed PGAM, and the dephosphorylated His-protein) are generic entities: kept generic, flagged for review. On the PGAM priming step the carrier is the enzyme's own active-site histidine, so it stays in the equation but is not drawn; on the PTS steps (HPr / EIIB) it is drawn.
- Identities: an entity or reaction already confirmed in the GEMs MAP canonical library keeps that confirmation; every other identity is an AI suggestion (high confidence when KEGG → one MetaNetX chemical with a consistent formula and an unambiguous BiGG ID; probable otherwise) and goes to the review queue.

## Generation log

```text
KEGG map00010 — Glycolysis / Gluconeogenesis: 31 compounds, 56 reactions on the map
BiGG tables: installed, 2441 metabolites / 7322 reactions
Template written: src/templates/builtin/kegg-map00010.gemsmap-template.json
```
