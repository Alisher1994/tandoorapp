const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const targetDir = 'client/public/reservation-furniture';

const svgs = {
  // 1. Work Desk
  'work_desk.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table top -->
  <rect x="40" y="30" width="80" height="80" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- Laptop / Notebook -->
  <rect x="60" y="68" width="40" height="18" rx="2" fill="#f8f1e4" stroke="#a27840" stroke-width="2"/>
  <rect x="60" y="52" width="40" height="14" rx="2" fill="#334155" stroke="#a27840" stroke-width="2"/>
  <!-- Chair (Top-down) -->
  <rect x="65" y="120" width="30" height="22" rx="4" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="63" y="136" width="34" height="6" rx="2" fill="#a27840"/>
  <rect x="59" y="122" width="5" height="14" rx="1" fill="#d5b27d" stroke="#a27840" stroke-width="2.5"/>
  <rect x="96" y="122" width="5" height="14" rx="1" fill="#d5b27d" stroke="#a27840" stroke-width="2.5"/>
</svg>`,

  // 2. Bed Single
  'bed_single.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Bed Frame -->
  <rect x="15" y="45" width="130" height="70" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- Mattress -->
  <rect x="21" y="51" width="118" height="58" rx="4" fill="#fdf6ea" stroke="#b98e52" stroke-width="2"/>
  <!-- Pillow -->
  <rect x="27" y="56" width="22" height="48" rx="4" fill="#ffffff" stroke="#b98e52" stroke-width="2"/>
  <!-- Blanket line -->
  <line x1="65" y1="51" x2="65" y2="109" stroke="#a27840" stroke-width="3" stroke-dasharray="6 4"/>
</svg>`,

  // 3. Bed Double
  'bed_double.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Bed Frame -->
  <rect x="15" y="30" width="130" height="100" rx="10" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- Mattress -->
  <rect x="21" y="36" width="118" height="88" rx="6" fill="#fdf6ea" stroke="#b98e52" stroke-width="2"/>
  <!-- Pillow 1 -->
  <rect x="27" y="42" width="22" height="34" rx="4" fill="#ffffff" stroke="#b98e52" stroke-width="2"/>
  <!-- Pillow 2 -->
  <rect x="27" y="84" width="22" height="34" rx="4" fill="#ffffff" stroke="#b98e52" stroke-width="2"/>
  <!-- Blanket line -->
  <line x1="65" y1="36" x2="65" y2="124" stroke="#a27840" stroke-width="3" stroke-dasharray="6 4"/>
</svg>`,

  // 4. Bunk Bed (Cot)
  'bunk_bed.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Bed Frame -->
  <rect x="15" y="45" width="130" height="70" rx="4" fill="#f6efe1" stroke="#b98e52" stroke-width="4"/>
  <!-- Mattress -->
  <rect x="19" y="49" width="122" height="62" rx="2" fill="#d6b27c" stroke="#a27840" stroke-width="2"/>
  <!-- Pillow -->
  <rect x="27" y="55" width="22" height="50" rx="3" fill="#ffffff" stroke="#a27840" stroke-width="2"/>
  <!-- Ladder -->
  <rect x="70" y="37" width="40" height="8" rx="1" fill="#a27840"/>
  <line x1="78" y1="37" x2="78" y2="45" stroke="#ffffff" stroke-width="2"/>
  <line x1="86" y1="37" x2="86" y2="45" stroke="#ffffff" stroke-width="2"/>
  <line x1="94" y1="37" x2="94" y2="45" stroke="#ffffff" stroke-width="2"/>
  <line x1="102" y1="37" x2="102" y2="45" stroke="#ffffff" stroke-width="2"/>
  <!-- Corner posts -->
  <rect x="11" y="41" width="8" height="8" rx="1" fill="#475569"/>
  <rect x="141" y="41" width="8" height="8" rx="1" fill="#475569"/>
  <rect x="11" y="111" width="8" height="8" rx="1" fill="#475569"/>
  <rect x="141" y="111" width="8" height="8" rx="1" fill="#475569"/>
</svg>`,

  // 5. Sofa 2-seater (2 chairs + table)
  'table_sofa_2.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table in the middle -->
  <rect x="60" y="40" width="40" height="80" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- Left Armchair -->
  <rect x="20" y="50" width="28" height="60" rx="6" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <line x1="26" y1="50" x2="26" y2="110" stroke="#a27840" stroke-width="3"/>
  <rect x="26" y="50" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
  <rect x="26" y="102" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
  <!-- Right Armchair -->
  <rect x="112" y="50" width="28" height="60" rx="6" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <line x1="134" y1="50" x2="134" y2="110" stroke="#a27840" stroke-width="3"/>
  <rect x="112" y="50" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
  <rect x="112" y="102" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
</svg>`,

  // 6. Sofa 4-seater (two 2-seater sofas + table)
  'table_sofa_4.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table in the middle -->
  <rect x="52" y="30" width="56" height="100" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- Left Sofa -->
  <rect x="16" y="20" width="28" height="120" rx="6" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <line x1="22" y1="20" x2="22" y2="140" stroke="#a27840" stroke-width="3"/>
  <line x1="22" y1="80" x2="44" y2="80" stroke="#a27840" stroke-width="3"/>
  <rect x="22" y="20" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
  <rect x="22" y="132" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
  <!-- Right Sofa -->
  <rect x="116" y="20" width="28" height="120" rx="6" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <line x1="138" y1="20" x2="138" y2="140" stroke="#a27840" stroke-width="3"/>
  <line x1="116" y1="80" x2="138" y2="80" stroke="#a27840" stroke-width="3"/>
  <rect x="116" y="20" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
  <rect x="116" y="132" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
</svg>`,

  // 7. Sofa 6-seater (two 3-seater sofas + table)
  'table_sofa_6.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table in the middle -->
  <rect x="52" y="20" width="56" height="120" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- Left Sofa -->
  <rect x="16" y="10" width="28" height="140" rx="6" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <line x1="22" y1="10" x2="22" y2="150" stroke="#a27840" stroke-width="3"/>
  <line x1="22" y1="56" x2="44" y2="56" stroke="#a27840" stroke-width="3"/>
  <line x1="22" y1="104" x2="44" y2="104" stroke="#a27840" stroke-width="3"/>
  <rect x="22" y="10" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
  <rect x="22" y="142" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
  <!-- Right Sofa -->
  <rect x="116" y="10" width="28" height="140" rx="6" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <line x1="138" y1="10" x2="138" y2="150" stroke="#a27840" stroke-width="3"/>
  <line x1="116" y1="56" x2="138" y2="56" stroke="#a27840" stroke-width="3"/>
  <line x1="116" y1="104" x2="138" y2="104" stroke="#a27840" stroke-width="3"/>
  <rect x="116" y="10" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
  <rect x="116" y="142" width="22" height="8" rx="2" fill="#d5b27d" stroke="#a27840" stroke-width="2"/>
</svg>`,

  // 8. Round 1-seater Table
  'table_round_1.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table -->
  <circle cx="80" cy="74" r="30" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- 1 Chair at the bottom -->
  <rect x="68" y="112" width="24" height="16" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
</svg>`,

  // 9. Round 2-seater Table
  'table_round_2.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table -->
  <circle cx="80" cy="80" r="35" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- 2 Chairs -->
  <rect x="20" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="124" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
</svg>`,

  // 10. Round 4-seater Table
  'table_round_4.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table -->
  <circle cx="80" cy="80" r="38" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- 4 Chairs around -->
  <rect x="68" y="20" width="24" height="16" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="68" y="124" width="24" height="16" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="20" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="124" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
</svg>`,

  // 11. Square 2-seater Table
  'table_square_2.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table -->
  <rect x="40" y="40" width="80" height="80" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- 2 Chairs (top & bottom) -->
  <rect x="68" y="20" width="24" height="16" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="68" y="124" width="24" height="16" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
</svg>`,

  // 12. Square 4-seater Table
  'table_square_4.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table -->
  <rect x="40" y="40" width="80" height="80" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- 4 Chairs around -->
  <rect x="68" y="20" width="24" height="16" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="68" y="124" width="24" height="16" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="20" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="124" y="68" width="16" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
</svg>`,

  // 13. Rectangular 4-seater Table
  'table_rect_4.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table -->
  <rect x="40" y="30" width="80" height="100" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- 4 Chairs (2 Left, 2 Right) -->
  <rect x="22" y="45" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="22" y="91" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="124" y="45" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="124" y="91" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
</svg>`,

  // 14. Rectangular 6-seater Table
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

  // 15. Rectangular 8-seater Table
  'table_rect_8.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <!-- Table -->
  <rect x="40" y="24" width="80" height="112" rx="8" fill="#d5b27d" stroke="#a27840" stroke-width="4"/>
  <!-- Chairs Top/Bottom (2 Top, 2 Bottom) -->
  <rect x="52" y="6" width="24" height="14" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="84" y="6" width="24" height="14" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="52" y="140" width="24" height="14" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="84" y="140" width="24" height="14" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <!-- Chairs Left Side -->
  <rect x="22" y="42" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="22" y="94" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <!-- Chairs Right Side -->
  <rect x="124" y="42" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
  <rect x="124" y="94" width="14" height="24" rx="3" fill="#d5b27d" stroke="#a27840" stroke-width="3"/>
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
    'table_sofa_2.svg': 'table_sofa_2.png',
    'table_sofa_6.svg': 'table_sofa_6.png',
    'table_rect_6.svg': 'table_rect_6.png',
    'table_rect_4.svg': 'table_rect_4.png',
    'table_rect_8.svg': 'table_rect_8.png',
    'table_square_4.svg': 'table_square_4.png',
    'table_square_2.svg': 'table_square_2.png',
    'table_round_4.svg': 'table_round_4.png',
    'table_round_2.svg': 'table_round_2.png',
    'table_round_1.svg': 'table_round_1.png'
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
