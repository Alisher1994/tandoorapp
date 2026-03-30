const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const filesToCopy = [
  'install.bat',
  'TalablarPrinter.bat',
  'run-agent-tray.ps1',
  'README.md',
  'READ_ME_FIRST.txt',
  '.env.example'
];

const persistentDistFiles = new Set(['TalablarAgent.exe']);

function ensureDistDir() {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
}

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

function cleanDistDirectory() {
  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    if (persistentDistFiles.has(name)) continue;
    const fullPath = path.join(distDir, name);
    removePath(fullPath);
  }
}

function copySupportFiles() {
  let copiedCount = 0;
  for (const relativePath of filesToCopy) {
    const sourcePath = path.join(projectRoot, relativePath);
    const targetPath = path.join(distDir, path.basename(relativePath));
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    fs.copyFileSync(sourcePath, targetPath);
    copiedCount += 1;
  }
  return copiedCount;
}

function writeVersionFile() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
  );
  const lines = [
    `name=${pkg.name || 'talablar-agent'}`,
    `version=${pkg.version || 'unknown'}`,
    `built_at=${new Date().toISOString()}`
  ];
  fs.writeFileSync(path.join(distDir, 'VERSION.txt'), `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  ensureDistDir();

  const exePath = path.join(distDir, 'TalablarAgent.exe');
  if (!fs.existsSync(exePath)) {
    throw new Error('TalablarAgent.exe not found. Run "npm run build:exe" first.');
  }

  cleanDistDirectory();
  const copied = copySupportFiles();
  writeVersionFile();
  console.log(`[bundle-dist] OK. copied_files=${copied}`);
}

main();
