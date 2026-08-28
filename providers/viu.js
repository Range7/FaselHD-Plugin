// providers/viu.js - Comprehensive Viu Provider for Nuvio (Supports Turkish & Dubbed Dramas)

const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49'; // المفتاح الخاص بك
const VIU_API_BASE = 'https://api.viu.com/ott/v1';

/**
 * دالة طلب GET آمنة لـ JSON
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
 * استخراج الاسم العربي للمسلسلات التركية والأجنبية من TMDB Translations
 */
async function getTmdbArabicTitle(tmdbId, mediaType) {
  if (!tmdbId) return '';
  try {
    const endpoint = (mediaType === 'tv' || mediaType === 'series') ? 'tv' : 'movie';
    
    // 1. جلب قائمة الترجمات الكاملة للعمل من TMDB
    const transUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
    const transRes = await fetchJson(transUrl);
    
    if (transRes && transRes.translations) {
      const arTrans = transRes.translations.find(t => t.iso_639_1 === 'ar');
      if (arTrans && arTrans.data) {
        const arName = arTrans.data.name || arTrans.data.title;
        if (arName) return arName;
      }
    }

    // 2. تجربة جلب تفاصيل ar-SA مباشرة
    const arUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=ar-SA`;
    const arRes = await fetchJson(arUrl);
    if (arRes) {
      const arName = arRes.name || arRes.title;
      if (arName) return arName;
    }

    return '';
  } catch (err) {
    return '';
  }
}

/**
 * تنظيف العناوين من الكلمات الزائدة والتشكيل
 */
function cleanTitle(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[\(\)\[\]\:\-\_\.\,\!\?]/g, ' ')
    .replace(/season\s*\d+/gi, '')
    .replace(/الموسم\s*\d+/gi, '')
    .replace(/الجزء\s*\d+/gi, '')
    .replace(/حلقة\s*\d+/gi, '')
    .replace(/[\u064B-\u0652]/g, '') // إزالة التشكيل
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * بناء روابط Viu API بمعاملات الشرق الأوسط
 */
function buildViuUrl(endpoint, params = {}) {
  const defaultParams = {
    platform_flag_label: 'web',
    area_id: '4',          // الشرق الأوسط
    country_code: 'IQ',    // العراق والمنطقة العربية
    language_flag_id: '3',  // اللغة العربية
    platform_type: 'WEB',
    app_ver: '2.0.0'
  };
  const allParams = { ...defaultParams, ...params };
  const query = Object.keys(allParams)
    .filter(k => allParams[k] !== undefined && allParams[k] !== null)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  return `${VIU_API_BASE}${endpoint}?${query}`;
}

/**
 * البحث في Viu بعدة احتمالات
 */
async function searchViu(keyword) {
  if (!keyword || typeof keyword !== 'string') return [];
  const q = keyword.trim();
  if (!q) return [];

  // 1. البحث بالكلمة كما هي
  let url = buildViuUrl('/product/search', { keyword: q, limit: '15' });
  let res = await fetchJson(url);
  let products = res?.data?.products || res?.data?.items || [];

  // 2. البحث بالكلمة المنظفة
  if (!products || products.length === 0) {
    const cleaned = cleanTitle(q);
    if (cleaned && cleaned !== q) {
      url = buildViuUrl('/product/search', { keyword: cleaned, limit: '15' });
      res = await fetchJson(url);
      products = res?.data?.products || res?.data?.items || [];
    }
  }

  // 3. البحث بأول كلمتين
  if ((!products || products.length === 0) && q.includes(' ')) {
    const shortQ = cleanTitle(q).split(' ').slice(0, 2).join(' ');
    if (shortQ) {
      url = buildViuUrl('/product/search', { keyword: shortQ, limit: '15' });
      res = await fetchJson(url);
      products = res?.data?.products || res?.data?.items || [];
    }
  }

  return products || [];
}

/**
 * مطابقة رقم الحلقة بـ 4 مستويات متتالية
 */
async function getEpisodeProductId(seriesProductId, epNum) {
  const url = buildViuUrl('/product/detail', { product_id: seriesProductId });
  const res = await fetchJson(url);
  const episodes = res?.data?.product?.episodes || res?.data?.episodes || [];

  if (!episodes || episodes.length === 0) return seriesProductId;

  const targetEpNum = parseInt(epNum || 1, 10);

  // 1. مطابقة رقمية دقيقة
  let target = episodes.find(
    e => parseInt(e.number || e.episode_num || 0, 10) === targetEpNum
  );

  // 2. مطابقة بالاسم (مثل "الحلقة 5")
  if (!target) {
    const epStr = targetEpNum.toString();
    target = episodes.find(e => {
      const t = String(e.title || '');
      return t.includes(`الحلقة ${epStr}`) || t.includes(`Episode ${epStr}`) || t.includes(` ${epStr} `);
    });
  }

  // 3. مطابقة بترتيب المصفوفة (Index)
  if (!target && targetEpNum > 0 && targetEpNum <= episodes.length) {
    target = episodes[targetEpNum - 1];
  }

  // 4. خيار احتياطي للحلقة الأولى
  if (!target) {
    target = episodes[0];
  }

  return target?.product_id || seriesProductId;
}

/**
 * ماسح عميق لاستخراج رابط الميديا M3U8 أينما كان بالاستجابة
 */
function findM3u8Deep(obj, visited = new Set()) {
  if (!obj) return null;
  if (typeof obj === 'string') {
    if (obj.startsWith('http') && (obj.includes('.m3u8') || obj.includes('viu.com'))) {
      return obj;
    }
    return null;
  }
  if (typeof obj !== 'object' || visited.has(obj)) return null;
  visited.add(obj);

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const found = findM3u8Deep(val, visited);
    if (found) return found;
  }
  return null;
}

/**
 * الدالة الرئيسية المستدعاة في Nuvio Engine
 */
async function getStreams(arg1, arg2, arg3, arg4, arg5) {
  try {
    let tmdbId = '';
    let mediaType = 'movie';
    let season = 1;
    let episode = 1;
    let inputTitle = '';
    let origTitle = '';

    // 1. استخراج المدخلات الممررة من Nuvio
    if (typeof arg1 === 'object' && arg1 !== null) {
      tmdbId = arg1.id || arg1.tmdbId || arg1.mediaId || '';
      mediaType = arg1.type || arg1.mediaType || 'movie';
      season = parseInt(arg1.season || arg1.seasonNumber || 1, 10);
      episode = parseInt(arg1.episode || arg1.episodeNumber || 1, 10);
      inputTitle = arg1.title || arg1.name || '';
      origTitle = arg1.origTitle || arg1.original_title || '';
    } else {
      tmdbId = arg1;
      mediaType = arg2 || 'movie';
      season = parseInt(arg3 || 1, 10);
      episode = parseInt(arg4 || 1, 10);
      inputTitle = (typeof arg5 === 'string') ? arg5 : '';
    }

    // 2. تجميع كل خيارات الأسماء الممكنة للبحث بـ Viu
    const candidates = [];

    // أخذ الاسم العربي من TMDB Translations للمسلسلات التركية والأجنبية
    if (tmdbId) {
      const tmdbArTitle = await getTmdbArabicTitle(tmdbId, mediaType);
      if (tmdbArTitle) candidates.push(tmdbArTitle);
    }

    if (inputTitle) candidates.push(inputTitle);
    if (origTitle) candidates.push(origTitle);

    // تصفية الأسماء المكررة والفارغة
    const searchTerms = [...new Set(candidates.filter(c => typeof c === 'string' && c.trim().length > 0))];

    if (searchTerms.length === 0) return [];

    // 3. تجربة البحث بالأسماء المتاحة حتى نجد العمل في Viu
    let products = [];
    for (const term of searchTerms) {
      products = await searchViu(term);
      if (products && products.length > 0) break;
    }

    if (!products || products.length === 0) return [];

    const matchedItem = products[0];
    let targetProductId = matchedItem.product_id;

    // 4. مطابقة الحلقة بالنسبة للمسلسلات
    if (mediaType === 'tv' || mediaType === 'series' || matchedItem.is_series === '1') {
      targetProductId = await getEpisodeProductId(targetProductId, episode);
    }

    // 5. استخراج رابط البث باستخدام الماسح العميق
    const playlistUrl = buildViuUrl('/playlist/detail', { product_id: targetProductId });
    const streamRes = await fetchJson(playlistUrl);
    const m3u8Url = findM3u8Deep(streamRes?.data);

    if (!m3u8Url) return [];

    return [
      {
        server: 'Viu',
        name: 'Viu HD',
        url: m3u8Url,
        link: m3u8Url,
        file: m3u8Url,
        quality: 'Auto',
        format: 'm3u8',
        type: 'hls',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://www.viu.com/',
          'Origin': 'https://www.viu.com'
        }
      }
    ];
  } catch (err) {
    return [];
  }
}

const ViuProvider = {
  id: 'nuvio-viu',
  name: 'Viu',
  getStreams: getStreams,
  getSources: getStreams,
  extract: getStreams,
  search: searchViu
};

module.exports = ViuProvider;
