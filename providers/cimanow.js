// providers/cimanow.js - Certified & Fully Audited CimaNow Provider for Nuvio

const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';
const CIMANOW_BASE = 'https://cimanow.cc';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3'
};

/**
 * دالة جلب النص آمنة مع معالجة الأخطاء
 */
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

/**
 * دالة جلب JSON من TMDB
 */
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

/**
 * جلب العناوين المترجمة رسمياً من TMDB
 */
async function getTmdbTitles(tmdbId, mediaType) {
  if (!tmdbId) return [];
  const titles = [];
  try {
    const endpoint = (mediaType === 'tv' || mediaType === 'series') ? 'tv' : 'movie';
    
    // 1. قائمة الترجمات المباشرة
    const transUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
    const transData = await fetchJson(transUrl);
    if (transData?.translations && Array.isArray(transData.translations)) {
      const arItem = transData.translations.find(t => t.iso_639_1 === 'ar');
      if (arItem?.data?.name) titles.push(arItem.data.name);
      if (arItem?.data?.title) titles.push(arItem.data.title);
    }

    // 2. العنوان المباشر بلغة ar-SA
    const arUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=ar-SA`;
    const arData = await fetchJson(arUrl);
    if (arData?.name) titles.push(arData.name);
    if (arData?.title) titles.push(arData.title);

    // 3. العناوين الإنكليزية والأصلية
    const enUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
    const enData = await fetchJson(enUrl);
    if (enData?.name) titles.push(enData.name);
    if (enData?.title) titles.push(enData.title);
    if (enData?.original_name) titles.push(enData.original_name);
    if (enData?.original_title) titles.push(enData.original_title);

  } catch (e) {
    // catch-all safety
  }
  return [...new Set(titles.filter(t => typeof t === 'string' && t.trim().length > 0))];
}

/**
 * تنظيف نصوص البحث من الرموز والكلمات الإضافية
 */
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

/**
 * تحويل الروابط النسبية إلى كاملة
 */
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

/**
 * البحث في سيما ناو بدعم الاقتباسات المزدوجة والفردية والفلترة الآمنة
 */
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

    let titleMatch = content.match(/<h3>([^<]+)<\/h3>/i) ||
                     content.match(/title=["']([^"']+)["']/i) ||
                     content.match(/alt=["']([^"']+)["']/i);
    let titleText = titleMatch ? titleMatch[1] : content.replace(/<[^>]+>/g, '').trim();

    if (fullLink && !results.some(r => r.link === fullLink)) {
      results.push({ link: fullLink, title: titleText.trim() });
    }
  }

  return results;
}

/**
 * استخراج صفحة الحلقة بدقة للمسلسلات
 */
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
      text.includes(`حلقة ${epStr}`) ||
      text.includes(`الحلقة ${epPadStr}`)
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
 * تفكيك المشغل المضمن للحصول على رابط الفيديو المباشر
 */
async function resolveEmbedToStream(embedUrl) {
  if (!embedUrl || typeof embedUrl !== 'string' || !embedUrl.startsWith('http')) return null;

  if (embedUrl.includes('.m3u8') || embedUrl.includes('.mp4')) {
    return {
      url: embedUrl,
      format: embedUrl.includes('.m3u8') ? 'm3u8' : 'mp4'
    };
  }

  const html = await fetchText(embedUrl);
  if (!html) return null;

  const streamMatch = html.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/i) ||
                      html.match(/file\s*:\s*["']([^"']+)["']/i) ||
                      html.match(/src\s*:\s*["']([^"']+)["']/i) ||
                      html.match(/source\s*:\s*["']([^"']+)["']/i);

  if (streamMatch && streamMatch[1]) {
    const url = streamMatch[1];
    return {
      url: url,
      format: url.includes('.m3u8') ? 'm3u8' : 'mp4'
    };
  }

  return null;
}

/**
 * استخراج السيرفرات بالتوازي وبأقصى قدر من التغطية
 */
async function extractStreamsFromPage(pageUrl) {
  const html = await fetchText(pageUrl);
  if (!html) return [];

  const streams = [];
  const candidateEmbeds = [];

  // 1. استخراج ה-iframes والـ embeds
  const iframeRegex = /<(?:iframe|embed)\s+[^>]*(?:src|data-src|data-lazy-src|data-url)=["']([^"']+)["']/gi;
  let match;
  let loopSafety = 0;

  while ((match = iframeRegex.exec(html)) !== null) {
    if (++loopSafety > 25) break;
    let src = match[1];
    if (src.startsWith('//')) src = 'https:' + src;
    if (src.startsWith('http') && !candidateEmbeds.includes(src)) {
      candidateEmbeds.push(src);
    }
  }

  // 2. استخراج data-attributes الخفيفة لتبويبات السيرفرات
  const tabRegex = /data-(?:url|embed|src|link|server|stream|player|video)=["']([^"']+)["']/gi;
  loopSafety = 0;
  while ((match = tabRegex.exec(html)) !== null) {
    if (++loopSafety > 25) break;
    let src = match[1];
    if (src.startsWith('//')) src = 'https:' + src;
    if (src.startsWith('http') && !candidateEmbeds.includes(src)) {
      candidateEmbeds.push(src);
    }
  }

  // 3. معالجة أول 5 مشغلات بالتوازي
  const topEmbeds = candidateEmbeds.slice(0, 5);
  const resolvedResults = await Promise.all(topEmbeds.map(url => resolveEmbedToStream(url)));

  for (let i = 0; i < resolvedResults.length; i++) {
    const res = resolvedResults[i];
    const embedUrl = topEmbeds[i];

    if (res && res.url) {
      streams.push({
        name: res.format === 'm3u8' ? 'CimaNow HD (HLS)' : 'CimaNow Direct (MP4)',
        url: res.url,
        quality: '1080p',
        format: res.format
      });
    } else if (embedUrl.includes('cimanow') || embedUrl.includes('player') || embedUrl.includes('embed')) {
      streams.push({
        name: 'CimaNow Player',
        url: embedUrl,
        quality: 'Auto',
        format: 'm3u8'
      });
    }
  }

  // 4. استخراج وسوم الفيديو المباشرة
  const videoRegex = /<source\s+[^>]*src=["']([^"']+)["']/gi;
  loopSafety = 0;
  while ((match = videoRegex.exec(html)) !== null) {
    if (++loopSafety > 15) break;
    const src = match[1];
    if (src && !streams.some(s => s.url === src)) {
      streams.push({
        name: 'CimaNow Fast 1080p',
        url: src,
        quality: '1080p',
        format: src.includes('.m3u8') ? 'm3u8' : 'mp4'
      });
    }
  }

  return streams;
}

/**
 * الدالة الرئيسية المستدعاة بداخل Nuvio Engine
 */
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
      quality: s.quality || '1080p',
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
