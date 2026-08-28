// providers/viu.js - Ported from Cloudstream re-3arabi/Viu Extension for Nuvio

const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';
const VIU_API_BASE = 'https://api.viu.com/ott/v1';

// المعاملات المعتمدة في Cloudstream re-3arabi
const COMMON_PARAMS = {
  area_id: '4',          // الشرق الأوسط
  language_flag_id: '3',  // العربية
  country_code: 'IQ',    // العراق
  platform_flag_label: 'web',
  platform_type: 'WEB',
  app_ver: '2.0.0'
};

/**
 * دالة جلب JSON الموحدة بحسب معايير Cloudstream
 */
async function fetchViuApi(endpoint, customParams = {}) {
  try {
    const params = { ...COMMON_PARAMS, ...customParams };
    const queryStr = Object.keys(params)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    const url = `${VIU_API_BASE}${endpoint}?${queryStr}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.viu.com/'
      }
    });

    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

/**
 * جلب الاسم العربي المترجم رسمياً من TMDB للمسلسلات التركية والأجنبية
 */
async function getTmdbArabicTitle(tmdbId, mediaType) {
  if (!tmdbId) return '';
  try {
    const endpoint = (mediaType === 'tv' || mediaType === 'series') ? 'tv' : 'movie';
    
    // 1. جلب قائمة الترجمات لاستخراج الاسم العربي المترجم (مثل "ورود وذنوب")
    const transUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
    const res = await fetch(transUrl);
    const transData = await res.json();
    
    if (transData?.translations && Array.isArray(transData.translations)) {
      const arItem = transData.translations.find(t => t.iso_639_1 === 'ar');
      if (arItem?.data?.name || arItem?.data?.title) {
        return arItem.data.name || arItem.data.title;
      }
    }

    // 2. جلب الاسم بلغة ar-SA مباشرة
    const arUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=ar-SA`;
    const arRes = await fetch(arUrl);
    const arData = await arRes.json();
    return arData?.name || arData?.title || '';
  } catch (e) {
    return '';
  }
}

/**
 * تنظيف نصوص البحث من الكلمات الإضافية
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
 * البحث بـ Viu API بناءً على منطق re-3arabi
 */
async function searchViu(keyword) {
  if (!keyword) return [];
  const q = keyword.trim();
  if (!q) return [];

  // 1. البحث بالاسم كما هو
  let res = await fetchViuApi('/product/search', { keyword: q, limit: '15' });
  let products = res?.data?.products || res?.data?.items || [];

  // 2. البحث بالاسم المنظف
  if (!products || products.length === 0) {
    const cleaned = cleanQuery(q);
    if (cleaned && cleaned !== q) {
      res = await fetchViuApi('/product/search', { keyword: cleaned, limit: '15' });
      products = res?.data?.products || res?.data?.items || [];
    }
  }

  // 3. البحث بأول كلمتين للوصول المباشر
  if ((!products || products.length === 0) && q.includes(' ')) {
    const shortQ = cleanQuery(q).split(' ').slice(0, 2).join(' ');
    if (shortQ) {
      res = await fetchViuApi('/product/search', { keyword: shortQ, limit: '15' });
      products = res?.data?.products || res?.data?.items || [];
    }
  }

  return products || [];
}

/**
 * جلب product_id الخاص بالحلقة بـ Viu
 */
async function getEpisodeProductId(seriesProductId, epNum) {
  const res = await fetchViuApi('/product/detail', { product_id: seriesProductId });
  const episodes = res?.data?.product?.episodes || res?.data?.episodes || [];

  if (!episodes || episodes.length === 0) return seriesProductId;

  const targetEp = parseInt(epNum || 1, 10);

  // 1. مطابقة برقم الحلقة
  let ep = episodes.find(e => parseInt(e.number || e.episode_num || 0, 10) === targetEp);

  // 2. مطابقة بالاسم
  if (!ep) {
    ep = episodes.find(e => String(e.title || '').includes(String(targetEp)));
  }

  // 3. مطابقة بالترتيب بداخل القائمة
  if (!ep && targetEp > 0 && targetEp <= episodes.length) {
    ep = episodes[targetEp - 1];
  }

  return ep?.product_id || episodes[0]?.product_id || seriesProductId;
}

/**
 * استخراج رابط M3U8 بناءً على معايير Viu API
 */
function extractStreamUrl(data) {
  if (!data) return null;

  let rawUrl =
    data.current_product?.stream_url ||
    data.stream?.url ||
    data.product?.stream_url ||
    data.distribute_url;

  if (typeof rawUrl === 'object' && rawUrl !== null) {
    rawUrl = rawUrl.url || rawUrl.m3u8 || rawUrl.src || rawUrl.hls || null;
  }

  if (typeof rawUrl === 'string' && rawUrl.startsWith('http')) {
    return rawUrl;
  }

  return null;
}

// كائن الإضافة المستدعى في Nuvio
const ViuProvider = {
  id: 'nuvio-viu',
  name: 'Viu',

  getStreams: async function(arg1, arg2, arg3, arg4, arg5) {
    try {
      let tmdbId = '';
      let mediaType = 'tv';
      let season = 1;
      let episode = 1;
      let title = '';
      let origTitle = '';

      // استخراج المعاملات الممررة من Nuvio
      if (typeof arg1 === 'object' && arg1 !== null) {
        tmdbId = arg1.id || arg1.tmdbId || arg1.mediaId || '';
        mediaType = arg1.type || arg1.mediaType || 'tv';
        season = parseInt(arg1.season || arg1.seasonNumber || 1, 10);
        episode = parseInt(arg1.episode || arg1.episodeNumber || 1, 10);
        title = arg1.title || arg1.name || '';
        origTitle = arg1.origTitle || arg1.original_title || '';
      } else {
        tmdbId = arg1;
        mediaType = arg2 || 'tv';
        season = parseInt(arg3 || 1, 10);
        episode = parseInt(arg4 || 1, 10);
        title = (typeof arg5 === 'string') ? arg5 : '';
      }

      // 1. تجميع الأسماء وتوليد الاسم العربي من TMDB (للمسلسلات التركية كـ "ورود وذنوب")
      const searchTerms = [];

      if (tmdbId) {
        const tmdbArTitle = await getTmdbArabicTitle(tmdbId, mediaType);
        if (tmdbArTitle) searchTerms.push(tmdbArTitle);
      }

      if (title) searchTerms.push(title);
      if (origTitle) searchTerms.push(origTitle);

      const uniqueTerms = [...new Set(searchTerms.filter(t => typeof t === 'string' && t.trim().length > 0))];
      if (uniqueTerms.length === 0) return [];

      // 2. البحث عن العمل في سيرفرات Viu
      let products = [];
      for (const term of uniqueTerms) {
        products = await searchViu(term);
        if (products && products.length > 0) break;
      }

      if (!products || products.length === 0) return [];

      const item = products[0];
      let targetProductId = item.product_id;

      // 3. مطابقة الحلقة بالنسبة للمسلسلات
      if (mediaType === 'tv' || mediaType === 'series' || item.is_series === '1') {
        targetProductId = await getEpisodeProductId(targetProductId, episode);
      }

      // 4. استخراج رابط البث النهائي M3U8
      const playlistRes = await fetchViuApi('/playlist/detail', { product_id: targetProductId });
      const m3u8Url = extractStreamUrl(playlistRes?.data);

      if (!m3u8Url) return [];

      return [
        {
          server: 'Viu',
          name: 'Viu Official',
          url: m3u8Url,
          link: m3u8Url,
          file: m3u8Url,
          quality: 'Auto',
          format: 'm3u8',
          type: 'hls'
        }
      ];
    } catch (err) {
      return [];
    }
  }
};

module.exports = ViuProvider;
