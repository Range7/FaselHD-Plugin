// providers/viu.js - Fully Audited & Certified Viu Provider for Nuvio Engine

const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';
const VIU_API_BASE = 'https://api.viu.com/ott/v1';

/**
 * دالة طلب GET آمنة لـ JSON بدون هيدرز تسبب كراش بـ React Native
 */
async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

/**
 * 1. جلب توكين الجلسة الخاص بـ Viu API
 */
async function getViuToken() {
  try {
    const url = `${VIU_API_BASE}/token/get?platform_flag_label=web&area_id=4&language_flag_id=3&app_ver=2.0.0`;
    const res = await fetchJson(url);
    return res?.data?.token || res?.token || '';
  } catch (e) {
    return '';
  }
}

/**
 * 2. جلب الأسماء العربية والإنكليزية المترجمة رسمياً من TMDB
 */
async function getTmdbTitles(tmdbId, mediaType) {
  if (!tmdbId) return [];
  const titles = [];
  const endpoint = (mediaType === 'tv' || mediaType === 'series') ? 'tv' : 'movie';

  // أ) فحص قائمة الترجمات المباشرة لاستخراج الاسم العربي (مثل ورود وذنوب)
  const transUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
  const transData = await fetchJson(transUrl);
  if (transData?.translations && Array.isArray(transData.translations)) {
    const arItem = transData.translations.find(t => t.iso_639_1 === 'ar');
    if (arItem?.data?.name) titles.push(arItem.data.name);
    if (arItem?.data?.title) titles.push(arItem.data.title);
  }

  // ب) فحص لغة ar-SA المباشرة
  const arUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=ar-SA`;
  const arData = await fetchJson(arUrl);
  if (arData?.name) titles.push(arData.name);
  if (arData?.title) titles.push(arData.title);

  // ج) فحص الاسم الأصلي / الإنكليزي
  const enUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
  const enData = await fetchJson(enUrl);
  if (enData?.name) titles.push(enData.name);
  if (enData?.title) titles.push(enData.title);
  if (enData?.original_name) titles.push(enData.original_name);
  if (enData?.original_title) titles.push(enData.original_title);

  return [...new Set(titles.filter(t => typeof t === 'string' && t.trim().length > 0))];
}

/**
 * تنظيف نصوص البحث من الرموز والكلمات الزائدة والتشكيل
 */
function cleanTitle(str) {
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
 * بناء روابط Viu API مدمج معها التوكين ومعاملات الشرق الأوسط
 */
function buildViuUrl(endpoint, params = {}, token = '') {
  const defaultParams = {
    platform_flag_label: 'web',
    area_id: '4',          // الشرق الأوسط
    country_code: 'IQ',    // العراق والدول العربية
    language_flag_id: '3',  // اللغة العربية
    platform_type: 'WEB',
    app_ver: '2.0.0'
  };

  if (token) {
    defaultParams.token = token;
  }

  const allParams = { ...defaultParams, ...params };
  const query = Object.keys(allParams)
    .filter(k => allParams[k] !== undefined && allParams[k] !== null)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  return `${VIU_API_BASE}${endpoint}?${query}`;
}

/**
 * 3. البحث في Viu API بالتوكين
 */
async function searchViu(keyword, token) {
  if (!keyword || typeof keyword !== 'string') return [];
  const q = keyword.trim();
  if (!q) return [];

  // 1. البحث بالاسم كما هو
  let url = buildViuUrl('/product/search', { keyword: q, limit: '15' }, token);
  let res = await fetchJson(url);
  let products = res?.data?.products || res?.data?.items || [];

  // 2. البحث بالاسم المنظف
  if (!products || products.length === 0) {
    const cleaned = cleanTitle(q);
    if (cleaned && cleaned !== q) {
      url = buildViuUrl('/product/search', { keyword: cleaned, limit: '15' }, token);
      res = await fetchJson(url);
      products = res?.data?.products || res?.data?.items || [];
    }
  }

  // 3. البحث بأول كلمتين
  if ((!products || products.length === 0) && q.includes(' ')) {
    const shortQ = cleanTitle(q).split(' ').slice(0, 2).join(' ');
    if (shortQ) {
      url = buildViuUrl('/product/search', { keyword: shortQ, limit: '15' }, token);
      res = await fetchJson(url);
      products = res?.data?.products || res?.data?.items || [];
    }
  }

  return products || [];
}

/**
 * 4. جلب product_id الخاص بالحلقة
 */
async function getEpisodeProductId(seriesProductId, epNum, token) {
  const url = buildViuUrl('/product/detail', { product_id: seriesProductId }, token);
  const res = await fetchJson(url);
  const episodes = res?.data?.product?.episodes || res?.data?.episodes || [];

  if (!episodes || episodes.length === 0) return seriesProductId;

  const targetEp = parseInt(epNum || 1, 10);

  // مطابقة برقم الحلقة أو بالاسم أو الترتيب
  let ep = episodes.find(e => parseInt(e.number || e.episode_num || 0, 10) === targetEp);
  if (!ep) ep = episodes.find(e => String(e.title || '').includes(String(targetEp)));
  if (!ep && targetEp > 0 && targetEp <= episodes.length) ep = episodes[targetEp - 1];

  return ep?.product_id || episodes[0]?.product_id || seriesProductId;
}

/**
 * دالة تفكيك عميق لاستخراج رابط M3U8
 */
function findM3u8Deep(obj, depth = 0) {
  if (!obj || depth > 5) return null;
  if (typeof obj === 'string' && obj.startsWith('http') && (obj.includes('.m3u8') || obj.includes('viu'))) {
    return obj;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const res = findM3u8Deep(obj[key], depth + 1);
      if (res) return res;
    }
  }
  return null;
}

/**
 * 5. استخراج رابط البث المباشر
 */
function extractStreamUrl(data) {
  if (!data) return null;

  let raw =
    data.stream?.url ||
    data.current_product?.stream_url ||
    data.product?.stream_url ||
    data.distribute_url;

  if (typeof raw === 'object' && raw !== null) {
    raw = raw.url || raw.m3u8 || raw.src || raw.hls || null;
  }

  if (typeof raw === 'string' && raw.startsWith('http')) {
    return raw;
  }

  return findM3u8Deep(data);
}

// الكائن الرئيسي المنسق لتطبيق Nuvio Engine
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

      // استخراج المدخلات الممررة من Nuvio
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

      // 1. جلب توكين الجلسة
      const token = await getViuToken();

      // 2. تجميع عناوين البحث المحتملة عبر TMDB ID
      const searchTerms = [];
      if (title) searchTerms.push(title);
      if (origTitle) searchTerms.push(origTitle);

      if (tmdbId) {
        const tmdbTitles = await getTmdbTitles(tmdbId, mediaType);
        tmdbTitles.forEach(t => {
          if (!searchTerms.includes(t)) searchTerms.push(t);
        });
      }

      const uniqueTerms = [...new Set(searchTerms.filter(t => typeof t === 'string' && t.trim().length > 0))];
      if (uniqueTerms.length === 0) return [];

      // 3. البحث في Viu API
      let products = [];
      for (const term of uniqueTerms) {
        products = await searchViu(term, token);
        if (products && products.length > 0) break;
      }

      if (!products || products.length === 0) return [];

      const item = products[0];
      let targetProductId = item.product_id;

      // 4. تحديد الحلقة للمسلسلات
      if (mediaType === 'tv' || mediaType === 'series' || item.is_series === '1') {
        targetProductId = await getEpisodeProductId(targetProductId, episode, token);
      }

      // 5. جلب رابط Stream النهائي
      const playlistUrl = buildViuUrl('/playlist/detail', { product_id: targetProductId }, token);
      const streamRes = await fetchJson(playlistUrl);
      const m3u8Url = extractStreamUrl(streamRes?.data);

      if (!m3u8Url) return [];

      return [
        {
          server: 'Viu',
          name: 'Viu Official',
          url: m3u8Url,
          link: m3u8Url,
          file: m3u8Url,
          streamUrl: m3u8Url,
          quality: 'Auto',
          format: 'm3u8',
          type: 'hls',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://www.viu.com/'
          }
        }
      ];
    } catch (err) {
      return [];
    }
  }
};

module.exports = ViuProvider;
