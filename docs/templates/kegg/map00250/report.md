# Alanine, aspartate and glutamate metabolism (KEGG map00250) — generation report

Source: KEGG map00250 (Alanine, aspartate and glutamate metabolism), https://www.genome.jp/pathway/map00250. The biology was taken from KEGG's flat files and KGML;
the drawing is GEMsMAP's own and is **not** an official KEGG map. Status: **AI-generated — needs review**.

## Completeness

```text
KEGG compounds handled:         28/28  (entities 28, related forms 0, omitted with reason 0)
Template entities:              54  (pathway metabolites 27, cofactors / carriers 27)
MetaNetX mapped:                54
BiGG mapped:                    49
ModelSEED mapped:               53
ChEBI mapped:                   54
MetaCyc mapped:                 52

Confirmed (GEMsMAP library):     18
Suggested, high confidence:     34
Suggested, probable:            2
Ambiguous metabolites:          0
Unresolved metabolites:         0
Generic entities:               2  (2-Oxo acid, L-Amino acid)

KEGG reactions handled:         47/47  (drawn steps 36, represented 0, variants 11, omitted 0)
Template reactions:             36
Cross-database mapped reactions: 36  (MetaNetX 36, BiGG 24, ModelSEED 35, Rhea 33)
Ambiguous reactions:            0
Unresolved reactions:           0
```

## Review queue

| Kind | Element | Status | Why |
| --- | --- | --- | --- |
| entity | 2-Oxo acid | suggested (probable) · generic | KEGG C00161; MetaNetX MNXM730321 |
| entity | L-Amino acid | suggested (probable) · generic | KEGG C00151; MetaNetX MNXM381 |
| reaction | ASNT (asparagine transaminase) | suggested (probable) | KEGG R01346; MetaNetX MNXR147259 |

## Reactions without a BiGG cross-reference

Not an error: BiGG's universal namespace has no verified reaction with these participants (bacterial PTS, archaeal / plant
enzymes, phosphatases). The matcher still finds them in a model by MetaNetX / ModelSEED / EC and topology.

| Step | Enzyme | KEGG | MetaNetX |
| --- | --- | --- | --- |
| ASNT | asparagine transaminase | R01346 | MNXR147259 |
| NIT2 | ω-amidase (2-oxosuccinamate) | R00348 | MNXR106485 |
| DDO | D-aspartate oxidase | R00359 | MNXR198918 |
| GTK | glutamine–pyruvate transaminase | R00576 | MNXR105309 |
| NIT2 | ω-amidase (2-oxoglutaramate) | R00269 | MNXR105306 |
| URAH | β-ureidopropionase (N-carbamoyl-aspartate) | R00484 | MNXR106552 |
| NAT8L | aspartate N-acetyltransferase | R00487 | MNXR189094 |
| RIMKLA | N-acetylaspartylglutamate synthase | R10678 | MNXR113998 |
| GCPII | glutamate carboxypeptidase II (NAAG) | R10687 | MNXR114007 |
| RIMKLB | N-acetylaspartylglutamylglutamate synthase | R10693 | MNXR114013 |
| GCPII | glutamate carboxypeptidase II (NAAG₂) | R10688 | MNXR114008 |
| RIMKLB | β-citrylglutamate synthase | R10677 | MNXR113997 |

## KEGG compounds

| KEGG | Name | In the template |
| --- | --- | --- |
| C00014 | Ammonia | template entity |
| C00022 | Pyruvate | template entity |
| C00025 | L-Glutamate | template entity |
| C00026 | 2-Oxoglutarate | template entity |
| C00036 | Oxaloacetate | template entity |
| C00041 | L-Alanine | template entity |
| C00042 | Succinate | template entity |
| C00049 | L-Aspartate | template entity |
| C00064 | L-Glutamine | template entity |
| C00122 | Fumarate | template entity |
| C00152 | L-Asparagine | template entity |
| C00158 | Citrate | template entity |
| C00169 | Carbamoyl phosphate | template entity |
| C00232 | Succinate semialdehyde | template entity |
| C00334 | 4-Aminobutanoate | template entity |
| C00352 | D-Glucosamine 6-phosphate | template entity |
| C00402 | D-Aspartate | template entity |
| C00438 | N-Carbamoyl-L-aspartate | template entity |
| C00940 | 2-Oxoglutaramate | template entity |
| C01042 | N-Acetyl-L-aspartate | template entity |
| C02362 | 2-Oxosuccinamate | template entity |
| C03090 | 5-Phosphoribosylamine | template entity |
| C03406 | N-(L-Arginino)succinate | template entity |
| C03794 | N6-(1,2-Dicarboxyethyl)-AMP | template entity |
| C03912 | (S)-1-Pyrroline-5-carboxylate | template entity |
| C12270 | N-Acetylaspartylglutamate | template entity |
| C20775 | beta-Citryl-L-glutamate | template entity |
| C20776 | N-Acetylaspartylglutamylglutamate | template entity |

## KEGG reactions

| KEGG | In the template |
| --- | --- |
| R00093 | variant of GOGAT (other cofactor or donor) |
| R00114 | drawn step GOGAT |
| R00149 | variant of CPS (other cofactor or donor) |
| R00243 | variant of GDH (other cofactor or donor) |
| R00248 | drawn step GDH |
| R00253 | drawn step GS |
| R00256 | drawn step GLS |
| R00258 | drawn step ALT |
| R00261 | drawn step GAD |
| R00269 | drawn step NIT2 |
| R00348 | drawn step NIT2 |
| R00355 | drawn step AST |
| R00357 | variant of AST (other cofactor or donor) |
| R00359 | drawn step DDO |
| R00369 | variant of ALT (other cofactor or donor) |
| R00396 | variant of ALT (other cofactor or donor) |
| R00397 | drawn step AsdA |
| R00400 | variant of ALT (other cofactor or donor) |
| R00483 | variant of ASNS (other cofactor or donor) |
| R00484 | drawn step URAH |
| R00485 | drawn step ASNase |
| R00487 | drawn step NAT8L |
| R00488 | drawn step ASPA |
| R00490 | drawn step AspA |
| R00491 | drawn step RacD |
| R00575 | drawn step CPS |
| R00576 | drawn step GTK |
| R00578 | drawn step ASNS |
| R00707 | drawn step P5CDH |
| R00708 | variant of P5CDH (other cofactor or donor) |
| R00713 | drawn step SSADH |
| R00714 | variant of SSADH (other cofactor or donor) |
| R00768 | drawn step GFAT |
| R01072 | drawn step PPAT |
| R01083 | drawn step ADSL |
| R01086 | drawn step ASL |
| R01135 | drawn step ADSS |
| R01346 | drawn step ASNT |
| R01397 | drawn step ATCase |
| R01648 | drawn step GABA-T |
| R01954 | drawn step ASS |
| R10178 | variant of GABA-T (other cofactor or donor) |
| R10677 | drawn step RIMKLB |
| R10678 | drawn step RIMKLA |
| R10687 | drawn step GCPII |
| R10688 | drawn step GCPII |
| R10693 | drawn step RIMKLB |

## Curation decisions

- Glutamate is the centre: 2-oxoglutarate → glutamate (GDH) → glutamine (GS) as a straight column, with GOGAT and glutaminase as the arcs that return glutamine to glutamate on either side — the GS-GOGAT cycle reads at a glance.
- GOGAT is drawn glutamine → glutamate with 2-oxoglutarate beside the arrow (a visual instance of the same entity); KGML confirms the physiological direction even though the KEGG equation is written the other way.
- Transaminases are drawn along the carbon skeleton they convert (OAA → Asp, Pyr → Ala, GABA → succinate semialdehyde); the amino-group carrier pair (Glu / 2-oxoglutarate) is drawn beside the arrow, not as extra arrows.
- Same step, other cofactor, donor or acceptor → one arrow with variants: GDH (NADP / NAD), GOGAT (NADPH / NADH), asparagine synthetase (Gln / NH₃), CPS (Gln / NH₃), ALT (with alanine dehydrogenase and the Asp- or glyoxylate-coupled aminotransferases), AST (with L-aspartate oxidase), P5CDH and SSADH (NAD / NADP), GABA-T (2-oxoglutarate / pyruvate).
- Opposite directions of the same conversion stay separate arrows: GS and glutaminase / GOGAT, asparagine synthetase and asparaginase, N-acetylaspartate synthesis and aspartoacylase, NAAG synthesis and hydrolysis.
- ATCase is drawn carbamoyl-P → N-carbamoyl-aspartate with aspartate beside the arrow (straight, under CPS), so the pyrimidine branch reads glutamine → carbamoyl-P → N-carbamoyl-Asp.
- The nitrogen glutamine and aspartate donate elsewhere (carbamoyl phosphate, pyrimidines, purines, arginine, amino sugars) is drawn as the donating step plus a link to the receiving pathway, with separate visual instances of aspartate and fumarate.
- Every drawn irreversible arrow was checked against KGML's own substrate → product direction.
- Generic 2-oxo acid / L-amino acid of the asparagine transaminase are generic entities, flagged for review.
- Compartments are not part of the template: the person chooses them when mapping onto a GEM (e.g. mitochondrial GDH / AST isoforms).

## Generation log

```text
KEGG map00250 — Alanine, aspartate and glutamate metabolism: 28 compounds, 47 reactions on the map
BiGG tables: installed, 2441 metabolites / 7322 reactions
Template written: src/templates/builtin/kegg-map00250.gemsmap-template.json
```
