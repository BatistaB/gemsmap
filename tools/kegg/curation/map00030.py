"""Curation of KEGG map00030 — Pentose phosphate pathway.

The biology comes from KEGG (flat files + KGML); the decisions below are the curator's. The layout is GEMsMAP's own
drawing (oxidative phase across the top, the non-oxidative transketolase / transaldolase cascade as a two-column
ladder below it, Entner–Doudoroff and the side routes as modules around), not a copy of the KEGG map.
"""
from layout import Layout

TEMPLATE_ID = "kegg-map00030"
NAME = "Pentose phosphate pathway (KEGG map00030)"
VERSION = "0.1.0"
CREATED = "2026-10-09T00:00:00Z"
DESCRIPTION = ("Oxidative and non-oxidative pentose phosphate pathway with the routes KEGG map00030 draws around it: Entner–Doudoroff, "
               "periplasmic glucose oxidation and the 2-ketogluconate route (bacteria), the non- and semi-phosphorylative ED (archaea), "
               "ribose / PRPP / deoxyribose, the ribulose monophosphate (RuMP) shunt of methylotrophs, sedoheptulose kinase and "
               "phosphoketolase. Derived from KEGG; drawn by GEMsMAP.")
SCOPE = {"level": "universal", "taxa": [], "note": "The oxidative and non-oxidative phases are conserved; ED, glucose oxidation, the archaeal routes, RuMP and phosphoketolase are organism-specific (optional). Compartments are chosen by the person mapping onto a GEM (cytosol, plastid…)."}
TAGS = ["KEGG", "map00030", "pentose phosphate pathway", "Entner-Doudoroff", "central carbon"]

# ----------------------------------------------------------------------------- entities drawn as pathway nodes
ENTITIES = [
    dict(key="g6p", kegg="C00092", short="Glucose-6P", related=["C00668", "C01172"]),
    dict(key="pgl", kegg="C01236", short="6P-Gluconolactone"),
    dict(key="pg6", kegg="C00345", short="6P-Gluconate"),
    dict(key="ru5p", kegg="C00199", short="Ribulose-5P"),
    dict(key="r5p", kegg="C00117", short="Ribose-5P"),
    dict(key="xu5p", kegg="C00231", short="Xylulose-5P"),
    dict(key="s7p", kegg="C05382", short="Sedoheptulose-7P"),
    dict(key="gap", kegg="C00118", short="GAP"),
    dict(key="e4p", kegg="C00279", short="Erythrose-4P"),
    dict(key="f6p", kegg="C00085", short="Fructose-6P"),
    # Entner–Doudoroff
    dict(key="kdpg", kegg="C04442", short="KDPG", level="recommended"),
    dict(key="pyr", kegg="C00022", short="Pyruvate", level="recommended"),
    # glucose oxidation / 2-ketogluconate (bacteria)
    dict(key="glc", kegg="C00031", short="Glucose", related=["C00221"], level="optional"),
    dict(key="gl", kegg="C00198", short="Gluconolactone", level="optional"),
    dict(key="glcn", kegg="C00257", short="Gluconate", level="optional"),
    dict(key="kg", kegg="C06473", short="2-Ketogluconate", level="optional"),
    dict(key="kg6p", kegg="C01218", short="2-Keto-6P-gluconate", level="optional"),
    # non- / semi-phosphorylative ED (archaea)
    dict(key="kdg", kegg="C00204", short="KDG", level="optional"),
    dict(key="glyald", kegg="C00577", short="Glyceraldehyde", level="optional"),
    dict(key="glyc", kegg="C00258", short="Glycerate", level="optional"),
    dict(key="pg2", kegg="C00631", short="2-PG", level="optional"),
    # side routes
    dict(key="h6p", kegg="C06019", short="Hexulose-6P", level="optional"),
    dict(key="sed", kegg="C02076", short="Sedoheptulose", level="optional"),
    dict(key="prpp", kegg="C00119", short="PRPP", level="optional"),
    dict(key="rib", kegg="C00121", short="Ribose", level="optional"),
    dict(key="r1p", kegg="C00620", short="Ribose-1P", level="optional"),
    dict(key="r15bp", kegg="C01151", short="Ribose-1,5P₂", level="optional"),
    dict(key="rubp", kegg="C01182", short="Ribulose-1,5P₂", level="optional"),
    dict(key="drib", kegg="C01801", short="Deoxyribose", level="optional"),
    dict(key="dr1p", kegg="C00672", short="Deoxyribose-1P", level="optional"),
    dict(key="dr5p", kegg="C00673", short="Deoxyribose-5P", level="optional"),
]

COFACTORS = {
    "C00002": {"short": "ATP"}, "C00008": {"short": "ADP"}, "C00020": {"short": "AMP"},
    "C00003": {"short": "NAD⁺"}, "C00004": {"short": "NADH"}, "C00006": {"short": "NADP⁺"}, "C00005": {"short": "NADPH"},
    "C00009": {"short": "Pᵢ"}, "C00001": {"short": "H2O"}, "C00011": {"short": "CO₂"},
    "C00016": {"short": "FAD"}, "C01352": {"short": "FADH₂"},
    "C15602": {"short": "Q", "generic": True}, "C15603": {"short": "QH₂", "generic": True},
    "C00084": {"short": "Acetaldehyde"}, "C00067": {"short": "Formaldehyde"}, "C00227": {"short": "Acetyl-P"},
}

# ----------------------------------------------------------------------------- reactions (drawn steps)
REACTIONS = [
    # oxidative phase
    dict(key="G6PDH", name="G6PDH", canonical="glucose-6-phosphate dehydrogenase", kegg="R02736", main=(["g6p"], ["pgl"]),
         variants=[dict(kegg="R10907", name="NAD-dependent G6PDH")]),
    dict(key="PGL", name="PGL", canonical="6-phosphogluconolactonase", kegg="R02035", main=(["pgl"], ["pg6"])),
    dict(key="GND", name="GND", canonical="6-phosphogluconate dehydrogenase (decarboxylating)", kegg="R01528", main=(["pg6"], ["ru5p"]),
         variants=[dict(kegg="R10221", name="NAD-dependent GND")]),
    # non-oxidative phase
    dict(key="RPI", name="RPI", canonical="ribose-5-phosphate isomerase", kegg="R01056", main=(["ru5p"], ["r5p"])),
    dict(key="RPE", name="RPE", canonical="ribulose-phosphate 3-epimerase", kegg="R01529", main=(["ru5p"], ["xu5p"])),
    dict(key="TKT1", name="TKT", canonical="transketolase (sedoheptulose-7P)", kegg="R01641", main=(["r5p", "xu5p"], ["s7p", "gap"])),
    dict(key="TAL", name="TAL", canonical="transaldolase", kegg="R08575", main=(["s7p", "gap"], ["f6p", "e4p"])),
    dict(key="TKT2", name="TKT", canonical="transketolase (erythrose-4P)", kegg="R01067", main=(["e4p", "xu5p"], ["f6p", "gap"])),
    # Entner–Doudoroff
    dict(key="EDD", name="EDD", canonical="6-phosphogluconate dehydratase", kegg="R02036", main=(["pg6"], ["kdpg"]), level="recommended"),
    dict(key="EDA", name="EDA", canonical="KDPG aldolase", kegg="R05605", main=(["kdpg"], ["gap", "pyr"]), level="recommended"),
    # glucose oxidation and the 2-ketogluconate route
    dict(key="GDH", name="GDH", canonical="glucose dehydrogenase (quinone, PQQ)", kegg="R00305", main=(["glc"], ["gl"]), level="optional", variants=[
        dict(kegg="R06620", name="glucose dehydrogenase (ubiquinone)"), dict(kegg="R07147", name="glucose 1-dehydrogenase (NADP)"),
        dict(kegg="R01520", name="glucose 1-dehydrogenase (NAD, β-D-glucose)"), dict(kegg="R01521", name="glucose 1-dehydrogenase (NADP, β-D-glucose)"),
        dict(kegg="R01522", name="glucose oxidase (O₂ → H₂O₂, β-D-glucose)")]),
    dict(key="GLNL", name="GNL", canonical="gluconolactonase", kegg="R01519", main=(["gl"], ["glcn"]), level="optional"),
    dict(key="GNTK", name="GNTK", canonical="gluconokinase", kegg="R01737", main=(["glcn"], ["pg6"]), level="optional"),
    dict(key="GADH", name="GADH", canonical="gluconate 2-dehydrogenase", kegg="R01741", main=(["glcn"], ["kg"]), level="optional",
         variants=[dict(kegg="R01739", name="2-ketogluconate reductase (NADP, reversible)")]),
    dict(key="KGK", name="KGUK", canonical="2-ketogluconokinase", kegg="R02658", main=(["kg"], ["kg6p"]), level="optional"),
    dict(key="KGR", name="KGUD", canonical="2-ketogluconate-6-phosphate reductase", kegg="R02034", main=(["kg6p"], ["pg6"]), level="optional",
         reversible=None, variants=[dict(kegg="R02032", name="NAD-dependent form")],
         review="KGML lists R02034 as irreversible in the oxidative direction (6P-gluconate → 2-keto-6P-gluconate), but the 2-ketogluconate route (Pseudomonas KguD) reduces 2-keto-6P-gluconate to 6P-gluconate; drawn in the physiological direction, reversibility left open"),
    # non- and semi-phosphorylative ED (archaea)
    dict(key="GAD", name="GAD", canonical="gluconate dehydratase", kegg="R01538", main=(["glcn"], ["kdg"]), level="optional"),
    dict(key="KDGK", name="KDGK", canonical="2-keto-3-deoxygluconate kinase", kegg="R01541", main=(["kdg"], ["kdpg"]), level="optional"),
    dict(key="KDGA", name="KDGA", canonical="2-keto-3-deoxygluconate aldolase", kegg="R08570", main=(["kdg"], ["glyald", "pyr"]), level="optional"),
    dict(key="GLAD", name="GADH", canonical="glyceraldehyde dehydrogenase (NADP)", kegg="R10615", main=(["glyald"], ["glyc"]), level="optional", variants=[
        dict(kegg="R08571", name="glyceraldehyde:ferredoxin oxidoreductase (GAOR)"), dict(kegg="R10324", name="glyceraldehyde dehydrogenase (acceptor)")]),
    dict(key="GK", name="GK", canonical="glycerate 2-kinase", kegg="R08572", main=(["glyc"], ["pg2"]), level="optional"),
    # side routes
    dict(key="HPS", name="HPS", canonical="3-hexulose-6-phosphate synthase", kegg="R05338", main=(["ru5p"], ["h6p"]), level="optional"),
    dict(key="PHI", name="PHI", canonical="6-phospho-3-hexuloisomerase", kegg="R05339", main=(["h6p"], ["f6p"]), level="optional"),
    dict(key="SHK", name="SHPK", canonical="sedoheptulokinase", kegg="R01844", main=(["sed"], ["s7p"]), level="optional"),
    dict(key="XPK", name="XPK", canonical="phosphoketolase", kegg="R01621", main=(["xu5p"], ["gap"]), level="optional"),
    dict(key="RBK", name="RBK", canonical="ribokinase", kegg="R01051", main=(["rib"], ["r5p"]), level="optional"),
    dict(key="PPM", name="PPM", canonical="phosphopentomutase (ribose)", kegg="R01057", main=(["r1p"], ["r5p"]), level="optional"),
    dict(key="PRPS", name="PRPS", canonical="ribose-phosphate pyrophosphokinase", kegg="R01049", main=(["r5p"], ["prpp"]), level="optional"),
    dict(key="R1PK", name="R1PK", canonical="ribose 1-phosphate kinase", kegg="R13089", represents=["R06837"], main=(["r1p"], ["r15bp"]), level="optional",
         variants=[dict(kegg="R11535", name="ADP-dependent ribose-1-phosphate kinase (archaea)")]),
    dict(key="R15BPK", name="PRPK", canonical="ribose 1,5-bisphosphate phosphokinase", kegg="R06836", main=(["r15bp"], ["prpp"]), level="optional"),
    dict(key="R15BPI", name="R15PI", canonical="ribose 1,5-bisphosphate isomerase", kegg="R10555", main=(["r15bp"], ["rubp"]), level="optional"),
    dict(key="DRBK", name="DRBK", canonical="deoxyribokinase", kegg="R02750", main=(["drib"], ["dr5p"]), level="optional"),
    dict(key="PPM2", name="PPM", canonical="phosphopentomutase (deoxyribose)", kegg="R02749", main=(["dr1p"], ["dr5p"]), level="optional"),
    dict(key="DERA", name="DERA", canonical="deoxyribose-phosphate aldolase", kegg="R01066", main=(["dr5p"], ["gap"]), level="optional"),
]

CONNECTORS = [
    dict(metabolite="g6p", direction="in", pathway="Glycolysis / Gluconeogenesis", template="kegg-map00010"),
    dict(metabolite="f6p", direction="out", pathway="Glycolysis / Gluconeogenesis", template="kegg-map00010"),
    dict(metabolite="gap", direction="out", pathway="Glycolysis / Gluconeogenesis", template="kegg-map00010"),
    dict(metabolite="prpp", direction="out", pathway="Purine metabolism"),
]

OMITTED_COMPOUNDS = [
    dict(kegg="C00354", reason="fructose 1,6-bisphosphate: PFK / FBPase / aldolase are glycolysis steps, drawn in the Glycolysis / Gluconeogenesis template (port at fructose-6P and GAP)"),
    dict(kegg="C00197", reason="3-phosphoglycerate: product of GAPN, a glycolysis step drawn in the Glycolysis / Gluconeogenesis template"),
    dict(kegg="C03752", reason="glucosaminate: amino-sugar acid catabolism of a few bacteria entering ED at KDG / KDPG; left out to keep the map readable"),
    dict(kegg="C20589", reason="glucosaminate 6-phosphate: same glucosaminate route (PTS)"),
]
OMITTED_REACTIONS = [
    dict(kegg="R00756", reason="6-phosphofructokinase: glycolysis step, drawn in the Glycolysis / Gluconeogenesis template"),
    dict(kegg="R00764", reason="PPi-dependent PFK: glycolysis step (variant of PFK in the Glycolysis / Gluconeogenesis template)"),
    dict(kegg="R05805", reason="ADP-dependent PFK: glycolysis step (variant of PFK in the Glycolysis / Gluconeogenesis template)"),
    dict(kegg="R00762", reason="fructose-1,6-bisphosphatase: gluconeogenesis step, drawn in the Glycolysis / Gluconeogenesis template"),
    dict(kegg="R01068", reason="fructose-bisphosphate aldolase: glycolysis step, drawn in the Glycolysis / Gluconeogenesis template"),
    dict(kegg="R13199", reason="glucose-6-phosphate isomerase: glycolysis step, drawn in the Glycolysis / Gluconeogenesis template"),
    dict(kegg="R01058", reason="non-phosphorylating GAPN: glycolysis step, drawn in the Glycolysis / Gluconeogenesis template"),
    dict(kegg="R10860", reason="NAD-dependent GAPN: glycolysis step (variant of GAPN in the Glycolysis / Gluconeogenesis template)"),
    dict(kegg="R02739", reason="α-D-glucose 6-P ⇌ β-D-glucose 6-P (anomerase): implicit in the anomer-unspecified glucose 6-P node"),
    dict(kegg="R01544", reason="glucosaminate ammonia-lyase: glucosaminate route, left out (see the omitted compounds)"),
    dict(kegg="R10407", reason="glucosaminate PTS: glucosaminate route, left out (see the omitted compounds)"),
    dict(kegg="R10408", reason="glucosaminate-6-phosphate ammonia-lyase: glucosaminate route, left out (see the omitted compounds)"),
]

DECISIONS = [
    "The oxidative phase runs left → right across the top (glucose-6P → 6P-gluconolactone → 6P-gluconate → ribulose-5P); the non-oxidative phase is a two-column ladder below ribulose-5P, each transketolase / transaldolase step a symmetric 2 → 2 fork. Aligned nodes are joined by straight arrows, the others by curved arrows.",
    "Glucose 6-phosphate is anomer-unspecified (C00092) with the α / β anomers kept as related forms; G6PDH acts on the β-anomer in KEGG (R02736), folded onto that node. The KEGG anomerase (R02739) is implicit.",
    "Glycolysis steps KEGG repeats on this map (PGI, PFK, FBPase, aldolase, GAPN) are not drawn twice: fructose-6P and GAP link to the Glycolysis / Gluconeogenesis template through ports.",
    "Pentose phosphates repeat as separate visual instances where a second copy avoids crossings (xylulose-5P, fructose-6P, GAP, ribose-5P, pyruvate, gluconate, KDPG) — all instances point to the same entity.",
    "Organism-specific routes are optional modules around the core: Entner–Doudoroff (bacteria), periplasmic glucose oxidation and the 2-ketogluconate route (bacteria), non- and semi-phosphorylative ED (archaea), ribose / PRPP / deoxyribose salvage, RuMP (methylotrophs), sedoheptulose kinase and phosphoketolase.",
    "Same step, other cofactor or acceptor → one arrow with variants: G6PDH and GND (NADP / NAD), glucose dehydrogenase (PQQ-quinone / ubiquinone / NAD(P) / glucose oxidase), gluconate 2-dehydrogenase (FAD / NADP), glyceraldehyde dehydrogenase (NADP / ferredoxin / acceptor), ribose-1P kinase (ATP / ADP).",
    "2-keto-6P-gluconate reductase is drawn in the physiological direction of the 2-ketogluconate route although KGML lists the oxidative direction as irreversible: reversibility left open and flagged for review.",
    "The glucosaminate route (C03752, C20589; R01544, R10407, R10408) is left out of the drawing with its reason: a peripheral amino-sugar acid catabolism of a few bacteria.",
    "Quinone / quinol of glucose dehydrogenase are generic entities, flagged for review. Water and protons are not drawn.",
    "Compartments are not part of the template: the person chooses them when mapping onto a GEM (cytosol, plastid, glycosome…).",
]


def layout(L: Layout) -> dict:
    L.center = (500, 400)
    n = {}
    # oxidative phase (top row) and the glucose-oxidation row above it
    for key, x in [("g6p", 0), ("pgl", 200), ("pg6", 400), ("ru5p", 670)]:
        n[key] = L.node(key, x, 0)
    for key, x in [("glc", 0), ("gl", 200), ("glcn", 400), ("kg", 640)]:
        n[key] = L.node(key, x, -200)
    n["kg6p"] = L.node("kg6p", 640, -100)
    # non-oxidative ladder
    for key, x, y in [("r5p", 570, 170), ("xu5p", 770, 170), ("s7p", 570, 340), ("gap", 770, 340), ("f6p", 570, 510), ("e4p", 770, 510)]:
        n[key] = L.node(key, x, y)
    n["xu5p_2"] = L.node("xu5p", 970, 510)
    n["f6p_2"] = L.node("f6p", 770, 680)
    n["gap_2"] = L.node("gap", 970, 680)
    # Entner–Doudoroff
    n["kdpg"] = L.node("kdpg", 400, 170)
    n["gap_3"] = L.node("gap", 330, 340)
    n["pyr"] = L.node("pyr", 470, 340)
    # non- / semi-phosphorylative ED
    n["glcn_2"] = L.node("glcn", 100, 340)
    n["kdg"] = L.node("kdg", 100, 510)
    n["kdpg_2"] = L.node("kdpg", 260, 510)
    n["glyald"] = L.node("glyald", 0, 680)
    n["pyr_2"] = L.node("pyr", 200, 680)
    n["glyc"] = L.node("glyc", 0, 850)
    n["pg2"] = L.node("pg2", 0, 1020)
    # side routes
    n["h6p"] = L.node("h6p", 920, 0)
    n["f6p_3"] = L.node("f6p", 920, -150)
    n["sed"] = L.node("sed", 440, 450)
    n["gap_4"] = L.node("gap", 970, 170)
    n["rib"] = L.node("rib", 400, 830)
    n["r5p_2"] = L.node("r5p", 600, 830)
    n["r1p"] = L.node("r1p", 800, 830)
    n["prpp"] = L.node("prpp", 600, 990)
    n["r15bp"] = L.node("r15bp", 800, 990)
    n["rubp"] = L.node("rubp", 1000, 990)
    n["drib"] = L.node("drib", 400, 1130)
    n["dr5p"] = L.node("dr5p", 600, 1130)
    n["dr1p"] = L.node("dr1p", 800, 1130)
    n["gap_5"] = L.node("gap", 600, 1280)

    cof = L.cofactors
    R = L.reaction
    cof(R("G6PDH", [n["g6p"]], [n["pgl"]]))
    cof(R("PGL", [n["pgl"]], [n["pg6"]]))
    cof(R("GND", [n["pg6"]], [n["ru5p"]]))
    R("RPI", [n["ru5p"]], [n["r5p"]])
    R("RPE", [n["ru5p"]], [n["xu5p"]])
    R("TKT1", [n["r5p"], n["xu5p"]], [n["s7p"], n["gap"]])
    R("TAL", [n["s7p"], n["gap"]], [n["f6p"], n["e4p"]])
    R("TKT2", [n["e4p"], n["xu5p_2"]], [n["f6p_2"], n["gap_2"]])
    cof(R("EDD", [n["pg6"]], [n["kdpg"]]))
    R("EDA", [n["kdpg"]], [n["gap_3"], n["pyr"]])
    cof(R("GDH", [n["glc"]], [n["gl"]]))
    cof(R("GLNL", [n["gl"]], [n["glcn"]]))
    cof(R("GNTK", [n["glcn"]], [n["pg6"]]))
    cof(R("GADH", [n["glcn"]], [n["kg"]]))
    cof(R("KGK", [n["kg"]], [n["kg6p"]]))
    cof(R("KGR", [n["kg6p"]], [n["pg6"]]))
    cof(R("GAD", [n["glcn_2"]], [n["kdg"]]))
    cof(R("KDGK", [n["kdg"]], [n["kdpg_2"]]))
    R("KDGA", [n["kdg"]], [n["glyald"], n["pyr_2"]])
    cof(R("GLAD", [n["glyald"]], [n["glyc"]]))
    cof(R("GK", [n["glyc"]], [n["pg2"]]))
    cof(R("HPS", [n["ru5p"]], [n["h6p"]]))
    R("PHI", [n["h6p"]], [n["f6p_3"]])
    cof(R("SHK", [n["sed"]], [n["s7p"]]))
    cof(R("XPK", [n["xu5p"]], [n["gap_4"]]))
    cof(R("RBK", [n["rib"]], [n["r5p_2"]]))
    R("PPM", [n["r1p"]], [n["r5p_2"]])
    cof(R("PRPS", [n["r5p_2"]], [n["prpp"]]))
    cof(R("R1PK", [n["r1p"]], [n["r15bp"]]))
    cof(R("R15BPK", [n["r15bp"]], [n["prpp"]]))
    R("R15BPI", [n["r15bp"]], [n["rubp"]])
    cof(R("DRBK", [n["drib"]], [n["dr5p"]]))
    R("PPM2", [n["dr1p"]], [n["dr5p"]])
    cof(R("DERA", [n["dr5p"]], [n["gap_5"]]))

    L.port("g6p>Glycolysis / Gluconeogenesis", -260, 0, n["g6p"])
    L.port("f6p>Glycolysis / Gluconeogenesis", 570, 600, n["f6p"])
    L.port("gap>Glycolysis / Gluconeogenesis", 1020, 340, n["gap"])
    L.port("prpp>Purine metabolism", 370, 990, n["prpp"])

    L.group("Glucose oxidation · 2-ketogluconate (bacteria)", [n["glc"], n["gl"], n["glcn"], n["kg"], n["kg6p"]])
    L.group("Non- / semi-phosphorylative ED (archaea)", [n["glcn_2"], n["kdg"], n["kdpg_2"], n["glyald"], n["pyr_2"], n["glyc"], n["pg2"]])
    L.group("Ribose, PRPP and deoxyribose", [n["rib"], n["r5p_2"], n["r1p"], n["prpp"], n["r15bp"], n["rubp"], n["drib"], n["dr5p"], n["dr1p"], n["gap_5"]])
    L.group("RuMP (methylotrophs)", [n["h6p"], n["f6p_3"]])
    L.label("Entner–Doudoroff", 180, 260)
    L.label("Pentose phosphate pathway", -300, -340, size=16, weight=700, italic=False, kind="title")
    L.label("derived from KEGG map00030 · drawn by GEMsMAP", -300, -320, size=10, weight=400, italic=True)
    return L.result()
