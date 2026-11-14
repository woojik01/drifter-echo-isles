import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const assets = new URL('../game-assets/', import.meta.url);
const index = new URL('index.html', assets);
const check = process.argv.includes('--check');
const original = fs.readFileSync(index, 'utf8');
let count = 0;
const versioned = original.replace(/(<script\b[^>]*\bsrc=")([^"?#]+\.js)(?:\?([^"#]*))?("[^>]*>)/g,
  (tag, prefix, file, query, suffix) => {
    if (!/^[\w-]+\.js$/.test(file)) return tag;
    const hash = createHash('sha256').update(fs.readFileSync(new URL(file, assets))).digest('hex').slice(0, 16);
    const params = new URLSearchParams(query);
    params.set('v', hash);
    count++;
    return `${prefix}${file}?${params}${suffix}`;
  });
if (!count) throw new Error('No local script references found.');
if (versioned !== original) {
  if (check) {
    console.error('Stale script cache keys. Run node scripts/version-assets.mjs and commit game-assets/index.html.');
    process.exitCode = 1;
  } else {
    fs.writeFileSync(index, versioned);
    console.log(`Updated ${count} script cache keys in ${fileURLToPath(index)}.`);
  }
} else console.log(`PASS ${count} script cache keys match their file contents.`);
