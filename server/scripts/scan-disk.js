const fs = require('fs');
const path = require('path');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDirSize(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        size += getDirSize(filePath);
      } else {
        size += stat.size;
      }
    }
  } catch (e) {
    // ignore
  }
  return size;
}

function scanDir(dirPath, depth = 0) {
  try {
    if (!fs.existsSync(dirPath)) {
      console.log(`${' '.repeat(depth * 2)}❌ ${dirPath} does not exist`);
      return;
    }
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      console.log(`${' '.repeat(depth * 2)}📄 ${path.basename(dirPath)} - ${formatBytes(stat.size)}`);
      return;
    }

    const size = getDirSize(dirPath);
    console.log(`${' '.repeat(depth * 2)}📁 ${path.basename(dirPath) || dirPath} - ${formatBytes(size)}`);

    if (depth < 3) {
      const files = fs.readdirSync(dirPath);
      const items = [];
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          const s = fs.statSync(filePath);
          items.push({ name: file, path: filePath, isDir: s.isDirectory(), size: s.isDirectory() ? getDirSize(filePath) : s.size });
        } catch (_) {}
      }
      items.sort((a, b) => b.size - a.size);

      for (const item of items.slice(0, 15)) {
        if (item.isDir) {
          scanDir(item.path, depth + 1);
        } else {
          console.log(`${' '.repeat((depth + 1) * 2)}📄 ${item.name} - ${formatBytes(item.size)}`);
        }
      }
      if (items.length > 15) {
        console.log(`${' '.repeat((depth + 1) * 2)}... and ${items.length - 15} more items`);
      }
    }
  } catch (e) {
    console.log(`${' '.repeat(depth * 2)}⚠️ Error scanning ${dirPath}: ${e.message}`);
  }
}

console.log('=== Scanning /data ===');
scanDir('/data');

console.log('\n=== Scanning /app ===');
scanDir('/app');
