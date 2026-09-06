/**
 * Knaben Nuvio Provider
 * Torrent search aggregator — scrapes knaben.org for magnet links
 * Supports movies & series with title matching, season/episode filtering
 */

var BASE_URL = "https://knaben.org";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

/**
 * Parse torrent title to extract season/episode info
 * Handles patterns like: S01E05, Season 1 Episode 5, 1x05, etc.
 */
function parseTorrentTitle(title) {
    var result = { title: "", season: null, episode: null, year: null };
    if (!title) return result;

    // Extract year
    var yearMatch = title.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) result.year = parseInt(yearMatch[1], 10);

    // Extract season/episode: S01E05, S1E5, Season 1 Episode 5, 1x05
    var seMatch = title.match(/\b[Ss](\d{1,2})[Ee](\d{1,2})\b/);
    if (!seMatch) seMatch = title.match(/\bSeason\s*(\d{1,2}).*?Episode\s*(\d{1,2})\b/i);
    if (!seMatch) seMatch = title.match(/\b(\d{1,2})x(\d{2})\b/);
    if (seMatch) {
        result.season = parseInt(seMatch[1], 10);
        result.episode = parseInt(seMatch[2], 10);
    }

    // Extract clean title (remove season/episode/year patterns)
    var clean = title
        .replace(/\.[Ss]\d{1,2}[Ee]\d{1,2}\./gi, " ")
        .replace(/\b[Ss]\d{1,2}[Ee]\d{1,2}\b/gi, " ")
        .replace(/\bSeason\s*\d+.*?Episode\s*\d+\b/gi, " ")
        .replace(/\b\d{1,2}x\d{2}\b/g, " ")
        .replace(/\b(19|20)\d{2}\b/g, " ")
        .replace(/\.(mkv|mp4|avi|wmv|mov|flv|webm|m4v|ts|m2ts)\b/gi, " ")
        .replace(/\.(1080p|720p|480p|2160p|4K|HDR|HEVC|x264|x265|BluRay|WEB-DL|WEBRip|BRRip|DVDRip|HDTV|AMZN|NF|DSNP)\b/gi, " ")
        .replace(/\./g, " ")
        .replace(/\s+/g, " ")
        .trim();

    result.title = clean;
    return result;
}

/**
 * Normalize string for comparison (lowercase, alphanumeric only)
 */
function normalize(str) {
    return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Extract infoHash from magnet URI
 */
function extractInfoHash(magnet) {
    var match = /urn:btih:([a-fA-F0-9]{40})/i.exec(magnet);
    return match ? match[1].toUpperCase() : null;
}

/**
 * Extract trackers from magnet URI
 */
function extractTrackers(magnet) {
    var trackers = [];
    var matches = magnet.match(/&tr=([^&]+)/g);
    if (matches) {
        for (var i = 0; i < matches.length; i++) {
            var decoded = decodeURIComponent(matches[i].substring(4));
            trackers.push(decoded);
        }
    }
    return trackers;
}

/**
 * Parse size string to MB for sorting
 */
function parseSizeMB(sizeStr) {
    if (!sizeStr) return 0;
    var m = sizeStr.match(/([\d.]+)\s*(TB|GB|MB|KB)/i);
    if (!m) return 0;
    var val = parseFloat(m[1]);
    var unit = m[2].toUpperCase();
    if (unit === "TB") return val * 1024 * 1024;
    if (unit === "GB") return val * 1024;
    if (unit === "MB") return val;
    if (unit === "KB") return val / 1024;
    return val;
}

/**
 * Decode HTML entities
 */
function decodeEntities(str) {
    if (!str) return "";
    var map = {
        "&nbsp;": " ", "&amp;": "&", "&quot;": "\"", "&lt;": "<",
        "&gt;": ">", "&#038;": "&", "&#39;": "'", "&apos;": "'"
    };
    return str.replace(/&(nbsp|amp|quot|lt|gt|#038|#39|apos);/g, function(m) {
        return map[m] || m;
    }).replace(/&#(\d+);/g, function(m, dec) {
        return String.fromCharCode(parseInt(dec, 10));
    });
}

/**
 * Fetch text from URL
 */
function fetchText(url, extraHeaders) {
    var headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive"
    };
    if (extraHeaders) {
        for (var k in extraHeaders) {
            if (Object.prototype.hasOwnProperty.call(extraHeaders, k)) {
                headers[k] = extraHeaders[k];
            }
        }
    }
    return fetch(url, { headers: headers, redirect: "follow" }).then(function(r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
    });
}

/**
 * Main entry point — Nuvio calls this
 */
function getStreams(tmdbId, mediaType, season, episode) {
    var type = (mediaType === "tv" || mediaType === "series") ? "tv" : "movie";
    var sea = parseInt(season, 10) || 1;
    var ep = parseInt(episode, 10) || 1;

    console.log("[Knaben] " + type + " tmdbId=" + tmdbId + (type === "tv" ? " S" + sea + "E" + ep : ""));

    // Step 1: Get title from TMDB
    return getTmdbTitle(tmdbId, type).then(function(tmdbInfo) {
        if (!tmdbInfo || !tmdbInfo.title) {
            console.log("[Knaben] TMDB title not found");
            return [];
        }
        console.log("[Knaben] TMDB title: " + tmdbInfo.title + " (" + (tmdbInfo.year || "N/A") + ")");

        // Step 2: Search Knaben
        return searchKnaben(tmdbInfo.title, tmdbInfo.year, type, sea, ep);
    }).catch(function(e) {
        console.log("[Knaben] Error: " + e.message);
        return [];
    });
}

/**
 * Get title & year from TMDB
 */
function getTmdbTitle(tmdbId, type) {
    var cleanId = String(tmdbId || "").replace(/^(?:tmdb|imdb):/i, "").trim();
    var isImdb = /^tt\d+/.test(cleanId);

    var tmdbKey = getTmdbKey();
    var endpoint = type === "tv" ? "tv" : "movie";
    var url;

    if (isImdb) {
        url = "https://api.themoviedb.org/3/find/" + cleanId + "?api_key=" + tmdbKey + "&external_source=imdb_id";
    } else {
        url = "https://api.themoviedb.org/3/" + endpoint + "/" + cleanId + "?api_key=" + tmdbKey;
    }

    return fetch(url, {
        headers: { "User-Agent": UA, "Accept": "application/json" }
    }).then(function(r) {
        if (!r.ok) throw new Error("TMDB " + r.status);
        return r.json();
    }).then(function(data) {
        var item = data;
        if (isImdb) {
            var results = type === "tv" ? (data.tv_results || []) : (data.movie_results || []);
            if (!results.length) results = (data.movie_results || []).concat(data.tv_results || []);
            item = results[0] || {};
        }
        var title = item.title || item.name || "";
        var year = "";
        var rawDate = item.release_date || item.first_air_date || "";
        if (rawDate) year = rawDate.substring(0, 4);
        return { title: title, year: year };
    });
}

/**
 * Get TMDB API key (same pattern as other providers)
 */
function getTmdbKey() {
    try {
        if (typeof globalThis !== "undefined") {
            if (globalThis.TMDB_API_KEY) return globalThis.TMDB_API_KEY;
            if (globalThis.TMDB_KEY) return globalThis.TMDB_KEY;
        }
        if (typeof window !== "undefined") {
            if (window.TMDB_API_KEY) return window.TMDB_API_KEY;
            if (window.TMDB_KEY) return window.TMDB_KEY;
        }
        var s = null;
        if (typeof globalThis !== "undefined") s = globalThis.SCRAPER_SETTINGS || globalThis.SETTINGS;
        if (!s && typeof window !== "undefined") s = window.SCRAPER_SETTINGS || window.SETTINGS;
        if (s && (s.tmdbKey || s.tmdb_key || s.apiKey || s.api_key)) {
            return s.tmdbKey || s.tmdb_key || s.apiKey || s.api_key;
        }
    } catch(e) {}
    var pool = [
        "ZjE1YWFmOWNmMDVmMTRlY2UzMDliNjhjYWQwMWNlMjU=",
        "NDM5YzQ3OGE3NzFmMzVjMDUwMjJmOWZlYWJjY2EwMWM="
    ];
    return b64decode(pool[Math.floor(Math.random() * pool.length)]);
}

/**
 * Base64 decode
 */
function b64decode(str) {
    if (typeof atob === "function") {
        try { return atob(str); } catch(e) {}
    }
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var output = "";
    str = String(str || "").replace(/=+$/, "");
    for (var bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
}

/**
 * Search Knaben.org and parse results
 */
function searchKnaben(title, year, type, season, episode) {
    var query = title.trim();
    if (type === "movie" && year) {
        query += " " + year;
    } else if (type === "tv" && season) {
        var s = season < 10 ? "0" + season : "" + season;
        query += " S" + s;
    }

    var encodedQuery = encodeURIComponent(query);
    var searchUrl = BASE_URL + "/search/" + encodedQuery + "/0/1/seeders";

    console.log("[Knaben] Searching: " + searchUrl);

    return fetchText(searchUrl).then(function(html) {
        return parseResults(html, title, type, season, episode);
    });
}

/**
 * Parse HTML results from Knaben
 */
function parseResults(html, searchTitle, type, season, episode) {
    var streams = [];
    var seenHashes = {};
    var searchNorm = normalize(searchTitle);

    if (!html) return streams;

    // Find table rows
    var tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) {
        console.log("[Knaben] No tbody found in response");
        return streams;
    }
    var tbody = tbodyMatch[1];

    // Extract rows
    var rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    var rowMatch;
    var rowCount = 0;

    while ((rowMatch = rowRegex.exec(tbody)) !== null) {
        rowCount++;
        var row = rowMatch[1];

        // Extract title from .text-wrap.w-100 > a
        var titleMatch = row.match(/<a[^>]*class=["'][^"']*text-wrap[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ||
                         row.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
        var torrentName = "";
        if (titleMatch) {
            torrentName = decodeEntities(titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
        }
        if (!torrentName) continue;

        // Extract magnet link
        var magnetMatch = row.match(/href=["'](magnet:[^"']+)["']/i);
        var magnetUrl = magnetMatch ? magnetMatch[1] : "";
        if (!magnetUrl) continue;

        // Extract infoHash
        var infoHash = extractInfoHash(magnetUrl);
        if (!infoHash) continue;
        if (seenHashes[infoHash]) continue;
        seenHashes[infoHash] = true;

        // Extract size (3rd td)
        var sizeMatch = row.match(/<td[^>]*>(?:\s*<[^>]+>)*\s*([\d.]+\s*[KMGT]B)\s*(?:<\/[^>]+>)*\s*<\/td>/gi);
        var size = "";
        // Try to find size in the row more specifically
        var sizeRegex = /([\d.]+\s*[KMGT]B)/i;
        var sizeFound = sizeRegex.exec(row);
        if (sizeFound) size = sizeFound[1];

        // Extract seeders (5th td typically)
        var seedersMatch = row.match(/<td[^>]*>(?:\s*<[^>]+>)*\s*(\d{1,6}(?:,\d{3})*)\s*(?:<\/[^>]+>)*\s*<\/td>/gi);
        var seeders = 0;
        // Look for numbers that look like seeders (not size)
        var numMatches = row.match(/>(\d{1,6}(?:,\d{3})*)</g);
        if (numMatches) {
            for (var n = 0; n < numMatches.length; n++) {
                var num = parseInt(numMatches[n].replace(/[><,]/g, ""), 10);
                if (num > seeders) seeders = num;
            }
        }

        // Parse torrent title for filtering
        var parsed = parseTorrentTitle(torrentName);
        var parsedTitleNorm = normalize(parsed.title);

        // Title matching — must match the search title
        if (parsedTitleNorm !== searchNorm && parsedTitleNorm.indexOf(searchNorm) === -1 && searchNorm.indexOf(parsedTitleNorm) === -1) {
            // Try fuzzy: at least 60% of words match
            var searchWords = searchTitle.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 2; });
            var parsedWords = (parsed.title || "").toLowerCase().split(/\s+/).filter(function(w) { return w.length > 2; });
            var matchedWords = 0;
            for (var w = 0; w < searchWords.length; w++) {
                for (var p = 0; p < parsedWords.length; p++) {
                    if (parsedWords[p].indexOf(searchWords[w]) !== -1 || searchWords[w].indexOf(parsedWords[p]) !== -1) {
                        matchedWords++;
                        break;
                    }
                }
            }
            if (matchedWords / Math.max(searchWords.length, 1) < 0.5) {
                continue;
            }
        }

        // Series filtering
        if (type === "tv") {
            var parsedSeason = parsed.season;
            var parsedEpisode = parsed.episode;

            // Must match season
            if (season && parsedSeason !== null && parsedSeason !== season) {
                continue;
            }
            // If episode specified, must match OR it's a season pack (no episode)
            if (episode && parsedEpisode !== null && parsedEpisode !== episode) {
                continue;
            }
        }

        // Extract trackers
        var trackers = extractTrackers(magnetUrl);

        // Build stream object
        var streamTitle = torrentName + "\n" + (size || "Unknown size") + " 👥 " + seeders + " seeders";
        var name = "Knaben" + (size ? " • " + size : "") + (seeders ? " • " + seeders + " seeders" : "");

        streams.push({
            name: name,
            title: streamTitle,
            url: magnetUrl,
            infoHash: infoHash,
            quality: "Unknown",
            size: size,
            seeders: seeders,
            sources: trackers.length > 0 ? trackers : null,
            headers: {}
        });
    }

    console.log("[Knaben] Parsed " + rowCount + " rows, found " + streams.length + " valid torrents");

    // Sort by seeders (descending)
    streams.sort(function(a, b) {
        return (b.seeders || 0) - (a.seeders || 0);
    });

    return streams;
}

/**
 * Settings hook — Nuvio calls this to get provider settings
 */
function onSettings() {
    return [];
}

// ── Export ────────────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams, onSettings: onSettings };
} else if (typeof globalThis !== "undefined") {
    globalThis.getStreams = getStreams;
    globalThis.onSettings = onSettings;
} else if (typeof window !== "undefined") {
    window.getStreams = getStreams;
    window.onSettings = onSettings;
}
