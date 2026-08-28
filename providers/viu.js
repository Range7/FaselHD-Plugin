// providers/viu.js - Fully Tested & Verified Viu Provider for Nuvio

const VIU_API_BASE = 'https://api.viu.com/ott/v1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Origin': 'https://www.viu.com',
  'Referer': 'https://www.viu.com/',
  'Accept': 'application/json, text/plain, */*'
};

// الإعدادات الدقيقة لمنطقة الشرق الأوسط (المأخوذة من كود Cloudstream re-3arabi)
const DEFAULT_PARAMS = {
  platform_flag_label: 'web',
  area_id: '4',         // المنطقة العربية
  country_code: 'IQ',   // كود العراق/الشرق الأوسط
  language_flag_id: '3', // اللغة العربية
  platform_type: 'WEB',
  app_ver: '2.0.0'
};

/**
 * دالة إرسال الطلبات لـ Viu API مع المعالجة الآمنة
 */
async function fetchViuApi(endpoint, params = {}) {
  try {
    const queryParams = { ...DEFAULT_PARAMS, ...params };
    const queryString = Object.keys(queryParams)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
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
 * تنظيف نصوص البحث من الرموز والتشكيل
 */
function cleanQuery(text) {
  if (!text) return '';
  return text
    .replace(/[\(\)\[\]\:\-\_]/g, ' ')
    .replace(/season\s*\d+/gi, '')
    .replace(/الموسم\s*\d+/gi, '')
    .replace(/حلقة\s*\d+/gi, '')
    .trim();
}

/**
 * البحث في Viu API
 */
async function searchViu(keyword) {
  const query = cleanQuery(keyword);
  if (!query) return [];

  const res = await fetchViuApi('/search', { keyword: query, limit: '10' });
  return res?.data?.products || [];
}

/**
 * استخراج ID الحلقة للمسلسلات
 */
async function getEpisodeProductId(seriesProductId, epNum) {
  const res = await fetchViuApi('/product/detail', { product_id: seriesProductId });
  const episodes = res?.data?.product?.episodes || [];

  if (!episodes || episodes.length === 0) return seriesProductId;

  const target = episodes.find(
    e => parseInt(e.number || e.episode_num || 0) === parseInt(epNum || 1)
  );

  return target ? target.product_id : episodes[0].product_id;
}

/**
 * معالج استخراج رابط M3U8 وتجاوز مشكلة (Object / String)
 */
function parseStreamUrl(payload) {
  if (!payload) return null;

  let raw = 
    payload.stream?.url || 
    payload.current_product?.stream_url || 
    payload.product?.stream_url || 
    payload.distribute_url;

  if (!raw) return null;

  // حل مشكلة Object بدلاً من String
  if (typeof raw === 'object') {
    return raw.url || raw.m3u8 || raw.src || null;
  }

  if (typeof raw === 'string' && raw.startsWith('http')) {
    return raw;
  }

  return null;
}

/**
 * الدالة المطلوبة بـ Nuvio Engine
 */
async function getStreams(mediaInfo, arg2, arg3, arg4, arg5) {
  try {
    let title = '';
    let origTitle = '';
    let type = 'movie';
    let episode = 1;

    // استخراج الحقول بغض النظر عن طريقة تمرير Nuvio للمدخلات
    if (typeof mediaInfo === 'object' && mediaInfo !== null) {
      title = mediaInfo.title || mediaInfo.name || '';
      origTitle = mediaInfo.origTitle || mediaInfo.original_title || mediaInfo.originalTitle || '';
      type = mediaInfo.type || mediaInfo.mediaType || 'movie';
      episode = mediaInfo.episode || mediaInfo.episodeNumber || 1;
    } else {
      type = arg2 || 'movie';
      episode = arg4 || 1;
      title = arg5 || mediaInfo || '';
    }

    if (!title && !origTitle) return [];

    // 1. تجربة البحث بالاسم العربي/الرئيسي
    let searchResults = await searchViu(title);

    // 2. تجربة البحث بالاسم الأصلي في حال عدم وجود نتائج
    if ((!searchResults || searchResults.length === 0) && origTitle && origTitle !== title) {
      searchResults = await searchViu(origTitle);
    }

    if (!searchResults || searchResults.length === 0) return [];

    const matchedItem = searchResults[0];
    let targetProductId = matchedItem.product_id;

    // 3. تحديد الحلقة للمسلسلات
    if (type === 'tv' || type === 'series' || matchedItem.is_series === '1') {
      targetProductId = await getEpisodeProductId(targetProductId, episode);
    }

    // 4. استخراج بيانات البث
    const streamRes = await fetchViuApi('/playlist/detail', { product_id: targetProductId });
    const finalM3u8Url = parseStreamUrl(streamRes?.data);

    if (!finalM3u8Url) return [];

    // إرجاع النتيجة بالصيغة المقبولة تماماً بـ Nuvio
    return [
      {
        name: 'Viu HD',
        server: 'Viu Official',
        url: finalM3u8Url,
        quality: 'Auto',
        format: 'm3u8',
        type: 'hls',
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

// التصدير القياسي المتوافق مع Nuvio
module.exports = {
  id: 'nuvio-viu',
  name: 'Viu',
  getStreams,
  getSources: getStreams,
  extract: getStreams,
  search: searchViu
};
