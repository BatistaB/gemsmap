/** BiGG data layer status, shown in the Template Library. */
import { useEffect } from 'react';
import { refreshBiggStatus, useBigg } from '../../templates/design/bigg';

export function BiggPanel() {
  const { status, offline } = useBigg();
  useEffect(() => { void refreshBiggStatus(); }, []);
  if (offline || !status) return null;
  return (
    <div className="bigg-panel small">
      <b>BiGG data</b>
      {status.available
        ? <span className="muted">{status.metabolites?.toLocaleString()} universal metabolites · {status.reactions?.toLocaleString()} universal reactions (installed {status.installed?.slice(0, 10)}) — used offline for identities, reaction stoichiometry and BiGG IDs, so templates match models downloaded from BiGG.</span>
        : <span className="muted">Not installed. Run <span className="mono">gemsmap bigg-data</span> once in a terminal (or <span className="mono">gemsmap bigg-data --from &lt;folder&gt;</span> with the metabolite and reaction downloads of bigg.bio/data_access; in a development checkout <span className="mono">npm run bigg:data</span>) to use the BiGG universal metabolites and reactions when building templates.</span>}
    </div>
  );
}
