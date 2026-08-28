// providers/viu.js - Pure JavaScript for Nuvio (Zero External Dependencies)

const VIU_API_BASE = 'https://api.viu.com/ott/v1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Origin': 'https://www.viu.com',
  'Referer': 'https://www.viu.com/',
  'Accept': 'application/json, text/plain, */*'
};

const DEFAULT_PARAMS = {
  platform_flag_label: 'web',
  area_id: '4',         // الشرق الأوسط (المنطقة العربية)
  language_flag_id: '3', // اللغة العربية
  app_ver: '2.0.0'
};

/**
 * دالة مساعدة لإرسال الطلبات باستخدام fetch المدمجة في Nuvio
 */
async function httpGet(endpoint, params = {}) {
  try {
    const allParams = { ...DEFAULT_PARAMS, ...params };
    const queryString = Object.keys(allParams)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`)
      .join('&');

    const fullUrl = `${VIU_API_BASE}${endpoint}?${queryString}`;

    const response = await fetch(fullUrl, {
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
 * تنظيف اسم الفلم/المسلسل من الكلمات الزائدة
 */
function cleanQuery(query) {
  if (!query) return '';
  return query
    .replace(/[\(\)\[\]]/g, '')
    .replace(/season\s*\d+/gi, '')
    .replace(/الموسم\s*\d+/gi, '')
    .replace(/حلقة\s*\d+/gi, '')
    .trim();
}

/**
 * البحث في سيرفر Viu
 */
async function searchViu(title) {
  const query = cleanQuery(title);
  if (!query) return [];

  const data = await httpGet('/search', { keyword: query, limit: '10' });
  return data?.data?.products || [];
}

/**
 * جلب product_id الخاص بالحلقة المحددة
 */
async function getEpisodeProductId(seriesProductId, episodeNum) {
  const data = await httpGet('/product/detail', { product_id: seriesProductId });
  const episodes = data?.data?.product?.episodes || [];

  if (!episodes || episodes.length === 0) return seriesProductId;

  const target = episodes.find(
    (ep) => parseInt(ep.number || ep.episode_num || 0) === parseInt(episodeNum || 1)
  );

  return target ? target.product_id : episodes[0].product_id;
}

/**
 * الدالة الرئيسية التي يستدعيها تطبيق Nuvio لجلب روابط التشغيل
 */
async function getStreams(mediaInfo) {
  try {
    if (!mediaInfo) return [];

    const { title, origTitle, type, season, episode } = mediaInfo;
    const searchTitle = title || origTitle || '';

    // 1. البحث عن العنوان في Viu
    let products = await searchViu(searchTitle);

    // تجربة البحث بالاسم الأصلي في حال عدم وجود نتائج
    if ((!products || products.length === 0) && origTitle && origTitle !== title) {
      products = await searchViu(origTitle);
    }

    if (!products || products.length === 0) {
      return [];
    }

    // 2. اختيار أول نتيجة مطابقة
    const matchedItem = products[0];
    let targetProductId = matchedItem.product_id;

    // 3. معالجة الحلقات للمسلسلات
    if (type === 'tv' || type === 'series' || matchedItem.is_series === '1') {
      const epId = await getEpisodeProductId(targetProductId, episode || 1);
      if (epId) targetProductId = epId;
    }

    // 4. استخراج رابط البث M3U8
    const streamData = await httpGet('/playlist/detail', { product_id: targetProductId });
    if (!streamData?.data) return [];

    const payload = streamData.data;
    const m3u8Url =
      payload.stream?.url ||
      payload.current_product?.stream_url ||
      payload.product?.stream_url ||
      payload.distribute_url;

    if (!m3u8Url) return [];

    // إرجاع الترتيب المتوافق مع Nuvio
    return [
      {
        name: 'Viu',
        server: 'Viu Official',
        url: m3u8Url,
        quality: 'auto',
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

// التصدير ليكون متوافقاً مع Nuvio
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getStreams,
    searchViu,
    getEpisodeProductId
  };
}
