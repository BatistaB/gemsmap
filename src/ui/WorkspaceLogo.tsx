/**
 * Each workspace has its own logo, at the left of its header row (the gem in the top left corner stays the
 * GEMsMAP mark). The images are public/brand/*-logo.png, made by tools/brand/make_brand.py from logo/; the
 * stacked Templates logo is set horizontally there so its word stays readable at this height.
 */
const LOGOS = {
  lab: { file: 'cobragui-logo.png', name: 'COBRAGUI', about: 'a graphical user interface for COBRApy: explore, edit and simulate the GEM' },
  map: { file: 'mapbuilder-logo.png', name: 'Map Builder', about: 'pathway figures, flux mapping, export' },
  templates: { file: 'templates-logo.png', name: 'Templates', about: 'model-independent pathway templates (biological identity + layout), reusable with any GEM' },
} as const;

export type WorkspaceId = keyof typeof LOGOS;

export function WorkspaceLogo({ workspace }: { workspace: WorkspaceId }) {
  const l = LOGOS[workspace];
  return <img className="ws-logo" src={`${import.meta.env.BASE_URL}brand/${l.file}`} alt={l.name} title={`${l.name} — ${l.about}`} draggable={false} />;
}
