/* zip.js — a ZIP writer in ninety lines.
 *
 * EPUB and DOCX are both ZIP archives of XML. Writing them is therefore a
 * solved problem that usually costs a dependency — and a dependency is exactly
 * what this application cannot afford, because it ships as one file that has to
 * open from a desktop in ten years with no package manager involved.
 *
 * Every entry is STORED (method 0, uncompressed). Deflate would make the file
 * smaller and the code longer; a novel is a few hundred kilobytes of text and
 * the reader's e-reader does not care. EPUB additionally REQUIRES the mimetype
 * entry to be stored and first, which this satisfies for free.
 */

const TEXT = new TextEncoder();

/* Standard CRC-32, table built once. Both formats validate it, so a wrong
 * checksum is a file that opens nowhere rather than a file that looks fine. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const toBytes = (data) => (typeof data === 'string' ? TEXT.encode(data) : new Uint8Array(data));

/* DOS date/time. Zero is not a legal value in some readers, so a real stamp is
 * cheaper than finding out which ones care. */
function dosStamp(date = new Date()) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5)
    | (Math.floor(date.getSeconds() / 2))) & 0xffff;
  const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5)
    | date.getDate()) & 0xffff;
  return { time, day };
}

/**
 * @param {{name: string, data: string|Uint8Array}[]} entries in archive order
 * @returns {Blob} the finished archive
 */
export function zip(entries, mime = 'application/zip') {
  const { time, day } = dosStamp();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = TEXT.encode(entry.name);
    const data = toBytes(entry.data);
    const sum = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);          // version needed
    view.setUint16(6, 0, true);           // flags — no data descriptor, no UTF-8 bit needed
    view.setUint16(8, 0, true);           // method 0: stored
    view.setUint16(10, time, true);
    view.setUint16(12, day, true);
    view.setUint32(14, sum, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);          // no extra field
    local.set(nameBytes, 30);

    chunks.push(local, data);

    const dir = new Uint8Array(46 + nameBytes.length);
    const dirView = new DataView(dir.buffer);
    dirView.setUint32(0, 0x02014b50, true);
    dirView.setUint16(4, 20, true);       // version made by
    dirView.setUint16(6, 20, true);       // version needed
    dirView.setUint16(10, 0, true);       // stored
    dirView.setUint16(12, time, true);
    dirView.setUint16(14, day, true);
    dirView.setUint32(16, sum, true);
    dirView.setUint32(20, data.length, true);
    dirView.setUint32(24, data.length, true);
    dirView.setUint16(28, nameBytes.length, true);
    dirView.setUint32(42, offset, true);  // where this entry's local header starts
    dir.set(nameBytes, 46);
    central.push(dir);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, end], { type: mime });
}

/** XML text escaping. Everything written into these archives is user prose. */
export const xml = (text) => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
