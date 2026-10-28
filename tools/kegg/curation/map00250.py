"""Curation of KEGG map00250 — Alanine, aspartate and glutamate metabolism.

The biology comes from KEGG (flat files + KGML); the decisions below are the curator's. The layout is GEMsMAP's own
drawing (the glutamate / glutamine nitrogen-assimilation column in the middle, aspartate / asparagine on the left,
alanine and the GABA shunt on the right, the nitrogen donations of glutamine and aspartate below), not a copy of
the KEGG map.
"""
from layout import Layout

TEMPLATE_ID = "kegg-map00250"
NAME = "Alanine, aspartate and glutamate metabolism (KEGG map00250)"
VERSION = "0.1.0"
CREATED = "2026-10-09T00:00:00Z"
DESCRIPTION = ("Nitrogen assimilation and the amino acids made directly from central-carbon keto acids: glutamate / glutamine "
               "(GDH, GS-GOGAT, glutaminase), aspartate / asparagine, alanine, the GABA shunt, and the nitrogen glutamine and "
               "aspartate donate to carbamoyl phosphate, pyrimidines, purines, arginine and amino sugars; N-acetylaspartate / NAAG "
               "of the vertebrate brain. Derived from KEGG; drawn by GEMsMAP.")
SCOPE = {"level": "universal", "taxa": [], "note": "GDH, GS, transaminases and asparagine synthesis are conserved; GOGAT (bacteria, plants, fungi), the GABA shunt, D-aspartate and NAA / NAAG (vertebrate brain) are organism-specific. Compartments are chosen by the person mapping onto a GEM."}
TAGS = ["KEGG", "map00250", "amino acids", "glutamate", "aspartate", "nitrogen assimilation"]

# ----------------------------------------------------------------------------- entities drawn as pathway nodes
ENTITIES = [
    dict(key="akg", kegg="C00026", short="2-Oxoglutarate"),
    dict(key="glu", kegg="C00025", short="Glutamate"),
    dict(key="gln", kegg="C00064", short="Glutamine"),
    dict(key="oaa", kegg="C00036", short="Oxaloacetate"),
    dict(key="asp", kegg="C00049", short="Aspartate"),
    dict(key="asn", kegg="C00152", short="Asparagine"),
    dict(key="pyr", kegg="C00022", short="Pyruvate"),
    dict(key="ala", kegg="C00041", short="Alanine"),
    dict(key="fum", kegg="C00122", short="Fumarate", level="recommended"),
    dict(key="gaba", kegg="C00334", short="GABA", level="recommended"),
    dict(key="ssa", kegg="C00232", short="Succinate semialdehyde", level="recommended"),
    dict(key="succ", kegg="C00042", short="Succinate", level="recommended"),
    dict(key="p5c", kegg="C03912", short="P5C", level="optional"),
    dict(key="dasp", kegg="C00402", short="D-Aspartate", level="optional"),
    dict(key="oxsuc", kegg="C02362", short="2-Oxosuccinamate", level="optional"),
    dict(key="oxglm", kegg="C00940", short="2-Oxoglutaramate", level="optional"),
    dict(key="cbp", kegg="C00169", short="Carbamoyl-P", level="recommended"),
    dict(key="cbasp", kegg="C00438", short="N-Carbamoyl-Asp", level="optional"),
    dict(key="gam6p", kegg="C00352", short="Glucosamine-6P", level="optional"),
    dict(key="pra", kegg="C03090", short="PRA", level="optional"),
    dict(key="argsuc", kegg="C03406", short="Argininosuccinate", level="optional"),
    dict(key="arg", kegg="C00062", short="Arginine", level="optional"),
    dict(key="adsucc", kegg="C03794", short="Adenylosuccinate", level="optional"),
    dict(key="naa", kegg="C01042", short="N-Acetyl-Asp", level="optional"),
    dict(key="naag", kegg="C12270", short="NAAG", level="optional"),
    dict(key="naagg", kegg="C20776", short="NAAG₂", level="optional"),
    dict(key="citglu", kegg="C20775", short="β-Citryl-Glu", level="optional"),
]

COFACTORS = {
    "C00002": {"short": "ATP"}, "C00008": {"short": "ADP"}, "C00020": {"short": "AMP"}, "C00013": {"short": "PPᵢ"}, "C00009": {"short": "Pᵢ"},
    "C00003": {"short": "NAD⁺"}, "C00004": {"short": "NADH"}, "C00006": {"short": "NADP⁺"}, "C00005": {"short": "NADPH"},
    "C00001": {"short": "H2O"}, "C00011": {"short": "CO₂"}, "C00014": {"short": "NH₃"}, "C00288": {"short": "HCO₃⁻"},
    "C00010": {"short": "CoA"}, "C00024": {"short": "Acetyl-CoA"}, "C00033": {"short": "Acetate"},
    "C00044": {"short": "GTP"}, "C00035": {"short": "GDP"}, "C00130": {"short": "IMP"}, "C00327": {"short": "Citrulline"},
    "C00158": {"short": "Citrate"}, "C00085": {"short": "Fructose-6P"}, "C00119": {"short": "PRPP"},
    "C00007": {"short": "O₂"}, "C00027": {"short": "H₂O₂"},
    "C00161": {"short": "2-Oxo acid", "generic": True}, "C00151": {"short": "L-Amino acid", "generic": True},
}

# ----------------------------------------------------------------------------- reactions (drawn steps)
REACTIONS = [
    # nitrogen assimilation
    dict(key="GDH", name="GDH", canonical="glutamate dehydrogenase (NADP)", kegg="R00248", main=(["akg"], ["glu"]),
         variants=[dict(kegg="R00243", name="NAD-dependent GDH (catabolic)")]),
    dict(key="GS", name="GS", canonical="glutamine synthetase", kegg="R00253", main=(["glu"], ["gln"])),
    dict(key="GOGAT", name="GOGAT", canonical="glutamate synthase (NADPH)", kegg="R00114", main=(["gln"], ["glu"]), level="recommended",
         note="Gln + 2-oxoglutarate → 2 Glu: 2-oxoglutarate drawn beside the arrow",
         variants=[dict(kegg="R00093", name="NADH-dependent GOGAT")]),
    dict(key="GLS", name="GLS", canonical="glutaminase", kegg="R00256", main=(["gln"], ["glu"]), level="recommended"),
    # aspartate / asparagine
    dict(key="AST", name="AST", canonical="aspartate aminotransferase", kegg="R00355", main=(["oaa"], ["asp"]),
         variants=[dict(kegg="R00357", name="L-aspartate oxidase (Asp + O₂ → OAA + NH₃ + H₂O₂; NAD biosynthesis)")]),
    dict(key="ASPA", name="AspA", canonical="aspartate ammonia-lyase (aspartase)", kegg="R00490", main=(["asp"], ["fum"]), level="optional"),
    dict(key="ASNS", name="ASNS", canonical="asparagine synthetase (glutamine-hydrolysing)", kegg="R00578", main=(["asp"], ["asn"]),
         variants=[dict(kegg="R00483", name="ammonia-dependent asparagine synthetase (AsnA)")]),
    dict(key="ASNase", name="ASNase", canonical="asparaginase", kegg="R00485", main=(["asn"], ["asp"]), level="recommended"),
    dict(key="ASNT", name="ASNT", canonical="asparagine transaminase", kegg="R01346", main=(["asn"], ["oxsuc"]), level="optional"),
    dict(key="NIT2a", name="NIT2", canonical="ω-amidase (2-oxosuccinamate)", kegg="R00348", main=(["oxsuc"], ["oaa"]), level="optional"),
    dict(key="RACD", name="RacD", canonical="aspartate racemase", kegg="R00491", main=(["asp"], ["dasp"]), level="optional"),
    dict(key="DDO", name="DDO", canonical="D-aspartate oxidase", kegg="R00359", main=(["dasp"], ["oaa"]), level="optional"),
    dict(key="ASPDC", name="AsdA", canonical="aspartate 4-decarboxylase", kegg="R00397", main=(["asp"], ["ala"]), level="optional"),
    # alanine
    dict(key="ALT", name="ALT", canonical="alanine aminotransferase", kegg="R00258", main=(["pyr"], ["ala"]), variants=[
        dict(kegg="R00396", name="alanine dehydrogenase (NADH, NH₃)"), dict(kegg="R00400", name="alanine–oxaloacetate aminotransferase (Asp as amino donor)"),
        dict(kegg="R00369", name="alanine–glyoxylate aminotransferase (Ala → Pyr, glyoxylate → Gly)")]),
    dict(key="GPT", name="GTK", canonical="glutamine–pyruvate transaminase", kegg="R00576", main=(["gln"], ["oxglm"]), level="optional"),
    dict(key="NIT2b", name="NIT2", canonical="ω-amidase (2-oxoglutaramate)", kegg="R00269", main=(["oxglm"], ["akg"]), level="optional"),
    # proline link and GABA shunt
    dict(key="P5CDH", name="P5CDH", canonical="1-pyrroline-5-carboxylate dehydrogenase", kegg="R00707", main=(["p5c"], ["glu"]), level="optional",
         variants=[dict(kegg="R00708", name="NADP-dependent P5CDH")]),
    dict(key="GAD", name="GAD", canonical="glutamate decarboxylase", kegg="R00261", main=(["glu"], ["gaba"]), level="recommended"),
    dict(key="GABAT", name="GABA-T", canonical="4-aminobutyrate aminotransferase", kegg="R01648", main=(["gaba"], ["ssa"]), level="recommended",
         variants=[dict(kegg="R10178", name="GABA–pyruvate transaminase (Pyr → Ala)")]),
    dict(key="SSADH", name="SSADH", canonical="succinate-semialdehyde dehydrogenase", kegg="R00713", main=(["ssa"], ["succ"]), level="recommended",
         variants=[dict(kegg="R00714", name="NADP-dependent SSADH")]),
    # nitrogen donations
    dict(key="CPS", name="CPS", canonical="carbamoyl-phosphate synthase (glutamine-hydrolysing)", kegg="R00575", main=(["gln"], ["cbp"]), level="recommended",
         variants=[dict(kegg="R00149", name="ammonia-dependent CPS (CPS I, urea cycle)")]),
    dict(key="GFAT", name="GFAT", canonical="glutamine–fructose-6-phosphate transaminase", kegg="R00768", main=(["gln"], ["gam6p"]), level="optional"),
    dict(key="PPAT", name="PPAT", canonical="amidophosphoribosyltransferase", kegg="R01072", main=(["gln"], ["pra"]), level="optional"),
    dict(key="ATCase", name="ATCase", canonical="aspartate carbamoyltransferase", kegg="R01397", main=(["cbp"], ["cbasp"]), level="optional",
         note="carbamoyl-P → N-carbamoyl-Asp drawn; aspartate written beside the arrow"),
    dict(key="URAH", name="URAH", canonical="β-ureidopropionase (N-carbamoyl-aspartate)", kegg="R00484", main=(["cbasp"], ["asp"]), level="optional"),
    dict(key="ASS", name="ASS", canonical="argininosuccinate synthase", kegg="R01954", main=(["asp"], ["argsuc"]), level="optional"),
    dict(key="ASL", name="ASL", canonical="argininosuccinate lyase", kegg="R01086", main=(["argsuc"], ["arg", "fum"]), level="optional"),
    dict(key="ADSS", name="ADSS", canonical="adenylosuccinate synthase", kegg="R01135", main=(["asp"], ["adsucc"]), level="optional"),
    dict(key="ADSL", name="ADSL", canonical="adenylosuccinate lyase", kegg="R01083", main=(["adsucc"], ["fum"]), level="optional"),
    # N-acetylaspartate / NAAG (vertebrate brain) and β-citrylglutamate
    dict(key="NAT8L", name="NAT8L", canonical="aspartate N-acetyltransferase", kegg="R00487", main=(["asp"], ["naa"]), level="optional"),
    dict(key="ASPAC", name="ASPA", canonical="aspartoacylase", kegg="R00488", main=(["naa"], ["asp"]), level="optional"),
    dict(key="NAAGS", name="RIMKLA", canonical="N-acetylaspartylglutamate synthase", kegg="R10678", main=(["naa"], ["naag"]), level="optional"),
    dict(key="GCP2a", name="GCPII", canonical="glutamate carboxypeptidase II (NAAG)", kegg="R10687", main=(["naag"], ["naa"]), level="optional"),
    dict(key="NAAGGS", name="RIMKLB", canonical="N-acetylaspartylglutamylglutamate synthase", kegg="R10693", main=(["naag"], ["naagg"]), level="optional"),
    dict(key="GCP2b", name="GCPII", canonical="glutamate carboxypeptidase II (NAAG₂)", kegg="R10688", main=(["naagg"], ["naag"]), level="optional"),
    dict(key="BCGS", name="RIMKLB", canonical="β-citrylglutamate synthase", kegg="R10677", main=(["glu"], ["citglu"]), level="optional"),
]

CONNECTORS = [
    dict(metabolite="akg", direction="in", pathway="Citrate cycle (TCA cycle)", template="kegg-map00020"),
    dict(metabolite="oaa", direction="in", pathway="Citrate cycle (TCA cycle)", template="kegg-map00020"),
    dict(metabolite="fum", direction="out", pathway="Citrate cycle (TCA cycle)", template="kegg-map00020"),
    dict(metabolite="succ", direction="out", pathway="Citrate cycle (TCA cycle)", template="kegg-map00020"),
    dict(metabolite="pyr", direction="in", pathway="Glycolysis / Gluconeogenesis", template="kegg-map00010"),
    dict(metabolite="p5c", direction="in", pathway="Arginine and proline metabolism"),
    dict(metabolite="cbasp", direction="out", pathway="Pyrimidine metabolism"),
    dict(metabolite="pra", direction="out", pathway="Purine metabolism"),
    dict(metabolite="gam6p", direction="out", pathway="Amino sugar and nucleotide sugar metabolism"),
    dict(metabolite="arg", direction="out", pathway="Arginine biosynthesis"),
]

OMITTED_COMPOUNDS = []
OMITTED_REACTIONS = []

DECISIONS = [
    "Glutamate is the centre: 2-oxoglutarate → glutamate (GDH) → glutamine (GS) as a straight column, with GOGAT and glutaminase as the arcs that return glutamine to glutamate on either side — the GS-GOGAT cycle reads at a glance.",
    "GOGAT is drawn glutamine → glutamate with 2-oxoglutarate beside the arrow (a visual instance of the same entity); KGML confirms the physiological direction even though the KEGG equation is written the other way.",
    "Transaminases are drawn along the carbon skeleton they convert (OAA → Asp, Pyr → Ala, GABA → succinate semialdehyde); the amino-group carrier pair (Glu / 2-oxoglutarate) is drawn beside the arrow, not as extra arrows.",
    "Same step, other cofactor, donor or acceptor → one arrow with variants: GDH (NADP / NAD), GOGAT (NADPH / NADH), asparagine synthetase (Gln / NH₃), CPS (Gln / NH₃), ALT (with alanine dehydrogenase and the Asp- or glyoxylate-coupled aminotransferases), AST (with L-aspartate oxidase), P5CDH and SSADH (NAD / NADP), GABA-T (2-oxoglutarate / pyruvate).",
    "Opposite directions of the same conversion stay separate arrows: GS and glutaminase / GOGAT, asparagine synthetase and asparaginase, N-acetylaspartate synthesis and aspartoacylase, NAAG synthesis and hydrolysis.",
    "ATCase is drawn carbamoyl-P → N-carbamoyl-aspartate with aspartate beside the arrow (straight, under CPS), so the pyrimidine branch reads glutamine → carbamoyl-P → N-carbamoyl-Asp.",
    "The nitrogen glutamine and aspartate donate elsewhere (carbamoyl phosphate, pyrimidines, purines, arginine, amino sugars) is drawn as the donating step plus a link to the receiving pathway, with separate visual instances of aspartate and fumarate.",
    "Every drawn irreversible arrow was checked against KGML's own substrate → product direction.",
    "Generic 2-oxo acid / L-amino acid of the asparagine transaminase are generic entities, flagged for review.",
    "Compartments are not part of the template: the person chooses them when mapping onto a GEM (e.g. mitochondrial GDH / AST isoforms).",
]


def layout(L: Layout) -> dict:
    L.center = (-100, 250)
    n = {}
    # glutamate / glutamine column
    n["akg"] = L.node("akg", 0, -220)
    n["glu"] = L.node("glu", 0, 0)
    n["gln"] = L.node("gln", 0, 260)
    # aspartate / asparagine
    n["oaa"] = L.node("oaa", -480, -220)
    n["asp"] = L.node("asp", -480, 0)
    n["asn"] = L.node("asn", -480, 260)
    n["fum"] = L.node("fum", -300, -180)
    n["dasp"] = L.node("dasp", -720, -110)
    n["oxsuc"] = L.node("oxsuc", -740, 260)
    n["oaa_2"] = L.node("oaa", -740, 100)
    n["ala_2"] = L.node("ala", -240, 0)
    n["p5c"] = L.node("p5c", -200, 170)
    # alanine and the GABA shunt
    n["pyr"] = L.node("pyr", 240, -420)
    n["ala"] = L.node("ala", 480, -420)
    n["gaba"] = L.node("gaba", 260, 0)
    n["ssa"] = L.node("ssa", 260, -220)
    n["succ"] = L.node("succ", 520, -220)
    n["oxglm"] = L.node("oxglm", 260, 260)
    n["akg_2"] = L.node("akg", 520, 260)
    # nitrogen donations
    n["cbp"] = L.node("cbp", 0, 480)
    n["gam6p"] = L.node("gam6p", -180, 460)
    n["pra"] = L.node("pra", 180, 460)
    n["asp_2"] = L.node("asp", -240, 700)
    n["cbasp"] = L.node("cbasp", 0, 700)
    n["argsuc"] = L.node("argsuc", -480, 700)
    n["arg"] = L.node("arg", -720, 620)
    n["fum_2"] = L.node("fum", -720, 780)
    n["adsucc"] = L.node("adsucc", -240, 900)
    n["fum_3"] = L.node("fum", -480, 900)
    # NAA / NAAG
    n["asp_3"] = L.node("asp", 520, 560)
    n["naa"] = L.node("naa", 520, 720)
    n["naag"] = L.node("naag", 760, 720)
    n["naagg"] = L.node("naagg", 1000, 720)
    n["glu_2"] = L.node("glu", 760, 880)
    n["citglu"] = L.node("citglu", 1000, 880)

    cof = L.cofactors
    R = L.reaction
    cof(R("GDH", [n["akg"]], [n["glu"]]))
    cof(R("GS", [n["glu"]], [n["gln"]]))
    cof(R("GOGAT", [n["gln"]], [n["glu"]], routing="curved", bend=80), side="same", along=24, step=30)
    cof(R("GLS", [n["gln"]], [n["glu"]], routing="curved", bend=80, flip=True), side="same", along=24)
    cof(R("AST", [n["oaa"]], [n["asp"]]), side="same")  # the right side belongs to the aspartase curve
    cof(R("ASPA", [n["asp"]], [n["fum"]]))
    cof(R("ASNS", [n["asp"]], [n["asn"]]), only=("Glutamine", "ATP", "Glutamate", "AMP"), step=22)  # PPᵢ stays in the equation
    cof(R("ASNase", [n["asn"]], [n["asp"]], routing="curved", bend=80, flip=True), side="same", along=24)
    cof(R("ASNT", [n["asn"]], [n["oxsuc"]]))
    cof(R("NIT2a", [n["oxsuc"]], [n["oaa_2"]]))
    R("RACD", [n["asp"]], [n["dasp"]])
    cof(R("DDO", [n["dasp"]], [n["oaa"]]))
    cof(R("ASPDC", [n["asp"]], [n["ala_2"]]))
    cof(R("ALT", [n["pyr"]], [n["ala"]]))
    cof(R("GPT", [n["gln"]], [n["oxglm"]]))
    cof(R("NIT2b", [n["oxglm"]], [n["akg_2"]]))
    cof(R("P5CDH", [n["p5c"]], [n["glu"]]))
    cof(R("GAD", [n["glu"]], [n["gaba"]]))
    cof(R("GABAT", [n["gaba"]], [n["ssa"]]))
    cof(R("SSADH", [n["ssa"]], [n["succ"]]))
    cof(R("CPS", [n["gln"]], [n["cbp"]]), only=("HCO₃⁻", "ATP", "Glutamate", "ADP"), step=22)  # Pᵢ stays in the equation
    cof(R("GFAT", [n["gln"]], [n["gam6p"]]))
    cof(R("PPAT", [n["gln"]], [n["pra"]]))
    cof(R("ATCase", [n["cbp"]], [n["cbasp"]]))
    cof(R("URAH", [n["cbasp"]], [n["asp_2"]]))
    cof(R("ASS", [n["asp_2"]], [n["argsuc"]]))
    R("ASL", [n["argsuc"]], [n["arg"], n["fum_2"]])
    cof(R("ADSS", [n["asp_2"]], [n["adsucc"]]))
    cof(R("ADSL", [n["adsucc"]], [n["fum_3"]]))
    cof(R("NAT8L", [n["asp_3"]], [n["naa"]]))
    cof(R("ASPAC", [n["naa"]], [n["asp_3"]], routing="curved", bend=60, flip=True), side="same")
    cof(R("NAAGS", [n["naa"]], [n["naag"]]))
    cof(R("GCP2a", [n["naag"]], [n["naa"]], routing="curved", bend=40, flip=True), side="same")
    cof(R("NAAGGS", [n["naag"]], [n["naagg"]]))
    cof(R("GCP2b", [n["naagg"]], [n["naag"]], routing="curved", bend=40, flip=True), side="same")
    cof(R("BCGS", [n["glu_2"]], [n["citglu"]]))

    L.port("akg>Citrate cycle (TCA cycle)", 0, -340, n["akg"])
    L.port("oaa>Citrate cycle (TCA cycle)", -480, -340, n["oaa"])
    L.port("fum>Citrate cycle (TCA cycle)", -300, -320, n["fum"])
    L.port("succ>Citrate cycle (TCA cycle)", 760, -220, n["succ"])
    L.port("pyr>Glycolysis / Gluconeogenesis", 240, -540, n["pyr"])
    L.port("p5c>Arginine and proline metabolism", -200, 300, n["p5c"])
    L.port("cbasp>Pyrimidine metabolism", 0, 820, n["cbasp"])
    L.port("pra>Purine metabolism", 180, 580, n["pra"])
    L.port("gam6p>Amino sugar and nucleotide sugar metabolism", -480, 460, n["gam6p"])
    L.port("arg>Arginine biosynthesis", -720, 520, n["arg"])

    L.group("GABA shunt", [n["gaba"], n["ssa"], n["succ"]])
    L.group("N-Acetylaspartate · NAAG (vertebrate brain)", [n["asp_3"], n["naa"], n["naag"], n["naagg"], n["glu_2"], n["citglu"]])
    L.label("Alanine, aspartate and glutamate metabolism", -900, -640, size=16, weight=700, italic=False, kind="title")
    L.label("derived from KEGG map00250 · drawn by GEMsMAP", -900, -620, size=10, weight=400, italic=True)
    return L.result()
