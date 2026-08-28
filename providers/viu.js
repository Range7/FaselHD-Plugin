// providers/viu.js - Fixed Viu Provider with Arabic Search & Correct API Endpoints

const VIU_API_BASE = 'https://api.viu.com/ott/v1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Origin': 'https://www.viu.com',
  'Referer': 'https://www.viu.com/',
  'Accept': 'application/json, text/plain, */*'
};

const DEFAULT_PARAMS = {
  platform_flag_label: 'web',
  area_id: '4',          // الشرق الأوسط
  country_code: 'IQ',    // العراق / الدول العربية
  language_flag_id: '3',  // اللغة العربية (1 للإنجليزية)
  platform_type: 'WEB',
  app_ver: '2.0.0'
};

/**
 * دالة إرسال الطلبات لـ API Viu
 */
async function fetchViu(endpoint, params = {}) {
  try {
    const allParams = { ...DEFAULT_PARAMS, ...params };
    const queryStr = Object.keys(allParams)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
      .join('&');

    const response = await fetch(`${VIU_API_BASE}${endpoint}?${queryStr}`, {
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
 * تنظيف نصوص البحث العربية والإنجليزية
 */
function cleanArabicTitle(title) {
  if (!title) return '';
  return title
    // إزالة الموسم والحلقة
    .replace(/الموسم\s*\d+/gi, '')
    .replace(/الجزء\s*\d+/gi, '')
    .replace(/season\s*\d+/gi, '')
    .replace(/part\s*\d+/gi, '')
    .replace(/حلقة\s*\d+/gi, '')
    .replace(/ep\w*\s*\d+/gi, '')
    // إزالة التشكيل العربي
    .replace(/[\u064B-\u0652]/g, '')
    // إزالة الرموز
    .replace(/[\(\)\[\]\:\-\_\.\,\!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * البحث بـ Viu API باستخدام الـ Endpoints الصحيحة
 */
async function searchViu(keyword) {
  const q = cleanArabicTitle(keyword);
  if (!q) return [];

  // 1. محاولة البحث بـ /product/search
  let res = await fetchViu('/product/search', { keyword: q, limit: '10' });
  let products = res?.data?.products || [];

  // 2. إذا لم يجد، محاولة البحث بـ /all-products
  if (!products || products.length === 0) {
    res = await fetchViu('/all-products', { keyword: q, limit: '10' });
    products = res?.data?.products || [];
  }

  // 3. إذا لم يجد، محاولة البحث بأول كلمتين من العنوان فقط
  if ((!products || products.length === 0) && q.includes(' ')) {
    const shortQuery = q.split(' ').slice(0, 2).join(' ');
    res = await fetchViu('/product/search', { keyword: shortQuery, limit: '10' });
    products = res?.data?.products || [];
  }

  return products;
}

/**
 * جلب product_id الخاص بالحلقة المطلوب عرضها
 */
async function getEpisodeId(seriesProductId, epNum) {
  const res = await fetchViu('/product/detail', { product_id: seriesProductId });
  const product = res?.data?.product;
  const episodes = product?.episodes || [];

  if (!episodes || episodes.length === 0) return seriesProductId;

  // المطابقة حسب رقم الحلقة
  const target = episodes.find(
    e => parseInt(e.number || e.episode_num || 0) === parseInt(epNum || 1)
  );

  return target ? target.product_id : episodes[0].product_id;
}

/**
 * استخراج رابط M3U8 آمن
 */
function extractM3u8Url(data) {
  if (!data) return null;

  let url =
    data.stream?.url ||
    data.current_product?.stream_url ||
    data.product?.stream_url ||
    data.distribute_url;

  if (typeof url === 'object' && url !== null) {
    url = url.url || url.m3u8 || url.src || null;
  }

  if (typeof url === 'string' && url.startsWith('http')) {
    return url;
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
    let episode = 1;

    // استخراج بيانات الفلم / المسلسل
    if (typeof arg1 === 'object' && arg1 !== null) {
      title = arg1.title || arg1.name || '';
      origTitle = arg1.origTitle || arg1.original_title || arg1.originalTitle || '';
      type = arg1.type || arg1.mediaType || 'movie';
      episode = arg1.episode || arg1.episodeNumber || 1;
    } else {
      type = arg2 || 'movie';
      episode = arg4 || 1;
      title = arg5 || arg1 || '';
    }

    // 1. تجربة البحث بالاسم العربي
    let searchResults = await searchViu(title);

    // 2. تجربة البحث بالاسم الأصلي/الإنجليزي إذا فشل العربي
    if ((!searchResults || searchResults.length === 0) && origTitle && origTitle !== title) {
      searchResults = await searchViu(origTitle);
    }

    if (!searchResults || searchResults.length === 0) return [];

    const matched = searchResults[0];
    let targetProductId = matched.product_id;

    // 3. مطابقة رقم الحلقة للمسلسلات
    if (type === 'tv' || type === 'series' || matched.is_series === '1') {
      targetProductId = await getEpisodeId(targetProductId, episode);
    }

    // 4. استخراج رابط التشغيل
    const streamRes = await fetchViu('/playlist/detail', { product_id: targetProductId });
    const m3u8Url = extractM3u8Url(streamRes?.data);

    if (!m3u8Url) return [];

    return [
      {
        name: 'Viu',
        server: 'Viu Official',
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
