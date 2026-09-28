// functions/_shared/exif.js
//
// Reads the two facts GrievIQ uses from a JPEG photo's EXIF data: when it
// was taken and where (GPS). Nothing else is read. Returns
// { takenAt: ISO string | null, lat: number | null, lng: number | null }.
//
// Only JPEG is read; PNG, WEBP and HEIC give nulls. EXIF can be missing
// (WhatsApp and many apps strip it) or edited, so callers use it only
// for warnings, never to block anything. A photo with no offset tag is
// read as India time (+05:30), since GrievIQ serves India.
//
// Written defensively: every offset is bounds-checked and any surprise
// returns nulls rather than throwing.

const NONE = { takenAt: null, lat: null, lng: null };

export function readExif(buffer) {
  try {
    const b = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
    if (b.byteLength < 4 || b.getUint16(0) !== 0xffd8) return NONE;
    let p = 2;
    while (p + 4 <= b.byteLength) {
      if (b.getUint8(p) !== 0xff) return NONE;
      const marker = b.getUint8(p + 1);
      if (marker === 0xda || marker === 0xd9) return NONE; // image data: no EXIF before it
      const len = b.getUint16(p + 2);
      if (len < 2) return NONE;
      if (marker === 0xe1 && p + 10 <= b.byteLength &&
          b.getUint32(p + 4) === 0x45786966 && b.getUint16(p + 8) === 0) { // "Exif\0\0"
        return readTiff(b, p + 10, Math.min(b.byteLength, p + 2 + len));
      }
      p += 2 + len;
    }
  } catch (e) { /* fall through */ }
  return NONE;
}

function readTiff(b, start, end) {
  const order = b.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) return NONE;
  const le = order === 0x4949;
  const u16 = (o) => (o + 2 <= end ? b.getUint16(o, le) : null);
  const u32 = (o) => (o + 4 <= end ? b.getUint32(o, le) : null);
  const ifd0 = u32(start + 4);
  if (ifd0 == null) return NONE;

  function entries(off) {
    const out = new Map();
    const at = start + off;
    const n = u16(at);
    if (n == null || n > 500) return out;
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > end) break;
      out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), valueAt: e + 8 });
    }
    return out;
  }
  function ascii(ent) {
    if (!ent || ent.type !== 2 || !ent.count) return null;
    const at = ent.count <= 4 ? ent.valueAt : start + u32(ent.valueAt);
    if (at < start || at + ent.count > end) return null;
    let s = "";
    for (let i = 0; i < ent.count; i++) { const c = b.getUint8(at + i); if (!c) break; s += String.fromCharCode(c); }
    return s;
  }
  function rationals(ent, n) {
    if (!ent || ent.type !== 5 || ent.count < n) return null;
    const at = start + u32(ent.valueAt);
    if (at < start || at + n * 8 > end) return null;
    const v = [];
    for (let i = 0; i < n; i++) {
      const num = b.getUint32(at + i * 8, le), den = b.getUint32(at + i * 8 + 4, le);
      if (!den) return null;
      v.push(num / den);
    }
    return v;
  }
  function pointer(map, tag) { const e = map.get(tag); return e && e.type === 4 ? u32(e.valueAt) : null; }

  const main = entries(ifd0);
  let dateStr = null, offsetStr = null;
  const exifOff = pointer(main, 0x8769);
  if (exifOff != null) {
    const ex = entries(exifOff);
    dateStr = ascii(ex.get(0x9003));      // DateTimeOriginal
    offsetStr = ascii(ex.get(0x9011));    // OffsetTimeOriginal
  }
  if (!dateStr) dateStr = ascii(main.get(0x0132)); // DateTime

  let lat = null, lng = null;
  const gpsOff = pointer(main, 0x8825);
  if (gpsOff != null) {
    const g = entries(gpsOff);
    const la = rationals(g.get(2), 3), lo = rationals(g.get(4), 3);
    const laRef = ascii(g.get(1)), loRef = ascii(g.get(3));
    if (la && lo) {
      lat = (la[0] + la[1] / 60 + la[2] / 3600) * (laRef === "S" ? -1 : 1);
      lng = (lo[0] + lo[1] / 60 + lo[2] / 3600) * (loRef === "W" ? -1 : 1);
      if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) { lat = null; lng = null; }
    }
  }
  return { takenAt: toIso(dateStr, offsetStr), lat, lng };
}

// "2026:09:27 14:05:33" (+ "+05:30") -> ISO. Missing offset = India time.
function toIso(d, off) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(String(d || ""));
  if (!m || m[1] === "0000") return null;
  const tz = /^[+-]\d{2}:\d{2}$/.test(String(off || "")) ? off : "+05:30";
  const t = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tz}`);
  return isNaN(t) ? null : t.toISOString();
}
