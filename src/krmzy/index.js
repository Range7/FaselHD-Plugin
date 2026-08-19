// src/krmzy/index.js

import { searchAndExtractStreams } from './extractor.js';

/**
 * الدالة الأساسية التي يناديها Nuvio
 * @param {string} tmdbId - معرف TMDB (مثل "tt1234567")
 * @param {string} mediaType - "movie" أو "tv"
 * @param {number} season - رقم الموسم (للمسلسلات)
 * @param {number} episode - رقم الحلقة (للمسلسلات)
 * @returns {Promise<Array>} قائمة التدفقات
 */
async function getStreams(tmdbId, mediaType, season = 0, episode = 0) {
    console.log(`[Krmzy] جلب تدفقات لـ ${tmdbId}, النوع: ${mediaType}`);

    // تحويل نوع الوسائط إلى الصيغة التي تستخدمها krmzi
    const type = mediaType === 'tv' ? 'series' : 'movie';
    
    // استدعاء دالة الاستخراج الرئيسية
    const streams = await searchAndExtractStreams(tmdbId, type, season, episode);
    
    return streams;
}

// التصدير المطلوب من Nuvio
module.exports = { getStreams };
