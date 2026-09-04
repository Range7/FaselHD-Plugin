/**
 * 111477 Nuvio Provider
 * Self-contained, no external requires.
 * Extracts ALL 1080p streams with full metadata.
 */

var SERVICE_ORIGIN = 'https://st.111477.xyz';
var DEFAULT_HOST = 'https://a.111477.xyz/';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var HEADERS = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*'
};

// ── Base64 URL Encode (بدون Buffer/require) ────────────────────────────────
function base64UrlEncode(str) {
    if (typeof btoa === 'function') {
        return btoa(unescape(encodeURIComponent(str)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
    // fallback يدوي إذا btoa غير موجود
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var utf8 = unescape(encodeURIComponent(str));
    var output = '';
    for (var i = 0; i < utf8.length; i += 3) {
        var c1 = utf8.charCodeAt(i);
        var c2 = i + 1 < utf8.length ? utf8.charCodeAt(i + 1) : 0;
        var c3 = i + 2 < utf8.length ? utf8.charCodeAt(i + 2) : 0;
        var n = (c1 << 16) | (c2 << 8) | c3;
        output += chars.charAt((n >>> 18) & 63) + chars.charAt((n >>> 12) & 63);
        if (i + 1 < utf8.length) output += chars.charAt((n >>> 6) & 63);
        if (i + 2 < utf8.length) output += chars.charAt(n & 63);
    }
    return output.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── TMDB API Key ───────────────────────────────────────────────────────────
function getTmdbKey() {
    try {
        if (typeof globalThis !== 'undefined') {
            if (globalThis.TMDB_API_KEY) return globalThis.TMDB_API_KEY;
            if (globalThis.TMDB_KEY) return globalThis.TMDB_KEY;
        }
        if (typeof window !== 'undefined') {
            if (window.TMDB_API_KEY) return window.TMDB_API_KEY;
            if (window.TMDB_KEY) return window.TMDB_KEY;
        }
        var s = null;
        if (typeof globalThis !== 'undefined') s = globalThis.SCRAPER_SETTINGS || globalThis.SETTINGS;
        if (!s && typeof window !== 'undefined') s = window.SCRAPER_SETTINGS || window.SETTINGS;
        if (s && (s.tmdbKey || s.tmdb_key || s.apiKey || s.api_key)) {
            return s.tmdbKey || s.tmdb_key || s.apiKey || s.api_key;
        }
    } catch (e) {}
    // fallback pool
    var pool = [
        'ZjE1YWFmOWNmMDVmMTRlY2UzMDliNjhjYWQwMWNlMjU=',
        'NDM5YzQ3OGE3NzFmMzVjMDUwMjJmOWZlYWJjY2EwMWM='
    ];
    return b64decode(pool[Math.floor(Math.random() * pool.length)]);
}

function b64decode(str) {
    if (typeof atob === 'function') {
        try { return atob(str); } catch (e) {}
    }
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var output = '';
    str = String(str || '').replace(/=+$/, '');
    for (var bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
}

// ── Fetch JSON Helper ──────────────────────────────────────────────────────
function fetchJson(url, timeout) {
    var headers = {
        'User-Agent': UA,
        'Accept': 'application/json'
    };
    var options = { headers: headers, redirect: 'follow' };
    if (timeout && typeof AbortController !== 'undefined') {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeout);
        options.signal = controller.signal;
        return fetch(url, options)
            .then(function (r) {
                clearTimeout(timer);
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .catch(function (e) {
                clearTimeout(timer);
                throw e;
            });
    }
    return fetch(url, options)
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
}

// ── TMDB Meta Resolution (بديل resolveMeta) ────────────────────────────────
function resolveMeta(tmdbId, mediaType) {
    var apiKey = getTmdbKey();
    var isTv = mediaType === 'tv';
    var endpoint = isTv ? 'tv' : 'movie';
    var path = '/3/' + endpoint + '/' + tmdbId + '?api_key=' + apiKey + '&append_to_response=external_ids';
    var hosts = ['https://api.themoviedb.org', 'https://api.tmdb.org'];
    var idx = 0;

    function tryHost() {
        if (idx >= hosts.length) return Promise.resolve(null);
        var url = hosts[idx++] + path;
        return fetchJson(url, 8000)
            .then(function (data) {
                var imdbId = data && data.imdb_id;
                if (!imdbId && data && data.external_ids) imdbId = data.external_ids.imdb_id;
                var title = data && (data.name || data.title) || '';
                return {
                    imdbId: imdbId || '',
                    title: title,
                    year: data && (data.release_date || data.first_air_date || '').substring(0, 4)
                };
            })
            .catch(function () {
                return tryHost();
            });
    }
    return tryHost();
}

// ── Manifest Base URL ──────────────────────────────────────────────────────
function manifestBaseUrl(host, sort, limit) {
    host = host || DEFAULT_HOST;
    sort = sort || 'file-desc';
    limit = limit || 3;
    var config = host.trim();
    if (!config.endsWith('/')) config += '/';
    if (sort && sort !== 'none') config += '::sort=' + sort;
    if (limit > 0 && limit !== 5) config += '::limit=' + limit;
    return SERVICE_ORIGIN + '/config/' + base64UrlEncode(config);
}

// ── Quality Parser ─────────────────────────────────────────────────────────
function parseQuality(label) {
    var l = String(label || '').toUpperCase();
    if (l.indexOf('4K') !== -1 || l.indexOf('2160') !== -1) return '4K';
    if (l.indexOf('1080') !== -1 || l.indexOf('FHD') !== -1) return '1080p';
    if (l.indexOf('720') !== -1 || l.indexOf('HD') !== -1) return '720p';
    if (l.indexOf('480') !== -1) return '480p';
    return 'Unknown';
}

function qualityRank(q) {
    if (q === '4K') return 4;
    if (q === '1080p') return 3;
    if (q === '720p') return 2;
    if (q === '480p') return 1;
    return 0;
}

function dedupByUrl(list) {
    var seen = new Set();
    var out = [];
    for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (s && s.url && !seen.has(s.url)) {
            seen.add(s.url);
            out.push(s);
        }
    }
    return out;
}

function sortByQuality(list) {
    return list.sort(function (a, b) {
        return qualityRank(b.quality) - qualityRank(a.quality);
    });
}

// ── Main getStreams (Nuvio) ────────────────────────────────────────────────
async function getStreams(tmdbId, mediaType, season, episode) {
    var out = [];
    var seen = new Set();
    try {
        var isTv = mediaType === 'tv';
        var meta = await resolveMeta(tmdbId, mediaType);
        var ids = [];
        if (meta && meta.imdbId && meta.imdbId.startsWith('tt')) ids.push(meta.imdbId);
        ids.push('tmdb:' + tmdbId);

        var addonBase = manifestBaseUrl();

        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var ep = isTv
                ? addonBase + '/stream/series/' + id + ':' + (season || 1) + ':' + (episode || 1) + '.json'
                : addonBase + '/stream/movie/' + id + '.json';

            try {
                var res = await fetch(ep, { headers: HEADERS });
                if (!res.ok) continue;
                var data = await res.json();
                var streams = data && data.streams;
                if (!Array.isArray(streams)) continue;

                for (var j = 0; j < streams.length; j++) {
                    var it = streams[j];
                    var url = it && it.url;
                    if (!url || !String(url).startsWith('http') || seen.has(url)) continue;

                    var label = it.title || it.name || '111477';
                    var quality = parseQuality(label);

                    // فقط جودة 1080p
                    if (quality !== '1080p') continue;

                    seen.add(url);
                    out.push({
                        name: it.name || '111477',
                        title: label,
                        url: url,
                        quality: quality,
                        headers: HEADERS
                    });
                }
            } catch (e) {
                // تجاهل الخطأ وواصل
            }
        }
    } catch (e) {
        console.error('[111477] getStreams error:', e);
    }

    return sortByQuality(dedupByUrl(out));
}

// ── Export ─────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
} else if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
} else if (typeof window !== 'undefined') {
    window.getStreams = getStreams;
}
