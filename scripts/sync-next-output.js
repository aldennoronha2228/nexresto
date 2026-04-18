const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, 'apps', 'web', '.next');
const targetDir = path.join(rootDir, '.next');

if (!fs.existsSync(sourceDir)) {
  console.warn(`[sync-next-output] Source not found: ${sourceDir}`);
  process.exit(0);
}

if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}

fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });

function walk(dir, callback) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

function normalizeNodeModulesTracePath(tracePath) {
  if (!tracePath.includes('node_modules/')) {
    return tracePath;
  }

  // We move from apps/web/.next to .next (2 levels up), so node_modules traces
  // must drop two leading "../" segments to keep the same absolute target.
  let normalized = tracePath;
  for (let i = 0; i < 2; i += 1) {
    if (normalized.startsWith('../')) {
      normalized = normalized.slice(3);
    }
  }
  return normalized;
}

let normalizedFiles = 0;
let normalizedEntries = 0;

walk(targetDir, (filePath) => {
  if (!filePath.endsWith('.nft.json')) {
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return;
  }

  if (!Array.isArray(data.files)) {
    return;
  }

  let changed = false;
  data.files = data.files.map((entry) => {
    const updated = normalizeNodeModulesTracePath(entry);
    if (updated !== entry) {
      changed = true;
      normalizedEntries += 1;
    }
    return updated;
  });

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(data));
    normalizedFiles += 1;
  }
});

console.log(`[sync-next-output] Copied ${sourceDir} -> ${targetDir}`);
console.log(
  `[sync-next-output] Normalized node_modules traces in ${normalizedFiles} nft files (${normalizedEntries} entries)`
);
