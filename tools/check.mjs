import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = ['script.js', 'service-worker.js', ...['api', 'lib', 'tools', 'test'].flatMap(dir => readdirSync(dir).filter(name => /\.(m?js)$/.test(name)).map(name => `${dir}/${name}`))];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const html = readFileSync('index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate element IDs');
const script = readFileSync('script.js', 'utf8');
for (const [, id] of script.matchAll(/\$\('([^']+)'\)/g)) if (!ids.includes(id)) throw new Error(`Missing element: ${id}`);
const version = JSON.parse(readFileSync('package.json')).version;
const lock = JSON.parse(readFileSync('package-lock.json'));
if (lock.version !== version || lock.packages[''].version !== version || !html.includes(`>${version}</span>`)) throw new Error('Version mismatch');
console.log(`Syntax, element IDs and version ${version}: OK (${files.length} files).`);
