// providers/viu.js - Aligned with Range7/FaselHD-Plugin Architecture

const axios = require('axios');

class ViuProvider {
  constructor() {
    this.id = 'nuvio-viu';
    this.name = 'Viu';
    this.baseUrl = 'https://www.viu.com';
    this.apiUrl = 'https://api.viu.com/ott/v1';

    // Headers المعتمدة لمنع الحظر
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Origin': 'https://www.viu.com',
      'Referer': 'https://www.viu.com/',
      'Accept': 'application/json, text/plain, */*'
    };

    // إعدادات API Viu للشرق الأوسط المأخوذة من مستودع Cloudstream
    this.defaultParams = {
      platform_flag_label: 'web',
      area_id: '4',         // المنطقة العربية
      language_flag_id: '3', // اللغة العربية
      app_ver: '2.0.0'
    };
  }

  /**
   * 1. دالة البحث (Search) - مثل هيكلية FaselHD
   */
  async search(query) {
    try {
      const cleanQ = this.cleanQuery(query);
      if (!cleanQ) return [];

      const response = await axios.get(`${this.apiUrl}/search`, {
        params: {
          ...this.defaultParams,
          keyword: cleanQ,
          limit: 15
        },
        headers: this.headers
      });

      const products = response.data?.data?.products || [];
      return products.map(item => ({
        id: item.product_id.toString(),
        title: item.title,
        poster: item.cover_image_url || item.image_url,
        type: item.is_series === '1' ? 'tv' : 'movie',
        description: item.synopsis || ''
      }));
    } catch (error) {
      console.error('[Viu Search Error]:', error.message);
      return [];
    }
  }

  /**
   * 2. دالة جلب التفاصيل والحلقات (Get Details) - مثل هيكلية FaselHD
   */
  async getDetails(productId) {
    try {
      const response = await axios.get(`${this.apiUrl}/product/detail`, {
        params: {
          ...this.defaultParams,
          product_id: productId
        },
        headers: this.headers
      });

      const product = response.data?.data?.product;
      if (!product) return null;

      const isSeries = product.is_series === '1' || (product.episodes && product.episodes.length > 0);

      return {
        id: product.product_id.toString(),
        title: product.title,
        poster: product.cover_image_url || product.image_url,
        description: product.synopsis || '',
        type: isSeries ? 'tv' : 'movie',
        episodes: (product.episodes || []).map(ep => ({
          id: ep.product_id.toString(),
          title: ep.title || `الحلقة ${ep.number}`,
          episodeNumber: parseInt(ep.number || ep.episode_num || 1),
          poster: ep.cover_image_url || ep.image_url
        }))
      };
    } catch (error) {
      console.error('[Viu Details Error]:', error.message);
      return null;
    }
  }

  /**
   * 3. دالة جلب السيرفرات (Get Streams) - المستدعاة رئيسياً في Nuvio
   */
  async getStreams(mediaInfo) {
    try {
      let title = '';
      let type = 'movie';
      let episodeNum = 1;

      if (typeof mediaInfo === 'object') {
        title = mediaInfo.title || mediaInfo.name || mediaInfo.origTitle || '';
        type = mediaInfo.type || mediaInfo.mediaType || 'movie';
        episodeNum = mediaInfo.episode || mediaInfo.episodeNumber || 1;
      } else {
        title = mediaInfo;
      }

      // البحث عن المحتوى بـ API Viu
      const searchResults = await this.search(title);
      if (!searchResults || searchResults.length === 0) return [];

      const target = searchResults[0];
      let targetProductId = target.id;

      // إذا كان مسلسلاً، نصل للحلقة المطلوبة
      if (type === 'tv' || target.type === 'tv') {
        const details = await this.getDetails(targetProductId);
        if (details && details.episodes && details.episodes.length > 0) {
          const matchedEp = details.episodes.find(ep => ep.episodeNumber === parseInt(episodeNum));
          if (matchedEp) {
            targetProductId = matchedEp.id;
          } else {
            targetProductId = details.episodes[0].id;
          }
        }
      }

      // استخراج روابط السيرفرات
      return await this.extractServers(targetProductId);
    } catch (error) {
      console.error('[Viu Streams Error]:', error.message);
      return [];
    }
  }

  /**
   * 4. دالة استخراج روابط المشاهدة (Extractors)
   */
  async extractServers(productId) {
    try {
      const response = await axios.get(`${this.apiUrl}/playlist/detail`, {
        params: {
          ...this.defaultParams,
          product_id: productId
        },
        headers: this.headers
      });

      const data = response.data?.data;
      if (!data) return [];

      const streamUrl =
        data.stream?.url ||
        data.current_product?.stream_url ||
        data.product?.stream_url ||
        data.distribute_url;

      if (!streamUrl) return [];

      // مصفوفة السيرفرات بتنسيق Range7/FaselHD
      return [
        {
          server: 'Viu Official Server',
          quality: 'Auto',
          url: streamUrl,
          type: 'm3u8',
          format: 'hls',
          headers: {
            'User-Agent': this.headers['User-Agent'],
            'Referer': 'https://www.viu.com/',
            'Origin': 'https://www.viu.com'
          }
        }
      ];
    } catch (error) {
      console.error('[Viu Extract Error]:', error.message);
      return [];
    }
  }

  cleanQuery(query) {
    if (!query) return '';
    return query
      .replace(/[\(\)\[\]]/g, '')
      .replace(/season\s*\d+/gi, '')
      .replace(/الموسم\s*\d+/gi, '')
      .replace(/حلقة\s*\d+/gi, '')
      .trim();
  }
}

module.exports = new ViuProvider();
