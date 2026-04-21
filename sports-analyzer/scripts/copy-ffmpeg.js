/**
 * copy-ffmpeg.js
 * Copies @ffmpeg/core wasm files from node_modules → public/ffmpeg/
 * Runs automatically on postinstall and before build (Vercel compatible).
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "@ffmpeg", "core", "dist", "umd");
const dst = path.join(__dirname, "..", "public", "ffmpeg");

if (!fs.existsSync(src)) {
  console.warn("[copy-ffmpeg] @ffmpeg/core not found in node_modules, skipping.");
  process.exit(0);
}

fs.mkdirSync(dst, { recursive: true });

const files = ["ffmpeg-core.js", "ffmpeg-core.wasm"];
for (const file of files) {
  const srcFile = path.join(src, file);
  const dstFile = path.join(dst, file);
  if (!fs.existsSync(srcFile)) {
    console.warn(`[copy-ffmpeg] ${file} not found, skipping.`);
    continue;
  }
  fs.copyFileSync(srcFile, dstFile);
  const size = (fs.statSync(dstFile).size / 1024 / 1024).toFixed(1);
  console.log(`[copy-ffmpeg] ✓ ${file} → public/ffmpeg/ (${size}MB)`);
}
