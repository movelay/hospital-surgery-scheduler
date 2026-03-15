const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// CRC32 lookup table
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])), 0);
  return Buffer.concat([len, typeB, data, crcB]);
}

function createPNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4 + 1;
  const rawData = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    rawData[y * stride] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = y * stride + 1 + x * 4;
      rawData[di]     = pixels[si];
      rawData[di + 1] = pixels[si + 1];
      rawData[di + 2] = pixels[si + 2];
      rawData[di + 3] = pixels[si + 3];
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);

  const bgR1 = 0x4A, bgG1 = 0x6C, bgB1 = 0xF7; // top-left blue
  const bgR2 = 0x7C, bgG2 = 0x4D, bgB2 = 0xDB; // bottom-right purple

  const crossThick = Math.round(size * 0.18);
  const crossLen   = Math.round(size * 0.50);
  const cx = size / 2, cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = ((x / size) + (y / size)) / 2;
      let r = Math.round(lerp(bgR1, bgR2, t));
      let g = Math.round(lerp(bgG1, bgG2, t));
      let b = Math.round(lerp(bgB1, bgB2, t));
      let a = 255;

      // Draw white cross
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      const inVertBar   = dx < crossThick / 2 && dy < crossLen / 2;
      const inHorizBar  = dy < crossThick / 2 && dx < crossLen / 2;

      if (inVertBar || inHorizBar) {
        // Anti-alias edges
        let edgeDist = Infinity;
        if (inVertBar) {
          edgeDist = Math.min(
            crossThick / 2 - dx,
            crossLen / 2 - dy
          );
        }
        if (inHorizBar) {
          edgeDist = Math.min(edgeDist,
            crossThick / 2 - dy,
            crossLen / 2 - dx
          );
        }
        const blend = Math.min(1, edgeDist * (size > 64 ? 2 : 1));
        r = Math.round(lerp(r, 255, blend));
        g = Math.round(lerp(g, 255, blend));
        b = Math.round(lerp(b, 255, blend));
      }

      const i = (y * size + x) * 4;
      pixels[i]     = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }
  }
  return pixels;
}

// Generate all needed sizes
const sizes = [16, 32, 64, 128, 192, 512, 1024];
const outputDirs = {
  pwa: path.join(__dirname, '..', 'client', 'public'),
  electron: path.join(__dirname, '..', 'build'),
};

// Ensure directories exist
Object.values(outputDirs).forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

for (const size of sizes) {
  console.log(`Generating ${size}x${size} icon...`);
  const pixels = drawIcon(size);
  const png = createPNG(size, size, pixels);

  if (size === 192 || size === 512) {
    fs.writeFileSync(path.join(outputDirs.pwa, `icon-${size}.png`), png);
    console.log(`  -> client/public/icon-${size}.png`);
  }
  if (size === 1024) {
    fs.writeFileSync(path.join(outputDirs.electron, 'icon.png'), png);
    console.log(`  -> build/icon.png (Electron Mac)`);
  }
  if (size === 64) {
    // Also save as favicon
    fs.writeFileSync(path.join(outputDirs.pwa, 'favicon.png'), png);
    console.log(`  -> client/public/favicon.png`);
  }
}

// Generate a simple ICO file for Windows (256x256 PNG embedded in ICO)
// Linux icons (build/icons/) - electron-builder expects NxN.png naming
const linuxDir = path.join(outputDirs.electron, 'icons');
if (!fs.existsSync(linuxDir)) fs.mkdirSync(linuxDir, { recursive: true });
const linuxSizes = [16, 32, 48, 64, 128, 256, 512];
console.log('Generating Linux icons...');
for (const s of linuxSizes) {
  const png = createPNG(s, s, drawIcon(s));
  fs.writeFileSync(path.join(linuxDir, `${s}x${s}.png`), png);
  console.log(`  -> build/icons/${s}x${s}.png`);
}

console.log('Generating ICO for Windows...');
const ico256 = createPNG(256, 256, drawIcon(256));

function createICO(pngBuf) {
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);    // reserved
  header.writeUInt16LE(1, 2);    // type: 1 = ICO
  header.writeUInt16LE(1, 4);    // 1 image

  // Directory entry: 16 bytes
  const entry = Buffer.alloc(16);
  entry[0] = 0;   // width (0 = 256)
  entry[1] = 0;   // height (0 = 256)
  entry[2] = 0;   // palette
  entry[3] = 0;   // reserved
  entry.writeUInt16LE(1, 4);     // color planes
  entry.writeUInt16LE(32, 6);    // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8);  // data size
  entry.writeUInt32LE(22, 12);   // data offset (6 + 16)

  return Buffer.concat([header, entry, pngBuf]);
}

const ico = createICO(ico256);
fs.writeFileSync(path.join(outputDirs.electron, 'icon.ico'), ico);
console.log('  -> build/icon.ico (Electron Windows)');

console.log('\nAll icons generated successfully!');
