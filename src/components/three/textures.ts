import * as THREE from 'three';

// Subtle speckle grain over a base color; used for paper cells and wood frame.
export function makeGrainTexture(
  base: string,
  opts: { noise?: number; repeat?: number } = {}
): THREE.CanvasTexture {
  const { noise = 14, repeat = 2 } = opts;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * noise;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A soft, blurred square outline on transparent black. Laid flat over a home
// base and tinted per player, it reads as a glowing halo around the quadrant.
export function makeHaloTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const inset = size * 0.16;
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.lineJoin = 'round';
  // Successively tighter, brighter passes build a falloff that is strongest
  // on the border and fades both inward and outward.
  for (const [width, blur, alpha] of [
    [22, 34, 0.35],
    [12, 18, 0.5],
    [5, 8, 0.9],
  ]) {
    ctx.lineWidth = width;
    ctx.shadowBlur = blur;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(inset, inset, size - inset * 2, size - inset * 2, size * 0.06);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
