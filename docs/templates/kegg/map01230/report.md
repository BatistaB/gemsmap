# Amino acid biosynthesis (overview) — generation report

Source: KEGG map01230 (Biosynthesis of amino acids), https://www.genome.jp/pathway/map01230. The biology was taken from KEGG's flat files and KGML;
the drawing is GEMsMAP's own and is **not** an official KEGG map. Status: **AI-generated — needs review**.

## Completeness

```text
Overview of KEGG map01230:  pathway summaries 20, single reactions 11
Template entities:              46  (pathway metabolites 32, cofactors / carriers 16)
MetaNetX mapped:                46
BiGG mapped:                    46
ModelSEED mapped:               46
ChEBI mapped:                   46
MetaCyc mapped:                 45

Confirmed (GEMsMAP library):     14
Suggested, high confidence:     32
Suggested, probable:            0
Ambiguous metabolites:          0
Unresolved metabolites:         0
Generic entities:               0  (—)

Template reactions:             31
Cross-database mapped reactions: 11  (MetaNetX 11, BiGG 11, ModelSEED 11, Rhea 11)
Ambiguous reactions:            0
Unresolved reactions:           0
```

## Review queue

| Kind | Element | Status | Why |
| --- | --- | --- | --- |

## Reactions without a BiGG cross-reference

Not an error: BiGG's universal namespace has no verified reaction with these participants (bacterial PTS, archaeal / plant
enzymes, phosphatases). The matcher still finds them in a model by MetaNetX / ModelSEED / EC and topology.

| Step | Enzyme | KEGG | MetaNetX |
| --- | --- | --- | --- |

## Pathway summaries

| Arrow | Pathway | KEGG module(s) |
| --- | --- | --- |
| Glycolysis | glucose → 3-phosphoglycerate (upper glycolysis, GAPDH, PGK) | M00001 |
| PGAM · ENO | 3-phosphoglycerate → phosphoenolpyruvate | R01518, R00658 |
| SerA·C·B | serine biosynthesis | M00020 |
| CysE·K | cysteine biosynthesis (serine → O-acetylserine → cysteine) | M00021 |
| Shikimate pathway | PEP + erythrose-4P → chorismate | M00022 |
| Phe pathway | chorismate → phenylalanine | M00024 |
| Tyr pathway | chorismate → tyrosine | M00025 |
| Trp pathway | chorismate → tryptophan | M00023 |
| IlvBN·C·D | pyruvate → 2-oxoisovalerate (acetolactate synthase, KARI, DHAD) | M00019 |
| Leu pathway | 2-oxoisovalerate → leucine | M00432 |
| AK · ASD | aspartate → aspartate-semialdehyde (aspartokinase, ASA dehydrogenase) | R00480, R02291 |
| DAP pathway | aspartate-semialdehyde → lysine (diaminopimelate pathway) | M00016 |
| ThrB·C | homoserine → threonine (homoserine kinase, threonine synthase) | M00018 |
| Met pathway | homoserine → methionine | M00017 |
| Ile pathway | threonine → 2-oxobutanoate → isoleucine | M00570 |
| TCA cycle | oxaloacetate + acetyl-CoA → 2-oxoglutarate (CS, ACO, IDH) | M00010 |
| ProB·A·C | glutamate → proline | M00015 |
| Arg pathway | glutamate → ornithine → arginine | M00028, M00844 |
| AAA pathway | 2-oxoglutarate → 2-aminoadipate → lysine (fungi) | M00030 |
| His pathway | PRPP → histidine | M00026 |

## Curation decisions

- An overview after KEGG map01230 (Biosynthesis of amino acids), drawn like the textbook summary: the glycolytic backbone down the middle, the families branching from their precursors, one coloured box per family.
- Whole pathways are summary arrows (identity: the KEGG module, kept as provenance): they are not atom-balanced and a GEM links them only when the model makes the conversion in one or two reactions; their end points — precursors and amino acids — map like any metabolite.
- Single enzymes are drawn as reactions with full identities (PK, SHMT, ALT, BCAT, PC, AST, ASNS, HSD, GDH, GS, PRPS), so they map onto model reactions.
- Branch-point intermediates are drawn where a family splits: chorismate (Phe / Tyr / Trp), 2-oxoisovalerate (Val / Leu), aspartate-semialdehyde (Lys / homoserine), homoserine (Thr / Met).
- Lysine has two routes: the DAP pathway from aspartate-semialdehyde (bacteria, plants) and the AAA pathway from 2-oxoglutarate (fungi — e.g. Aspergillus); both arrows point to the same lysine entity.
- Erythrose-4P (from the pentose phosphate pathway) and acetyl-CoA are drawn beside the shikimate and TCA summary arrows.
- Placed in the Central carbon section of the library, next to the hand-made central-carbon templates.

## Generation log

```text
KEGG map01230 — Biosynthesis of amino acids: 128 compounds, 166 reactions on the map
BiGG tables: installed, 2441 metabolites / 7322 reactions
Unused side compounds left out: NAD+, NADH
Template written: src/templates/builtin/amino-acid-biosynthesis.gemsmap-template.json
```
