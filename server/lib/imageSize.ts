/**
 * Pixel dimensions straight out of an image's header bytes.
 *
 * Cover URLs from every source lie about what they will give you — the same
 * Google Books link answers a 128px thumbnail or a 1280px scan depending on a
 * query parameter nobody documents, and a "missing cover" is often a 1x1 GIF
 * served with a 200. The only way to know what a candidate actually is, is to
 * look at it, so the cover resolver measures rather than trusts.
 *
 * Header parsing keeps that cheap: no decoding and no dependency, just the
 * first few hundred bytes of each format.
 */

export interface ImageSize { width: number; height: number; type: string }

function png(b: Buffer): ImageSize | null {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), type: 'png' };
}

function gif(b: Buffer): ImageSize | null {
  if (b.length < 10 || b.toString('ascii', 0, 3) !== 'GIF') return null;
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8), type: 'gif' };
}

function jpeg(b: Buffer): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    // SOF0..SOF15 carry the frame size; DHT/DAC/RST are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), type: 'jpeg' };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function webp(b: Buffer): ImageSize | null {
  if (b.length < 30) return null;
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fourcc = b.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, type: 'webp' };
  }
  if (fourcc === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, type: 'webp' };
  }
  if (fourcc === 'VP8X') {
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { width: w, height: h, type: 'webp' };
  }
  return null;
}

/** Reads an image's dimensions, or null if these bytes are not an image we know. */
export function imageSize(buf: Buffer): ImageSize | null {
  return png(buf) || jpeg(buf) || gif(buf) || webp(buf);
}
