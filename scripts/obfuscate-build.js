const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const CHUNKS_ROOT = path.join(process.cwd(), '.next', 'static', 'chunks');

const OBFUSCATION_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  deadCodeInjection: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  renameGlobals: false,
  identifierNamesGenerator: 'hexadecimal',
  splitStrings: true,
  splitStringsChunkLength: 8,
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!full.endsWith('.js')) continue;
    if (full.endsWith('.map.js')) continue;

    const name = path.basename(full);
    if (
      name.startsWith('framework-') ||
      name.startsWith('main-') ||
      name.startsWith('polyfills-') ||
      name.startsWith('webpack-')
    ) {
      continue;
    }

    out.push(full);
  }
  return out;
}

function run() {
  if (!fs.existsSync(CHUNKS_ROOT)) {
    console.error('[obfuscate-build] Missing build output at .next/static/chunks. Run build first.');
    process.exit(1);
  }

  const targets = walk(CHUNKS_ROOT);
  if (targets.length === 0) {
    console.warn('[obfuscate-build] No target chunk files found.');
    process.exit(0);
  }

  const startedAt = Date.now();
  let done = 0;

  for (const filePath of targets) {
    const source = fs.readFileSync(filePath, 'utf8');
    const result = JavaScriptObfuscator.obfuscate(source, OBFUSCATION_OPTIONS);
    fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8');
    done += 1;
  }

  const secs = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`[obfuscate-build] Obfuscated ${done} files in ${secs}s.`);
}

run();
