#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Building the Next.js project..."
pnpm next build

echo "Packing chrome extension into public/..."
mkdir -p "${COZE_WORKSPACE_PATH}/public"
cp "${COZE_WORKSPACE_PATH}/chrome-extension/manifest.json" "${COZE_WORKSPACE_PATH}/public/chrome-extension-manifest.json"
node -e "
const { ZipArchive } = require('archiver');
const fs = require('fs');
const path = require('path');
const output = fs.createWriteStream(path.join('${COZE_WORKSPACE_PATH}', 'public', 'mianjing-chrome-extension.zip'));
const archive = new ZipArchive({ zlib: { level: 9 } });
output.on('close', () => console.log('Extension zip created: ' + output.bytesWritten + ' bytes'));
archive.on('error', (err) => { throw err; });
archive.pipe(output);
archive.directory(path.join('${COZE_WORKSPACE_PATH}', 'chrome-extension'), false);
archive.finalize();
"

echo "Bundling server with tsup..."
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo "Build completed successfully!"
