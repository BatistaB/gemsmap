# Citrate cycle (TCA cycle) (KEGG map00020) — generation report

Source: KEGG map00020 (Citrate cycle (TCA cycle)), https://www.genome.jp/pathway/map00020. The biology was taken from KEGG's flat files and KGML;
the drawing is GEMs MAP's own and is **not** an official KEGG map. Status: **AI-generated — needs review**.

## Completeness

```text
KEGG compounds handled:         20/20  (entities 12, related forms 0, omitted with reason 8)
Template entities:              23  (pathway metabolites 12, cofactors / carriers 11)
MetaNetX mapped:                23
BiGG mapped:                    22
ModelSEED mapped:               22
ChEBI mapped:                   23
MetaCyc mapped:                 21

Confirmed (GEMs MAP library):     19
Suggested, high confidence:     2
Suggested, probable:            2
Ambiguous metabolites:          0
Unresolved metabolites:         0
Generic entities:               2  (Quinone, Hydroquinone)

KEGG reactions handled:         29/29  (drawn steps 11, represented 9, variants 9, omitted 0)
Template reactions:             13
Cross-database mapped reactions: 13  (MetaNetX 13, BiGG 12, ModelSEED 12, Rhea 10)
Ambiguous reactions:            0
Unresolved reactions:           0
```

## Review queue

| Kind | Element | Status | Why |
| --- | --- | --- | --- |
| entity | Quinone | suggested (probable) · generic | KEGG C15602; MetaNetX MNXM1776 |
| entity | Hydroquinone | suggested (probable) · generic | KEGG C15603; MetaNetX MNXM4100; BiGG hqn |

## Reactions without a BiGG cross-reference

Not an error: BiGG's universal namespace has no verified reaction with these participants (bacterial PTS, archaeal / plant
enzymes, phosphatases). The matcher still finds them in a model by MetaNetX / ModelSEED / EC and topology.

| Step | Enzyme | KEGG | MetaNetX |
| --- | --- | --- | --- |
| SDH | succinate dehydrogenase (complex II) | R02164 | MNXR107340 |

## KEGG compounds

| KEGG | Name | In the template |
| --- | --- | --- |
| C00022 | Pyruvate | template entity |
| C00024 | Acetyl-CoA | template entity |
| C00026 | 2-Oxoglutarate | template entity |
| C00036 | Oxaloacetate | template entity |
| C00042 | Succinate | template entity |
| C00068 | Thiamin diphosphate | omitted — thiamin diphosphate: enzyme-bound cofactor of the E1 half-reactions, regenerated inside the lumped PDH / OGDH steps |
| C00074 | Phosphoenolpyruvate | template entity |
| C00091 | Succinyl-CoA | template entity |
| C00122 | Fumarate | template entity |
| C00149 | (S)-Malate | template entity |
| C00158 | Citrate | template entity |
| C00311 | Isocitrate | template entity |
| C00417 | cis-Aconitate | template entity |
| C05125 | 2-(alpha-Hydroxyethyl)thiamine diphosphate | omitted — 2-(α-hydroxyethyl)-ThPP: enzyme-bound intermediate of PDH (lumped) |
| C05379 | Oxalosuccinate | omitted — oxalosuccinate: enzyme-bound intermediate of NADP-IDH; its two half-reactions are represented by the IDH step |
| C05381 | 3-Carboxy-1-hydroxypropyl-ThPP | omitted — 3-carboxy-1-hydroxypropyl-ThPP: enzyme-bound intermediate of OGDH (lumped) |
| C15972 | Enzyme N6-(lipoyl)lysine | omitted — lipoamide-E: protein-bound intermediate of the PDH / OGDH complexes (lumped) |
| C15973 | Enzyme N6-(dihydrolipoyl)lysine | omitted — dihydrolipoamide-E: protein-bound intermediate of the PDH / OGDH complexes (lumped) |
| C16254 | [Dihydrolipoyllysine-residue succinyltransferase] S-succinyldihydrolipoyllysine | omitted — S-succinyldihydrolipoamide-E: protein-bound intermediate of OGDH (lumped) |
| C16255 | [Dihydrolipoyllysine-residue acetyltransferase] S-acetyldihydrolipoyllysine | omitted — S-acetyldihydrolipoamide-E: protein-bound intermediate of PDH (lumped) |

## KEGG reactions

| KEGG | In the template |
| --- | --- |
| R00014 | represented by PDH (anomer-specific form / part of a lumped complex) |
| R00268 | represented by IDH (anomer-specific form / part of a lumped complex) |
| R00341 | drawn step PEPCK |
| R00342 | drawn step MDH |
| R00344 | drawn step PC |
| R00351 | drawn step CS |
| R00352 | drawn step ACL |
| R00361 | variant of MDH (other cofactor or donor) |
| R00405 | drawn step SCS |
| R00431 | variant of PEPCK (other cofactor or donor) |
| R00432 | variant of SCS (other cofactor or donor) |
| R00621 | represented by OGDH (anomer-specific form / part of a lumped complex) |
| R00709 | drawn step IDH |
| R00726 | variant of PEPCK (other cofactor or donor) |
| R00727 | variant of SCS (other cofactor or donor) |
| R01082 | drawn step FUM |
| R01196 | variant of PDH (other cofactor or donor) |
| R01197 | variant of OGDH (other cofactor or donor) |
| R01325 | drawn step ACO |
| R01899 | represented by IDH (anomer-specific form / part of a lumped complex) |
| R01900 | drawn step ACO |
| R02164 | drawn step SDH |
| R02569 | represented by PDH (anomer-specific form / part of a lumped complex) |
| R02570 | represented by OGDH (anomer-specific form / part of a lumped complex) |
| R03270 | represented by PDH (anomer-specific form / part of a lumped complex) |
| R03316 | represented by OGDH (anomer-specific form / part of a lumped complex) |
| R07618 | represented by PDH, OGDH (anomer-specific form / part of a lumped complex) |
| R10343 | variant of SCS (other cofactor or donor) |
| R13137 | variant of SDH (other cofactor or donor) |

## Curation decisions

- The cycle is drawn as a circle, clockwise from oxaloacetate; every step between two non-aligned nodes is a curved arrow bowing outwards. Enzyme names sit inside the circle and cofactors outside, as on textbook drawings.
- Multi-step complexes are drawn as their overall reaction: PDH (R00209) and OGDH (R08549); KEGG draws their E1/E2/E3 steps through enzyme-bound ThPP and lipoyl intermediates, kept as provenance (represented reactions) and listed as omitted compounds with the reason.
- Aconitase is drawn in two steps through cis-aconitate, as KEGG and most genome-scale models (ACONTa / ACONTb) do; models with a single citrate → isocitrate reaction still match the two arrows as a lumped series.
- NADP-IDH: KEGG draws it as two half-reactions through oxalosuccinate (R01899, R00268). The drawn IDH step is the NAD form (R00709) with the NADP overall reaction (R00267) as a variant; oxalosuccinate is omitted as enzyme-bound.
- Enzymes catalysing the same step with another cofactor or acceptor are one arrow with variants: SCS (ATP / GTP / ITP and the acetate CoA-transferase SCACT), SDH (quinone / cytochrome c), MDH (NAD / quinone MQO), PEPCK (ATP / GTP / ITP), PDH / PFOR, OGDH / OGOR.
- ATP-citrate lyase cleaves citrate into its own acetyl-CoA and oxaloacetate instances, drawn outside the cycle: it is the route of citrate to lipogenesis (eukaryotic cytosol) and of the reductive TCA.
- Quinone / quinol of SDH are generic entities (ubiquinone or menaquinone depending on the organism): kept generic, flagged for review.
- Directionality follows the KGML of rn00020 for every drawn step (the overall complexes take it from their KEGG half-reactions).
- Compartments are not part of the template: the person chooses them when mapping onto a GEM (mitochondrial matrix in eukaryotes, cytosol in prokaryotes; the matcher proposes and asks when both exist).
- Identities: an entity or reaction already confirmed in the GEMs MAP canonical library keeps that confirmation; every other identity is an AI suggestion and goes to the review queue when it is not high-confidence.

## Generation log

```text
KEGG map00020 — Citrate cycle (TCA cycle): 20 compounds, 29 reactions on the map
BiGG tables: installed, 2441 metabolites / 7322 reactions
Template written: src/templates/builtin/kegg-map00020.gemsmap-template.json
```
