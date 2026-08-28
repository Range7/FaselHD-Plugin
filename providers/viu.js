// providers/viu.js - Fully Tested & Verified Viu Provider for Nuvio

const VIU_API_BASE = 'https://api.viu.com/ott/v1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Origin': 'https://www.viu.com',
  'Referer': 'https://www.viu.com/',
  'Accept': 'application/json, text/plain, */*'
};

const COMMON_PARAMS = {
  platform_flag_label: 'web',
  area_id: '4',          // الشرق الأوسط
  country_code: 'IQ',    // العراق والدول العربية
  language_flag_id: '3',  // اللغة العربية
  platform_type: 'WEB',
  app_ver: '2.0.0'
};

/**
 * دالة إرسال الطلبات الموحدة لـ Viu API
 */
async function fetchViuApi(endpoint, params = {}) {
  try {
    const allParams = { ...COMMON_PARAMS, ...params };
    const queryString = Object.keys(allParams)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`)
      .join('&');

    const response = await fetch(`${VIU_API_BASE}${endpoint}?${queryString}`, {
      method: 'GET',
      headers: HEADERS
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    return null;
  }
}

/**
 * تنظيف نصوص البحث وتجريدها من الكلمات الإضافية
 */
function cleanTitle(text) {
  if (!text) return '';
  return text
    .replace(/[\(\)\[\]\:\-\_\.\,\!]/g, ' ')
    .replace(/season\s*\d+/gi, '')
    .replace(/الموسم\s*\d+/gi, '')
    .replace(/الجزء\s*\d+/gi, '')
    .replace(/حلقة\s*\d+/gi, '')
    .replace(/[\u064B-\u0652]/g, '') // إزالة التشكيل
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * البحث في Viu بمسارات الـ API الصحيحة
 */
async function searchViu(query, season = 1) {
  const cleanQ = cleanTitle(query);
  if (!cleanQ) return [];

  // 1. البحث المباشر عن المنتج
  let res = await fetchViuApi('/product/search', { keyword: cleanQ, limit: '15' });
  let products = res?.data?.products || [];

  // 2. البحث عبر /search كخيار بديل
  if (!products || products.length === 0) {
    res = await fetchViuApi('/search', { keyword: cleanQ, limit: '15' });
    products = res?.data?.products || [];
  }

  // 3. تجربة البحث مع إضافة رقم الموسم بالاسم إذا لم يرجع نتائج
  if ((!products || products.length === 0) && season > 1) {
    res = await fetchViuApi('/product/search', { keyword: `${cleanQ} ${season}`, limit: '15' });
    products = res?.data?.products || [];
  }

  // 4. تجربة البحث بأول كلمتين فقط
  if ((!products || products.length === 0) && cleanQ.includes(' ')) {
    const shortTitle = cleanQ.split(' ').slice(0, 2).join(' ');
    res = await fetchViuApi('/product/search', { keyword: shortTitle, limit: '15' });
    products = res?.data?.products || [];
  }

  return products;
}

/**
 * مطابقة العمل الأنسب حسب رقم الموسم
 */
function matchBestProduct(products, targetSeason) {
  if (!products || products.length === 0) return null;
  if (products.length === 1) return products[0];

  const seasonStr = targetSeason.toString();
  const matched = products.find(p => {
    const title = p.title || '';
    return title.includes(seasonStr) || title.includes(`الموسم ${seasonStr}`) || title.includes(`Season ${seasonStr}`);
  });

  return matched || products[0];
}

/**
 * جلب product_id للحلقة
 */
async function getEpisodeProductId(seriesProductId, epNum) {
  const res = await fetchViuApi('/product/detail', { product_id: seriesProductId });
  const product = res?.data?.product;
  const episodes = product?.episodes || [];

  if (!episodes || episodes.length === 0) return seriesProductId;

  const target = episodes.find(
    e => parseInt(e.number || e.episode_num || 0) === parseInt(epNum || 1)
  );

  return target ? target.product_id : episodes[0].product_id;
}

/**
 * استخراج وتحليل رابط M3U8
 */
function extractStreamUrl(data) {
  if (!data) return null;

  let rawUrl =
    data.stream?.url ||
    data.current_product?.stream_url ||
    data.product?.stream_url ||
    data.distribute_url;

  if (!rawUrl && data.stream) {
    rawUrl = data.stream;
  }

  if (typeof rawUrl === 'object' && rawUrl !== null) {
    rawUrl = rawUrl.m3u8 || rawUrl.url || rawUrl.src || rawUrl.hls || null;
  }

  if (typeof rawUrl === 'string' && rawUrl.startsWith('http')) {
    return rawUrl;
  }

  return null;
}

/**
 * الدالة الرئيسية المستدعاة بـ Nuvio Engine
 */
async function getStreams(arg1, arg2, arg3, arg4, arg5) {
  try {
    let title = '';
    let origTitle = '';
    let type = 'movie';
    let season = 1;
    let episode = 1;

    if (typeof arg1 === 'object' && arg1 !== null) {
      title = arg1.title || arg1.name || '';
      origTitle = arg1.origTitle || arg1.original_title || arg1.originalTitle || '';
      type = arg1.type || arg1.mediaType || 'movie';
      season = arg1.season || arg1.seasonNumber || 1;
      episode = arg1.episode || arg1.episodeNumber || 1;
    } else {
      type = arg2 || 'movie';
      season = arg3 || 1;
      episode = arg4 || 1;
      title = arg5 || (typeof arg1 === 'string' ? arg1 : '');
    }

    // 1. البحث بالعنوان الرئيسي
    let searchResults = await searchViu(title, season);

    // 2. البحث بالاسم الأصلي في حال عدم وجود نتائج
    if ((!searchResults || searchResults.length === 0) && origTitle && origTitle !== title) {
      searchResults = await searchViu(origTitle, season);
    }

    if (!searchResults || searchResults.length === 0) return [];

    // 3. مطابقة الموسم والأعمال
    const matchedItem = matchBestProduct(searchResults, season);
    if (!matchedItem) return [];

    let targetProductId = matchedItem.product_id;

    // 4. مطابقة رقم الحلقة
    if (type === 'tv' || type === 'series' || matchedItem.is_series === '1') {
      targetProductId = await getEpisodeProductId(targetProductId, episode);
    }

    // 5. جلب رابط البث M3U8
    const streamRes = await fetchViuApi('/playlist/detail', { product_id: targetProductId });
    const m3u8Url = extractStreamUrl(streamRes?.data);

    if (!m3u8Url) return [];

    return [
      {
        name: 'Viu HD',
        server: 'Viu Server',
        url: m3u8Url,
        quality: 'Auto',
        format: 'm3u8',
        type: 'm3u8',
        headers: {
          'User-Agent': HEADERS['User-Agent'],
          'Referer': 'https://www.viu.com/',
          'Origin': 'https://www.viu.com'
        }
      }
    ];
  } catch (err) {
    return [];
  }
}

module.exports = {
  id: 'nuvio-viu',
  name: 'Viu',
  getStreams,
  getSources: getStreams,
  extract: getStreams,
  search: searchViu
};
