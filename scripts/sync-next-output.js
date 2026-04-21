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

function retargetNodeModulesTracePath(nftFilePath, tracePath) {
  const marker = 'node_modules/';
  if (!tracePath.includes(marker)) {
    return tracePath;
  }

  const nftDir = path.dirname(nftFilePath);
  const currentTarget = path.resolve(nftDir, tracePath);
  if (fs.existsSync(currentTarget)) {
    return tracePath;
  }

  const markerIndex = tracePath.indexOf(marker);
  if (markerIndex === -1) {
    return tracePath;
  }

  const moduleSuffix = tracePath
    .slice(markerIndex + marker.length)
    .split('/')
    .join(path.sep);

  const nextNodeModulesTarget = path.join(targetDir, 'node_modules', moduleSuffix);
  if (fs.existsSync(nextNodeModulesTarget)) {
    return path.relative(nftDir, nextNodeModulesTarget).split(path.sep).join('/');
  }

  const rootNodeModulesTarget = path.join(rootDir, 'node_modules', moduleSuffix);

  if (!fs.existsSync(rootNodeModulesTarget)) {
    return tracePath;
  }

  return path.relative(nftDir, rootNodeModulesTarget).split(path.sep).join('/');
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
    const updated = retargetNodeModulesTracePath(filePath, entry);
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
