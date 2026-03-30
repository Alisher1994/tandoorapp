const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const projectRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(projectRoot, '..');
const sourceSvgPath = path.join(repositoryRoot, 'Logo.svg');
const desktopDir = path.join(projectRoot, 'desktop');
const iconPngPath = path.join(desktopDir, 'icon.png');
const iconIcoPath = path.join(desktopDir, 'icon.ico');

async function ensureDesktopDir() {
  if (!fs.existsSync(desktopDir)) {
    fs.mkdirSync(desktopDir, { recursive: true });
  }
}

async function main() {
  if (!fs.existsSync(sourceSvgPath)) {
    throw new Error(`Logo.svg not found: ${sourceSvgPath}`);
  }

  await ensureDesktopDir();
  const svgBuffer = fs.readFileSync(sourceSvgPath);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    const buffer = await sharp(svgBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    pngBuffers.push(buffer);
    if (size === 256) {
      fs.writeFileSync(iconPngPath, buffer);
    }
  }

  const icoBuffer = await pngToIco(pngBuffers);
  fs.writeFileSync(iconIcoPath, icoBuffer);
  console.log(`[generate-icons] OK -> ${iconPngPath}, ${iconIcoPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
