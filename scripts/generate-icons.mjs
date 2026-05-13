import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "public", "icons");
mkdirSync(iconsDir, { recursive: true });

const svgAny = readFileSync(join(iconsDir, "icon.svg"));
const svgMask = readFileSync(join(iconsDir, "icon-maskable.svg"));

const sizes = [192, 512];

for (const size of sizes) {
  await sharp(svgAny).resize(size, size).png().toFile(join(iconsDir, `icon-${size}.png`));
  console.log(`icon-${size}.png`);
}

await sharp(svgMask).resize(512, 512).png().toFile(join(iconsDir, "icon-maskable-512.png"));
console.log("icon-maskable-512.png");
