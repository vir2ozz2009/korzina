// Remove all optional metadata chunks after re-encoding too. Even an upstream
// codec change cannot persist GPS, camera model, XMP or comments in our WebP.
export function stripWebpMetadata(input: Uint8Array): Uint8Array {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const chunks: Uint8Array[] = [];
  const allowed = new Set(["VP8 ", "VP8L", "VP8X", "ALPH"]);
  let total = 12;
  for (let offset = 12; offset + 8 <= input.length; ) {
    const name = new TextDecoder().decode(input.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    const end = offset + 8 + length + (length % 2);
    if (end > input.length) throw new Error("Invalid WebP chunk");
    if (allowed.has(name)) {
      const chunk = input.slice(offset, end);
      if (name === "VP8X") chunk[8] &= ~0x2c; // clear ICC, EXIF and XMP flags
      chunks.push(chunk);
      total += chunk.length;
    }
    offset = end;
  }
  const output = new Uint8Array(total);
  output.set(input.subarray(0, 12));
  new DataView(output.buffer).setUint32(4, total - 8, true);
  let offset = 12;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
