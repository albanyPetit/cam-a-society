// Rasterizes public/icons/icon.svg into the PNG sizes used by the manifest
// and iOS. Run after changing the SVG: `npm run icons`.
import sharp from "sharp";

const src = "public/icons/icon.svg";
const out = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-maskable-512.png", 512],
  ["public/icons/apple-touch-icon.png", 180],
];

for (const [file, size] of out) {
  await sharp(src).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
