// providers/cimanow.js - Fixes WebP Codec Error & Duplicates for Nuvio

const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';
const CIMANOW_BASE = 'https://cimanow.cc';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

async function fetchText(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const res = await fetch(url, { method: 'GET', headers: HEADERS });
    if (!res.ok) return '';
    return await res.text();
  } catch (e) {
    return '';
  }
}

async function fetchJson(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

async function getTmdbTitles(tmdbId, mediaType) {
  if (!tmdbId) return [];
  const titles = [];
  try {
    const endpoint = (mediaType === 'tv' || mediaType === 'series') ? 'tv' : 'movie';
    const transUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
    const transData = await fetchJson(transUrl);
    if (transData?.translations && Array.isArray(transData.translations)) {
      const arItem = transData.translations.find(t => t.iso_639_1 === 'ar');
      if (arItem?.data?.name) titles.push(arItem.data.name);
      if (arItem?.data?.title) titles.push(arItem.data.title);
    }

    const arUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=ar-SA`;
    const arData = await fetchJson(arUrl);
    if (arData?.name) titles.push(arData.name);
    if (arData?.title) titles.push(arData.title);
  } catch (e) {}
  return [...new Set(titles.filter(t => typeof t === 'string' && t.trim().length > 0))];
}

function cleanQuery(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[\(\)\[\]\:\-\_\.\,\!\?]/g, ' ')
    .replace(/season\s*\d+/gi, '')
    .replace(/الموسم\s*\d+/gi, '')
    .replace(/الجزء\s*\d+/gi, '')
    .replace(/حلقة\s*\d+/gi, '')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveUrl(relativeUrl, baseUrl) {
  if (!relativeUrl || typeof relativeUrl !== 'string') return '';
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) return relativeUrl;
  if (relativeUrl.startsWith('//')) return 'https:' + relativeUrl;
  if (relativeUrl.startsWith('/')) {
    try {
      const base = new URL(baseUrl);
      return `${base.protocol}//${base.host}${relativeUrl}`;
    } catch (e) {
      return `${CIMANOW_BASE}${relativeUrl}`;
    }
  }
  return `${baseUrl}/${relativeUrl}`;
}

async function searchCimaNow(keyword) {
  const q = cleanQuery(keyword);
  if (!q) return [];

  const searchUrl = `${CIMANOW_BASE}/?s=${encodeURIComponent(q)}`;
  const html = await fetchText(searchUrl);
  if (!html) return [];

  const results = [];
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  let loopSafety = 0;

  while ((match = linkRegex.exec(html)) !== null) {
    if (++loopSafety > 60) break;
    const rawLink = match[1];
    const content = match[2];
    const fullLink = resolveUrl(rawLink, CIMANOW_BASE);

    if (
      !fullLink ||
      fullLink.includes('/category/') ||
      fullLink.includes('/tag/') ||
      fullLink.includes('/page/') ||
      fullLink.includes('/actor/') ||
      fullLink === CIMANOW_BASE ||
      fullLink === `${CIMANOW_BASE}/`
    ) {
      continue;
    }

    let titleMatch = content.match(/<h3>([^<]+)<\/h3>/i) || content.match(/title=["']([^"']+)["']/i);
    let titleText = titleMatch ? titleMatch[1] : content.replace(/<[^>]+>/g, '').trim();

    if (fullLink && !results.some(r => r.link === fullLink)) {
      results.push({ link: fullLink, title: titleText.trim() });
    }
  }

  return results;
}

async function getEpisodePageUrl(seriesPageUrl, episodeNum) {
  const html = await fetchText(seriesPageUrl);
  if (!html) return seriesPageUrl;

  const epNumInt = parseInt(episodeNum || 1, 10);
  const epStr = epNumInt.toString();
  const epPadStr = epStr.padStart(2, '0');

  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  let loopSafety = 0;
  let fallbackEpisodeUrl = '';

  while ((match = linkRegex.exec(html)) !== null) {
    if (++loopSafety > 80) break;
    const rawLink = match[1];
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    const fullLink = resolveUrl(rawLink, seriesPageUrl);

    if (
      fullLink.includes(`episode-${epStr}`) ||
      fullLink.includes(`episode-${epPadStr}`) ||
      fullLink.includes(`الحلقة-${epStr}`) ||
      fullLink.includes(`الحلقة-${epPadStr}`) ||
      text.includes(`الحلقة ${epStr}`) ||
      text.includes(`حلقة ${epStr}`)
    ) {
      return fullLink;
    }

    if (!fallbackEpisodeUrl && (fullLink.includes('/episode/') || fullLink.includes('/video/'))) {
      fallbackEpisodeUrl = fullLink;
    }
  }

  return fallbackEpisodeUrl || seriesPageUrl;
}

/**
 * استخراج رابط البث المباشر الموثوق فقط (.m3u8 أو .mp4)
 * يتجاهل تماماً أي صفحة HTML أو صور .webp
 */
async function resolveEmbedToStream(embedUrl) {
  if (!embedUrl || typeof embedUrl !== 'string' || !embedUrl.startsWith('http')) return null;

  if (/\.(m3u8|mp4)(\?|$)/i.test(embedUrl)) {
    return {
      url: embedUrl,
      format: embedUrl.includes('.m3u8') ? 'm3u8' : 'mp4'
    };
  }

  const html = await fetchText(embedUrl);
  if (!html) return null;

  // البحث حصراً عن روابط الفيديو .m3u8 أو .mp4 الداخلي وتجاهل أي صور webp/jpg
  const videoRegex = /(https?:\/\/[^"'\s\>]+?\.(?:m3u8|mp4)(?:\?[^"'\s\>]*)?)/gi;
  let match;
  while ((match = videoRegex.exec(html)) !== null) {
    const foundUrl = match[1];
    if (foundUrl && !/\.(webp|jpg|jpeg|png|gif|svg)(\?|$)/i.test(foundUrl)) {
      return {
        url: foundUrl,
        format: foundUrl.includes('.m3u8') ? 'm3u8' : 'mp4'
      };
    }
  }

  const fileMatch = html.match(/(?:file|src|source)\s*:\s*["'](https?:\/\/[^"']+)["']/i);
  if (fileMatch && fileMatch[1]) {
    const foundUrl = fileMatch[1];
    if (/\.(m3u8|mp4)(\?|$)/i.test(foundUrl) && !/\.(webp|jpg|png)(\?|$)/i.test(foundUrl)) {
      return {
        url: foundUrl,
        format: foundUrl.includes('.m3u8') ? 'm3u8' : 'mp4'
      };
    }
  }

  return null;
}

async function extractStreamsFromPage(pageUrl) {
  const html = await fetchText(pageUrl);
  if (!html) return [];

  const candidateEmbeds = [];

  const iframeRegex = /<(?:iframe|embed)\s+[^>]*(?:src|data-src|data-lazy-src|data-url)=["']([^"']+)["']/gi;
  let match;
  let loopSafety = 0;

  while ((match = iframeRegex.exec(html)) !== null) {
    if (++loopSafety > 20) break;
    let src = match[1];
    if (src.startsWith('//')) src = 'https:' + src;
    if (src.startsWith('http') && !candidateEmbeds.includes(src)) {
      candidateEmbeds.push(src);
    }
  }

  const tabRegex = /data-(?:url|embed|src|link|server|player)=["']([^"']+)["']/gi;
  loopSafety = 0;
  while ((match = tabRegex.exec(html)) !== null) {
    if (++loopSafety > 20) break;
    let src = match[1];
    if (src.startsWith('//')) src = 'https:' + src;
    if (src.startsWith('http') && !candidateEmbeds.includes(src)) {
      candidateEmbeds.push(src);
    }
  }

  const topEmbeds = candidateEmbeds.slice(0, 5);
  const resolvedResults = await Promise.all(topEmbeds.map(url => resolveEmbedToStream(url)));

  const validStreams = [];
  for (const res of resolvedResults) {
    if (res && res.url && !validStreams.some(v => v.url === res.url)) {
      validStreams.push({
        name: res.format === 'm3u8' ? 'CimaNow 1080p FHD' : 'CimaNow Direct 1080p',
        url: res.url,
        quality: '1080p',
        format: res.format
      });
    }
  }

  const videoRegex = /<source\s+[^>]*src=["']([^"']+)["']/gi;
  loopSafety = 0;
  while ((match = videoRegex.exec(html)) !== null) {
    if (++loopSafety > 10) break;
    const src = match[1];
    if (src && /\.(m3u8|mp4)(\?|$)/i.test(src) && !validStreams.some(s => s.url === src)) {
      validStreams.push({
        name: 'CimaNow Fast 1080p',
        url: src,
        quality: '1080p',
        format: src.includes('.m3u8') ? 'm3u8' : 'mp4'
      });
    }
  }

  // تصفية وحذف التكرار
  const uniqueStreams = [];
  const seenUrls = new Set();
  for (const st of validStreams) {
    if (!seenUrls.has(st.url)) {
      seenUrls.add(st.url);
      uniqueStreams.push(st);
    }
  }

  return uniqueStreams;
}

async function getStreams(arg1, arg2, arg3, arg4, arg5) {
  try {
    let tmdbId = '';
    let mediaType = 'movie';
    let season = 1;
    let episode = 1;
    let title = '';
    let origTitle = '';

    if (typeof arg1 === 'object' && arg1 !== null) {
      tmdbId = arg1.id || arg1.tmdbId || arg1.mediaId || '';
      mediaType = arg1.type || arg1.mediaType || 'movie';
      season = parseInt(arg1.season || arg1.seasonNumber || 1, 10);
      episode = parseInt(arg1.episode || arg1.episodeNumber || 1, 10);
      title = arg1.title || arg1.name || '';
      origTitle = arg1.origTitle || arg1.original_title || '';
    } else {
      tmdbId = arg1;
      mediaType = arg2 || 'movie';
      season = parseInt(arg3 || 1, 10);
      episode = parseInt(arg4 || 1, 10);
      title = (typeof arg5 === 'string') ? arg5 : '';
    }

    const searchTerms = [];
    if (title) searchTerms.push(title);
    if (origTitle) searchTerms.push(origTitle);

    if (tmdbId) {
      const tmdbTitles = await getTmdbTitles(tmdbId, mediaType);
      if (Array.isArray(tmdbTitles)) {
        tmdbTitles.forEach(t => {
          if (!searchTerms.includes(t)) searchTerms.push(t);
        });
      }
    }

    const uniqueTerms = [...new Set(searchTerms.filter(t => typeof t === 'string' && t.trim().length > 0))];
    if (uniqueTerms.length === 0) return [];

    let searchResults = [];
    for (const term of uniqueTerms) {
      searchResults = await searchCimaNow(term);
      if (Array.isArray(searchResults) && searchResults.length > 0) break;
    }

    if (!searchResults || searchResults.length === 0) return [];

    let targetLink = searchResults[0].link;

    if (mediaType === 'tv' || mediaType === 'series') {
      targetLink = await getEpisodePageUrl(targetLink, episode);
    }

    const streams = await extractStreamsFromPage(targetLink);

    if (!Array.isArray(streams) || streams.length === 0) return [];

    return streams.map(s => ({
      server: 'CimaNow',
      name: s.name || 'CimaNow 1080p',
      url: s.url,
      link: s.url,
      file: s.url,
      streamUrl: s.url,
      quality: '1080p',
      format: s.format || 'm3u8',
      type: s.format === 'm3u8' ? 'hls' : 'direct'
    }));

  } catch (err) {
    return [];
  }
}

const CimaNowProvider = {
  id: 'nuvio-cimanow',
  name: 'CimaNow',
  getStreams: getStreams,
  getSources: getStreams,
  extract: getStreams,
  search: searchCimaNow
};

module.exports = CimaNowProvider;
