const axios = require('axios');

const VIU_API_BASE = 'https://api.viu.com/ott/v1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Origin': 'https://www.viu.com',
  'Referer': 'https://www.viu.com/'
};

const COMMON_PARAMS = {
  platform_flag_label: 'web',
  area_id: '4',         // منطقة الشرق الأوسط
  language_flag_id: '3', // اللغة العربية
  app_ver: '2.0.0'
};

class ViuProvider {
  // 1. جلب المحتوى الرئيسي (Home / Catalog)
  async getCatalog(type = 'series', page = 1) {
    try {
      const categoryId = type === 'series' ? '1' : '2';
      const response = await axios.get(`${VIU_API_BASE}/all-products`, {
        params: {
          ...COMMON_PARAMS,
          category_id: categoryId,
          limit: 20,
          page: page
        },
        headers: HEADERS
      });

      const products = response.data?.data?.products || [];
      return products.map(item => ({
        id: item.product_id.toString(),
        title: item.title,
        poster: item.cover_image_url || item.image_url,
        type: type,
        description: item.synopsis || ''
      }));
    } catch (error) {
      console.error('Error fetching Viu catalog:', error.message);
      return [];
    }
  }

  // 2. البحث (Search)
  async search(query) {
    try {
      const response = await axios.get(`${VIU_API_BASE}/search`, {
        params: {
          ...COMMON_PARAMS,
          keyword: query,
          limit: 20
        },
        headers: HEADERS
      });

      const products = response.data?.data?.products || [];
      return products.map(item => ({
        id: item.product_id.toString(),
        title: item.title,
        poster: item.cover_image_url || item.image_url,
        type: item.is_series === '1' ? 'series' : 'movie'
      }));
    } catch (error) {
      console.error('Error searching Viu:', error.message);
      return [];
    }
  }

  // 3. جلب التفاصيل والمواسم/الحلقات (Details)
  async getDetails(productId) {
    try {
      const response = await axios.get(`${VIU_API_BASE}/product/detail`, {
        params: {
          ...COMMON_PARAMS,
          product_id: productId
        },
        headers: HEADERS
      });

      const data = response.data?.data?.product;
      if (!data) return null;

      return {
        id: data.product_id.toString(),
        title: data.title,
        poster: data.cover_image_url || data.image_url,
        description: data.synopsis || '',
        year: data.year || '',
        episodes: (data.episodes || []).map(ep => ({
          id: ep.product_id.toString(),
          title: ep.title || `الحلقة ${ep.number}`,
          episodeNumber: ep.number
        }))
      };
    } catch (error) {
      console.error('Error fetching details:', error.message);
      return null;
    }
  }

  // 4. استخراج روابط البث والـ Extractor (Streams / M3U8)
  async getStreams(productId) {
    try {
      const response = await axios.get(`${VIU_API_BASE}/playlist/detail`, {
        params: {
          ...COMMON_PARAMS,
          product_id: productId
        },
        headers: HEADERS
      });

      const streamData = response.data?.data;
      if (!streamData) return [];

      const streams = [];

      // رابط الـ HLS الرئيسي
      if (streamData.stream && streamData.stream.url) {
        streams.push({
          name: 'Viu HD (Auto M3U8)',
          url: streamData.stream.url,
          quality: 'auto',
          format: 'hls'
        });
      }

      return streams;
    } catch (error) {
      console.error('Error fetching stream links:', error.message);
      return [];
    }
  }
}

module.exports = new ViuProvider();
