# How to cite

If GEMsMAP helped your work, please cite it, so that others can find it and repeat what you did. There are two things to cite, and they serve different purposes:

| What | Cite it for | Identifier |
| --- | --- | --- |
| **The software**, in the version you used | The exact program behind your results and figures. This documentation is part of it. | A DOI for each version, from Zenodo <span class="gm-badge planned">Being set up</span> |
| **The article** that describes GEMsMAP | The method and its design | The journal DOI <span class="gm-badge planned">In preparation</span> |

When both exist, cite both: the article where you introduce the tool, and the software version in your methods.

!!! info "Where this stands today"
    Neither DOI exists yet: GEMsMAP 0.3.0b1 is a public beta. Until the software DOI exists, cite the version and the repository address as shown below. This page will give both DOIs as soon as they are assigned.

## Cite the software

Each released version of GEMsMAP will be archived on [Zenodo](https://zenodo.org), an open research repository run by CERN. Zenodo gives every version its own DOI, and gives the project a *concept DOI* that always points to the newest version. Cite the DOI of the **version you used**: another version can give different results or draw a figure differently.

Fill in your version (see [below](#find-the-version-you-used)):

> Batista B (2026). *GEMsMAP: an interactive workbench for genome-scale metabolic models*. Version 0.3.0b1. https://github.com/BatistaB/gemsmap

Once the DOI exists, add it at the end, for example "Zenodo. doi:10.5281/zenodo.…".

```bibtex
@software{gemsmap,
  author  = {Batista, Bruno},
  title   = {{GEMsMAP}: an interactive workbench for genome-scale metabolic models},
  version = {0.3.0b1},
  year    = {2026},
  url     = {https://github.com/BatistaB/gemsmap},
  % publisher = {Zenodo}, doi = {10.5281/zenodo.…},  % added when the version is archived
}
```

The repository has a [`CITATION.cff`](https://github.com/BatistaB/gemsmap/blob/main/CITATION.cff) file, so the GitHub page of the project offers *Cite this repository* with the same reference in APA and BibTeX form.

## Cite the article

An article that describes GEMsMAP is in preparation. When it is published, its full reference and DOI will appear here, and `CITATION.cff` will name it as the preferred citation.

## Cite this documentation

The documentation is written and released together with the software: these pages live in the `docs/` folder of the repository, so the archive of each version also contains the documentation of that version. Citing the software version therefore covers the documentation too.

To point a reader to one page, give its address and the date you read it, because the website always shows the documentation of the newest code:

> GEMsMAP documentation: *Identity and matching*. https://gemsmap.readthedocs.io/en/latest/templates/identity-and-matching/ (accessed 28 October 2026).

## Find the version you used

- In a terminal, `gemsmap --version` prints the version, for example `GEMsMAP 0.3.0b1`.
- In COBRAGUI, the version is shown at the right of the status bar. Click it, then *Copy diagnostics*, to copy it together with the versions of Python and COBRApy and the solvers that are installed.
- Each result records the model checksum, the model state, the medium, the objective, the method and its parameters, and the solver. Report these with the version in your methods, so that the analysis can be repeated.

## Cite the tools GEMsMAP builds on

GEMsMAP does not solve the models itself, and it relies on public databases. Please also cite what your work used:

| If you used | Please cite |
| --- | --- |
| Any simulation (FBA, pFBA, loopless FBA, FVA) | **COBRApy**: Ebrahim A, Lerman JA, Palsson BO, Hyduke DR (2013). COBRApy: COnstraints-Based Reconstruction and Analysis for Python. *BMC Systems Biology* 7:74. [doi:10.1186/1752-0509-7-74](https://doi.org/10.1186/1752-0509-7-74) |
| The solver | The solver recorded in your results, with its version, for example [GLPK](https://www.gnu.org/software/glpk/), the default of a standard installation. |
| [Metabolite analysis](../cobra-gui/metabolite-analysis.md#curating-identifiers-with-metanetx) or template matching that relies on MetaNetX | **MetaNetX/MNXref**: Moretti S, Tran VDT, Mehl F, Ibberson M, Pagni M (2021). MetaNetX/MNXref: unified namespace for metabolites and biochemical reactions in the context of metabolic models. *Nucleic Acids Research* 49(D1):D570–D574. [doi:10.1093/nar/gkaa992](https://doi.org/10.1093/nar/gkaa992) |
| BiGG identifiers, the BiGG tables or a model from BiGG | **BiGG Models**: King ZA, Lu J, Dräger A, *et al.* (2016). BiGG Models: a platform for integrating, standardizing and sharing genome-scale models. *Nucleic Acids Research* 44:D515–D522. [doi:10.1093/nar/gkv1049](https://doi.org/10.1093/nar/gkv1049) |
| A [KEGG-derived template](../templates/ai-assisted-templates.md) | **KEGG**: the articles KEGG asks its users to cite, listed on its [database page](https://www.kegg.jp/kegg/kegg1.html), among them Kanehisa M, Goto S (2000). KEGG: Kyoto Encyclopedia of Genes and Genomes. *Nucleic Acids Research* 28(1):27–30. [doi:10.1093/nar/28.1.27](https://doi.org/10.1093/nar/28.1.27) |
| A published model | The model's own publication, for example iML1515: Monk JM, Lloyd CJ, Brunk E, *et al.* (2017). *Nature Biotechnology* 35:904–908. [doi:10.1038/nbt.3956](https://doi.org/10.1038/nbt.3956). See [About the examples](examples.md). |

GEMsMAP is an independent project; citing these tools does not imply that their teams endorse it.
