import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const iconSizes = [192, 512];
const publicDir = join(__dirname, '..', 'public');
const iconSvg = join(publicDir, 'icon.svg');

async function generateIcons() {
  const svgBuffer = readFileSync(iconSvg);
  
  for (const size of iconSizes) {
    const outputPath = join(publicDir, `pwa-${size}x${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated ${outputPath}`);
  }
  
  // Also generate favicon
  const faviconPath = join(publicDir, 'favicon.ico');
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(faviconPath.replace('.ico', '.png'));
  console.log(`Generated favicon`);
}

generateIcons().catch(console.error);


