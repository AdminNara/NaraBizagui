import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'plugins/narabizagui/server/dist');
await mkdir(output, { recursive: true });
const result = await build({ entryPoints: [path.join(root, 'plugins/narabizagui/server/index.mjs')], outfile: path.join(output, 'server.mjs'), bundle: true, platform: 'node', target: 'node22', format: 'esm', metafile: true, legalComments: 'inline', banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } });
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const normalized = input.replaceAll('\\', '/');
  const match = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(normalized);
  if (match) packages.add(match[1]);
}
const notices = ['NaraBizagui MCP — bundled third-party licenses.\n'];
for (const name of [...packages].sort()) {
  const dir = path.join(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  let license;
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'license.txt']) {
    try { license = await readFile(path.join(dir, file), 'utf8'); break; } catch { /* Try the next conventional license name. */ }
  }
  if (!license) throw new Error(`Missing bundled license: ${name}`);
  notices.push(`\n--- ${name}@${pkg.version} (${pkg.license}) ---\n${license}`);
}
await writeFile(path.join(output, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n'));
const distributed = ['index.html', 'modelador.js', 'modelador.css', 'archivos.js', 'mcp-editor.js', 'mcp-bridge.js', 'assets/narabizagui_blanco.png', 'vendor/bpmn-modeler.production.min.js', 'vendor/bpmn.css', 'vendor/bpmn.woff2', 'vendor/diagram-js.css', 'vendor/LICENSE.txt'];
const manifest = {};
for (const file of distributed) manifest[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built plugin with ${packages.size} attributed dependencies; updated ${distributed.length} web hashes.`);
