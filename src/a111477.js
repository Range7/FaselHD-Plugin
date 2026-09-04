// 111477 — Stremio addon (st.111477.xyz) with a base64url-encoded config token.
// Ported from PlayTorrioV3 lib/services/scraper/sites/a111477.dart
// Modified: extract ALL 1080p streams with full original metadata.

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

          const label = it.title || it.name || '111477';
          const quality = parseQuality(label);

          // فقط جودة 1080p
          if (quality !== '1080p') continue;

          seen.add(url);

          // نحتفظ بكل الحقول الأصلية + الجودة + الترويسات
          out.push({
            ...it,               // كل معلومات السيرفر الأصلية
            name: it.name || '111477',
            title: label,
            url,
            quality,
            headers: HEADERS,
          });
        }
        // بدون break: نجمع من كل المعرفات حتى نضمن كل سيرفرات 1080p
      } catch (e) {}
    }
  } catch (e) {}
  return sortByQuality(dedupByUrl(out));
}

module.exports = { getStreams };
