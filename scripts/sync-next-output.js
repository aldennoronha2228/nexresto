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

const linkType = process.platform === 'win32' ? 'junction' : 'dir';

try {
  fs.symlinkSync(sourceDir, targetDir, linkType);
  console.log(`[sync-next-output] Linked ${targetDir} -> ${sourceDir}`);
} catch (error) {
  if (process.env.CI || process.env.VERCEL) {
    console.error(
      `[sync-next-output] Link failed in CI/Vercel: ${error.message}`
    );
    process.exit(1);
  }

  // Fallback keeps builds unblocked in environments that disallow links.
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
  console.warn(
    `[sync-next-output] Link failed (${error.message}). Falling back to copy.`
  );
  console.log(`[sync-next-output] Copied ${sourceDir} -> ${targetDir}`);
}
