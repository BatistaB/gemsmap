"""Curation of an amino acid biosynthesis overview, after KEGG map01230 (Biosynthesis of amino acids).

An overview, not a step-by-step map: the precursors of central carbon metabolism and the twenty proteinogenic amino
acids, grouped in their biosynthetic families. Single reactions are drawn as such (PK, SHMT, ALT, BCAT, AST, ASNS,
HSD, GDH, GS, PC, PRPS); whole pathways are *summary* arrows whose identity is the KEGG module. The template goes in
the "Central carbon" section of the library, next to the hand-made central-carbon templates.
"""
from layout import Layout

TEMPLATE_ID = "amino-acid-biosynthesis"
NAME = "Amino acid biosynthesis (overview)"
PATHWAY = "Biosynthesis of amino acids"
SECTION = "Central carbon"
LAYOUT_KIND = "free"
OVERVIEW = True
VERSION = "0.1.0"
CREATED = "2026-10-09T00:00:00Z"
DESCRIPTION = ("Where the twenty amino acids come from: the central-carbon precursors (3-phosphoglycerate, PEP + erythrose-4P, pyruvate, "
               "oxaloacetate, 2-oxoglutarate, ribose-5P / PRPP) and the biosynthetic families built on them — serine, aromatic, pyruvate, "
               "aspartate, glutamate and histidine. Whole pathways are drawn as summary arrows (KEGG modules). After KEGG map01230; drawn by GEMs MAP.")
SCOPE = {"level": "universal", "taxa": [], "note": "Families are universal; lysine is made from aspartate (DAP pathway, bacteria and plants) or from 2-oxoglutarate (AAA pathway, fungi). Animals lack several of these pathways (essential amino acids). Compartments are chosen by the person mapping onto a GEM."}
TAGS = ["amino acids", "overview", "KEGG", "map01230", "central carbon", "precursors"]

ENTITIES = [
    # precursors
    dict(key="glc", kegg="C00031", short="Glucose"),
    dict(key="pg3", kegg="C00197", short="3-Phosphoglycerate"),
    dict(key="pep", kegg="C00074", short="Phosphoenolpyruvate"),
    dict(key="pyr", kegg="C00022", short="Pyruvate"),
    dict(key="oaa", kegg="C00036", short="Oxaloacetate"),
    dict(key="akg", kegg="C00026", short="2-Oxoglutarate"),
    dict(key="r5p", kegg="C00117", short="Ribose-5P"),
    dict(key="prpp", kegg="C00119", short="PRPP"),
    # branch-point intermediates
    dict(key="chor", kegg="C00251", short="Chorismate", level="recommended"),
    dict(key="kiv", kegg="C00141", short="2-Oxoisovalerate", level="recommended"),
    dict(key="asa", kegg="C00441", short="Asp-semialdehyde", level="recommended"),
    dict(key="hom", kegg="C00263", short="Homoserine", level="recommended"),
    # amino acids
    dict(key="ser", kegg="C00065", short="Ser"), dict(key="gly", kegg="C00037", short="Gly"), dict(key="cys", kegg="C00097", short="Cys"),
    dict(key="phe", kegg="C00079", short="Phe"), dict(key="tyr", kegg="C00082", short="Tyr"), dict(key="trp", kegg="C00078", short="Trp"),
    dict(key="ala", kegg="C00041", short="Ala"), dict(key="val", kegg="C00183", short="Val"), dict(key="leu", kegg="C00123", short="Leu"),
    dict(key="asp", kegg="C00049", short="Asp"), dict(key="asn", kegg="C00152", short="Asn"), dict(key="lys", kegg="C00047", short="Lys"),
    dict(key="thr", kegg="C00188", short="Thr"), dict(key="met", kegg="C00073", short="Met"), dict(key="ile", kegg="C00407", short="Ile"),
    dict(key="glu", kegg="C00025", short="Glu"), dict(key="gln", kegg="C00064", short="Gln"), dict(key="pro", kegg="C00148", short="Pro"),
    dict(key="arg", kegg="C00062", short="Arg"), dict(key="his", kegg="C00135", short="His"),
]

COFACTORS = {
    "C00002": {"short": "ATP"}, "C00008": {"short": "ADP"}, "C00020": {"short": "AMP"}, "C00013": {"short": "PPᵢ"}, "C00009": {"short": "Pᵢ"},
    "C00003": {"short": "NAD⁺"}, "C00004": {"short": "NADH"}, "C00006": {"short": "NADP⁺"}, "C00005": {"short": "NADPH"},
    "C00001": {"short": "H2O"}, "C00014": {"short": "NH₃"}, "C00288": {"short": "HCO₃⁻"},
    "C00101": {"short": "THF"}, "C00143": {"short": "CH₂-THF"},
    "C00279": {"short": "Erythrose-4P"}, "C00024": {"short": "Acetyl-CoA"},
}

# summary=[KEGG modules or reactions] marks a whole pathway drawn as one arrow
REACTIONS = [
    # glycolytic backbone
    dict(key="GLYC", name="Glycolysis", canonical="glucose → 3-phosphoglycerate (upper glycolysis, GAPDH, PGK)", summary=["M00001"], main=(["glc"], ["pg3"])),
    dict(key="PGMENO", name="PGAM · ENO", canonical="3-phosphoglycerate → phosphoenolpyruvate", summary=["R01518", "R00658"], main=(["pg3"], ["pep"])),
    dict(key="PK", name="PK", canonical="pyruvate kinase", kegg="R00200", main=(["pep"], ["pyr"])),
    # serine family
    dict(key="SER", name="SerA·C·B", canonical="serine biosynthesis", summary=["M00020"], main=(["pg3"], ["ser"])),
    dict(key="SHMT", name="SHMT", canonical="serine hydroxymethyltransferase", kegg="R00945", main=(["ser"], ["gly"])),
    dict(key="CYS", name="CysE·K", canonical="cysteine biosynthesis (serine → O-acetylserine → cysteine)", summary=["M00021"], main=(["ser"], ["cys"])),
    # aromatic family
    dict(key="SHIK", name="Shikimate pathway", canonical="PEP + erythrose-4P → chorismate", summary=["M00022"], main=(["pep"], ["chor"]), side=(["C00279"], []), level="recommended"),
    dict(key="PHE", name="Phe pathway", canonical="chorismate → phenylalanine", summary=["M00024"], main=(["chor"], ["phe"])),
    dict(key="TYR", name="Tyr pathway", canonical="chorismate → tyrosine", summary=["M00025"], main=(["chor"], ["tyr"])),
    dict(key="TRP", name="Trp pathway", canonical="chorismate → tryptophan", summary=["M00023"], main=(["chor"], ["trp"])),
    # pyruvate family
    dict(key="ALT", name="ALT", canonical="alanine aminotransferase", kegg="R00258", main=(["pyr"], ["ala"])),
    dict(key="ILV", name="IlvBN·C·D", canonical="pyruvate → 2-oxoisovalerate (acetolactate synthase, KARI, DHAD)", summary=["M00019"], main=(["pyr"], ["kiv"]), level="recommended"),
    dict(key="BCAT", name="BCAT", canonical="branched-chain aminotransferase (valine)", kegg="R01214", main=(["kiv"], ["val"])),
    dict(key="LEU", name="Leu pathway", canonical="2-oxoisovalerate → leucine", summary=["M00432"], main=(["kiv"], ["leu"])),
    # aspartate family
    dict(key="PC", name="PC", canonical="pyruvate carboxylase", kegg="R00344", main=(["pyr"], ["oaa"])),
    dict(key="AST", name="AST", canonical="aspartate aminotransferase", kegg="R00355", main=(["oaa"], ["asp"])),
    dict(key="ASNS", name="ASNS", canonical="asparagine synthetase", kegg="R00578", main=(["asp"], ["asn"])),
    dict(key="ASD", name="AK · ASD", canonical="aspartate → aspartate-semialdehyde (aspartokinase, ASA dehydrogenase)", summary=["R00480", "R02291"], main=(["asp"], ["asa"]), level="recommended"),
    dict(key="LYS", name="DAP pathway", canonical="aspartate-semialdehyde → lysine (diaminopimelate pathway)", summary=["M00016"], main=(["asa"], ["lys"]),
         note="bacteria and plants; variants M00525, M00526, M00527"),
    dict(key="HSD", name="HSD", canonical="homoserine dehydrogenase", kegg="R01775", main=(["asa"], ["hom"]), level="recommended"),
    dict(key="THR", name="ThrB·C", canonical="homoserine → threonine (homoserine kinase, threonine synthase)", summary=["M00018"], main=(["hom"], ["thr"])),
    dict(key="MET", name="Met pathway", canonical="homoserine → methionine", summary=["M00017"], main=(["hom"], ["met"])),
    dict(key="ILE", name="Ile pathway", canonical="threonine → 2-oxobutanoate → isoleucine", summary=["M00570"], main=(["thr"], ["ile"])),
    # TCA link and glutamate family
    dict(key="TCA", name="TCA cycle", canonical="oxaloacetate + acetyl-CoA → 2-oxoglutarate (CS, ACO, IDH)", summary=["M00010"], main=(["oaa"], ["akg"]), side=(["C00024"], [])),
    dict(key="GDH", name="GDH", canonical="glutamate dehydrogenase", kegg="R00248", main=(["akg"], ["glu"])),
    dict(key="GS", name="GS", canonical="glutamine synthetase", kegg="R00253", main=(["glu"], ["gln"])),
    dict(key="PRO", name="ProB·A·C", canonical="glutamate → proline", summary=["M00015"], main=(["glu"], ["pro"])),
    dict(key="ARG", name="Arg pathway", canonical="glutamate → ornithine → arginine", summary=["M00028", "M00844"], main=(["glu"], ["arg"])),
    dict(key="LYSAAA", name="AAA pathway", canonical="2-oxoglutarate → 2-aminoadipate → lysine (fungi)", summary=["M00030"], main=(["akg"], ["lys"]), level="optional",
         note="fungi (and some archaea / Thermus) make lysine from 2-oxoglutarate instead of aspartate"),
    # histidine
    dict(key="PRPS", name="PRPS", canonical="ribose-phosphate pyrophosphokinase", kegg="R01049", main=(["r5p"], ["prpp"])),
    dict(key="HIS", name="His pathway", canonical="PRPP → histidine", summary=["M00026"], main=(["prpp"], ["his"])),
]

CONNECTORS = [
    dict(metabolite="glc", direction="in", pathway="Glycolysis / Gluconeogenesis", template="kegg-map00010"),
    dict(metabolite="r5p", direction="in", pathway="Pentose phosphate pathway", template="kegg-map00030"),
    dict(metabolite="akg", direction="in", pathway="Citrate cycle (TCA cycle)", template="kegg-map00020"),
    dict(metabolite="gln", direction="out", pathway="Alanine, aspartate and glutamate metabolism", template="kegg-map00250"),
]

OMITTED_COMPOUNDS = []
OMITTED_REACTIONS = []

DECISIONS = [
    "An overview after KEGG map01230 (Biosynthesis of amino acids), drawn like the textbook summary: the glycolytic backbone down the middle, the families branching from their precursors, one coloured box per family.",
    "Whole pathways are summary arrows (identity: the KEGG module, kept as provenance): they are not atom-balanced and a GEM links them only when the model makes the conversion in one or two reactions; their end points — precursors and amino acids — map like any metabolite.",
    "Single enzymes are drawn as reactions with full identities (PK, SHMT, ALT, BCAT, PC, AST, ASNS, HSD, GDH, GS, PRPS), so they map onto model reactions.",
    "Branch-point intermediates are drawn where a family splits: chorismate (Phe / Tyr / Trp), 2-oxoisovalerate (Val / Leu), aspartate-semialdehyde (Lys / homoserine), homoserine (Thr / Met).",
    "Lysine has two routes: the DAP pathway from aspartate-semialdehyde (bacteria, plants) and the AAA pathway from 2-oxoglutarate (fungi — e.g. Aspergillus); both arrows point to the same lysine entity.",
    "Erythrose-4P (from the pentose phosphate pathway) and acetyl-CoA are drawn beside the shikimate and TCA summary arrows.",
    "Placed in the Central carbon section of the library, next to the hand-made central-carbon templates.",
]


def layout(L: Layout) -> dict:
    L.center = (0, 560)
    n = {}
    for key, x, y in [
        ("glc", 0, 0), ("pg3", 0, 170), ("pep", 0, 340), ("pyr", 0, 510),
        ("ser", -260, 170), ("gly", -480, 170), ("cys", -260, 30),
        ("chor", 280, 340), ("phe", 520, 260), ("tyr", 520, 340), ("trp", 520, 420),
        ("ala", 260, 510), ("kiv", -260, 510), ("val", -480, 450), ("leu", -480, 570),
        ("oaa", 0, 690), ("asp", -260, 690), ("asn", -500, 690), ("asa", -260, 850), ("lys", -500, 850),
        ("hom", -260, 1010), ("met", -500, 1010), ("thr", -260, 1170), ("ile", -500, 1170),
        ("akg", 240, 810), ("glu", 480, 810), ("pro", 480, 660), ("gln", 720, 810), ("arg", 480, 960),
        ("r5p", 240, 1130), ("prpp", 480, 1130), ("his", 720, 1130),
    ]:
        n[key] = L.node(key, x, y)
    n["lys_2"] = L.node("lys", 240, 970)

    cof = L.cofactors
    R = L.reaction
    R("GLYC", [n["glc"]], [n["pg3"]])
    R("PGMENO", [n["pg3"]], [n["pep"]])
    cof(R("PK", [n["pep"]], [n["pyr"]]))
    R("SER", [n["pg3"]], [n["ser"]])
    cof(R("SHMT", [n["ser"]], [n["gly"]]))
    R("CYS", [n["ser"]], [n["cys"]])
    cof(R("SHIK", [n["pep"]], [n["chor"]]))
    R("PHE", [n["chor"]], [n["phe"]])
    R("TYR", [n["chor"]], [n["tyr"]])
    R("TRP", [n["chor"]], [n["trp"]], routing="curved", bend=24, flip=False)  # bows down, away from the Tyr arrow
    cof(R("ALT", [n["pyr"]], [n["ala"]]))
    R("ILV", [n["pyr"]], [n["kiv"]])
    # Val bows up and Leu bows down: the two branches never meet
    cof(R("BCAT", [n["kiv"]], [n["val"]], routing="curved", bend=22, flip=False), side="same")
    R("LEU", [n["kiv"]], [n["leu"]], routing="curved", bend=22, flip=True)
    cof(R("PC", [n["pyr"]], [n["oaa"]]))
    cof(R("AST", [n["oaa"]], [n["asp"]]))
    cof(R("ASNS", [n["asp"]], [n["asn"]]), only=("Gln", "Glu"))
    R("ASD", [n["asp"]], [n["asa"]])
    R("LYS", [n["asa"]], [n["lys"]])
    cof(R("HSD", [n["asa"]], [n["hom"]]))
    R("THR", [n["hom"]], [n["thr"]])
    R("MET", [n["hom"]], [n["met"]])
    R("ILE", [n["thr"]], [n["ile"]])
    cof(R("TCA", [n["oaa"]], [n["akg"]]))
    cof(R("GDH", [n["akg"]], [n["glu"]]))
    cof(R("GS", [n["glu"]], [n["gln"]]))
    R("PRO", [n["glu"]], [n["pro"]])
    R("ARG", [n["glu"]], [n["arg"]])
    R("LYSAAA", [n["akg"]], [n["lys_2"]])
    cof(R("PRPS", [n["r5p"]], [n["prpp"]]))
    R("HIS", [n["prpp"]], [n["his"]])

    L.port("glc>Glycolysis / Gluconeogenesis", 0, -110, n["glc"])
    L.port("r5p>Pentose phosphate pathway", 0, 1130, n["r5p"])
    L.port("akg>Citrate cycle (TCA cycle)", 240, 700, n["akg"])
    L.port("gln>Alanine, aspartate and glutamate metabolism", 1010, 810, n["gln"])

    fam = dict(kind="pathway", padding=34)  # pathway boxes have no outline by default
    L.group("Serine family", [n["ser"], n["gly"], n["cys"]], fill="#eaf2fd", **{k: v for k, v in fam.items() if k != "kind"})
    L.group("Aromatic family", [n["chor"], n["phe"], n["tyr"], n["trp"]], fill="#f1ebfb", **{k: v for k, v in fam.items() if k != "kind"})
    L.group("Pyruvate family", [n["kiv"], n["val"], n["leu"]], fill="#e9f6ee", **{k: v for k, v in fam.items() if k != "kind"})
    L.group("Aspartate family", [n["asp"], n["asn"], n["asa"], n["lys"], n["hom"], n["met"], n["thr"], n["ile"]], fill="#fdf1e4", **{k: v for k, v in fam.items() if k != "kind"})
    L.group("Glutamate family", [n["glu"], n["gln"], n["pro"], n["arg"]], fill="#fcebee", **{k: v for k, v in fam.items() if k != "kind"})
    L.group("Histidine", [n["prpp"], n["his"]], fill="#e8f6f6", **{k: v for k, v in fam.items() if k != "kind"})
    L.label("Amino acid biosynthesis", -700, -150, size=16, weight=700, italic=False, kind="title")
    L.label("overview after KEGG map01230 · drawn by GEMs MAP", -700, -130, size=10, weight=400, italic=True)
    return L.result()
