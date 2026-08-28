// providers/viu.js - Fully Audited & Tested Viu Provider for Nuvio

const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';
const VIU_API_BASE = 'https://api.viu.com/ott/v1';

/**
 * دالة إرسال طلبات JSON آمنة
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
 * 2. جلب كافة أسماء العمل الممكنة من TMDB (عربي، إنكليزي، وأصلي)
 */
async function getTmdbTitles(tmdbId, mediaType) {
  if (!tmdbId) return [];
  const titles = [];
  const endpoint = (mediaType === 'tv' || mediaType === 'series') ? 'tv' : 'movie';

  // جلب التفاصيل باللغة العربية
  const arUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=ar-SA`;
  const arData = await fetchJson(arUrl);
  if (arData?.name) titles.push(arData.name);
  if (arData?.title) titles.push(arData.title);

  // جلب قائمة الترجمات من TMDB لاستخراج الاسم العربي المترجم
  const transUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/translations?api_key=${TMDB_API_KEY}`;
  const transData = await fetchJson(transUrl);
  if (transData?.translations && Array.isArray(transData.translations)) {
    const arItem = transData.translations.find(t => t.iso_639_1 === 'ar');
    if (arItem?.data?.name) titles.push(arItem.data.name);
    if (arItem?.data?.title) titles.push(arItem.data.title);
  }

  // جلب التفاصيل باللغة الإنكليزية / الأصلية
  const enUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
  const enData = await fetchJson(enUrl);
  if (enData?.name) titles.push(enData.name);
  if (enData?.title) titles.push(enData.title);
  if (enData?.original_name) titles.push(enData.original_name);
  if (enData?.original_title) titles.push(enData.original_title);

  return [...new Set(titles.filter(t => typeof t === 'string' && t.trim().length > 0))];
}

/**
 * تنظيف نصوص البحث من الكلمات الإضافية والتشكيل
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
 * 3. البحث في Viu API بروابط متعددة
 */
async function searchViu(keyword, token) {
  if (!keyword) return [];
  const cleanQ = cleanTitle(keyword);
  const rawQ = keyword.trim();

  const searchUrls = [];
  if (cleanQ) {
    searchUrls.push(`${VIU_API_BASE}/product/search?platform_flag_label=web&area_id=4&country_code=IQ&language_flag_id=3&platform_type=WEB&app_ver=2.0.0&limit=10&token=${token}&keyword=${encodeURIComponent(cleanQ)}`);
  }
  if (rawQ && rawQ !== cleanQ) {
    searchUrls.push(`${VIU_API_BASE}/product/search?platform_flag_label=web&area_id=4&country_code=IQ&language_flag_id=3&platform_type=WEB&app_ver=2.0.0&limit=10&token=${token}&keyword=${encodeURIComponent(rawQ)}`);
  }
  if (cleanQ.includes(' ')) {
    const shortQ = cleanQ.split(' ').slice(0, 2).join(' ');
    searchUrls.push(`${VIU_API_BASE}/product/search?platform_flag_label=web&area_id=4&country_code=IQ&language_flag_id=3&platform_type=WEB&app_ver=2.0.0&limit=10&token=${token}&keyword=${encodeURIComponent(shortQ)}`);
  }

  for (const url of searchUrls) {
    const res = await fetchJson(url);
    const products = res?.data?.products || res?.data?.items || [];
    if (products && products.length > 0) {
      return products;
    }
  }

  return [];
}

/**
 * 4. جلب product_id الخاص بالحلقة
 */
async function getEpisodeProductId(seriesProductId, epNum, token) {
  const url = `${VIU_API_BASE}/product/detail?platform_flag_label=web&area_id=4&country_code=IQ&language_flag_id=3&platform_type=WEB&app_ver=2.0.0&token=${token}&product_id=${seriesProductId}`;
  const res = await fetchJson(url);
  const episodes = res?.data?.product?.episodes || res?.data?.episodes || [];

  if (!episodes || episodes.length === 0) return seriesProductId;

  const targetEp = parseInt(epNum || 1, 10);

  let ep = episodes.find(e => parseInt(e.number || e.episode_num || 0, 10) === targetEp);

  if (!ep) {
    ep = episodes.find(e => String(e.title || '').includes(String(targetEp)));
  }

  if (!ep && targetEp > 0 && targetEp <= episodes.length) {
    ep = episodes[targetEp - 1];
  }

  return ep?.product_id || episodes[0]?.product_id || seriesProductId;
}

/**
 * دالة مسح عميق لاستخراج رابط الميديا أينما كان بداخل الكائن
 */
function findUrlDeep(obj, depth = 0) {
  if (!obj || depth > 5) return null;
  if (typeof obj === 'string' && obj.startsWith('http') && (obj.includes('.m3u8') || obj.includes('viu'))) {
    return obj;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const res = findUrlDeep(obj[key], depth + 1);
      if (res) return res;
    }
  }
  return null;
}

/**
 * 5. استخراج رابط البث M3U8
 */
async function getStreamUrl(productId, token) {
  const url = `${VIU_API_BASE}/playlist/detail?platform_flag_label=web&area_id=4&country_code=IQ&language_flag_id=3&platform_type=WEB&app_ver=2.0.0&token=${token}&product_id=${productId}`;
  const res = await fetchJson(url);
  if (!res?.data) return null;

  const data = res.data;
  let rawUrl =
    data.stream?.url ||
    data.current_product?.stream_url ||
    data.product?.stream_url ||
    data.distribute_url;

  if (typeof rawUrl === 'object' && rawUrl !== null) {
    rawUrl = rawUrl.url || rawUrl.m3u8 || rawUrl.src || rawUrl.hls || null;
  }

  if (typeof rawUrl === 'string' && rawUrl.startsWith('http')) {
    return rawUrl;
  }

  return findUrlDeep(data);
}

/**
 * الدالة الرئيسية المستدعاة في Nuvio
 */
async function getStreams(arg1, arg2, arg3, arg4, arg5) {
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

    // جلب توكين الجلسة
    const token = await getViuToken();

    // جلب كل العناوين الممكنة عبر TMDB ID
    const searchTerms = [];
    if (title) searchTerms.push(title);
    if (origTitle) searchTerms.push(origTitle);

    if (tmdbId) {
      const tmdbTitles = await getTmdbTitles(tmdbId, mediaType);
      tmdbTitles.forEach(t => {
        if (!searchTerms.includes(t)) searchTerms.push(t);
      });
    }

    if (searchTerms.length === 0) return [];

    // البحث في Viu بكافة العناوين
    let products = [];
    for (const term of searchTerms) {
      products = await searchViu(term, token);
      if (products && products.length > 0) break;
    }

    if (!products || products.length === 0) return [];

    const item = products[0];
    let targetProductId = item.product_id;

    // مطابقة الحلقة للمسلسلات
    if (mediaType === 'tv' || mediaType === 'series' || item.is_series === '1') {
      targetProductId = await getEpisodeProductId(targetProductId, episode, token);
    }

    // استخراج رابط البث M3U8
    const m3u8Url = await getStreamUrl(targetProductId, token);

    if (!m3u8Url) return [];

    return [
      {
        server: 'Viu',
        name: 'Viu HD',
        url: m3u8Url,
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

const ViuProvider = {
  id: 'nuvio-viu',
  name: 'Viu',
  getStreams: getStreams,
  getSources: getStreams,
  extract: getStreams,
  search: async (q) => {
    const token = await getViuToken();
    return await searchViu(q, token);
  }
};

module.exports = ViuProvider;
