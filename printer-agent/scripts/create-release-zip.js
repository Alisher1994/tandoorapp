const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const zipPath = path.join(distDir, 'TalablarAgent-release.zip');

function main() {
  if (!fs.existsSync(distDir)) {
    throw new Error('dist folder not found. Run build first.');
  }
  if (!fs.existsSync(path.join(distDir, 'TalablarAgent.exe'))) {
    throw new Error('TalablarAgent.exe not found in dist.');
  }
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  if (process.platform === 'win32') {
    const escapedDist = distDir.replace(/'/g, "''");
    const escapedZip = zipPath.replace(/'/g, "''");
    const command = `powershell -NoProfile -Command "Compress-Archive -Path '${escapedDist}\\*' -DestinationPath '${escapedZip}' -Force"`;
    execSync(command, { stdio: 'inherit' });
    return;
  }

  throw new Error('zip:release currently supports Windows build host only.');
}

main();
