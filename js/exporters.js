/**
 * Client-side macOS Icon Exporters
 * - High-quality stepped downsampling (1024 -> 512 -> 256 -> 128 -> 64 -> 32 -> 16)
 * - Binary Apple .icns encoder (icp4, ic11, icp5, ic12, ic07, ic13, ic08, ic14, ic09, ic10)
 * - Pure JS .iconset.zip encoder (STORE method + IEEE 802.3 CRC32) for Xcode / iconutil
 * - Single & multi-size PNG exports
 */

const ICNS_ENTRIES = [
  { ostype: 'icp4', size: 16 },
  { ostype: 'ic11', size: 32 },
  { ostype: 'icp5', size: 32 },
  { ostype: 'ic12', size: 64 },
  { ostype: 'ic07', size: 128 },
  { ostype: 'ic13', size: 256 },
  { ostype: 'ic08', size: 256 },
  { ostype: 'ic14', size: 512 },
  { ostype: 'ic09', size: 512 },
  { ostype: 'ic10', size: 1024 },
];

const ICONSET_FILES = [
  { filename: 'icon_16x16.png', size: 16 },
  { filename: 'icon_16x16@2x.png', size: 32 },
  { filename: 'icon_32x32.png', size: 32 },
  { filename: 'icon_32x32@2x.png', size: 64 },
  { filename: 'icon_128x128.png', size: 128 },
  { filename: 'icon_128x128@2x.png', size: 256 },
  { filename: 'icon_256x256.png', size: 256 },
  { filename: 'icon_256x256@2x.png', size: 512 },
  { filename: 'icon_512x512.png', size: 512 },
  { filename: 'icon_512x512@2x.png', size: 1024 },
];

/**
 * Downsamples a 1024x1024 canvas cleanly by halving sequentially to prevent aliasing.
 */
export function downsampleCanvas(sourceCanvas, targetSize) {
  if (sourceCanvas.width === targetSize && sourceCanvas.height === targetSize) {
    return sourceCanvas;
  }

  let current = sourceCanvas;
  while (current.width / 2 >= targetSize && current.width > targetSize) {
    const nextSize = Math.max(targetSize, Math.floor(current.width / 2));
    const step = document.createElement('canvas');
    step.width = nextSize;
    step.height = nextSize;
    const sctx = step.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(current, 0, 0, nextSize, nextSize);
    current = step;
    if (nextSize === targetSize) return current;
  }

  const out = document.createElement('canvas');
  out.width = targetSize;
  out.height = targetSize;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(current, 0, 0, targetSize, targetSize);
  return out;
}

export function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Failed to encode canvas as PNG'));
        return;
      }
      const buf = await blob.arrayBuffer();
      resolve(new Uint8Array(buf));
    }, 'image/png');
  });
}

async function renderSizedPngMap(masterCanvas, sizes) {
  const uniqueSizes = [...new Set(sizes)].sort((a, b) => b - a);
  const map = new Map();
  for (const size of uniqueSizes) {
    const scaled = downsampleCanvas(masterCanvas, size);
    const bytes = await canvasToPngBytes(scaled);
    map.set(size, bytes);
  }
  return map;
}

/**
 * Generates an Apple Icon Image (.icns) binary Blob from a 1024x1024 master canvas.
 */
export async function generateICNSBlob(masterCanvas) {
  const pngBySize = await renderSizedPngMap(
    masterCanvas,
    ICNS_ENTRIES.map((e) => e.size)
  );

  let totalLength = 8; // 'icns' magic (4) + file length uint32 (4)
  const chunks = ICNS_ENTRIES.map((entry) => {
    const data = pngBySize.get(entry.size);
    const chunkLength = 8 + data.length;
    totalLength += chunkLength;
    return { ostype: entry.ostype, data, chunkLength };
  });

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  // Header: 'icns'
  out[0] = 0x69; // i
  out[1] = 0x63; // c
  out[2] = 0x6e; // n
  out[3] = 0x73; // s
  view.setUint32(4, totalLength, false); // big-endian

  let offset = 8;
  for (const chunk of chunks) {
    for (let i = 0; i < 4; i++) {
      out[offset + i] = chunk.ostype.charCodeAt(i);
    }
    view.setUint32(offset + 4, chunk.chunkLength, false);
    out.set(chunk.data, offset + 8);
    offset += chunk.chunkLength;
  }

  return new Blob([buffer], { type: 'image/icns' });
}

// IEEE 802.3 CRC32 lookup table
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Generates an uncompressed (STORE) ZIP archive containing <iconName>.iconset/*.png
 * compatible with macOS `iconutil -c icns` and Xcode Asset Catalogs.
 */
export async function generateIconsetZipBlob(masterCanvas, iconName = 'AppIcon') {
  const safeName = (iconName || 'AppIcon').replace(/[^a-zA-Z0-9_-]/g, '_') || 'AppIcon';
  const folderPrefix = `${safeName}.iconset/`;

  const pngBySize = await renderSizedPngMap(
    masterCanvas,
    ICONSET_FILES.map((f) => f.size)
  );

  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of ICONSET_FILES) {
    const filePath = `${folderPrefix}${entry.filename}`;
    const nameBytes = encoder.encode(filePath);
    const data = pngBySize.get(entry.size);
    const crc = crc32(data);

    // Local File Header (30 bytes + name)
    const localHeader = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(localHeader);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 flag
    lv.setUint16(8, 0, true); // method: STORE
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); // compressed size
    lv.setUint32(22, data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    new Uint8Array(localHeader).set(nameBytes, 30);

    // Central Directory Header (46 bytes + name)
    const centralHeader = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(centralHeader);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // method: STORE
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk start
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // relative offset of local header
    new Uint8Array(centralHeader).set(nameBytes, 46);

    localParts.push(new Uint8Array(localHeader), data);
    centralParts.push(new Uint8Array(centralHeader));
    offset += 30 + nameBytes.length + data.length;
  }

  let centralSize = 0;
  for (const part of centralParts) centralSize += part.length;

  // End of Central Directory Record (22 bytes)
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, ICONSET_FILES.length, true);
  ev.setUint16(10, ICONSET_FILES.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, new Uint8Array(eocd)], {
    type: 'application/zip',
  });
}

export async function generatePNGBlob(masterCanvas, size = 1024) {
  const scaled = downsampleCanvas(masterCanvas, size);
  const bytes = await canvasToPngBytes(scaled);
  return new Blob([bytes], { type: 'image/png' });
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
