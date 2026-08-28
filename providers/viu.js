const axios = require('axios');

class ViuProvider {
  constructor() {
    this.id = 'nuvio-viu';
    this.name = 'Viu';
    this.baseUrl = 'https://www.viu.com';
    this.apiUrl = 'https://api.viu.com/ott/v1';
    
    // Headers المعتمدة من Viu API في Cloudstream
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Origin': 'https://www.viu.com',
      'Referer': 'https://www.viu.com/',
      'Accept': 'application/json, text/plain, */*'
    };

    // الإعدادات الخاصة بمنطقة الشرق الأوسط (MEA - Arabic)
    this.defaultParams = {
      platform_flag_label: 'web',
      area_id: '4',         // كود المنطقة العربية
      language_flag_id: '3', // اللغة العربية
      app_ver: '2.0.0'
    };
  }

  /**
   * الدالة الرئيسية المطلوبة في Nuvio لاستخراج السيرفرات وروابط المشاهدة
   * @param {Object} mediaInfo - تحتوي على بيانات العنوان، النوع، الموسم والحلقة
   */
  async getStream(mediaInfo) {
    try {
      const { title, year, season, episode, type } = mediaInfo;
      const cleanTitle = this.cleanSearchQuery(title);

      // 1. البحث عن المحتوى في Viu
      const searchResults = await this.searchViu(cleanTitle);
      if (!searchResults || searchResults.length === 0) {
        console.log(`[Viu] لم يتم العثور على نتائج للعنوان: ${cleanTitle}`);
        return [];
      }

      // اختيار أفضل نتيجة مطابقة
      const targetItem = searchResults[0];
      let targetProductId = targetItem.product_id;

      // 2. إذا كان نوع المحتوى مسلسل، نقوم بجلب قائمة الحلقات واختيار الحلقة المطلوبة
      if (type === 'tv' || type === 'series' || targetItem.is_series === '1') {
        const episodeProductId = await this.getEpisodeProductId(targetProductId, episode);
        if (episodeProductId) {
          targetProductId = episodeProductId;
        }
      }

      // 3. استخراج روابط M3U8 للبث
      const streams = await this.extractStreams(targetProductId);
      return streams;

    } catch (error) {
      console.error('[Viu Provider Error]:', error.message);
      return [];
    }
  }

  /**
   * البحث عن فيلم أو مسلسل عبر API Viu
   */
  async searchViu(query) {
    try {
      const response = await axios.get(`${this.apiUrl}/search`, {
        params: {
          ...this.defaultParams,
          keyword: query,
          limit: 10
        },
        headers: this.headers
      });

      return response.data?.data?.products || [];
    } catch (err) {
      console.error('[Viu Search Error]:', err.message);
      return [];
    }
  }

  /**
   * جلب ID الحلقة المطلوبة داخل المسلسل
   */
  async getEpisodeProductId(seriesProductId, episodeNumber) {
    try {
      const response = await axios.get(`${this.apiUrl}/product/detail`, {
        params: {
          ...this.defaultParams,
          product_id: seriesProductId
        },
        headers: this.headers
      });

      const episodes = response.data?.data?.product?.episodes || [];
      if (episodes.length === 0) return seriesProductId;

      // البحث عن رقم الحلقة المطابق
      const targetEp = episodes.find(ep => parseInt(ep.number || ep.episode_num) === parseInt(episodeNumber));
      return targetEp ? targetEp.product_id : episodes[0].product_id;

    } catch (err) {
      console.error('[Viu Episode Fetch Error]:', err.message);
      return seriesProductId;
    }
  }

  /**
   * استخراج روابط التشغيل M3U8 والجودات
   */
  async extractStreams(productId) {
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

      const streams = [];

      // استخراج رابط البث المباشر (HLS / M3U8)
      const streamUrl = data.stream?.url || data.current_product?.stream_url;

      if (streamUrl) {
        streams.push({
          server: 'Viu Official',
          name: 'Viu Auto Quality (M3U8)',
          url: streamUrl,
          quality: 'auto',
          format: 'm3u8',
          headers: {
            'User-Agent': this.headers['User-Agent'],
            'Referer': this.headers['Referer'],
            'Origin': this.headers['Origin']
          }
        });
      }

      return streams;

    } catch (err) {
      console.error('[Viu Stream Extraction Error]:', err.message);
      return [];
    }
  }

  /**
   * تنظيف نص البحث من الرموز الزائدة لضمان دقة البحث
   */
  cleanSearchQuery(query) {
    if (!query) return '';
    return query
      .replace(/[\(\)\[\]]/g, '')
      .replace(/Season \d+/i, '')
      .replace(/الموسم \d+/g, '')
      .trim();
  }
}

module.exports = new ViuProvider();
