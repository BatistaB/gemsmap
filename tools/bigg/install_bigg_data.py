"""Install the BiGG data layer of the Template Builder: the universal metabolite and reaction tables of BiGG Models.

    npm run bigg:data                          download the two published bulk files from bigg.bio once (~19 MB)
    npm run bigg:data -- --from <folder>       use files you downloaded yourself from https://bigg.bio/data_access
                                               (a *metabolites*.json and a *reactions*.json in that folder)

Installed GEMsMAP: `gemsmap bigg-data` (same options). This script is the development-checkout equivalent.

The tables are stored in the backend cache (next to the MetaNetX cache) and used offline from then on: identity
search, reaction identity from stoichiometry, BiGG IDs for templates, and the annotation of models exported by BiGG.
GEMsMAP itself never calls the BiGG API. Run again to update.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from cobragui.services import bigg_service  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="folder", type=Path, help="folder with the BiGG metabolite and reaction JSON downloads")
    a = ap.parse_args()
    try:
        st = bigg_service.install_from(a.folder, log=lambda m: print(m, flush=True))
    except bigg_service.BiggDataError as e:
        sys.exit(str(e))
    print(f"BiGG data installed in {bigg_service.data_dir()}: {st['metabolites']} universal metabolites, {st['reactions']} reactions.")
    print("A running backend picks the new tables up at its next search.")


if __name__ == "__main__":
    main()
