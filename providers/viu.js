// providers/viu.js - Pure & Error-Free Viu Provider for Nuvio

const VIU_API_BASE = 'https://api.viu.com/ott/v1';

/**
 * دالة جلب البيانات الآمنة بدون هيدرز محظورة لتفادي كراش React Native
 */
async function fetchJson(endpoint, params = {}) {
  try {
    const defaultParams = {
      platform_flag_label: 'web',
      area_id: '4',          // الشرق الأوسط
      country_code: 'IQ',    // العراق والدول العربية
      language_flag_id: '3',  // اللغة العربية
      platform_type: 'WEB',
      app_ver: '2.0.0'
    };

    const allParams = { ...defaultParams, ...params };
    const queryStr = Object.keys(allParams)
      .filter(k => allParams[k] !== undefined && allParams[k] !== null)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
      .join('&');

    const response = await fetch(`${VIU_API_BASE}${endpoint}?${queryStr}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) return null;
    const text = await response.text();
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

/**
 * تنظيف نصوص البحث
 */
function cleanQuery(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\(\)\[\]\:\-\_\.\,\!]/g, ' ')
    .replace(/season\s*\d+/gi, '')
    .replace(/الموسم\s*\d+/gi, '')
    .replace(/الجزء\s*\d+/gi, '')
    .replace(/حلقة\s*\d+/gi, '')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * البحث بـ Viu API
 */
async function searchViu(keyword) {
  const q = cleanQuery(keyword);
  if (!q) return [];

  let res = await fetchJson('/product/search', { keyword: q, limit: '10' });
  let products = res?.data?.products || res?.data?.items || [];

  if (!products || products.length === 0) {
    res = await fetchJson('/search', { keyword: q, limit: '10' });
    products = res?.data?.products || res?.data?.items || [];
  }

  if ((!products || products.length === 0) && q.includes(' ')) {
    const shortQ = q.split(' ').slice(0, 2).join(' ');
    res = await fetchJson('/product/search', { keyword: shortQ, limit: '10' });
    products = res?.data?.products || res?.data?.items || [];
  }

  return products;
}

/**
 * جلب product_id للحلقة
 */
async function getEpisodeProductId(seriesProductId, epNum) {
  const res = await fetchJson('/product/detail', { product_id: seriesProductId });
  const episodes = res?.data?.product?.episodes || res?.data?.episodes || [];

  if (!episodes || episodes.length === 0) return seriesProductId;

  const target = episodes.find(
    e => parseInt(e.number || e.episode_num || 0, 10) === parseInt(epNum || 1, 10)
  );

  return target ? target.product_id : episodes[0].product_id;
}

/**
 * استخراج رابط M3U8
 */
function extractStreamUrl(data) {
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

// الكائن الرئيسي المصدّر لتطبيق Nuvio
const ViuProvider = {
  id: 'nuvio-viu',
  name: 'Viu',

  async getStreams(mediaInfo, type, season, episode, title) {
    try {
      let searchTitle = '';
      let origTitle = '';
      let mediaType = 'movie';
      let epNum = 1;

      // استخراج البيانات بأمان بدون أخطاء Types
      if (typeof mediaInfo === 'object' && mediaInfo !== null) {
        searchTitle = mediaInfo.title || mediaInfo.name || mediaInfo.query || '';
        origTitle = mediaInfo.origTitle || mediaInfo.original_title || mediaInfo.originalTitle || '';
        mediaType = mediaInfo.type || mediaInfo.mediaType || 'movie';
        epNum = parseInt(mediaInfo.episode || mediaInfo.episodeNumber || 1, 10);
      } else if (typeof mediaInfo === 'string') {
        searchTitle = mediaInfo;
        if (typeof type === 'string') mediaType = type;
        if (episode) epNum = parseInt(episode, 10);
      } else if (typeof title === 'string') {
        searchTitle = title;
        if (typeof type === 'string') mediaType = type;
        if (episode) epNum = parseInt(episode, 10);
      }

      if (!searchTitle && !origTitle) return [];

      // 1. البحث بالعنوان الرئيسي
      let products = await searchViu(searchTitle);

      // 2. تجربة البحث بالاسم الأصلي
      if ((!products || products.length === 0) && origTitle && origTitle !== searchTitle) {
        products = await searchViu(origTitle);
      }

      if (!products || products.length === 0) return [];

      const item = products[0];
      let targetProductId = item.product_id;

      // 3. معالجة الحلقات للمسلسلات
      if (mediaType === 'tv' || mediaType === 'series' || item.is_series === '1') {
        targetProductId = await getEpisodeProductId(targetProductId, epNum);
      }

      // 4. جلب رابط Stream
      const streamRes = await fetchJson('/playlist/detail', { product_id: targetProductId });
      const streamUrl = extractStreamUrl(streamRes?.data);

      if (!streamUrl) return [];

      return [
        {
          name: 'Viu HD',
          server: 'Viu',
          url: streamUrl,
          quality: 'Auto',
          format: 'm3u8'
        }
      ];
    } catch (err) {
      return [];
    }
  }
};

module.exports = ViuProvider;
