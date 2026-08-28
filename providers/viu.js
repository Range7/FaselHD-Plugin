// providers/viu.js - Fully Verified Viu Provider for Nuvio Engine

const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49'; // المفتاح الخاص بك
const VIU_API_BASE = 'https://api.viu.com/ott/v1';

/**
 * دالة طلب GET آمنة ومتوافقة مع React Native
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
 * جلب العناوين من TMDB عند توفر المعرف ID
 */
async function getTmdbTitles(tmdbId, type) {
  if (!tmdbId) return { ar: '', en: '' };
  try {
    const endpoint = (type === 'tv' || type === 'series') ? 'tv' : 'movie';
    const arRes = await fetchJson(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=ar-SA`);
    const enRes = await fetchJson(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`);

    const arTitle = arRes?.name || arRes?.title || '';
    const enTitle = enRes?.name || enRes?.title || arRes?.original_name || arRes?.original_title || '';

    return { ar: arTitle, en: enTitle };
  } catch (err) {
    return { ar: '', en: '' };
  }
}

/**
 * تنظيف العناوين من التشكيل والكلمات الزائدة
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
 * بناء روابط Viu API بمعاملات الشرق الأوسط
 */
function buildViuUrl(endpoint, params = {}) {
  const defaultParams = {
    platform_flag_label: 'web',
    area_id: '4',          // الشرق الأوسط
    country_code: 'IQ',    // العراق والدول العربية
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
 * البحث بـ Viu API بعدة مراحل متتالية
 */
async function searchViu(keyword, langId = '3') {
  if (!keyword || typeof keyword !== 'string') return [];
  const q = keyword.trim();
  if (!q) return [];

  // 1. تجربة البحث بالاسم كما هو
  let url = buildViuUrl('/product/search', { keyword: q, language_flag_id: langId, limit: '15' });
  let res = await fetchJson(url);
  let products = res?.data?.products || res?.data?.items || [];

  // 2. تجربة البحث بالاسم المنظف
  if (!products || products.length === 0) {
    const cleaned = cleanTitle(q);
    if (cleaned && cleaned !== q) {
      url = buildViuUrl('/product/search', { keyword: cleaned, language_flag_id: langId, limit: '15' });
      res = await fetchJson(url);
      products = res?.data?.products || res?.data?.items || [];
    }
  }

  // 3. تجربة البحث عبر /all-products
  if (!products || products.length === 0) {
    url = buildViuUrl('/all-products', { keyword: cleanTitle(q) || q, language_flag_id: langId, limit: '15' });
    res = await fetchJson(url);
    products = res?.data?.products || res?.data?.items || [];
  }

  // 4. تجربة البحث بأول كلمتين
  if ((!products || products.length === 0) && q.includes(' ')) {
    const shortQ = cleanTitle(q).split(' ').slice(0, 2).join(' ');
    if (shortQ) {
      url = buildViuUrl('/product/search', { keyword: shortQ, language_flag_id: langId, limit: '15' });
      res = await fetchJson(url);
      products = res?.data?.products || res?.data?.items || [];
    }
  }

  return products || [];
}

/**
 * مطابقة رقم الموسم للعمل بـ Viu
 */
function selectBestProduct(products, seasonNum) {
  if (!products || products.length === 0) return null;
  if (products.length === 1) return products[0];

  const sStr = seasonNum.toString();
  const matched = products.find(p => {
    const t = p.title || '';
    return t.includes(sStr) || t.includes(`الموسم ${sStr}`) || t.includes(`Season ${sStr}`);
  });

  return matched || products[0];
}

/**
 * جلب product_id الخاص بالحلقة
 */
async function getEpisodeProductId(seriesProductId, epNum) {
  const url = buildViuUrl('/product/detail', { product_id: seriesProductId });
  const res = await fetchJson(url);
  const episodes = res?.data?.product?.episodes || res?.data?.episodes || [];

  if (!episodes || episodes.length === 0) return seriesProductId;

  const target = episodes.find(
    e => parseInt(e.number || e.episode_num || 0, 10) === parseInt(epNum || 1, 10)
  );

  return target ? target.product_id : episodes[0].product_id;
}

/**
 * تفكيك واستخراج رابط M3U8
 */
function extractM3u8Url(data) {
  if (!data) return null;

  let raw =
    data.stream?.url ||
    data.current_product?.stream_url ||
    data.product?.stream_url ||
    data.distribute_url;

  if (!raw && data.stream) {
    raw = data.stream;
  }

  if (typeof raw === 'object' && raw !== null) {
    raw = raw.url || raw.m3u8 || raw.src || raw.hls || null;
  }

  if (typeof raw === 'string' && raw.startsWith('http')) {
    return raw;
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
    let title = '';
    let origTitle = '';

    // 1. استخراج المدخلات الممررة من Nuvio
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
      title = (typeof arg5 === 'string') ? arg5 : '';
    }

    // 2. استخدام TMDB لتوفير الأسماء عند الحاجة
    if (tmdbId) {
      const tmdbInfo = await getTmdbTitles(tmdbId, mediaType);
      if (tmdbInfo.ar && !title) title = tmdbInfo.ar;
      if (tmdbInfo.en && !origTitle) origTitle = tmdbInfo.en;
      if (!title && tmdbInfo.en) title = tmdbInfo.en;
    }

    if (!title && !origTitle) return [];

    // 3. البحث بـ Viu API
    let products = await searchViu(title, '3');

    // 4. التجربة بالاسم الأصلي / الإنجليزي عند عدم وجود نتائج
    if ((!products || products.length === 0) && origTitle && origTitle !== title) {
      products = await searchViu(origTitle, '3');
      if (!products || products.length === 0) {
        products = await searchViu(origTitle, '1');
      }
    }

    if (!products || products.length === 0) return [];

    const matchedItem = selectBestProduct(products, season);
    if (!matchedItem) return [];

    let targetProductId = matchedItem.product_id;

    // 5. جلب ID الحلقة للمسلسلات
    if (mediaType === 'tv' || mediaType === 'series' || matchedItem.is_series === '1') {
      targetProductId = await getEpisodeProductId(targetProductId, episode);
    }

    // 6. استخراج رابط التشغيل
    const playlistUrl = buildViuUrl('/playlist/detail', { product_id: targetProductId });
    const streamRes = await fetchJson(playlistUrl);
    const m3u8Url = extractM3u8Url(streamRes?.data);

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
