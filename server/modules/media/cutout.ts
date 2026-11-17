import { decode } from "fast-png";

// Inspect a small RGBA thumbnail: empty/full masks, clipped edges and fragmented masks are rejected.
export function goodCutout(png: Uint8Array): boolean {
  const { data, width, height, channels, depth } = decode(png);
  if (channels !== 4 || depth !== 8) return false;
  const mask = new Uint8Array(width * height);
  let count = 0;
  let edges = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (data[p * 4 + 3] < 128) continue;
      mask[p] = 1;
      count++;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edges++;
    }
  const coverage = count / mask.length;
  if (coverage < 0.04 || coverage > 0.88 || edges > (width + height) * 0.04) return false;
  let largest = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const queue = [p];
    mask[p] = 0;
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i];
      const neighbours = [n - width, n + width];
      if (n % width) neighbours.push(n - 1);
      if (n % width !== width - 1) neighbours.push(n + 1);
      for (const next of neighbours)
        if (next >= 0 && next < mask.length && mask[next]) {
          mask[next] = 0;
          queue.push(next);
        }
    }
    largest = Math.max(largest, queue.length);
  }
  return largest / count > 0.9;
}
