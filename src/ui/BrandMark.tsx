/**
 * The GEMs MAP mark: a gem cut from a metabolic network. Nodes are metabolites, edges are reactions
 * coloured on the map's diverging flux scale (red / blue, paler = smaller |flux|), the girdle in ink.
 * Same gem as tools/brand/make_brand.py (which writes the SVG and PNG brand files): keep NODES, EDGES
 * and the UI weights in step with it. In the UI the strokes are heavier (an optical size) so the
 * network still reads at 20–30 px.
 */
const NODES: Record<string, [number, number]> = { A: [-90, 0], B: [0, 0], C: [90, 0], D: [-157, 77], E: [-75, 77], F: [75, 77], G: [157, 77], H: [0, 250] };
// pale edges first, so the strong ones and the girdle lie on top
const EDGES: [string, string][] = [
  ['AE', '#f3cada'], ['CF', '#ffbbbc'], ['FH', '#ffbbbc'], ['BF', '#9e9bfe'], ['AB', '#7e7fff'], ['EH', '#736eeb'],
  ['AD', '#4c49f6'], ['GH', '#4c49f6'], ['BC', '#1800ad'], ['BE', '#ff5757'], ['CG', '#ff3131'], ['DH', '#f24e50'],
];
const GIRDLE = ['DE', 'EF', 'FG'];
// node radius (outer edge of the ring), ring, coloured edge, girdle — display (≥ 96 px) and UI weights
const DISPLAY = { r: 16, ring: 3.4, edge: 7, girdle: 3.2 };
const UI = { r: 24, ring: 5, edge: 13, girdle: 6 };

export function BrandMark({ width = 26 }: { width?: number }) {
  const w = width >= 96 ? DISPLAY : UI;
  const W = 314 + 2 * w.r, H = 250 + 2 * w.r;
  const line = (k: string, stroke: string, strokeWidth: number) => {
    const [x1, y1] = NODES[k[0]], [x2, y2] = NODES[k[1]];
    return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />;
  };
  return (
    <svg width={width} height={(width * H) / W} viewBox={`${-157 - w.r} ${-w.r} ${W} ${H}`} aria-hidden="true">
      {EDGES.map(([k, c]) => line(k, c, w.edge))}
      {GIRDLE.map((k) => line(k, '#000', w.girdle))}
      {Object.entries(NODES).map(([k, [x, y]]) => <circle key={k} cx={x} cy={y} r={w.r - w.ring / 2} fill="#262626" stroke="#000" strokeWidth={w.ring} />)}
    </svg>
  );
}
