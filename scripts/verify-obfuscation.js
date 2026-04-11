const fs = require('fs');
const path = require('path');

const CHUNKS_ROOT = path.join(process.cwd(), '.next', 'static', 'chunks');

const FORBIDDEN_PATTERNS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'FIREBASE_PRIVATE_KEY',
  'SUPER_ADMIN_PASSWORD',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'AI_CONTROL_KEY',
  'restaurants/',
  'pending_signups/',
  '/api/tenant/create',
  'firebase-adminsdk',
];

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
    out.push(full);
  }
  return out;
}

function readabilityScore(content) {
  const lines = content.split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  const avgLineLength = nonEmpty.length
    ? nonEmpty.reduce((s, l) => s + l.length, 0) / nonEmpty.length
    : 0;

  const alphaChars = (content.match(/[a-zA-Z]/g) || []).length;
  const totalChars = Math.max(content.length, 1);
  const alphaRatio = alphaChars / totalChars;

  return { avgLineLength, alphaRatio };
}

function run() {
  if (!fs.existsSync(CHUNKS_ROOT)) {
    console.error('[verify-obfuscation] Missing build output at .next/static/chunks.');
    process.exit(1);
  }

  const files = walk(CHUNKS_ROOT);
  if (files.length === 0) {
    console.error('[verify-obfuscation] No JS chunk files found.');
    process.exit(1);
  }

  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (content.includes(forbidden)) {
        violations.push(`Forbidden string found in ${path.relative(process.cwd(), file)}: ${forbidden}`);
      }
    }

    if (!path.basename(file).startsWith('framework-')) {
      const score = readabilityScore(content);
      if (score.avgLineLength < 60 && score.alphaRatio > 0.5) {
        violations.push(`Chunk appears human-readable: ${path.relative(process.cwd(), file)}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('[verify-obfuscation] FAILED');
    for (const v of violations) console.error(` - ${v}`);
    process.exit(1);
  }

  console.log(`[verify-obfuscation] PASS (${files.length} chunk files checked).`);
}

run();
