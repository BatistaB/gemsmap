// Bundles a TypeScript tool of tools/templates with esbuild (as the tests do) and runs it.
//   node tools/templates/run.mjs <qc_template | render_template> [args…]
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [name, ...args] = process.argv.slice(2);
const entry = ['.ts', '.tsx'].map((x) => join(root, 'tools', 'templates', name + x)).find(existsSync);
if (!entry) { console.error(`no tools/templates/${name}.ts(x)`); process.exit(2); }
const out = join(root, 'node_modules', '.cache', 'gemsmap-tools');
mkdirSync(out, { recursive: true });
const outfile = join(out, `${name}.mjs`);
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning', sourcemap: 'inline', jsx: 'automatic', packages: 'external' });
const r = spawnSync(process.execPath, ['--enable-source-maps', outfile, ...args], { stdio: 'inherit', cwd: root });
process.exit(r.status ?? 1);
