/**
 * 111477 Nuvio Provider
 * Self-contained + Promise-based (no async/await)
 * Extracts 1080p streams with flexible quality detection
 */

var SERVICE_ORIGIN = 'https://st.111477.xyz';
var DEFAULT_HOST = 'https://a.111477.xyz/';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var HEADERS = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*'
};

function base64UrlEncode(str) {
    try {
        if (typeof btoa === 'function') {
            return btoa(unescape(encodeURIComponent(str)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
        }
    } catch (e) {}
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
    var pool = [
        'ZjE1YWFmOWNmMDVmMTRlY2UzMDliNjhjYWQwMWNlMjU=',
        'NDM5YzQ3OGE3NzFmMzVjMDUwMjJmOWZlYWJjY2EwMWM='
    ];
    return b64decode(pool[Math.floor(Math.random() * pool.length)]);
}

function fetchJson(url, timeout) {
    var options = {
        headers: HEADERS,
        redirect: 'follow'
    };
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
                return {
                    imdbId: imdbId || '',
                    title: data && (data.name || data.title) || '',
                    year: data && (data.release_date || data.first_air_date || '').substring(0, 4)
                };
            })
            .catch(function () {
                return tryHost();
            });
    }
    return tryHost();
}

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

function parseQuality(label) {
    var l = String(label || '').toUpperCase();
    if (l.indexOf('4K') !== -1 || l.indexOf('2160') !== -1) return '4K';
    if (l.indexOf('1080') !== -1 || l.indexOf('FHD') !== -1 || l.indexOf('FULL HD') !== -1) return '1080p';
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
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (s && s.url && !seen[s.url]) {
            seen[s.url] = true;
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

// ── Main getStreams ────────────────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
    return resolveMeta(tmdbId, mediaType)
        .then(function (meta) {
            var ids = [];
            if (meta && meta.imdbId && meta.imdbId.indexOf('tt') === 0) ids.push(meta.imdbId);
            ids.push('tmdb:' + tmdbId);

            var addonBase = manifestBaseUrl();
            var promises = [];

            for (var i = 0; i < ids.length; i++) {
                var id = ids[i];
                var ep = mediaType === 'tv'
                    ? addonBase + '/stream/series/' + id + ':' + (season || 1) + ':' + (episode || 1) + '.json'
                    : addonBase + '/stream/movie/' + id + '.json';

                var p = fetch(ep, { headers: HEADERS })
                    .then(function (res) {
                        if (!res.ok) return [];
                        return res.json();
                    })
                    .then(function (data) {
                        var streams = data && data.streams;
                        return Array.isArray(streams) ? streams : [];
                    })
                    .catch(function () {
                        return [];
                    });

                promises.push(p);
            }

            return Promise.all(promises)
                .then(function (groups) {
                    var out = [];
                    var seen = {};
                    for (var g = 0; g < groups.length; g++) {
                        var streams = groups[g];
                        for (var j = 0; j < streams.length; j++) {
                            var it = streams[j];
                            var url = it && it.url;
                            if (!url || String(url).indexOf('http') !== 0 || seen[url]) continue;

                            var label = it.title || it.name || '111477';
                            var quality = parseQuality(label);
                            var lowerLabel = label.toLowerCase();

                            var is1080 = lowerLabel.indexOf('1080') !== -1 || lowerLabel.indexOf('fhd') !== -1 || lowerLabel.indexOf('full hd') !== -1;
                            var isLower = lowerLabel.indexOf('720') !== -1 || lowerLabel.indexOf('480') !== -1 || lowerLabel.indexOf('360') !== -1 || lowerLabel.indexOf('4k') !== -1 || lowerLabel.indexOf('2160') !== -1;

                            // نسمح إذا كان 1080/FHD أو غير معروف (بدون مؤشر جودة أقل)
                            if (!is1080 && isLower) continue;

                            // إذا غير معروف، نعتبرها 1080p للتوافق
                            if (quality === 'Unknown') quality = '1080p';

                            seen[url] = true;
                            out.push({
                                name: it.name || '111477',
                                title: label,
                                url: url,
                                quality: quality,
                                headers: HEADERS
                            });
                        }
                    }
                    return sortByQuality(dedupByUrl(out));
                });
        })
        .catch(function (e) {
            console.error('[111477] getStreams error:', e);
            return [];
        });
}

// ── Export ─────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
} else if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
} else if (typeof window !== 'undefined') {
    window.getStreams = getStreams;
}
