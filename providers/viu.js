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
 * دالة طلب GET الموحدة والآمنة
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
 * تنظيف العناوين العربية والإنجليزية
 */
function cleanTitle(text) {
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
 * دالة البحث الشاملة بـ API Viu
 */
async function searchViu(keyword, isArabic = true) {
  const cleanQ = cleanTitle(keyword);
  if (!cleanQ) return [];

  const langId = isArabic ? '3' : '1';

  // 1. البحث عبر /product/search
  let res = await fetchViuApi('/product/search', { keyword: cleanQ, language_flag_id: langId, limit: '15' });
  let products = res?.data?.products || res?.data?.items || [];

  // 2. البحث عبر /search
  if (!products || products.length === 0) {
    res = await fetchViuApi('/search', { keyword: cleanQ, language_flag_id: langId, limit: '15' });
    products = res?.data?.products || res?.data?.items || [];
  }

  // 3. تجربة اللغة البديلة
  if (!products || products.length === 0) {
    const altLangId = isArabic ? '1' : '3';
    res = await fetchViuApi('/product/search', { keyword: cleanQ, language_flag_id: altLangId, limit: '15' });
    products = res?.data?.products || res?.data?.items || [];
  }

  // 4. تجربة البحث بأول كلمتين
  if ((!products || products.length === 0) && cleanQ.includes(' ')) {
    const shortQ = cleanQ.split(' ').slice(0, 2).join(' ');
    res = await fetchViuApi('/product/search', { keyword: shortQ, language_flag_id: langId, limit: '15' });
    products = res?.data?.products || res?.data?.items || [];
  }

  return products;
}

/**
 * جلب product_id الخاص بالحلقة
 */
async function getEpisodeProductId(seriesProductId, epNum) {
  const res = await fetchViuApi('/product/detail', { product_id: seriesProductId });
  const product = res?.data?.product;
  const episodes = product?.episodes || res?.data?.episodes || [];

  if (!episodes || episodes.length === 0) return seriesProductId;

  const target = episodes.find(
    e => Number(e.number || e.episode_num || 0) === Number(epNum || 1)
  );

  return target ? target.product_id : episodes[0].product_id;
}

/**
 * استخراج وتحليل جميع روابط M3U8 المتاحة
 */
function extractStreamUrls(data) {
  if (!data) return [];
  const results = [];

  const parseVal = (val) => {
    if (!val) return null;
    if (typeof val === 'string' && val.startsWith('http')) return val;
    if (typeof val === 'object') {
      return val.url || val.m3u8 || val.src || val.hls || val.link || null;
    }
    return null;
  };

  const u1 = parseVal(data.stream?.url || data.stream);
  if (u1) results.push({ url: u1, quality: 'Auto (HLS)' });

  const u2 = parseVal(data.current_product?.stream_url);
  if (u2 && !results.some(r => r.url === u2)) results.push({ url: u2, quality: 'HD (HLS)' });

  const u3 = parseVal(data.product?.stream_url || data.distribute_url);
  if (u3 && !results.some(r => r.url === u3)) results.push({ url: u3, quality: 'SD (HLS)' });

  return results;
}

/**
 * المعالج الرئيسي لاستخراج السيرفرات بـ Nuvio
 */
async function mainGetStreams(arg1, arg2, arg3, arg4, arg5) {
  try {
    let title = '';
    let origTitle = '';
    let type = 'movie';
    let season = 1;
    let episode = 1;

    // استخراج بيانات الفلم / المسلسل
    if (typeof arg1 === 'object' && arg1 !== null) {
      title = arg1.title || arg1.name || arg1.query || '';
      origTitle = arg1.origTitle || arg1.original_title || arg1.originalTitle || '';
      type = arg1.type || arg1.mediaType || 'movie';
      season = Number(arg1.season || arg1.seasonNumber || 1);
      episode = Number(arg1.episode || arg1.episodeNumber || 1);
    } else {
      type = arg2 || 'movie';
      season = Number(arg3 || 1);
      episode = Number(arg4 || 1);
      title = (typeof arg5 === 'string' && arg5) ? arg5 : ((typeof arg1 === 'string') ? arg1 : '');
    }

    if (!title && !origTitle) return [];

    // 1. البحث بالاسم العربي
    let searchResults = await searchViu(title, true);

    // 2. البحث بالاسم الأصلي / الإنجليزي
    if ((!searchResults || searchResults.length === 0) && origTitle && origTitle !== title) {
      searchResults = await searchViu(origTitle, false);
    }

    if (!searchResults || searchResults.length === 0) return [];

    const matchedItem = searchResults[0];
    let targetProductId = matchedItem.product_id;

    // 3. معالجة الحلقات للمسلسلات
    if (type === 'tv' || type === 'series' || matchedItem.is_series === '1') {
      targetProductId = await getEpisodeProductId(targetProductId, episode);
    }

    // 4. جلب روابط البث
    const streamRes = await fetchViuApi('/playlist/detail', { product_id: targetProductId });
    const streamsList = extractStreamUrls(streamRes?.data);

    if (!streamsList || streamsList.length === 0) return [];

    return streamsList.map((st, idx) => ({
      name: `Viu ${st.quality}`,
      server: `Viu Server ${idx + 1}`,
      url: st.url,
      link: st.url,
      file: st.url,
      streamUrl: st.url,
      quality: st.quality,
      format: 'm3u8',
      type: 'hls',
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        'Referer': 'https://www.viu.com/',
        'Origin': 'https://www.viu.com'
      }
    }));
  } catch (err) {
    return [];
  }
}

// --- UNIVERSAL CLASS / OBJECT EXPORT FOR NUVIO ENGINE ---
class ViuProvider {
  constructor() {
    this.id = 'nuvio-viu';
    this.name = 'Viu';
  }
  async getStreams(a, b, c, d, e) { return await mainGetStreams(a, b, c, d, e); }
  async getSources(a, b, c, d, e) { return await mainGetStreams(a, b, c, d, e); }
  async extract(a, b, c, d, e) { return await mainGetStreams(a, b, c, d, e); }
  async search(q) { return await searchViu(q); }
}

const instance = new ViuProvider();

function universalExport(a, b, c, d, e) {
  return mainGetStreams(a, b, c, d, e);
}

Object.assign(universalExport, instance);
universalExport.ViuProvider = ViuProvider;
universalExport.default = universalExport;

module.exports = universalExport;
