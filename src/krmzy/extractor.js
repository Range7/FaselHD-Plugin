// src/krmzy/extractor.js

const BASE_URL = 'https://krmzi.net';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': `${BASE_URL}/`
};

// ----- جلب عنوان الفيلم من TMDB -----
async function getMediaTitle(tmdbId, type) {
    try {
        const mediaType = type === 'series' ? 'tv' : 'movie';
        const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=15d2850027b7744312013263e12089b3&language=ar-SA`;
        const response = await fetch(url);
        const data = await response.json();
        return data.title || data.name || data.original_title || data.original_name;
    } catch (e) {
        console.error('[Krmzy] فشل جلب العنوان من TMDB:', e.message);
        return null;
    }
}

// ----- استخراج التدفقات من الموقع -----
async function searchAndExtractStreams(tmdbId, type, season = 0, episode = 0) {
    try {
        // 1. جلب العنوان
        const title = await getMediaTitle(tmdbId, type);
        if (!title) {
            console.log('[Krmzy] لم يتم العثور على العنوان');
            return [];
        }

        // 2. بناء استعلام البحث
        let searchQuery = title;
        if (type === 'series' && season > 0 && episode > 0) {
            searchQuery += ` الموسم ${season} الحلقة ${episode}`;
        }

        console.log(`[Krmzy] البحث عن: ${searchQuery}`);

        // 3. البحث في الموقع
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(searchQuery)}`;
        const searchRes = await fetch(searchUrl, { headers: HEADERS });
        const html = await searchRes.text();

        // 4. استخراج رابط الصفحة الأولى
        const linkMatch = html.match(/href="(https?:\/\/[^"]*(?:post|movie|watch|video|series)[^"]*)"/i);
        if (!linkMatch) {
            console.log('[Krmzy] لم يتم العثور على رابط الصفحة');
            return [];
        }

        // 5. جلب الصفحة الداخلية
        const pageRes = await fetch(linkMatch[1], { headers: HEADERS });
        const pageHtml = await pageRes.text();

        // 6. استخراج جميع iframes
        const streams = [];
        const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        let match;
        let index = 1;

        while ((match = iframeRegex.exec(pageHtml)) !== null) {
            let src = match[1];
            if (src.startsWith('//')) src = 'https:' + src;

            streams.push({
                name: 'Krmzy Arabic',
                title: `سيرفر ${index++} (1080p)`,
                url: src,
                quality: '1080p',
                headers: HEADERS,
                provider: 'krmzy'
            });
        }

        console.log(`[Krmzy] تم العثور على ${streams.length} تدفق`);
        return streams;

    } catch (error) {
        console.error('[Krmzy] خطأ في الاستخراج:', error.message);
        return [];
    }
}

export { searchAndExtractStreams, getMediaTitle };
