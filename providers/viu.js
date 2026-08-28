// providers/viu.js - Viu Provider for Nuvio with Custom TMDB API Key

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
 * تحويل TMDB ID إلى اسم عربي وإنكليزي للعمل باستخدام مفتاحك
 */
async function getTitlesFromTmdb(id, type) {
  if (!id) return { ar: '', en: '' };
  
  const endpoint = (type === 'tv' || type === 'series') ? 'tv' : 'movie';
  
  // جلب البيانات باللغة العربية والإنكليزية من TMDB
  const arData = await fetchJson(`https://api.themoviedb.org/3/${endpoint}/${id}?api_key=${TMDB_API_KEY}&language=ar-SA`);
  const enData = await fetchJson(`https://api.themoviedb.org/3/${endpoint}/${id}?api_key=${TMDB_API_KEY}&language=en-US`);

  const arTitle = arData?.name || arData?.title || '';
  const enTitle = enData?.name || enData?.title || arData?.original_name || arData?.original_title || '';

  return { ar: arTitle, en: enTitle };
}

/**
 * تنظيف نصوص البحث من التشكيل والرموز
 */
function cleanTitle(str) {
  if (!str || typeof str !== 'string') return '';
  return str
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
 * البحث في سيرفر Viu
 */
async function searchViu(keyword) {
  const q = cleanTitle(keyword);
  if (!q) return [];

  const params = `platform_flag_label=web&area_id=4&country_code=IQ&language_flag_id=3&platform_type=WEB&app_ver=2.0.0&limit=10&keyword=${encodeURIComponent(q)}`;

  let res = await fetchJson(`${VIU_API_BASE}/product/search?${params}`);
  let products = res?.data?.products || res?.data?.items || [];

  if (!products || products.length === 0) {
    res = await fetchJson(`${VIU_API_BASE}/search?${params}`);
    products = res?.data?.products || res?.data?.items || [];
  }

  if ((!products || products.length === 0) && q.includes(' ')) {
    const shortQ = q.split(' ').slice(0, 2).join(' ');
    const shortParams = `platform_flag_label=web&area_id=4&country_code=IQ&language_flag_id=3&platform_type=WEB&app_ver=2.0.0&limit=10&keyword=${encodeURIComponent(shortQ)}`;
    res = await fetchJson(`${VIU_API_BASE}/product/search?${shortParams}`);
    products = res?.data?.products || res?.data?.items || [];
  }

  return products;
}

/**
 * جلب product_id الخاص بالحلقة
 */
async function getEpisodeProductId(seriesProductId, epNum) {
  const params = `platform_flag_label=web&area_id=4&country_code=IQ&language_flag_id=3&platform_type=WEB&app_ver=2.0.0&product_id=${seriesProductId}`;
  const res = await fetchJson(`${VIU_API_BASE}/product/detail?${params}`);
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

/**
 * الدالة الرئيسية المستدعاة في Nuvio
 */
async function getStreams(arg1, arg2, arg3, arg4, arg5) {
  try {
    let tmdbId = '';
    let mediaType = 'movie';
    let season = 1;
    let episode = 1;
    let title = '';
    let origTitle = '';

    // استخراج المدخلات الممررة من Nuvio
    if (typeof arg1 === 'object' && arg1 !== null) {
      tmdbId = arg1.id || arg1.tmdbId || arg1.mediaId || '';
      mediaType = arg1.type || arg1.mediaType || 'movie';
      season = parseInt(arg1.season || arg1.seasonNumber || 1, 10);
      episode = parseInt(arg1.episode || arg1.episodeNumber || 1, 10);
      title = arg1.title || arg1.name || '';
      origTitle = arg1.origTitle || arg1.original_title || '';
    } else {
      tmdbId = arg1;
      mediaType = arg2 || 'movie';
      season = parseInt(arg3 || 1, 10);
      episode = parseInt(arg4 || 1, 10);
      title = arg5 || '';
    }

    // جلب الاسم العربي والإنكليزي باستخدام مفتاح TMDB الخاص بك
    if (tmdbId) {
      const tmdbTitles = await getTitlesFromTmdb(tmdbId, mediaType);
      if (tmdbTitles.ar) title = tmdbTitles.ar;
      if (tmdbTitles.en) origTitle = tmdbTitles.en;
    }

    if (!title && !origTitle) return [];

    // 1. البحث بالاسم العربي بـ Viu
    let products = await searchViu(title);

    // 2. تجربة البحث بالاسم الإنكليزي في حال عدم وجود نتائج
    if ((!products || products.length === 0) && origTitle && origTitle !== title) {
      products = await searchViu(origTitle);
    }

    if (!products || products.length === 0) return [];

    const item = products[0];
    let targetProductId = item.product_id;

    // 3. تحديد الحلقة للمسلسلات
    if (mediaType === 'tv' || mediaType === 'series' || item.is_series === '1') {
      targetProductId = await getEpisodeProductId(targetProductId, episode);
    }

    // 4. جلب رابط Stream
    const params = `platform_flag_label=web&area_id=4&country_code=IQ&language_flag_id=3&platform_type=WEB&app_ver=2.0.0&product_id=${targetProductId}`;
    const streamRes = await fetchJson(`${VIU_API_BASE}/playlist/detail?${params}`);
    const m3u8Url = extractStreamUrl(streamRes?.data);

    if (!m3u8Url) return [];

    return [
      {
        name: 'Viu HD',
        server: 'Viu',
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

const ViuProvider = {
  id: 'nuvio-viu',
  name: 'Viu',
  getStreams: getStreams,
  getSources: getStreams,
  extract: getStreams,
  search: searchViu
};

module.exports = ViuProvider;
