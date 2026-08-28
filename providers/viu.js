// providers/viu.js - Final Nuvio Compatible Provider for Viu

const VIU_API_BASE = 'https://api.viu.com/ott/v1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Origin': 'https://www.viu.com',
  'Referer': 'https://www.viu.com/'
};

const DEFAULT_PARAMS = {
  platform_flag_label: 'web',
  area_id: '4',         // كود الشرق الأوسط
  language_flag_id: '3', // اللغة العربية
  platform_type: 'WEB',
  app_ver: '2.0.0'
};

/**
 * دالة طلب GET آمنة لـ Viu API
 */
async function fetchViu(endpoint, params = {}) {
  try {
    const queryParams = { ...DEFAULT_PARAMS, ...params };
    const queryStr = Object.keys(queryParams)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
      .join('&');

    const url = `${VIU_API_BASE}${endpoint}?${queryStr}`;
    const res = await fetch(url, { method: 'GET', headers: HEADERS });
    
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * تنظيف نصوص البحث
 */
function cleanQuery(text) {
  if (!text) return '';
  return text
    .replace(/[\(\)\[\]]/g, '')
    .replace(/season\s*\d+/gi, '')
    .replace(/الموسم\s*\d+/gi, '')
    .replace(/حلقة\s*\d+/gi, '')
    .trim();
}

/**
 * دالة البحث في Viu API
 */
async function searchViu(keyword) {
  const q = cleanQuery(keyword);
  if (!q) return [];
  const res = await fetchViu('/search', { keyword: q, limit: '10' });
  return res?.data?.products || [];
}

/**
 * استخراج ID الحلقة لمسلسلات Viu
 */
async function getEpisodeId(seriesProductId, epNum) {
  const res = await fetchViu('/product/detail', { product_id: seriesProductId });
  const episodes = res?.data?.product?.episodes || [];
  if (!episodes || episodes.length === 0) return seriesProductId;

  const match = episodes.find(e => parseInt(e.number || e.episode_num || 0) === parseInt(epNum || 1));
  return match ? match.product_id : episodes[0].product_id;
}

/**
 * الدالة الرئيسية لجلب السيرفرات (تستقبل كافة أشكال المدخلات من Nuvio)
 */
async function getStreams(arg1, arg2, arg3, arg4, arg5) {
  try {
    let title = '';
    let type = 'movie';
    let season = 1;
    let episode = 1;

    // معالجة المدخلات سواء كانت Object أو Parameters منفصلة
    if (typeof arg1 === 'object' && arg1 !== null) {
      title = arg1.title || arg1.name || arg1.origTitle || arg1.original_title || '';
      type = arg1.type || arg1.mediaType || 'movie';
      season = arg1.season || arg1.seasonNumber || 1;
      episode = arg1.episode || arg1.episodeNumber || 1;
    } else {
      // Nuvio Standard Signature: (tmdbId, type, season, episode, title)
      type = arg2 || 'movie';
      season = arg3 || 1;
      episode = arg4 || 1;
      title = arg5 || arg1 || '';
    }

    if (!title) return [];

    // 1. البحث عن المحتوى بـ Viu
    let searchResults = await searchViu(title);

    if (!searchResults || searchResults.length === 0) {
      return [];
    }

    const matchedItem = searchResults[0];
    let targetProductId = matchedItem.product_id;

    // 2. إذا كان حلقة مسلسل، جلب ID الحلقة
    if (type === 'tv' || type === 'series' || matchedItem.is_series === '1') {
      targetProductId = await getEpisodeId(targetProductId, episode);
    }

    // 3. جلب رابط البث M3U8
    const streamData = await fetchViu('/playlist/detail', { product_id: targetProductId });
    const payload = streamData?.data;
    if (!payload) return [];

    const streamUrl =
      payload.stream?.url ||
      payload.current_product?.stream_url ||
      payload.product?.stream_url ||
      payload.distribute_url;

    if (!streamUrl) return [];

    // إرجاع السيرفر بنفس الصيغة المعتمدة في Nuvio
    return [
      {
        name: 'Viu Server',
        server: 'Viu Official',
        url: streamUrl,
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

// التصدير المباشر والموحد المتوافق مع Nuvio
module.exports = {
  id: 'nuvio-viu',
  name: 'Viu',
  getStreams,
  getSources: getStreams,
  extract: getStreams,
  search: searchViu
};
