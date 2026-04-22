const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

const rootDir = process.cwd();
const nodeEnv = process.env.NODE_ENV || 'development';

function loadEnvFile(fileName) {
  const filePath = path.join(rootDir, fileName);
  if (!fs.existsSync(filePath)) return;
  dotenv.config({ path: filePath, override: false });
}

// Load in descending precedence; first load wins because override=false.
loadEnvFile(`.env.${nodeEnv}.local`);
if (nodeEnv !== 'test') loadEnvFile('.env.local');
loadEnvFile(`.env.${nodeEnv}`);
loadEnvFile('.env');

const nextBin = require.resolve('next/dist/bin/next');
const args = [nextBin, ...process.argv.slice(2)];

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code || 0);
});
