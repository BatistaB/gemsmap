"""Build the GEM fixtures used by tests/templates.test.ts (written to tests/fixtures/, git-ignored).

    backend/.venv/Scripts/python tools/templates/make_fixtures.py     (Windows)
    backend/.venv/bin/python tools/templates/make_fixtures.py         (macOS/Linux)

Models come from the COBRApy package data, so nothing is downloaded:

  e_coli_core.json   BiGG IDs, full annotation (textbook model)
  iJO1366.json       BiGG IDs, genome scale
  seed_core.json     the same e_coli_core rewritten to a ModelSEED-like namespace
                     (cpd00027_c0, compartments c0/e0, names lower-cased, BiGG/MetaCyc
                     annotations removed) — the template must map it without any change
  kegg_names.json    e_coli_core with opaque IDs (m0001_c), NO annotation at all:
                     only names, formulas and topology are left
"""
import copy
import gzip
import json
import os
import sys

import cobra
from cobra.io import load_json_model, read_sbml_model, save_json_model  # noqa: F401

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "tests", "fixtures")
DATA = os.path.join(os.path.dirname(cobra.__file__), "data")


def read_gz(path):
    # libSBML cannot open non-ASCII paths on Windows: hand it the XML text
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return read_sbml_model(f.read())


def dump(model, name):
    path = os.path.join(OUT, name)
    save_json_model(model, path)
    print("wrote", os.path.relpath(path), len(model.metabolites), "metabolites")


def as_list(v):
    return v if isinstance(v, list) else [v]


def rename(src, new_met_id, new_comp, strip_ann, lower_names):
    """Copy a COBRA JSON dict with renamed metabolites/compartments."""
    j = copy.deepcopy(src)
    ids = {}
    for m in j["metabolites"]:
        nid = new_met_id(m)
        ids[m["id"]] = nid
        m["id"] = nid
        m["compartment"] = new_comp(m["compartment"])
        if lower_names:
            m["name"] = m["name"].lower()
        ann = m.get("annotation", {})
        m["annotation"] = {k: v for k, v in ann.items() if not strip_ann(k)}
    for r in j["reactions"]:
        r["metabolites"] = {ids[k]: v for k, v in r["metabolites"].items()}
        r["annotation"] = {k: v for k, v in r.get("annotation", {}).items() if not strip_ann(k)}
    j["compartments"] = {new_comp(k): v for k, v in j["compartments"].items()}
    return j


def main():
    os.makedirs(OUT, exist_ok=True)
    core = read_gz(os.path.join(DATA, "textbook.xml.gz"))
    core.id = "e_coli_core"
    dump(core, "e_coli_core.json")
    dump(read_gz(os.path.join(DATA, "iJO1366.xml.gz")), "iJO1366.json")

    src = json.load(open(os.path.join(OUT, "e_coli_core.json"), encoding="utf-8"))

    # ModelSEED-like namespace
    used = {}

    def seed_id(m):
        seeds = as_list(m.get("annotation", {}).get("seed.compound", []))
        base = seeds[0] if seeds else "cpdx" + str(len(used)).zfill(4)
        nid = f"{base}_{m['compartment']}0"
        while nid in used.values():
            nid = nid + "b"
        used[m["id"]] = nid
        return nid

    seed = rename(src, seed_id, lambda c: c + "0", lambda k: k in ("bigg.metabolite", "biocyc", "bigg.reaction"), True)
    seed["id"] = "seed_core"
    json.dump(seed, open(os.path.join(OUT, "seed_core.json"), "w", encoding="utf-8"))
    print("wrote tests/fixtures/seed_core.json")

    # opaque IDs, no annotation: names + formula + topology only
    counter = {"n": 0}

    def opaque(m):
        counter["n"] += 1
        return f"m{counter['n']:04d}_{m['compartment']}"

    bare = rename(src, opaque, lambda c: c, lambda k: True, False)
    bare["id"] = "opaque_core"
    json.dump(bare, open(os.path.join(OUT, "kegg_names.json"), "w", encoding="utf-8"))
    print("wrote tests/fixtures/kegg_names.json")


if __name__ == "__main__":
    sys.exit(main())
