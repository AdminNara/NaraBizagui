import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const resources = await Promise.all(Object.entries(manifest).map(async ([file, expected]) => {
  const response = await fetch(`https://demo.naraconsultores.com/NaraBizagui/${file}?verify=${expected.slice(0, 16)}`, { cache: 'no-store' });
  const actual = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  return { file, status: response.status, matches: response.ok && actual === expected };
}));
const result = { date: new Date().toISOString(), resources, allMatch: resources.every(r => r.matches) };
await mkdir(new URL('../local/', import.meta.url), { recursive: true });
await writeFile(new URL('../local/verificacion_publicacion_mcp.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.allMatch) process.exitCode = 1;
