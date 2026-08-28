const axios = require('axios');

class ViuProvider {
  constructor() {
    this.id = 'nuvio-viu';
    this.name = 'Viu';
    this.baseUrl = 'https://www.viu.com';
    this.apiUrl = 'https://api.viu.com/ott/v1';

    // Headers المعتمدة في Cloudstream للالتفاف على الحظر
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Origin': 'https://www.viu.com',
      'Referer': 'https://www.viu.com/',
      'Accept': 'application/json, text/plain, */*'
    };

    // Parms الشرق الأوسط المأخوذة من كود re-3arabi
    this.defaultParams = {
      platform_flag_label: 'web',
      area_id: '4',         // المنطقة العربية
      language_flag_id: '3', // اللغة العربية
      app_ver: '2.0.0'
    };
  }

  // 1. الدالة الأساسية المطلوبة في Nuvio لجلب السيرفرات
  async getStreams(mediaInfo) {
    try {
      const { title, origTitle, type, season, episode } = mediaInfo;

      // البحث أولاً بالاسم الأصلي أو العربي
      let searchResults = await this.searchViu(title);
      if ((!searchResults || searchResults.length === 0) && origTitle) {
        searchResults = await this.searchViu(origTitle);
      }

      if (!searchResults || searchResults.length === 0) {
        return [];
      }

      // اختيار النتيجة الأولى الأكثر مطابقة
      const targetItem = searchResults[0];
      let targetProductId = targetItem.product_id;

      // إذا كان مسلسلاً، نبحث عن الحلقة المطلوبة لاستخراج الـ product_id الخاص بها
      if (type === 'tv' || type === 'series' || targetItem.is_series === '1') {
        const epProductId = await this.getEpisodeProductId(targetProductId, episode || 1);
        if (epProductId) {
          targetProductId = epProductId;
        }
      }

      // استخراج روابط M3U8
      return await this.extractStreams(targetProductId);
    } catch (error) {
      console.error('[Viu Plugin Error]:', error?.message || error);
      return [];
    }
  }

  // 2. البحث في API Viu
  async searchViu(query) {
    if (!query) return [];
    try {
      const cleanQuery = query.replace(/Season \d+/i, '').replace(/الموسم \d+/g, '').trim();
      
      const response = await axios.get(`${this.apiUrl}/search`, {
        params: {
          ...this.defaultParams,
          keyword: cleanQuery,
          limit: 10
        },
        headers: this.headers,
        timeout: 8000
      });

      return response.data?.data?.products || [];
    } catch (err) {
      return [];
    }
  }

  // 3. مطابقة الحلقة واستخراج product_id الخاص بها
  async getEpisodeProductId(seriesProductId, episodeNum) {
    try {
      const response = await axios.get(`${this.apiUrl}/product/detail`, {
        params: {
          ...this.defaultParams,
          product_id: seriesProductId
        },
        headers: this.headers,
        timeout: 8000
      });

      const episodes = response.data?.data?.product?.episodes || [];
      if (!episodes || episodes.length === 0) return seriesProductId;

      const matchedEp = episodes.find(ep => parseInt(ep.number || ep.episode_num) === parseInt(episodeNum));
      return matchedEp ? matchedEp.product_id : episodes[0].product_id;
    } catch (err) {
      return seriesProductId;
    }
  }

  // 4. استخراج رابط التشغيل النهائي (M3U8) بنفس طريقة Cloudstream
  async extractStreams(productId) {
    try {
      const response = await axios.get(`${this.apiUrl}/playlist/detail`, {
        params: {
          ...this.defaultParams,
          product_id: productId
        },
        headers: this.headers,
        timeout: 8000
      });

      const data = response.data?.data;
      if (!data) return [];

      // فحص كفاءة متعدد الأماكن لرابط الـ HLS لمنع الكراش
      const streamUrl = 
        data.stream?.url || 
        data.current_product?.stream_url || 
        data.product?.stream_url || 
        data.distribute_url;

      if (!streamUrl) return [];

      return [{
        name: 'Viu Official Server',
        quality: 'Auto (HLS)',
        url: streamUrl,
        format: 'm3u8',
        headers: {
          'User-Agent': this.headers['User-Agent'],
          'Referer': 'https://www.viu.com/',
          'Origin': 'https://www.viu.com'
        }
      }];
    } catch (err) {
      return [];
    }
  }
}

module.exports = new ViuProvider();
