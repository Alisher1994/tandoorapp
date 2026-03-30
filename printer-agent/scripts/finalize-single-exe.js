const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release');
const buildDir = path.join(projectRoot, 'build');
const distDir = path.join(projectRoot, 'dist');
const artifactName = 'TalablarPrinter.exe';
const builtExePath = path.join(releaseDir, artifactName);
const finalExePath = path.join(distDir, artifactName);
const WAIT_TIMEOUT_MS = 120000;
const WAIT_STEP_MS = 800;

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(targetPath)) {
      removePath(path.join(targetPath, child));
    }
    fs.rmdirSync(targetPath);
    return;
  }
  fs.unlinkSync(targetPath);
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function cleanDirectory(dirPath, removeDirIfEmpty = false) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath)) {
    removePath(path.join(dirPath, entry));
  }
  if (removeDirIfEmpty && fs.readdirSync(dirPath).length === 0) {
    fs.rmdirSync(dirPath);
  }
}

function writeVersionFile() {
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const lines = [
    `name=${pkg.name || 'talablar-agent'}`,
    `version=${pkg.version || 'unknown'}`,
    `built_at=${new Date().toISOString()}`
  ];
  fs.writeFileSync(path.join(distDir, 'VERSION.txt'), `${lines.join('\n')}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForArtifact(filePath, timeoutMs) {
  const startedAt = Date.now();
  let lastSize = -1;
  let stableTicks = 0;
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(filePath)) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > 0 && stat.size === lastSize) {
          stableTicks += 1;
          if (stableTicks >= 2) return;
        } else {
          stableTicks = 0;
          lastSize = stat.size;
        }
      } catch (_) {
        // keep waiting
      }
    }
    await sleep(WAIT_STEP_MS);
  }
  throw new Error(`Single EXE not found or not stable: ${filePath}`);
}

async function main() {
  await waitForArtifact(builtExePath, WAIT_TIMEOUT_MS);

  ensureDirectory(distDir);
  cleanDirectory(distDir, false);
  fs.copyFileSync(builtExePath, finalExePath);
  writeVersionFile();
  cleanDirectory(releaseDir, true);
  cleanDirectory(buildDir, true);

  console.log(`[finalize-single-exe] OK -> ${finalExePath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
