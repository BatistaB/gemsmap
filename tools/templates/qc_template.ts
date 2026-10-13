/**
 * Quality check of a template file: validation, identities, visual QC with the app's geometry and, optionally,
 * a mapping comparison with another template on the test models.
 *
 *   npm run template:qc -- src/templates/builtin/kegg-map00010.gemsmap-template.json --compare glycolysis --md docs/templates/kegg/map00010/qc.md
 *
 * Only the public test models (tests/fixtures) go into --md. Extra local models (unpublished ones, for example) are
 * printed to the console only: GEMSMAP_QC_MODELS=path/a.gemsmap;path/b.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseCobraJson } from '../../src/model/importers';
import type { MetabolicModel } from '../../src/model/types';
import { compileTemplate } from '../../src/templates/format/compile';
import { layoutQc } from '../../src/templates/format/layoutQc';
import { parseTemplateJson } from '../../src/templates/format/parse';
import type { TemplateFile } from '../../src/templates/format/schema';
import { completeness, issueCounts, validateTemplateFile } from '../../src/templates/format/validate';
import { isMapped, mapTemplate, type TemplateMapping } from '../../src/templates/mapping/engine';
import { BUILTIN_TEMPLATE_FILES } from '../../src/templates/pathways';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const path = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!path) { console.error('usage: npm run template:qc -- <file.gemsmap-template.json> [--compare <builtin id>] [--md <out.md>]'); process.exit(2); }
const parsed = parseTemplateJson(readFileSync(path, 'utf8'));
if (!parsed.file) { console.error(parsed.errors.join('\n')); process.exit(1); }
const f = parsed.file;
const md: string[] = [];
const out = (s = '') => { console.log(s); md.push(s); };

// ------------------------------------------------------------ validation and identities
const issues = validateTemplateFile(f);
const ic = issueCounts(issues);
const c = completeness(f);
const ents = f.biology.entities;
const st = (s: string, conf?: string) => ents.filter((e) => e.identity.status === s && (!conf || e.identity.confidence === conf)).length;
out(`# ${f.metadata.name} — quality check`);
out();
out('## Validation');
out();
out('```text');
out(`Errors:    ${ic.errors}`);
out(`Warnings:  ${ic.warnings}`);
out(`Notes:     ${ic.infos}`);
for (const i of issues.filter((x) => x.severity !== 'info')) out(`  ${i.severity.padEnd(8)} ${i.code}: ${i.message}`);
out(`Completeness: metabolites ${c.metabolitesIdentified}/${c.metabolites} · reactions ${c.reactionsIdentified}/${c.reactions} · compartments ${c.compartmentsDefined}/${c.metabolites} · overall ${Math.round(c.overall * 100)}%`);
out(`Identities: confirmed ${st('confirmed')} · suggested high ${st('suggested', 'high')} · suggested probable ${st('suggested', 'probable')} · ambiguous ${st('ambiguous')} · unresolved ${st('unresolved')} · generic ${ents.filter((e) => e.generic).length}`);
out('```');
out();

// ------------------------------------------------------------ visual QC
const q = layoutQc(f);
out('## Visual QC');
out();
out('```text');
out(`Drawing:                ${q.elements.nodes} metabolite nodes, ${q.elements.cofactors} attached cofactors, ${q.elements.arrows} arrows, ${q.elements.ports} pathway ports, ${Math.round(q.bounds.w)} × ${Math.round(q.bounds.h)} px`);
out(`Label overlaps:         ${q.counts['label-overlap']}`);
out(`Arrows through labels:  ${q.counts['edge-through-label']}`);
out(`Arrow crossings:        ${q.counts['edge-crossing']}`);
out(`Cofactor crossings:     ${q.counts['cofactor-crossing']}`);
out(`Cofactor curves through labels: ${q.counts['cofactor-through-label']}`);
out(`Disconnected nodes:     ${q.counts.disconnected}`);
out(`Long arrows (> 280 px): ${q.counts['long-edge']}`);
out(`Nodes in a foreign box: ${q.counts['foreign-in-group']}`);
for (const i of q.issues) out(`  ${i.kind.padEnd(19)} ${i.message}  @(${Math.round(i.at.x)}, ${Math.round(i.at.y)})`);
out('```');
out();

// ------------------------------------------------------------ mapping comparison
const cmpId = opt('--compare');
if (cmpId) {
  const other = BUILTIN_TEMPLATE_FILES.find((x) => x.metadata.id === cmpId);
  if (!other) { console.error(`no built-in template ${cmpId}`); process.exit(2); }
  const models: [string, MetabolicModel, boolean][] = [];
  for (const fx of ['e_coli_core.json', 'iJO1366.json', 'seed_core.json', 'kegg_names.json']) {
    const p = `tests/fixtures/${fx}`;
    if (existsSync(p)) models.push([fx.replace('.json', ''), parseCobraJson(readFileSync(p, 'utf8')), true]);
  }
  for (const p of (process.env.GEMSMAP_QC_MODELS ?? '').split(';').map((x) => x.trim()).filter(Boolean)) {
    if (!existsSync(p)) { console.error(`GEMSMAP_QC_MODELS: ${p} not found`); continue; }
    const text = readFileSync(p, 'utf8');
    models.push([`${p.split(/[\\/]/).pop()} (local, console only)`, p.endsWith('.gemsmap') ? JSON.parse(text).model : parseCobraJson(text), false]);
  }
  const kegg = (file: TemplateFile, slot: string) => {
    const m = file.biology.metabolites.find((x) => x.id === slot);
    const e = m && file.biology.entities.find((x) => x.id === m.entity);
    return new Set([...(e?.identifiers['kegg.compound'] ?? []), ...(e?.related ?? []).flatMap((r) => r.identifiers?.['kegg.compound'] ?? [])]);
  };
  const row = (r: TemplateMapping) => {
    const amb = r.slots.filter((s) => s.status === 'ambiguous').length;
    const prov = r.slots.filter((s) => s.status === 'provisional').length;
    return `${`${r.coverage.allMapped}/${r.coverage.all}`.padEnd(7)} ${`${r.coverage.coreMapped}/${r.coverage.core}`.padEnd(7)} ${`${r.reactions.filter((x) => x.mapped).length}/${r.reactions.length}`.padEnd(7)} ${String(amb).padEnd(4)} ${String(prov).padEnd(5)} ${r.quality}`;
  };
  const block: string[] = [];
  const say = (s: string, pub: boolean) => { console.log(s); if (pub) block.push(s); };
  say(`Model                ${'Template'.padEnd(34)} Nodes   Core    Arrows  Amb  Prov  Quality`, true);
  for (const [name, model, pub] of models) {
    const a = mapTemplate(compileTemplate(f), model), b = mapTemplate(compileTemplate(other), model);
    say(`${name.padEnd(20)} ${f.metadata.name.slice(0, 34).padEnd(34)} ${row(a)}`, pub);
    say(`${''.padEnd(20)} ${other.metadata.name.slice(0, 34).padEnd(34)} ${row(b)}`, pub);
    // shared metabolites (same KEGG compound): do both templates pick the same model metabolite?
    let same = 0, diff = 0;
    const diffs: string[] = [];
    for (const s of a.slots) {
      const ka = kegg(f, s.slot.slot);
      const t = b.slots.find((x) => [...kegg(other, x.slot.slot)].some((k) => ka.has(k)));
      if (!t) continue;
      const ma = s.chosen && isMapped(s.status) ? s.chosen.metId : null, mb = t.chosen && isMapped(t.status) ? t.chosen.metId : null;
      if (ma === mb) same++;
      else { diff++; diffs.push(`${s.slot.label ?? s.entity.short ?? s.slot.slot}: ${ma ?? '—'} vs ${mb ?? '—'}`); }
    }
    say(`${''.padEnd(20)} shared metabolites: ${same} same choice, ${diff} different${diffs.length ? ` (${diffs.join('; ')})` : ''}`, pub);
  }
  out(`## Mapping comparison with the built-in "${other.metadata.name}"`);
  out();
  md.push('Nodes = drawn metabolites mapped / total; Core = required metabolites; Arrows = template reactions found in the model;', 'Amb = ambiguous metabolites (a person chooses); Prov = provisional matches.', '', '```text', ...block, '```', '');
}

const mdPath = opt('--md');
if (mdPath) { writeFileSync(mdPath, md.join('\n') + '\n', 'utf8'); console.log(`\nwritten ${mdPath}`); }
process.exit(ic.errors ? 1 : 0);
