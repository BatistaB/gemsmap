"""Curation of KEGG map00020 — Citrate cycle (TCA cycle).

The biology comes from KEGG (flat files + KGML); the decisions below are the curator's. The layout is GEMsMAP's own
drawing (the cycle as a circle, clockwise from oxaloacetate, enzymes inside and cofactors outside; pyruvate entry
and anaplerosis above), not a copy of the KEGG map.
"""
import math

from layout import Layout

TEMPLATE_ID = "kegg-map00020"
NAME = "Citrate cycle (TCA cycle) (KEGG map00020)"
VERSION = "0.1.0"
CREATED = "2026-10-09T00:00:00Z"
DESCRIPTION = ("The citrate cycle with the entries and exits KEGG map00020 draws: pyruvate dehydrogenase, pyruvate carboxylase and "
               "PEP carboxykinase (anaplerosis), ATP-citrate lyase (citrate cleavage, reductive TCA / lipogenesis) and cis-aconitate "
               "as the aconitase intermediate. Derived from KEGG; drawn by GEMsMAP.")
SCOPE = {"level": "universal", "taxa": [], "note": "The cycle is conserved; ATP-citrate lyase, PC and the ferredoxin-dependent oxidoreductases (PFOR, OGOR) are organism-specific. Compartments are left to the person mapping onto a GEM (mitochondrial in eukaryotes, cytosolic in prokaryotes)."}
TAGS = ["KEGG", "map00020", "TCA cycle", "citrate cycle", "central carbon"]

# ----------------------------------------------------------------------------- entities drawn as pathway nodes
ENTITIES = [
    dict(key="pyr", kegg="C00022", short="Pyruvate", level="recommended"),
    dict(key="accoa", kegg="C00024", short="Acetyl-CoA"),
    dict(key="oaa", kegg="C00036", short="Oxaloacetate"),
    dict(key="cit", kegg="C00158", short="Citrate"),
    dict(key="acon", kegg="C00417", short="cis-Aconitate", level="recommended"),
    dict(key="icit", kegg="C00311", short="Isocitrate"),
    dict(key="akg", kegg="C00026", short="2-Oxoglutarate"),
    dict(key="succoa", kegg="C00091", short="Succinyl-CoA"),
    dict(key="succ", kegg="C00042", short="Succinate"),
    dict(key="fum", kegg="C00122", short="Fumarate"),
    dict(key="mal", kegg="C00149", short="Malate"),
    dict(key="pep", kegg="C00074", short="PEP", level="optional"),
]

COFACTORS = {
    "C00002": {"short": "ATP"}, "C00008": {"short": "ADP"}, "C00009": {"short": "Pᵢ"},
    "C00003": {"short": "NAD⁺"}, "C00004": {"short": "NADH"}, "C00001": {"short": "H2O"}, "C00011": {"short": "CO₂"},
    "C00010": {"short": "CoA"}, "C00288": {"short": "HCO₃⁻"},
    "C15602": {"short": "Q", "generic": True}, "C15603": {"short": "QH₂", "generic": True},
}

# ----------------------------------------------------------------------------- reactions (drawn steps)
REACTIONS = [
    dict(key="PDH", name="PDH", canonical="pyruvate dehydrogenase complex", kegg="R00209", represents=["R00014", "R03270", "R02569", "R07618"],
         main=(["pyr"], ["accoa"]), ec=["1.2.4.1", "2.3.1.12", "1.8.1.4"], level="recommended",
         note="drawn as the overall reaction; KEGG draws the E1/E2/E3 steps through enzyme-bound lipoyl intermediates",
         variants=[dict(kegg="R01196", name="pyruvate:ferredoxin oxidoreductase (PFOR, anaerobes; also reductive TCA)")]),
    dict(key="CS", name="CS", canonical="citrate synthase", kegg="R00351", main=(["accoa", "oaa"], ["cit"])),
    dict(key="ACO1", name="ACO", canonical="aconitase (citrate → cis-aconitate)", kegg="R01325", main=(["cit"], ["acon"])),
    dict(key="ACO2", name="ACO", canonical="aconitase (cis-aconitate → isocitrate)", kegg="R01900", main=(["acon"], ["icit"])),
    dict(key="IDH", name="IDH", canonical="isocitrate dehydrogenase", kegg="R00709", represents=["R01899", "R00268"], main=(["icit"], ["akg"]),
         note="NAD-IDH drawn; KEGG draws the NADP-IDH (variant R00267) as two half-reactions through enzyme-bound oxalosuccinate",
         variants=[dict(kegg="R00267", name="NADP-dependent IDH (bacteria; cytosolic / mitochondrial IDP in eukaryotes)")]),
    dict(key="OGDH", name="OGDH", canonical="2-oxoglutarate dehydrogenase complex", kegg="R08549", represents=["R00621", "R03316", "R02570", "R07618"],
         main=(["akg"], ["succoa"]), ec=["1.2.4.2", "2.3.1.61", "1.8.1.4"],
         note="drawn as the overall reaction; KEGG draws the E1/E2/E3 steps through enzyme-bound intermediates",
         variants=[dict(kegg="R01197", name="2-oxoglutarate:ferredoxin oxidoreductase (OGOR, anaerobes; reductive TCA)")]),
    dict(key="SCS", name="SCS", canonical="succinyl-CoA synthetase", kegg="R00405", main=(["succoa"], ["succ"]), variants=[
        dict(kegg="R00432", name="GTP-forming SCS (animals)"), dict(kegg="R00727", name="ITP-forming SCS"),
        dict(kegg="R10343", name="succinyl-CoA:acetate CoA-transferase (SCACT, acetic acid bacteria / trypanosomes)", note="CoA goes to acetate instead of ADP + Pi")]),
    dict(key="SDH", name="SDH", canonical="succinate dehydrogenase (complex II)", kegg="R02164", main=(["succ"], ["fum"]),
         variants=[dict(kegg="R13137", name="succinate:cytochrome c oxidoreductase")]),
    dict(key="FUM", name="FUM", canonical="fumarase", kegg="R01082", main=(["fum"], ["mal"])),
    dict(key="MDH", name="MDH", canonical="malate dehydrogenase", kegg="R00342", main=(["mal"], ["oaa"]),
         variants=[dict(kegg="R00361", name="malate:quinone oxidoreductase (MQO)")]),
    dict(key="PC", name="PC", canonical="pyruvate carboxylase", kegg="R00344", main=(["pyr"], ["oaa"]), level="optional"),
    dict(key="PEPCK", name="PEPCK", canonical="phosphoenolpyruvate carboxykinase", kegg="R00341", main=(["oaa"], ["pep"]), level="optional",
         variants=[dict(kegg="R00431", name="GTP-dependent PEPCK (animals)"), dict(kegg="R00726", name="ITP-dependent PEPCK")]),
    dict(key="ACL", name="ACL", canonical="ATP-citrate lyase", kegg="R00352", main=(["cit"], ["accoa", "oaa"]), level="optional"),
]

CONNECTORS = [
    dict(metabolite="pyr", direction="in", pathway="Glycolysis / Gluconeogenesis", template="kegg-map00010"),
    dict(metabolite="pep", direction="out", pathway="Glycolysis / Gluconeogenesis", template="kegg-map00010"),
    dict(metabolite="accoa", direction="out", pathway="Fatty acid biosynthesis"),
    dict(metabolite="akg", direction="out", pathway="Alanine, aspartate and glutamate metabolism"),
    dict(metabolite="succoa", direction="in", pathway="Valine, leucine and isoleucine degradation"),
    dict(metabolite="icit", direction="out", pathway="Glyoxylate and dicarboxylate metabolism"),
]

OMITTED_COMPOUNDS = [
    dict(kegg="C00068", reason="thiamin diphosphate: enzyme-bound cofactor of the E1 half-reactions, regenerated inside the lumped PDH / OGDH steps"),
    dict(kegg="C05125", reason="2-(α-hydroxyethyl)-ThPP: enzyme-bound intermediate of PDH (lumped)"),
    dict(kegg="C05381", reason="3-carboxy-1-hydroxypropyl-ThPP: enzyme-bound intermediate of OGDH (lumped)"),
    dict(kegg="C15972", reason="lipoamide-E: protein-bound intermediate of the PDH / OGDH complexes (lumped)"),
    dict(kegg="C15973", reason="dihydrolipoamide-E: protein-bound intermediate of the PDH / OGDH complexes (lumped)"),
    dict(kegg="C16254", reason="S-succinyldihydrolipoamide-E: protein-bound intermediate of OGDH (lumped)"),
    dict(kegg="C16255", reason="S-acetyldihydrolipoamide-E: protein-bound intermediate of PDH (lumped)"),
    dict(kegg="C05379", reason="oxalosuccinate: enzyme-bound intermediate of NADP-IDH; its two half-reactions are represented by the IDH step"),
]
OMITTED_REACTIONS = []

DECISIONS = [
    "The cycle is drawn as a circle, clockwise from oxaloacetate; every step between two non-aligned nodes is a curved arrow bowing outwards. Enzyme names sit inside the circle and cofactors outside, as on textbook drawings.",
    "Multi-step complexes are drawn as their overall reaction: PDH (R00209) and OGDH (R08549); KEGG draws their E1/E2/E3 steps through enzyme-bound ThPP and lipoyl intermediates, kept as provenance (represented reactions) and listed as omitted compounds with the reason.",
    "Aconitase is drawn in two steps through cis-aconitate, as KEGG and most genome-scale models (ACONTa / ACONTb) do; models with a single citrate → isocitrate reaction still match the two arrows as a lumped series.",
    "NADP-IDH: KEGG draws it as two half-reactions through oxalosuccinate (R01899, R00268). The drawn IDH step is the NAD form (R00709) with the NADP overall reaction (R00267) as a variant; oxalosuccinate is omitted as enzyme-bound.",
    "Enzymes catalysing the same step with another cofactor or acceptor are one arrow with variants: SCS (ATP / GTP / ITP and the acetate CoA-transferase SCACT), SDH (quinone / cytochrome c), MDH (NAD / quinone MQO), PEPCK (ATP / GTP / ITP), PDH / PFOR, OGDH / OGOR.",
    "ATP-citrate lyase cleaves citrate into its own acetyl-CoA and oxaloacetate instances, drawn outside the cycle: it is the route of citrate to lipogenesis (eukaryotic cytosol) and of the reductive TCA.",
    "Quinone / quinol of SDH are generic entities (ubiquinone or menaquinone depending on the organism): kept generic, flagged for review.",
    "Directionality follows the KGML of rn00020 for every drawn step (the overall complexes take it from their KEGG half-reactions).",
    "Compartments are not part of the template: the person chooses them when mapping onto a GEM (mitochondrial matrix in eukaryotes, cytosol in prokaryotes; the matcher proposes and asks when both exist).",
    "Identities: an entity or reaction already confirmed in the GEMsMAP canonical library keeps that confirmation; every other identity is an AI suggestion and goes to the review queue when it is not high-confidence.",
]


def layout(L: Layout) -> dict:
    """The cycle as a circle (radius 250) around the origin; entry from pyruvate on top; anaplerosis on the left; citrate cleavage on the right."""
    L.center = (0, 0)
    R = 250
    angles = {"oaa": -110, "cit": -70, "acon": -30, "icit": 10, "akg": 50, "succoa": 90, "succ": 130, "fum": 170, "mal": 210}
    n = {k: L.node(k, R * math.cos(math.radians(a)), R * math.sin(math.radians(a))) for k, a in angles.items()}
    n["accoa"] = L.node("accoa", 0, -370)
    n["pyr"] = L.node("pyr", 0, -490)
    n["pep"] = L.node("pep", -330, -330)
    # ATP-citrate lyase: a symmetric fork pointing away from the cycle
    n["accoa_2"] = L.node("accoa", 240, -390)
    n["oaa_2"] = L.node("oaa", 330, -250)
    cof = L.cofactors

    cof(L.reaction("PDH", [n["pyr"]], [n["accoa"]]))
    cof(L.reaction("CS", [n["accoa"], n["oaa"]], [n["cit"]]))
    for key, a, b in [("ACO1", "cit", "acon"), ("ACO2", "acon", "icit"), ("IDH", "icit", "akg"), ("OGDH", "akg", "succoa"),
                      ("SCS", "succoa", "succ"), ("SDH", "succ", "fum"), ("FUM", "fum", "mal"), ("MDH", "mal", "oaa")]:
        cof(L.reaction(key, [n[a]], [n[b]], label_side="inside"))
    # anaplerosis and citrate cleavage, outside the cycle
    cof(L.reaction("PC", [n["pyr"]], [n["oaa"]]))
    cof(L.reaction("PEPCK", [n["oaa"]], [n["pep"]]))
    cof(L.reaction("ACL", [n["cit"]], [n["accoa_2"], n["oaa_2"]], flip=True))  # label inside the fork, cofactors below the stem

    L.port("pyr>Glycolysis / Gluconeogenesis", 0, -600, n["pyr"])
    L.port("pep>Glycolysis / Gluconeogenesis", -540, -330, n["pep"])
    L.port("accoa>Fatty acid biosynthesis", 240, -490, n["accoa_2"])
    L.port("akg>Alanine, aspartate and glutamate metabolism", 400, 300, n["akg"])
    L.port("succoa>Valine, leucine and isoleucine degradation", 0, 370, n["succoa"])
    L.port("icit>Glyoxylate and dicarboxylate metabolism", 520, 40, n["icit"])

    L.label("Citrate cycle (TCA cycle)", -680, -690, size=16, weight=700, italic=False, kind="title")
    L.label("derived from KEGG map00020 · drawn by GEMsMAP", -680, -670, size=10, weight=400, italic=True)
    L.label("TCA cycle", -34, 5, size=13, weight=600)
    return L.result()
