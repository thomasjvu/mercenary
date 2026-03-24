import { deflateSync } from "node:zlib";

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "11110", "10001", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "11110", "10000", "10000", "10000", "11111"],
  F: ["11111", "10000", "11110", "10000", "10000", "10000", "10000"],
  G: ["01110", "10000", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00001", "00001", "00001", "00001", "10001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00110", "00100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  ":": ["00000", "00110", "00110", "00000", "00110", "00110", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let i = 0; i < 8; i += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

export class Bitmap {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    background: RgbaColor = { r: 0, g: 0, b: 0, a: 0 },
  ) {
    this.data = new Uint8Array(width * height * 4);
    this.fill(background);
  }

  fill(color: RgbaColor): void {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        this.setPixel(x, y, color);
      }
    }
  }

  setPixel(x: number, y: number, color: RgbaColor): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }

    const offset = (y * this.width + x) * 4;
    this.data[offset] = color.r;
    this.data[offset + 1] = color.g;
    this.data[offset + 2] = color.b;
    this.data[offset + 3] = color.a ?? 255;
  }

  fillRect(x: number, y: number, width: number, height: number, color: RgbaColor): void {
    for (let yy = y; yy < y + height; yy += 1) {
      for (let xx = x; xx < x + width; xx += 1) {
        this.setPixel(xx, yy, color);
      }
    }
  }

  strokeRect(x: number, y: number, width: number, height: number, color: RgbaColor): void {
    this.fillRect(x, y, width, 1, color);
    this.fillRect(x, y + height - 1, width, 1, color);
    this.fillRect(x, y, 1, height, color);
    this.fillRect(x + width - 1, y, 1, height, color);
  }

  blit(source: Bitmap, targetX: number, targetY: number, scale: number = 1): void {
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const offset = (y * source.width + x) * 4;
        if (source.data[offset + 3] === 0) {
          continue;
        }
        this.fillRect(targetX + x * scale, targetY + y * scale, scale, scale, {
          r: source.data[offset],
          g: source.data[offset + 1],
          b: source.data[offset + 2],
          a: source.data[offset + 3],
        });
      }
    }
  }

  drawText(
    text: string,
    x: number,
    y: number,
    color: RgbaColor,
    options: { scale?: number; maxWidth?: number; lineHeight?: number } = {},
  ): void {
    const scale = options.scale ?? 1;
    const maxWidth = options.maxWidth ?? this.width - x;
    const lineHeight = options.lineHeight ?? 8 * scale;
    const words = text.toUpperCase().split(/\s+/);
    let cursorX = x;
    let cursorY = y;

    for (const word of words) {
      const wordWidth = word.length * 6 * scale;
      if (cursorX > x && cursorX + wordWidth > x + maxWidth) {
        cursorX = x;
        cursorY += lineHeight;
      }
      for (const character of word) {
        this.drawGlyph(character, cursorX, cursorY, color, scale);
        cursorX += 6 * scale;
      }
      cursorX += 6 * scale;
    }
  }

  private drawGlyph(character: string, x: number, y: number, color: RgbaColor, scale: number): void {
    const glyph = FONT[character] ?? FONT["?"];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === "1") {
          this.fillRect(x + column * scale, y + row * scale, scale, scale, color);
        }
      }
    }
  }
}

export function parseHexColor(hex: string, alpha: number = 255): RgbaColor {
  const normalized = hex.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized;
  const value = expanded.padEnd(6, "0").slice(0, 6);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: alpha,
  };
}

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([header, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, header, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function encodePng(bitmap: Bitmap): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(bitmap.width, 0);
  ihdr.writeUInt32BE(bitmap.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = bitmap.width * 4;
  const raw = Buffer.alloc((stride + 1) * bitmap.height);
  for (let y = 0; y < bitmap.height; y += 1) {
    raw[y * (stride + 1)] = 0;
    const sourceStart = y * stride;
    raw.set(bitmap.data.subarray(sourceStart, sourceStart + stride), y * (stride + 1) + 1);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function nextGifTableSize(colorCount: number): number {
  let size = 2;
  while (size < colorCount && size < 256) {
    size <<= 1;
  }
  return size;
}

function colorKey(r: number, g: number, b: number, a: number): string {
  return `${r},${g},${b},${a}`;
}

function collectGifPalette(frames: Bitmap[]): { palette: RgbaColor[]; indices: Map<string, number> } {
  const palette: RgbaColor[] = [];
  const indices = new Map<string, number>();

  for (const frame of frames) {
    for (let offset = 0; offset < frame.data.length; offset += 4) {
      const r = frame.data[offset];
      const g = frame.data[offset + 1];
      const b = frame.data[offset + 2];
      const a = frame.data[offset + 3];
      const key = colorKey(r, g, b, a);
      if (indices.has(key) || palette.length >= 256) {
        continue;
      }
      indices.set(key, palette.length);
      palette.push({ r, g, b, a });
    }
  }

  if (palette.length === 0) {
    palette.push({ r: 0, g: 0, b: 0, a: 255 });
    indices.set(colorKey(0, 0, 0, 255), 0);
  }

  return { palette, indices };
}

function findNearestPaletteIndex(color: RgbaColor, palette: RgbaColor[]): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < palette.length; index += 1) {
    const candidate = palette[index];
    const dr = color.r - candidate.r;
    const dg = color.g - candidate.g;
    const db = color.b - candidate.b;
    const da = (color.a ?? 255) - (candidate.a ?? 255);
    const distance = dr * dr + dg * dg + db * db + da * da;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function mapFrameToGifIndices(bitmap: Bitmap, palette: RgbaColor[], paletteIndices: Map<string, number>): Uint8Array {
  const output = new Uint8Array(bitmap.width * bitmap.height);
  for (let pixel = 0; pixel < bitmap.width * bitmap.height; pixel += 1) {
    const offset = pixel * 4;
    const r = bitmap.data[offset];
    const g = bitmap.data[offset + 1];
    const b = bitmap.data[offset + 2];
    const a = bitmap.data[offset + 3];
    const key = colorKey(r, g, b, a);
    const exact = paletteIndices.get(key);
    output[pixel] =
      exact ??
      findNearestPaletteIndex(
        {
          r,
          g,
          b,
          a,
        },
        palette,
      );
  }
  return output;
}

function encodeGifSubBlocks(bytes: Uint8Array): Buffer {
  const blocks: Buffer[] = [];
  for (let offset = 0; offset < bytes.length; offset += 255) {
    const chunkLength = Math.min(255, bytes.length - offset);
    blocks.push(Buffer.from([chunkLength]));
    blocks.push(Buffer.from(bytes.subarray(offset, offset + chunkLength)));
  }
  blocks.push(Buffer.from([0]));
  return Buffer.concat(blocks);
}

function encodeGifImageData(indices: Uint8Array, minCodeSize: number): Buffer {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  let emittedSinceClear = 0;
  let bitBuffer = 0;
  let bitCount = 0;
  const bytes: number[] = [];

  const flushCode = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  const resetTable = () => {
    flushCode(clearCode);
    codeSize = minCodeSize + 1;
    nextCode = endCode + 1;
    emittedSinceClear = 0;
  };

  resetTable();
  for (const index of indices) {
    flushCode(index);
    if (emittedSinceClear > 0) {
      nextCode += 1;
      if (nextCode === 1 << codeSize && codeSize < 12) {
        codeSize += 1;
      }
    }
    emittedSinceClear += 1;
    if (emittedSinceClear >= 512 || nextCode >= 4095) {
      resetTable();
    }
  }

  flushCode(endCode);
  if (bitCount > 0) {
    bytes.push(bitBuffer & 0xff);
  }

  return Buffer.concat([Buffer.from([minCodeSize]), encodeGifSubBlocks(Uint8Array.from(bytes))]);
}

export function encodeGifAnimation(
  frames: Bitmap[],
  options: { delayCs?: number; loopCount?: number } = {},
): Buffer {
  if (frames.length === 0) {
    throw new Error("encodeGifAnimation requires at least one frame.");
  }

  const width = frames[0].width;
  const height = frames[0].height;
  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height) {
      throw new Error("encodeGifAnimation requires frames to share the same dimensions.");
    }
  }

  const { palette, indices: paletteIndices } = collectGifPalette(frames);
  const tableSize = nextGifTableSize(palette.length);
  const minCodeSize = Math.max(2, Math.ceil(Math.log2(Math.max(2, palette.length))));
  const delayCs = Math.max(2, Math.round(options.delayCs ?? 100));
  const loopCount = Math.max(0, options.loopCount ?? 0);

  const header = Buffer.from("GIF89a", "ascii");
  const logicalScreenDescriptor = Buffer.alloc(7);
  logicalScreenDescriptor.writeUInt16LE(width, 0);
  logicalScreenDescriptor.writeUInt16LE(height, 2);
  logicalScreenDescriptor[4] = 0x80 | 0x70 | Math.max(0, Math.log2(tableSize) - 1);
  logicalScreenDescriptor[5] = 0;
  logicalScreenDescriptor[6] = 0;

  const globalColorTable = Buffer.alloc(tableSize * 3, 0);
  palette.forEach((color, index) => {
    const offset = index * 3;
    globalColorTable[offset] = color.r;
    globalColorTable[offset + 1] = color.g;
    globalColorTable[offset + 2] = color.b;
  });

  const applicationExtension = Buffer.concat([
    Buffer.from([0x21, 0xff, 0x0b]),
    Buffer.from("NETSCAPE2.0", "ascii"),
    Buffer.from([0x03, 0x01, loopCount & 0xff, (loopCount >> 8) & 0xff, 0x00]),
  ]);

  const parts: Buffer[] = [header, logicalScreenDescriptor, globalColorTable, applicationExtension];

  for (const frame of frames) {
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x08, delayCs & 0xff, (delayCs >> 8) & 0xff, 0x00, 0x00]));

    const imageDescriptor = Buffer.alloc(10);
    imageDescriptor[0] = 0x2c;
    imageDescriptor.writeUInt16LE(0, 1);
    imageDescriptor.writeUInt16LE(0, 3);
    imageDescriptor.writeUInt16LE(width, 5);
    imageDescriptor.writeUInt16LE(height, 7);
    imageDescriptor[9] = 0x00;
    parts.push(imageDescriptor);
    parts.push(encodeGifImageData(mapFrameToGifIndices(frame, palette, paletteIndices), minCodeSize));
  }

  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}
