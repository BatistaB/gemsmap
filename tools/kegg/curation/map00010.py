"""Curation of KEGG map00010 — Glycolysis / Gluconeogenesis.

The biology comes from KEGG (flat files + KGML); the decisions below are the curator's. The layout is GEMsMAP's own
drawing (top → bottom, glycolysis down the middle, gluconeogenic bypasses on the right, branches to the sides),
not a copy of the KEGG map.
"""
from layout import Layout

TEMPLATE_ID = "kegg-map00010"
NAME = "Glycolysis / Gluconeogenesis (KEGG map00010)"
VERSION = "0.1.0"
CREATED = "2026-10-09T00:00:00Z"
DESCRIPTION = ("Embden–Meyerhof–Parnas glycolysis and gluconeogenesis with the branches KEGG map00010 draws: glucose-1P, "
               "the 2,3-bisphosphoglycerate shunt, non-phosphorylating GAPN, pyruvate fates (lactate, ethanol, acetate, acetyl-CoA) "
               "and the bacterial PTS route of aryl-β-glucosides. Derived from KEGG; drawn by GEMsMAP.")
SCOPE = {"level": "universal", "taxa": [], "note": "Core steps are conserved; G6Pase, PPDK/PPS, PDC/ADH, GAPN and the aryl-β-glucoside PTS route are organism-specific. Compartments are left unspecified (KEGG gives none): the matcher decides them in each GEM."}
TAGS = ["KEGG", "map00010", "glycolysis", "gluconeogenesis", "central carbon"]

# ----------------------------------------------------------------------------- entities drawn as pathway nodes
# key, KEGG compound, map label, KEGG anomers / specific forms folded onto this node (kept as related forms)
ENTITIES = [
    dict(key="glc", kegg="C00031", short="Glucose", related=["C00267", "C00221"]),
    dict(key="g6p", kegg="C00092", short="Glucose-6P", related=["C00668", "C01172"]),
    dict(key="f6p", kegg="C00085", short="Fructose-6P"),
    dict(key="fbp", kegg="C00354", short="Fructose-1,6P₂"),
    dict(key="dhap", kegg="C00111", short="DHAP"),
    dict(key="gap", kegg="C00118", short="GAP"),
    dict(key="bpg13", kegg="C00236", short="1,3-BPG"),
    dict(key="pg3", kegg="C00197", short="3-PG"),
    dict(key="pg2", kegg="C00631", short="2-PG"),
    dict(key="pep", kegg="C00074", short="PEP"),
    dict(key="pyr", kegg="C00022", short="Pyruvate"),
    dict(key="accoa", kegg="C00024", short="Acetyl-CoA"),
    dict(key="oaa", kegg="C00036", short="Oxaloacetate", level="recommended"),
    dict(key="lac", kegg="C00186", short="L-Lactate", level="optional"),
    dict(key="acald", kegg="C00084", short="Acetaldehyde", level="optional"),
    dict(key="etoh", kegg="C00469", short="Ethanol", level="optional"),
    dict(key="ac", kegg="C00033", short="Acetate", level="optional"),
    dict(key="g1p", kegg="C00103", short="Glucose-1P", level="optional"),
    dict(key="bpg23", kegg="C01159", short="2,3-BPG", level="optional"),
    dict(key="arb", kegg="C06186", short="Arbutin", level="optional"),
    dict(key="arb6p", kegg="C06187", short="Arbutin-6P", level="optional"),
    dict(key="sal", kegg="C01451", short="Salicin", level="optional"),
    dict(key="sal6p", kegg="C06188", short="Salicin-6P", level="optional"),
]

# side compounds of the equations (drawn small beside their arrows; water is never drawn)
COFACTORS = {
    "C00002": {"short": "ATP"}, "C00008": {"short": "ADP"}, "C00020": {"short": "AMP"},
    "C00003": {"short": "NAD⁺"}, "C00004": {"short": "NADH"}, "C00006": {"short": "NADP⁺"}, "C00005": {"short": "NADPH"},
    "C00009": {"short": "Pᵢ"}, "C00013": {"short": "PPᵢ"}, "C00001": {"short": "H2O"}, "C00011": {"short": "CO₂"}, "C00010": {"short": "CoA"},
    "C00530": {"short": "Hydroquinone"}, "C02323": {"short": "Salicyl alcohol"},
    "C04261": {"short": "P(π)-His-protein", "generic": True}, "C04262": {"short": "P(τ)-His-protein", "generic": True},
    "C00615": {"short": "His-protein", "generic": True},
}

# ----------------------------------------------------------------------------- reactions (drawn steps)
# kegg: identity of the drawn step; represents: map reactions it stands for (anomer-specific forms, parts of a lumped
# complex); variants: same step with another cofactor / donor (not drawn); main: drawn substrates → products
REACTIONS = [
    dict(key="HK", name="HK", canonical="hexokinase / glucokinase", kegg="R00299", represents=["R01786", "R01600"], main=(["glc"], ["g6p"]),
         hints=["HEX1", "GLCpts", "HXK"], variants=[
             dict(kegg="R09085", name="ADP-dependent glucokinase (α-D-glucose)"), dict(kegg="R09086", name="ADP-dependent glucokinase (β-D-glucose)"),
             dict(kegg="R02189", name="polyphosphate glucokinase (α-D-glucose)"), dict(kegg="R02187", name="polyphosphate glucokinase (β-D-glucose)"),
             dict(kegg="R02738", name="glucose PTS (EIIB^Glc)", note="group translocation; in GEMs a transport reaction from extracellular glucose with PEP → pyruvate")]),
    dict(key="G6PASE", name="G6Pase", canonical="glucose-6-phosphatase", kegg="R00303", represents=["R01788"], main=(["g6p"], ["glc"]), level="optional"),
    dict(key="PGI", name="PGI", canonical="glucose-6-phosphate isomerase", kegg="R00771", represents=["R13199"], main=(["g6p"], ["f6p"])),
    dict(key="PFK", name="PFK", canonical="6-phosphofructokinase", kegg="R00756", main=(["f6p"], ["fbp"]), variants=[
        dict(kegg="R00764", name="pyrophosphate-dependent PFK (PPi-PFK)", note="reversible; glycolysis and gluconeogenesis in plants and some protists and bacteria"),
        dict(kegg="R05805", name="ADP-dependent PFK")]),
    dict(key="FBPASE", name="FBPase", canonical="fructose-1,6-bisphosphatase", kegg="R00762", main=(["fbp"], ["f6p"]), level="recommended"),
    dict(key="FBA", name="FBA", canonical="fructose-bisphosphate aldolase", kegg="R01068", main=(["fbp"], ["dhap", "gap"])),
    dict(key="TPI", name="TPI", canonical="triose-phosphate isomerase", kegg="R01015", main=(["dhap"], ["gap"])),
    dict(key="GAPDH", name="GAPDH", canonical="glyceraldehyde-3-phosphate dehydrogenase (phosphorylating)", kegg="R01061", main=(["gap"], ["bpg13"]),
         variants=[dict(kegg="R01063", name="NADP-dependent GAPDH (GapB / GapC)")]),
    dict(key="GAPN", name="GAPN", canonical="glyceraldehyde-3-phosphate dehydrogenase (non-phosphorylating)", kegg="R01058", main=(["gap"], ["pg3"]), level="optional",
         variants=[dict(kegg="R10860", name="NAD-dependent GAPN"), dict(kegg="R07159", name="glyceraldehyde-3-phosphate:ferredoxin oxidoreductase (GAPOR, archaea)")]),
    dict(key="PGK", name="PGK", canonical="phosphoglycerate kinase", kegg="R01512", main=(["bpg13"], ["pg3"])),
    dict(key="BPGM", name="BPGM", canonical="bisphosphoglycerate mutase", kegg="R01662", main=(["bpg13"], ["bpg23"]), level="optional"),
    dict(key="BPG3", name="PGAM", canonical="phosphoglycerate mutase, priming with 2,3-BPG", kegg="R01516", main=(["bpg23"], ["pg3"]), level="optional"),
    dict(key="MIPP", name="MIPP1", canonical="2,3-bisphosphoglycerate 3-phosphatase", kegg="R09532", main=(["bpg23"], ["pg2"]), level="optional"),
    dict(key="PGAM", name="PGAM", canonical="phosphoglycerate mutase", kegg="R01518", main=(["pg3"], ["pg2"])),
    dict(key="ENO", name="ENO", canonical="enolase", kegg="R00658", main=(["pg2"], ["pep"])),
    dict(key="PK", name="PK", canonical="pyruvate kinase", kegg="R00200", main=(["pep"], ["pyr"])),
    dict(key="PPDK", name="PPDK", canonical="pyruvate, phosphate dikinase", kegg="R00206", main=(["pyr"], ["pep"]), level="optional",
         variants=[dict(kegg="R00199", name="phosphoenolpyruvate synthase (PPS)", note="ATP + pyruvate + H2O → AMP + PEP + Pi")]),
    dict(key="PEPCK", name="PEPCK", canonical="phosphoenolpyruvate carboxykinase", kegg="R00341", main=(["oaa"], ["pep"]), level="recommended",
         variants=[dict(kegg="R00431", name="GTP-dependent PEPCK (animals)"), dict(kegg="R00726", name="ITP-dependent PEPCK")]),
    dict(key="LDH", name="LDH", canonical="L-lactate dehydrogenase", kegg="R00703", main=(["pyr"], ["lac"]), level="optional"),
    dict(key="PDH", name="PDH", canonical="pyruvate dehydrogenase complex", kegg="R00209", represents=["R00014", "R03270", "R02569", "R07618"],
         main=(["pyr"], ["accoa"]), ec=["1.2.4.1", "2.3.1.12", "1.8.1.4"],
         note="drawn as the overall reaction; KEGG draws the E1/E2/E3 steps through enzyme-bound lipoyl intermediates",
         variants=[dict(kegg="R01196", name="pyruvate:ferredoxin oxidoreductase (PFOR, anaerobes)")]),
    dict(key="PDC", name="PDC", canonical="pyruvate decarboxylase", kegg="R00224", represents=["R00014", "R00755"], main=(["pyr"], ["acald"]), level="optional",
         note="drawn as the overall reaction; KEGG draws the two TPP-dependent half-reactions"),
    dict(key="ADH", name="ADH", canonical="alcohol dehydrogenase", kegg="R00754", main=(["acald"], ["etoh"]), level="optional", variants=[
        dict(kegg="R00746", name="NADP-dependent ADH"), dict(kegg="R09479", name="quinone-dependent ADH (PQQ)"),
        dict(kegg="R05198", name="cytochrome c-dependent ADH"), dict(kegg="R09127", name="cytochrome cL-dependent ADH (methylotrophs)")]),
    dict(key="ALDH", name="ALDH", canonical="aldehyde dehydrogenase", kegg="R00710", main=(["acald"], ["ac"]), level="optional",
         variants=[dict(kegg="R00711", name="NADP-dependent ALDH")]),
    dict(key="ACS", name="ACS", canonical="acetyl-CoA synthetase (AMP-forming)", kegg="R00235", main=(["ac"], ["accoa"]), level="optional"),
    dict(key="ACD", name="ACD", canonical="acetyl-CoA synthetase (ADP-forming)", kegg="R00229", main=(["accoa"], ["ac"]), level="optional"),
    dict(key="PGM", name="PGM", canonical="phosphoglucomutase", kegg="R08639", represents=["R00959"], main=(["g1p"], ["g6p"]), level="optional"),
    dict(key="G1PASE", name="G1Pase", canonical="glucose-1-phosphatase", kegg="R00947", main=(["g1p"], ["glc"]), level="optional"),
    dict(key="ARB_PTS", name="PTS", canonical="arbutin PTS (EIIBC^Arb)", kegg="R05132", main=(["arb"], ["arb6p"]), level="optional"),
    dict(key="ARB_GLU", name="BglA", canonical="6-phospho-β-glucosidase (arbutin 6-phosphate)", kegg="R05133", main=(["arb6p"], ["g6p"]), level="optional"),
    dict(key="SAL_PTS", name="PTS", canonical="salicin PTS", kegg="R04394", main=(["sal"], ["sal6p"]), level="optional"),
    dict(key="SAL_GLU", name="BglB", canonical="6-phospho-β-glucosidase (salicin 6-phosphate)", kegg="R05134", main=(["sal6p"], ["g6p"]), level="optional"),
]

# links to other pathways (ports, never matched to model reactions)
CONNECTORS = [
    dict(metabolite="g1p", direction="in", pathway="Starch and sucrose metabolism"),
    dict(metabolite="g6p", direction="out", pathway="Pentose phosphate pathway", template="kegg-map00030"),
    dict(metabolite="oaa", direction="in", pathway="Citrate cycle (TCA cycle)", template="kegg-map00020"),
    dict(metabolite="accoa", direction="out", pathway="Citrate cycle (TCA cycle)", template="kegg-map00020"),
]

OMITTED_COMPOUNDS = [
    dict(kegg="C00068", reason="thiamin diphosphate: enzyme-bound cofactor of the TPP-dependent half-reactions, regenerated inside the lumped PDH / PDC steps"),
    dict(kegg="C05125", reason="2-(α-hydroxyethyl)-ThPP: enzyme-bound intermediate of PDH / PDC (lumped)"),
    dict(kegg="C15972", reason="lipoamide-E: protein-bound intermediate of the PDH complex (lumped)"),
    dict(kegg="C15973", reason="dihydrolipoamide-E: protein-bound intermediate of the PDH complex (lumped)"),
    dict(kegg="C16255", reason="S-acetyldihydrolipoamide-E: protein-bound intermediate of the PDH complex (lumped)"),
]
OMITTED_REACTIONS = [
    dict(kegg="R01602", reason="α-D-glucose ⇌ β-D-glucose (mutarotation): implicit in the anomer-unspecified D-glucose node"),
    dict(kegg="R02739", reason="α-D-glucose 6-P ⇌ β-D-glucose 6-P (anomerase): implicit in the anomer-unspecified glucose 6-P node"),
]

DECISIONS = [
    "Hexose phosphates are drawn anomer-unspecified (D-glucose C00031, D-glucose 6-phosphate C00092), as most GEMs (BiGG, ModelSEED) encode them. KEGG map00010 draws the α/β anomers (C00267, C00221, C00668, C01172): they are kept as *related forms* of these nodes, so models that use anomers still match (scored as related forms), and the anomer-specific KEGG reactions are listed as the reactions each drawn step represents.",
    "Enzymes that catalyse the same step with another cofactor or phosphoryl donor are one drawn arrow with *variants* (PEPCK ATP/GTP/ITP, GAPDH NAD/NADP, PFK ATP/PPi/ADP, ADH NAD/NADP/quinone/cytochrome, ALDH NAD/NADP, glucokinases ATP/ADP/polyphosphate/PTS, PDH/PFOR, PPDK/PPS). The drawn stoichiometry is the most widespread form; the variants' EC numbers and IDs help the matcher.",
    "Routes with different products stay separate arrows: GAPN (GAP → 3-PG directly) next to GAPDH + PGK, the 2,3-BPG shunt, ACS (AMP-forming) and ACD (ADP-forming, the opposite direction).",
    "Multi-step complexes are drawn as their overall reaction: PDH (R00209; KEGG draws E1/E2/E3 through enzyme-bound lipoyl intermediates) and PDC (R00224; two TPP-dependent half-reactions). The KEGG steps are kept as provenance.",
    "Compartments are left unspecified: KEGG reference pathways have none, and glycolysis is plastidic as well as cytosolic in plants. The matcher picks the compartment in each GEM.",
    "Directionality follows the KGML of rn00010 (reversible / irreversible) for every drawn step.",
    "Cofactors are drawn beside each arrow as small attached nodes — repeated for every reaction, all pointing to the same entity (ATP is one entity drawn many times). Water and protons are left out of the drawing (water stays in the equations, protons are left out of the equations as in all GEMsMAP templates).",
    "Protein phosphoryl carriers (phospho-histidine proteins of the PTS and of the 2,3-BPG-primed PGAM, and the dephosphorylated His-protein) are generic entities: kept generic, flagged for review. On the PGAM priming step the carrier is the enzyme's own active-site histidine, so it stays in the equation but is not drawn; on the PTS steps (HPr / EIIB) it is drawn.",
    "Identities: an entity or reaction already confirmed in the GEMsMAP canonical library keeps that confirmation; every other identity is an AI suggestion (high confidence when KEGG → one MetaNetX chemical with a consistent formula and an unambiguous BiGG ID; probable otherwise) and goes to the review queue.",
]


def layout(L: Layout) -> dict:
    """Glycolysis top → bottom in the middle column; gluconeogenic bypasses as arcs on the right; side branches left/right."""
    X = 0
    H = -90  # the hexose half of the trunk stands above the middle of the two trioses: aldolase is a symmetric fork
    n = {}
    # ---- trunk
    for key, y in [("glc", 0), ("g6p", 100), ("f6p", 200), ("fbp", 300)]:
        n[key] = L.node(key, H, y)
    for key, y in [("gap", 400), ("bpg13", 500), ("pg3", 600), ("pg2", 700), ("pep", 800), ("pyr", 900), ("accoa", 1030)]:
        n[key] = L.node(key, X, y)
    n["dhap"] = L.node("dhap", -180, 400)
    n["bpg23"] = L.node("bpg23", -200, 600)
    n["g1p"] = L.node("g1p", H - 230, 50)
    n["oaa"] = L.node("oaa", 240, 750)
    n["lac"] = L.node("lac", -210, 900)
    n["acald"] = L.node("acald", 250, 980)
    n["etoh"] = L.node("etoh", 450, 980)
    n["ac"] = L.node("ac", 250, 1100)
    # aryl-β-glucosides (PTS) module, top left, with its own instance of glucose 6-P
    n["arb"] = L.node("arb", H - 620, -110)
    n["arb6p"] = L.node("arb6p", H - 450, -110)
    n["sal"] = L.node("sal", H - 620, -30)
    n["sal6p"] = L.node("sal6p", H - 450, -30)
    n["g6p_2"] = L.node("g6p", H - 270, -110)

    L.center = (0, 500)  # diagonal arrows bow away from the trunk
    # ---- glycolysis (straight, enzyme on the left, cofactors on the right)
    def step(key, a, b, **kw):
        r = L.reaction(key, [a], [b], **kw)
        return r
    cof = L.cofactors
    cof(step("HK", n["glc"], n["g6p"]))
    step("PGI", n["g6p"], n["f6p"])
    cof(step("PFK", n["f6p"], n["fbp"]))
    L.reaction("FBA", [n["fbp"]], [n["dhap"], n["gap"]])
    step("TPI", n["dhap"], n["gap"])
    cof(step("GAPDH", n["gap"], n["bpg13"]), step=12)  # a compact stack: the GAPN arc runs close on the right
    cof(step("PGK", n["bpg13"], n["pg3"]))
    step("PGAM", n["pg3"], n["pg2"])
    cof(step("ENO", n["pg2"], n["pep"]))
    pk = step("PK", n["pep"], n["pyr"])
    cof(pk, side="same")
    cof(step("PDH", n["pyr"], n["accoa"]))

    # ---- gluconeogenic bypasses: arcs on the right of the trunk (upward arrows: the normal points right)
    cof(step("G6PASE", n["g6p"], n["glc"], routing="curved", bend=75), side="same", along=24)
    cof(step("FBPASE", n["fbp"], n["f6p"], routing="curved", bend=75), side="same", along=24)
    cof(step("PPDK", n["pyr"], n["pep"], routing="curved", bend=60), side="same")  # two cofactors per side: the default spacing keeps both curves clear
    cof(step("PEPCK", n["oaa"], n["pep"]))

    # ---- GAPN bypass (right arc, outside the GAPDH / PGK cofactors) and the 2,3-BPG shunt (left)
    cof(step("GAPN", n["gap"], n["pg3"], routing="curved", bend=115, flip=True), side="same", along=24)
    step("BPGM", n["bpg13"], n["bpg23"])
    # the phospho-histidine of the priming step is PGAM's own active site: in the equation, not drawn
    cof(step("BPG3", n["bpg23"], n["pg3"]), only=())
    cof(step("MIPP", n["bpg23"], n["pg2"]))

    # ---- glucose-1P
    step("PGM", n["g1p"], n["g6p"])
    cof(step("G1PASE", n["g1p"], n["glc"]))

    # ---- pyruvate fates
    cof(step("LDH", n["pyr"], n["lac"]))
    cof(step("PDC", n["pyr"], n["acald"]))
    cof(step("ADH", n["acald"], n["etoh"]))
    cof(step("ALDH", n["acald"], n["ac"]))
    # two arcs bulging apart, enzyme and cofactors on the outside of each
    cof(step("ACS", n["ac"], n["accoa"], routing="curved", bend=28), side="same")
    cof(step("ACD", n["accoa"], n["ac"], routing="curved", bend=28), side="same")

    # ---- aryl-β-glucosides
    cof(step("ARB_PTS", n["arb"], n["arb6p"]))
    cof(step("SAL_PTS", n["sal"], n["sal6p"]))
    # arbutin route straight along the top row; the salicin route joins it with one curve bowing down and away
    cof(step("ARB_GLU", n["arb6p"], n["g6p_2"], flip=True), side="same")  # label and hydroquinone above: the space below is the salicin curve's
    cof(step("SAL_GLU", n["sal6p"], n["g6p_2"], routing="curved", bend=20))

    # ---- pathway links
    L.port("g1p>Starch and sucrose metabolism", H - 420, 50, n["g1p"])
    L.port("g6p>Pentose phosphate pathway", H + 260, 130, n["g6p"])
    L.port("oaa>Citrate cycle (TCA cycle)", 420, 750, n["oaa"])
    L.port("accoa>Citrate cycle (TCA cycle)", 0, 1150, n["accoa"])

    # ---- modules
    L.group("Aryl-β-D-glucosides (PTS, bacteria)", [n["arb"], n["arb6p"], n["sal"], n["sal6p"], n["g6p_2"]])
    L.label("Glycolysis / Gluconeogenesis", H - 640, -200, size=16, weight=700, italic=False, kind="title")
    L.label("derived from KEGG map00010 · drawn by GEMsMAP", H - 640, -180, size=10, weight=400, italic=True)
    L.label("2,3-BPG shunt", -270, 550)
    L.label("Fermentation", 300, 930)
    return L.result()
