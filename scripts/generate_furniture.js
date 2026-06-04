const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const targetDir = 'client/public/reservation-furniture';

const svgs = {
  // 1. Work Desk
  'work_desk.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <!-- Table top -->
  <rect x="20" y="20" width="80" height="46" rx="6" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- Desk pad / keyboard -->
  <rect x="36" y="28" width="48" height="24" rx="3" fill="#3f6f60" stroke="#2c4e44" stroke-width="2"/>
  <rect x="42" y="34" width="36" height="6" rx="1" fill="#f8f1e4"/>
  <!-- Chair (Top-down) -->
  <circle cx="60" cy="85" r="18" fill="#475569" stroke="#334155" stroke-width="3"/>
  <path d="M42 85 A 18 18 0 0 0 78 85 Z" fill="#334155"/>
  <rect x="38" y="72" width="6" height="18" rx="2" fill="#334155"/>
  <rect x="76" y="72" width="6" height="18" rx="2" fill="#334155"/>
</svg>`,

  // 2. Bed Single
  'bed_single.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <!-- Bed Frame -->
  <rect x="25" y="10" width="70" height="100" rx="10" fill="#f6efe1" stroke="#b98e52" stroke-width="4"/>
  <!-- Sheets / Mattress -->
  <rect x="31" y="16" width="58" height="88" rx="6" fill="#d6b27c" stroke="#a27840" stroke-width="3"/>
  <!-- Pillow -->
  <rect x="39" y="24" width="42" height="18" rx="4" fill="#fdf6ea" stroke="#b98e52" stroke-width="2"/>
  <!-- Folded sheet line -->
  <line x1="31" y1="56" x2="89" y2="56" stroke="#a27840" stroke-width="3" stroke-dasharray="6 4"/>
</svg>`,

  // 3. Bed Double
  'bed_double.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <!-- Bed Frame -->
  <rect x="15" y="10" width="90" height="100" rx="12" fill="#f6efe1" stroke="#b98e52" stroke-width="4"/>
  <!-- Sheets / Mattress -->
  <rect x="21" y="16" width="78" height="88" rx="8" fill="#d6b27c" stroke="#a27840" stroke-width="3"/>
  <!-- Pillow 1 -->
  <rect x="27" y="24" width="30" height="18" rx="4" fill="#fdf6ea" stroke="#b98e52" stroke-width="2"/>
  <!-- Pillow 2 -->
  <rect x="63" y="24" width="30" height="18" rx="4" fill="#fdf6ea" stroke="#b98e52" stroke-width="2"/>
  <!-- Folded sheet line -->
  <line x1="21" y1="56" x2="99" y2="56" stroke="#a27840" stroke-width="3" stroke-dasharray="6 4"/>
</svg>`,

  // 4. Bunk Bed (Cot)
  'bunk_bed.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <!-- Outer frame (metal rails) -->
  <rect x="25" y="10" width="70" height="100" rx="4" fill="#e2e8f0" stroke="#64748b" stroke-width="4"/>
  <!-- Mattress -->
  <rect x="29" y="14" width="62" height="92" rx="2" fill="#d6b27c" stroke="#a27840" stroke-width="2"/>
  <!-- Pillow -->
  <rect x="37" y="20" width="46" height="16" rx="3" fill="#fdf6ea" stroke="#a27840" stroke-width="2"/>
  <!-- Ladder on the side -->
  <rect x="91" y="30" width="8" height="40" rx="1" fill="#64748b"/>
  <line x1="91" y1="38" x2="99" y2="38" stroke="#ffffff" stroke-width="2"/>
  <line x1="91" y1="46" x2="99" y2="46" stroke="#ffffff" stroke-width="2"/>
  <line x1="91" y1="54" x2="99" y2="54" stroke="#ffffff" stroke-width="2"/>
  <line x1="91" y1="62" x2="99" y2="62" stroke="#ffffff" stroke-width="2"/>
  <!-- Corner posts -->
  <rect x="22" y="6" width="8" height="8" rx="1" fill="#475569"/>
  <rect x="90" y="6" width="8" height="8" rx="1" fill="#475569"/>
  <rect x="22" y="106" width="8" height="8" rx="1" fill="#475569"/>
  <rect x="90" y="106" width="8" height="8" rx="1" fill="#475569"/>
</svg>`,

  // 5. Sofa Table
  'table_sofa_4.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Left Sofa -->
  <rect x="15" y="20" width="26" height="120" rx="8" fill="#475569" stroke="#334155" stroke-width="4"/>
  <rect x="15" y="20" width="10" height="120" rx="4" fill="#334155"/>
  <!-- Right Sofa -->
  <rect x="119" y="20" width="26" height="120" rx="8" fill="#475569" stroke="#334155" stroke-width="4"/>
  <rect x="135" y="20" width="10" height="120" rx="4" fill="#334155"/>
  <!-- Table -->
  <rect x="52" y="30" width="56" height="100" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- Table details -->
  <circle cx="80" cy="80" r="12" fill="#f8f1e4" stroke="#d5b27d" stroke-width="2"/>
</svg>`,

  // 6. Rectangular 6-seater Table
  'table_rect_6.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table -->
  <rect x="40" y="24" width="80" height="112" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- Chairs Top/Bottom -->
  <rect x="68" y="6" width="24" height="14" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="68" y="140" width="24" height="14" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <!-- Chairs Left Side -->
  <rect x="22" y="42" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="22" y="94" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <!-- Chairs Right Side -->
  <rect x="124" y="42" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="124" y="94" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
</svg>`,

  // 7. Square 4-seater Table
  'table_square_4.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table -->
  <rect x="40" y="40" width="80" height="80" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- Top Chair -->
  <rect x="68" y="20" width="24" height="16" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <!-- Bottom Chair -->
  <rect x="68" y="124" width="24" height="16" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <!-- Left Chair -->
  <rect x="20" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <!-- Right Chair -->
  <rect x="124" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
</svg>`,

  // 8. Round 4-seater Table
  'table_round_4.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table -->
  <circle cx="80" cy="80" r="40" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- 4 Chairs around -->
  <rect x="68" y="20" width="24" height="16" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="68" y="124" width="24" height="16" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="20" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="124" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
</svg>`,

  // 9. Round 2-seater Table
  'table_round_2.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table -->
  <circle cx="80" cy="80" r="40" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- 2 Chairs -->
  <rect x="20" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="124" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
</svg>`
};

async function generate() {
  console.log('Generating furniture assets...');
  
  // Create target directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 1. Write the vector SVG files directly
  const svgKeys = ['work_desk.svg', 'bed_single.svg', 'bed_double.svg', 'bunk_bed.svg'];
  for (const filename of svgKeys) {
    const fullPath = path.join(targetDir, filename);
    fs.writeFileSync(fullPath, svgs[filename], 'utf-8');
    console.log(`Created vector: ${filename}`);
  }

  // 2. Render SVG layouts to high-quality square PNGs for PNG targets
  const pngMappings = {
    'table_sofa_4.svg': 'table_sofa_4.png',
    'table_rect_6.svg': 'table_rect_6.png',
    'table_square_4.svg': 'table_square_4.png',
    'table_round_4.svg': 'table_round_4.png',
    'table_round_2.svg': 'table_round_2.png'
  };

  for (const [svgName, pngName] of Object.entries(pngMappings)) {
    const svgContent = svgs[svgName];
    const buffer = Buffer.from(svgContent);
    const targetPngPath = path.join(targetDir, pngName);
    
    // Compile using sharp to high-quality square PNG
    await sharp(buffer)
      .png()
      .toFile(targetPngPath);
    
    console.log(`Rendered PNG: ${pngName} (square 160x160)`);
  }

  console.log('All templates generated successfully!');
}

generate().catch(err => {
  console.error('Error generating templates:', err);
  process.exit(1);
});
