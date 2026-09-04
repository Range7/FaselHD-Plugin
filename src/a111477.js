// 111477 — Stremio addon (st.111477.xyz) with a base64url-encoded config token.
// Ported from PlayTorrioV3 lib/services/scraper/sites/a111477.dart
// Modified: extract rich metadata and display like 4KHDHub (name multi-line, title short)

const { resolveMeta } = require('./_lib/tmdb');
const { base64UrlEncode } = require('./_lib/crypto');
const { dedupByUrl, sortByQuality, parseQuality } = require('./_lib/dedup');
const { fetchT } = require('./_lib/http');

const SERVICE_ORIGIN = 'https://st.111477.xyz';
const DEFAULT_HOST = 'https://a.111477.xyz/';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

// ── Rich metadata parsers ──────────────────────────────────────────────────
function parseSize(title) {
  const m = String(title || '').match(/\[a11\s+([\d.]+)\s*(GB|MB)\]/i) ||
            String(title || '').match(/([\d.]+)\s*(GB|MB)/i);
  return m ? m[1] + ' ' + m[2].toUpperCase() : '';
}

function parseCodec(title) {
  const t = String(title || '').toUpperCase();
  if (t.indexOf('HEVC') !== -1 || t.indexOf('X265') !== -1 || t.indexOf('H.265') !== -1) return 'HEVC';
  if (t.indexOf('H264') !== -1 || t.indexOf('X264') !== -1 || t.indexOf('H.264') !== -1) return 'H.264';
  if (t.indexOf('AV1') !== -1) return 'AV1';
  return '';
}

function parseAudio(title) {
  const t = String(title || '').toUpperCase();
  if (t.indexOf('TRUEHD') !== -1 && t.indexOf('ATMOS') !== -1) return 'TrueHD Atmos 7.1';
  if (t.indexOf('ATMOS') !== -1) return 'Atmos';
  if (t.indexOf('DDP') !== -1 || t.indexOf('DD+') !== -1) return 'DDP 5.1';
  if (t.indexOf('AAC') !== -1) {
    const m = t.match(/AAC\s*([\d.]+)/i);
    return m ? 'AAC ' + m[1] : 'AAC';
  }
  if (t.indexOf('AC3') !== -1) return 'AC3';
  return '';
}

function parseSource(title) {
  const t = String(title || '').toUpperCase();
  if (t.indexOf('REMUX') !== -1) return 'BluRay REMUX';
  if (t.indexOf('BLURAY') !== -1 || t.indexOf('BLU-RAY') !== -1) return 'BluRay';
  if (t.indexOf('WEBDL') !== -1 || t.indexOf('WEB-DL') !== -1) return 'WEB-DL';
  if (t.indexOf('WEBRIP') !== -1) return 'WEBRip';
  if (t.indexOf('HDRIP') !== -1) return 'HDRip';
  return '';
}

function parseLangs(title) {
  const t = String(title || '').toUpperCase();
  const langs = [];
  if (/\bEN\b/.test(t) || t.indexOf('ENGLISH') !== -1) langs.push('English');
  if (/\bJA\b/.test(t) || t.indexOf('JAPANESE') !== -1) langs.push('Japanese');
  if (/\bHI\b/.test(t) || t.indexOf('HINDI') !== -1) langs.push('Hindi');
  if (/\bAR\b/.test(t) || t.indexOf('ARABIC') !== -1) langs.push('Arabic');
  if (/\bFR\b/.test(t) || t.indexOf('FRENCH') !== -1) langs.push('French');
  if (/\bES\b/.test(t) || t.indexOf('SPANISH') !== -1) langs.push('Spanish');
  return langs.length ? langs.join(' + ') : '';
}

// Build the base64url config URL (host + sort + limit), like the Dart version.
function manifestBaseUrl(host = DEFAULT_HOST, sort = 'file-desc', limit = 3) {
  let config = host.trim();
  if (!config.endsWith('/')) config += '/';
  if (sort && sort !== 'none') config += `::sort=${sort}`;
  if (limit > 0 && limit !== 5) config += `::limit=${limit}`;
  return `${SERVICE_ORIGIN}/config/${base64UrlEncode(config)}`;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  const out = [];
  const seen = new Set();
  try {
    const isTv = mediaType === 'tv';
    const meta = await resolveMeta(tmdbId, mediaType);
    const ids = [];
    if (meta && meta.imdbId && meta.imdbId.startsWith('tt')) ids.push(meta.imdbId);
    ids.push(`tmdb:${tmdbId}`);

    const addonBase = manifestBaseUrl();
    for (const id of ids) {
      const ep = isTv
        ? `${addonBase}/stream/series/${id}:${season || 1}:${episode || 1}.json`
        : `${addonBase}/stream/movie/${id}.json`;
      try {
        const res = await fetchT(ep, { headers: HEADERS }, 10000);
        if (!res.ok) continue;
        const data = await res.json();
        const streams = data && data.streams;
        if (!Array.isArray(streams)) continue;

        for (const it of streams) {
          const url = it && it.url;
          if (!url || !String(url).startsWith('http') || seen.has(url)) continue;

          seen.add(url);
          const label = it.title || it.name || '111477';
          const quality = parseQuality(label);
          const size = parseSize(label);
          const codec = parseCodec(label);
          const audio = parseAudio(label);
          const source = parseSource(label);
          const langs = parseLangs(label);

          const mainLine = ['111477', quality, size].filter(Boolean).join(' • ');

          const details = [];
          if (source) details.push(source);
          if (codec) details.push(codec);
          if (audio) details.push(audio);
          if (langs) details.push(langs);
          const detailsLine = details.join(' • ');

          // نفس تنسيق 4KHDHub: name متعدد الأسطر، title سطر واحد
          const nameMulti = detailsLine ? (mainLine + '\n' + detailsLine) : mainLine;

          out.push({
            name: nameMulti,
            title: mainLine,
            url,
            quality,
            headers: HEADERS,
            _sizeRaw: size,
            _host: '111477'
          });
        }
        if (streams.length) break;
      } catch (e) {}
    }
  } catch (e) {}
  return sortByQuality(dedupByUrl(out));
}

module.exports = { getStreams };
