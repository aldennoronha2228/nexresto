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
console.log(`[sync-next-output] Synced ${sourceDir} -> ${targetDir}`);
