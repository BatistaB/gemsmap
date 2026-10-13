/**
 * Reading a template file from outside: schema check and normalization. An
 * imported template is never trusted blindly — structure problems are errors
 * (the file is refused), everything that can be repaired is repaired with a
 * warning, and the semantic validator (validate.ts) runs afterwards.
 */
import { isProjectFormat } from '../../store/project';
import { isConceptualCompartment, isTemplateFormat, TEMPLATE_FORMAT, TEMPLATE_SCHEMA_VERSION, type IdentityStatus, type TemplateFile } from './schema';

export interface ParseResult { file?: TemplateFile; errors: string[]; warnings: string[] }

const STATUSES: IdentityStatus[] = ['confirmed', 'suggested', 'ambiguous', 'unresolved'];
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown) => (typeof x === 'string' ? x : undefined);
const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

export function parseTemplateJson(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { errors: [`Not valid JSON: ${(e as Error).message}`], warnings: [] }; }
  return parseTemplate(raw);
}

export function parseTemplate(raw: unknown): ParseResult {
  const errors: string[] = [], warnings: string[] = [];
  if (!isObj(raw)) return { errors: ['The file does not contain a JSON object'], warnings };
  if (isProjectFormat(raw.format)) return { errors: ['This is a GEMs MAP project (.gemsmap), not a template — open it with File → Open project'], warnings };
  if (!isTemplateFormat(raw.format)) return { errors: [`Unknown format "${String(raw.format)}" — expected "${TEMPLATE_FORMAT}"`], warnings };
  const sv = str(raw.schema_version) ?? '';
  const [major, minor] = sv.split('.').map(Number);
  const [curMajor, curMinor] = TEMPLATE_SCHEMA_VERSION.split('.').map(Number);
  if (!Number.isFinite(major)) errors.push('Missing schema_version');
  else if (major !== curMajor) errors.push(`Schema ${sv} is not supported by this GEMs MAP (reads ${curMajor}.x)`);
  else if (minor > curMinor) warnings.push(`Written by a newer GEMs MAP (schema ${sv}); unknown fields are kept but ignored`);
  if (!isObj(raw.metadata)) errors.push('Missing metadata');
  if (!isObj(raw.biology)) errors.push('Missing biology section');
  if (!isObj(raw.layout)) errors.push('Missing layout section');
  if (errors.length) return { errors, warnings };

  const f = structuredClone(raw) as unknown as TemplateFile;
  f.format = TEMPLATE_FORMAT; // a MetMap-era file is upgraded to the current tag
  const md = f.metadata as unknown as Record<string, unknown>;
  if (!str(md.id)) errors.push('metadata.id is required');
  if (!str(md.name)) errors.push('metadata.name is required');
  f.metadata = {
    ...f.metadata,
    description: str(md.description) ?? '', pathway: str(md.pathway) ?? str(md.name) ?? '', template_version: str(md.template_version) ?? '1.0.0',
    scope: isObj(md.scope) ? { level: (str(md.scope.level) as never) ?? 'universal', taxa: arr<string>(md.scope.taxa), ...(str(md.scope.note) ? { note: str(md.scope.note) } : {}) } : { level: 'universal', taxa: [] },
    authors: arr<string>(md.authors).filter((a) => typeof a === 'string'), created: str(md.created) ?? new Date().toISOString(), modified: str(md.modified) ?? new Date().toISOString(),
    license: str(md.license) ?? '', tags: arr<string>(md.tags), citations: arr(md.citations),
  };
  const b = f.biology as unknown as Record<string, unknown>;
  f.biology = {
    compartments: arr(b.compartments), entities: arr(b.entities), metabolites: arr(b.metabolites), reactions: arr(b.reactions), connectors: arr(b.connectors),
  };
  const l = f.layout as unknown as Record<string, unknown>;
  f.layout = { nodes: arr(l.nodes), ports: arr(l.ports), reactions: arr(l.reactions), groups: arr(l.groups), labels: arr(l.labels) };

  const ids = new Map<string, Set<string>>(); // one id space per element kind
  const unique = (id: unknown, what: string) => {
    if (typeof id !== 'string' || !id) { errors.push(`A ${what} has no id`); return; }
    const seen = ids.get(what) ?? new Set<string>();
    if (seen.has(id)) errors.push(`Duplicate ${what} id ${id}`);
    seen.add(id);
    ids.set(what, seen);
  };
  f.biology.compartments = f.biology.compartments.filter((c) => {
    if (isConceptualCompartment(c?.id)) { c.fallback = arr<string>(c.fallback).filter((x) => x === 'intracellular' || isConceptualCompartment(x)) as never; return true; }
    warnings.push(`Unknown compartment "${String(c?.id)}" ignored`);
    return false;
  });
  for (const e of f.biology.entities) {
    unique(e.id, 'entity');
    if (typeof e.name !== 'string' || !e.name) { warnings.push(`Entity ${e.id} has no name`); e.name = e.id; }
    e.synonyms = arr<string>(e.synonyms);
    e.identifiers = isObj(e.identifiers) ? Object.fromEntries(Object.entries(e.identifiers).map(([k, v]) => [k, arr<string>(v).map(String)])) : {};
    if (!isObj(e.identity) || !STATUSES.includes(e.identity.status)) { warnings.push(`Entity ${e.name}: no valid identity status — set to unresolved`); e.identity = { status: 'unresolved' }; }
  }
  for (const m of f.biology.metabolites) {
    unique(m.id, 'metabolite');
    if (m.compartment != null && !isConceptualCompartment(m.compartment)) { warnings.push(`Metabolite ${m.id}: unknown compartment "${String(m.compartment)}" — set to none`); m.compartment = null; }
    m.compartment ??= null;
    if (!['required', 'recommended', 'optional'].includes(m.level)) m.level = 'required';
  }
  for (const r of f.biology.reactions) {
    unique(r.id, 'reaction');
    r.participants = arr(r.participants);
    r.ec = arr<string>(r.ec);
    r.identifiers = isObj(r.identifiers) ? Object.fromEntries(Object.entries(r.identifiers).map(([k, v]) => [k, arr<string>(v).map(String)])) : {};
    if (typeof r.reversible !== 'boolean') r.reversible = null;
    if (!['required', 'recommended', 'optional'].includes(r.level)) r.level = 'required';
    if (!isObj(r.identity) || !STATUSES.includes(r.identity.status)) r.identity = { status: 'unresolved' };
    if (typeof r.name !== 'string') r.name = r.id;
  }
  for (const c of f.biology.connectors) { unique(c.id, 'pathway link'); if (!isObj(c.target)) c.target = { pathway: '' }; }
  for (const n of f.layout.nodes) {
    unique(n.id, 'node');
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) { errors.push(`Node ${n.id} has no valid position`); }
  }
  for (const p of f.layout.ports) unique(p.id, 'port');
  for (const r of f.layout.reactions) { r.sources = arr(r.sources); r.targets = arr(r.targets); r.routing ??= 'straight'; }
  if (errors.length) return { errors, warnings };
  return { file: f, errors, warnings };
}
