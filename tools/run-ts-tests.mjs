// Runs tests/*.test.ts with node:test. esbuild (already installed with Vite) bundles each
// test file to plain JS first, so no extra test framework is needed.
//   npm test
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'node_modules', '.cache', 'gemsmap-tests');
mkdirSync(out, { recursive: true });
const files = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.ts'));
const outs = [];
for (const f of files) {
  const outfile = join(out, f.replace(/\.ts$/, '.mjs'));
  await build({ entryPoints: [join(root, 'tests', f)], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning', sourcemap: 'inline' });
  outs.push(outfile);
}
const r = spawnSync(process.execPath, ['--enable-source-maps', '--test', ...outs], { stdio: 'inherit', cwd: root });
process.exit(r.status ?? 1);
