#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

echo "Packing chrome extension into public/..."
mkdir -p "${COZE_WORKSPACE_PATH}/public"
cp "${COZE_WORKSPACE_PATH}/chrome-extension/manifest.json" "${COZE_WORKSPACE_PATH}/public/chrome-extension-manifest.json"

# Create zip using pure Node.js (no external dependencies)
node -e "
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createZip(sourceDir, outputPath) {
  const files = [];
  
  function walkDir(dir, base) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const entryPath = base ? base + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        walkDir(fullPath, entryPath);
      } else if (entry.isFile() && !entry.name.endsWith('.DS_Store')) {
        files.push({ path: entryPath, data: fs.readFileSync(fullPath) });
      }
    }
  }
  
  walkDir(sourceDir, '');
  
  const localFiles = [];
  const centralDir = [];
  let offset = 0;
  
  for (const file of files) {
    const nameBuf = Buffer.from(file.path, 'utf8');
    const compressed = zlib.deflateRawSync(file.data);
    const crc32 = crc32buf(file.data);
    
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(8, 8); // compression: deflate
    localHeader.writeUInt32LE(crc32, 14); // crc32
    localHeader.writeUInt32LE(compressed.length, 18); // compressed size
    localHeader.writeUInt32LE(file.data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // filename length
    
    localFiles.push(localHeader, nameBuf, compressed);
    
    const centralEntry = Buffer.alloc(46);
    centralEntry.writeUInt32LE(0x02014b50, 0); // signature
    centralEntry.writeUInt16LE(20, 4); // version made by
    centralEntry.writeUInt16LE(20, 6); // version needed
    centralEntry.writeUInt16LE(8, 10); // compression: deflate
    centralEntry.writeUInt32LE(crc32, 16); // crc32
    centralEntry.writeUInt32LE(compressed.length, 20); // compressed size
    centralEntry.writeUInt32LE(file.data.length, 24); // uncompressed size
    centralEntry.writeUInt16LE(nameBuf.length, 28); // filename length
    centralEntry.writeUInt32LE(offset, 42); // offset of local header
    
    centralDir.push(centralEntry, nameBuf);
    offset += 30 + nameBuf.length + compressed.length;
  }
  
  const centralOffset = offset;
  let centralSize = 0;
  for (const b of centralDir) centralSize += b.length;
  
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // signature
  endRecord.writeUInt16LE(files.length, 8); // entries on disk
  endRecord.writeUInt16LE(files.length, 10); // total entries
  endRecord.writeUInt32LE(centralSize, 12); // central dir size
  endRecord.writeUInt32LE(centralOffset, 16); // central dir offset
  
  const result = Buffer.concat([...localFiles, ...centralDir, endRecord]);
  fs.writeFileSync(outputPath, result);
  console.log('Extension zip created: ' + result.length + ' bytes');
}

function crc32buf(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crc32Table[i] = c;
}

const outputPath = path.join('${COZE_WORKSPACE_PATH}', 'public', 'mianjing-chrome-extension.zip');
const sourceDir = path.join('${COZE_WORKSPACE_PATH}', 'chrome-extension');
if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
createZip(sourceDir, outputPath);
"

echo "Building the Next.js project..."
pnpm next build

echo "Build completed successfully!"
