// The pixel size of a PNG or a WebP from its header, as 'WxH', for the checks that compare a
// sheet with its WebP twin.
export function imageSize(buf) {
  if (buf.toString('ascii', 1, 4) === 'PNG') return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
  // tools/webp.py writes an extended WebP (VP8X) for lossy art with alpha, a simple lossy one (VP8)
  // for opaque art and, for its lossless twins, mostly a simple lossless one (VP8L: 14-bit sizes
  // less one, after a signature byte)
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return `${(bits & 0x3fff) + 1}x${((bits >>> 14) & 0x3fff) + 1}`;
  }
  return kind === 'VP8X' ? `${buf.readUIntLE(24, 3) + 1}x${buf.readUIntLE(27, 3) + 1}`
    : kind === 'VP8 ' ? `${buf.readUInt16LE(26) & 0x3fff}x${buf.readUInt16LE(28) & 0x3fff}` : `a ${kind} chunk`;
}
