import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

/**
 * Generates the artwork shown on the Telegram inline invite and as the
 * Mini App preview in BotFather.
 *
 * Run with: npm run generate-telegram-invite
 *
 * Output is JPEG because Telegram rejects PNG for photo results, and 1280x720
 * so it stays sharp on high-DPI screens. The design is drawn at 640x360 and
 * rendered at 2x - the SVG scales cleanly, so coordinates stay readable.
 */

const DESIGN_W = 640;
const DESIGN_H = 360;
const SCALE = 2;

const OUT = fileURLToPath(new URL('../public/telegram-invite.jpg', import.meta.url));

const TOKENS = [
  { id: 'r', c: '#d0524a', d: '#8d2f28', x: 196 },
  { id: 'b', c: '#4382ca', d: '#25507f', x: 278 },
  { id: 'g', c: '#4da45c', d: '#2a6435', x: 360 },
  { id: 'y', c: '#e0b93c', d: '#96751b', x: 442 },
];

const gradient = (t) => `
  <radialGradient id="tok${t.id}" cx="35%" cy="25%" r="80%">
    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
    <stop offset="38%" stop-color="${t.c}"/>
    <stop offset="100%" stop-color="${t.d}"/>
  </radialGradient>`;

const token = (t) => `
  <g transform="translate(${t.x},286)">
    <ellipse cx="0" cy="17" rx="27" ry="7" fill="#000" opacity="0.4"/>
    <circle cx="0" cy="0" r="28" fill="${t.d}"/>
    <circle cx="0" cy="-2" r="24.5" fill="url(#tok${t.id})"/>
    <circle cx="0" cy="-2" r="24.5" fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="1.5"/>
    <circle cx="0" cy="2" r="7" fill="${t.d}" opacity="0.9"/>
    <ellipse cx="-7" cy="-13" rx="10" ry="6" fill="#fff" opacity="0.3"/>
  </g>`;

const FONT = "'Arial Black','Helvetica Neue',Helvetica,Arial,sans-serif";
const BASE = 170;
const SIZE = 112;
const TRACK = 8;

const wordmark = (attrs) =>
  `<text x="${DESIGN_W / 2}" y="${BASE}" text-anchor="middle" font-family="${FONT}"
         font-weight="900" font-size="${SIZE}" letter-spacing="${TRACK}" ${attrs}>LUDO</text>`;

// Stacked offset copies read as carved depth rather than a flat drop shadow.
const extrude = Array.from({ length: 7 }, (_, i) =>
  wordmark(`fill="#5b3611" transform="translate(0,${7 - i})" opacity="${0.55 + i * 0.06}"`)
).join('');

const CY = BASE - SIZE * 0.36; // optical centre of the wordmark

const svg = `<svg xmlns="http://www.w3.org/2000/svg"
  width="${DESIGN_W * SCALE}" height="${DESIGN_H * SCALE}"
  viewBox="0 0 ${DESIGN_W} ${DESIGN_H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#3d2c1d"/>
      <stop offset="55%" stop-color="#2a1c11"/>
      <stop offset="100%" stop-color="#170e07"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="letter" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fadd9c"/>
      <stop offset="50%" stop-color="#efc177"/>
      <stop offset="100%" stop-color="#d59d43"/>
    </linearGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <clipPath id="inside">${wordmark('')}</clipPath>
    ${TOKENS.map(gradient).join('')}
  </defs>

  <rect width="${DESIGN_W}" height="${DESIGN_H}" fill="url(#bg)"/>
  <rect width="${DESIGN_W}" height="${DESIGN_H}" filter="url(#grain)" opacity="0.05"/>
  <rect width="${DESIGN_W}" height="${DESIGN_H}" fill="url(#vig)"/>
  <rect x="9" y="9" width="${DESIGN_W - 18}" height="${DESIGN_H - 18}" rx="7"
        fill="none" stroke="#c9a15c" stroke-opacity="0.3" stroke-width="1.5"/>

  <text x="${DESIGN_W / 2}" y="60" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="16" letter-spacing="6.5" fill="#d8ab63">THE CLASSIC RACE HOME</text>

  ${extrude}
  ${wordmark('fill="url(#letter)" stroke="#8a5a22" stroke-width="1.2"')}
  <g clip-path="url(#inside)">
    ${wordmark(`fill="none" stroke="#b5822f" stroke-width="3"
       transform="translate(${DESIGN_W / 2},${CY}) scale(0.9) translate(${-DESIGN_W / 2},${-CY})"`)}
  </g>

  <text x="${DESIGN_W / 2}" y="211" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="15" letter-spacing="8" fill="#e6dcc8" opacity="0.85">TABLETOP EDITION</text>

  ${TOKENS.map(token).join('')}
</svg>`;

await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(OUT);

const meta = await sharp(OUT).metadata();
console.log(`wrote ${OUT} — ${meta.width}x${meta.height} ${meta.format}`);
