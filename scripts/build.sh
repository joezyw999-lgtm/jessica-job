#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

echo "Packing chrome extension into public/..."
mkdir -p "${COZE_WORKSPACE_PATH}/public"
cp "${COZE_WORKSPACE_PATH}/chrome-extension/manifest.json" "${COZE_WORKSPACE_PATH}/public/chrome-extension-manifest.json"

# Use pnpm to install archiver temporarily and create zip
node -e "
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outputPath = path.join('${COZE_WORKSPACE_PATH}', 'public', 'mianjing-chrome-extension.zip');
const sourceDir = path.join('${COZE_WORKSPACE_PATH}', 'chrome-extension');

if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

// Install archiver as dev dependency if not present
try {
  require.resolve('archiver');
} catch {
  console.log('Installing archiver...');
  execSync('pnpm add -D archiver', { stdio: 'pipe' });
}

const { ZipArchive } = require('archiver');
const output = fs.createWriteStream(outputPath);
const archive = new ZipArchive({ zlib: { level: 9 } });
output.on('close', () => console.log('Extension zip created: ' + archive.pointer() + ' bytes'));
archive.on('error', (err) => { throw err; });
archive.pipe(output);
archive.directory(sourceDir, false);
archive.finalize();
"

echo "Building the Next.js project..."
pnpm next build

echo "Build completed successfully!"
