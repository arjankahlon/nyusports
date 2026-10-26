// Shared copy of the deck for the Prospective Studies site.
//   GET  /api/slides  -> the most recent pull (404 if nothing has been pulled yet)
//   POST /api/slides  -> pull the deck from Google now, save it, and return it
// The function downloads the deck itself, so visitors can't store anything but
// what Google returns. Only the slide text is kept: the PowerPoint export puts
// every slide's XML before the images, so the download stops once the slides are in.
import { getStore } from '@netlify/blobs';
import { inflateRawSync, gzipSync } from 'node:zlib';

const DECK_ID = '16LPexUG2uF_mNUndOf742ppnOXDifLltINZjpJCrvoE';
const EXPORT_URL = `https://docs.google.com/presentation/d/${DECK_ID}/export/pptx`;
const MIN_SECONDS_BETWEEN_PULLS = 60; // repeated presses within a minute reuse the last pull

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function pullDeck() {
  const ctrl = new AbortController();
  const res = await fetch(`${EXPORT_URL}?t=${Date.now()}`, { signal: ctrl.signal, redirect: 'follow' });
  if (!res.ok) throw new Error(`Google returned ${res.status}. Is the deck still shared with "anyone with the link"?`);
  const reader = res.body.getReader();
  let buf = Buffer.alloc(2 << 20), len = 0, pos = 0;
  const files = {};
  let wanted = null;
  const isWanted = n => /^ppt\/slides\/slide\d+\.xml$/.test(n) || n === 'ppt/presentation.xml' || n === 'ppt/_rels/presentation.xml.rels';
  const haveAll = () => wanted && files['ppt/presentation.xml'] !== undefined && wanted.every(n => files[n] !== undefined);

  // Read complete zip entries from the buffer; returns 'end' at the central directory.
  const parse = () => {
    while (pos + 30 <= len) {
      if (u32(buf, pos) !== 0x04034b50) return 'end';
      const flags = u16(buf, pos + 6), method = u16(buf, pos + 8), csize = u32(buf, pos + 18);
      const nlen = u16(buf, pos + 26), xlen = u16(buf, pos + 28);
      if (pos + 30 + nlen + xlen > len) return;
      const name = buf.toString('utf8', pos + 30, pos + 30 + nlen);
      const start = pos + 30 + nlen + xlen;
      let end = -1, next;
      if (flags & 8) { // sizes follow the data in a descriptor: find PK\x07\x08 whose size matches
        for (let i = start; i + 16 <= len; i++) {
          if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 7 && buf[i + 3] === 8 && u32(buf, i + 8) === i - start) { end = i; break; }
        }
        if (end < 0) return;
        next = end + 16;
      } else {
        end = start + csize;
        if (end > len) return;
        next = end;
      }
      if (isWanted(name)) {
        const data = buf.subarray(start, end);
        files[name] = (method === 8 ? inflateRawSync(data) : Buffer.from(data)).toString('utf8');
        if (name === 'ppt/_rels/presentation.xml.rels') {
          wanted = [...files[name].matchAll(/Target="(slides\/slide\d+\.xml)"/g)].map(m => 'ppt/' + m[1]);
        }
      }
      pos = next;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (len + value.length > buf.length) { const nb = Buffer.alloc(Math.max(buf.length * 2, len + value.length)); buf.copy(nb, 0, 0, len); buf = nb; }
    buf.set(value, len); len += value.length;
    if (parse() === 'end' || haveAll()) break;
  }
  ctrl.abort(); // skip the images
  if (!files['ppt/presentation.xml'] || !wanted) throw new Error('The slide download was incomplete. Try again.');

  // Hidden slides are dropped here; the page treats a missing slide as hidden.
  for (const name of wanted) {
    if (/<p:sld\b[^>]*\sshow="0"/.test(files[name] || '')) delete files[name];
  }
  return { syncedAt: new Date().toISOString(), bytes: len, files };
}

function reply(req, data, status = 200) {
  const body = JSON.stringify(data);
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (/\bgzip\b/.test(req.headers.get('accept-encoding') || '')) {
    headers['content-encoding'] = 'gzip';
    return new Response(gzipSync(body), { status, headers });
  }
  return new Response(body, { status, headers });
}

export default async (req) => {
  const store = getStore('deck');
  try {
    if (req.method === 'POST') {
      const last = await store.get('latest', { type: 'json' });
      if (last && Date.now() - Date.parse(last.syncedAt) < MIN_SECONDS_BETWEEN_PULLS * 1000) return reply(req, last);
      const data = await pullDeck();
      await store.setJSON('latest', data);
      return reply(req, data);
    }
    if (req.method === 'GET') {
      const last = await store.get('latest', { type: 'json' });
      return last ? reply(req, last) : reply(req, { error: 'nothing saved yet' }, 404);
    }
    return new Response('Method not allowed', { status: 405 });
  } catch (err) {
    return reply(req, { error: err.message }, 502);
  }
};

export const config = { path: '/api/slides' };
