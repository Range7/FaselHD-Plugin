/**
 * Knaben Nuvio Provider v2 — Rich Metadata + 4K/1080p Filter + Size Sort
 * Torrent search aggregator — scrapes knaben.org for magnet links
 * Supports movies & series with title matching, season/episode filtering
 * Displays rich metadata like 111477 provider (language, source, codec, audio, HDR, DV, host, bitrate, fps)
 * Filters: 4K/2160p & 1080p ONLY
 * Sort: 4K largest first → 1080p largest first
 */

var BASE_URL = "https://knaben.org";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

// ═════════════════════════════════════════════════════════════════════════════
// AUDIO / CODEC / SOURCE TABLES
// ═════════════════════════════════════════════════════════════════════════════

var AUDIO_TABLE = [
    [/ddp.?51.*truehd.*71|truehd.*71.*ddp.?51/i, "DDP 5.1 + TrueHD 7.1"],
    [/ddp.?51.*ddp.?71|ddp.?71.*ddp.?51/i, "DDP 5.1 + DDP 7.1"],
    [/ddp.?51.*aac.?71|aac.?71.*ddp.?51/i, "DDP 5.1 + AAC 7.1"],
    [/ddp.?51/i, "DDP 5.1"],
    [/truehd/i, "TrueHD 7.1"],
    [/aac.*71|71.*aac/i, "AAC 7.1"],
    [/aac/i, "AAC 5.1"],
    [/ac3.*51|51.*ac3/i, "AC3 5.1"],
    [/eac3/i, "EAC3"],
    [/dts.*hd/i, "DTS-HD"],
    [/dts/i, "DTS"],
    [/mp3/i, "MP3"],
    [/flac/i, "FLAC"],
];

var QUALITY_RANK = { "4K": 5, "2160P": 5, "1080P": 4, "720P": 3, "480P": 2, "CAM": 1 };

// ═════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

function normalize(str) {
    return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

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

function fetchText(url, extraHeaders) {
    var headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
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

// ═════════════════════════════════════════════════════════════════════════════
// TORRENT TITLE PARSER
// ═════════════════════════════════════════════════════════════════════════════

function parseTorrentTitle(title) {
    var result = { title: "", season: null, episode: null, year: null, quality: "Unknown" };
    if (!title) return result;

    // Extract year
    var yearMatch = title.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) result.year = parseInt(yearMatch[0], 10);

    // Extract quality
    var qMatch = title.match(/\b(2160p|4K|UHD|1080p|720p|480p|360p)\b/i);
    if (qMatch) {
        var q = qMatch[1].toUpperCase();
        result.quality = q === "2160P" || q === "UHD" ? "4K" : q;
    }

    // Extract season/episode: S01E05, S1E5, Season 1 Episode 5, 1x05
    var seMatch = title.match(/\b[Ss](\d{1,2})[Ee](\d{1,2})\b/);
    if (!seMatch) seMatch = title.match(/\bSeason\s*(\d{1,2}).*?Episode\s*(\d{1,2})\b/i);
    if (!seMatch) seMatch = title.match(/\b(\d{1,2})x(\d{2})\b/);
    if (seMatch) {
        result.season = parseInt(seMatch[1], 10);
        result.episode = parseInt(seMatch[2], 10);
    }

    // Extract clean title
    var clean = title
        .replace(/\.[Ss]\d{1,2}[Ee]\d{1,2}\./gi, " ")
        .replace(/\b[Ss]\d{1,2}[Ee]\d{1,2}\b/gi, " ")
        .replace(/\bSeason\s*\d+.*?Episode\s*\d+\b/gi, " ")
        .replace(/\b\d{1,2}x\d{2}\b/g, " ")
        .replace(/\b(19|20)\d{2}\b/g, " ")
        .replace(/\.(mkv|mp4|avi|wmv|mov|flv|webm|m4v|ts|m2ts)\b/gi, " ")
        .replace(/\.(2160p|4K|1080p|720p|480p|360p|HDR|HEVC|x264|x265|h265|h264|BluRay|WEB-DL|WEBRip|BRRip|DVDRip|HDTV|AMZN|NF|DSNP|REMUX|10Bit|DV|UHD)\b/gi, " ")
        .replace(/\./g, " ")
        .replace(/\s+/g, " ")
        .trim();

    result.title = clean;
    return result;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAGNET / SIZE / TRACKER UTILS
// ═════════════════════════════════════════════════════════════════════════════

function extractInfoHash(magnet) {
    var match = /urn:btih:([a-fA-F0-9]{40})/i.exec(magnet);
    return match ? match[1].toUpperCase() : null;
}

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

function parseSizeBytes(sizeStr) {
    if (!sizeStr) return 0;
    var m = sizeStr.match(/([\d.]+)\s*([KMGT]B)/i);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    var u = m[2].toUpperCase();
    if (u === "TB") return n * 1e12;
    if (u === "GB") return n * 1e9;
    if (u === "MB") return n * 1e6;
    if (u === "KB") return n * 1e3;
    return n;
}

function calcMbps(sizeMB, runtimeMinutes) {
    if (!sizeMB || !runtimeMinutes) return null;
    var bits = sizeMB * 1024 * 1024 * 8;
    var seconds = runtimeMinutes * 60;
    return (bits / seconds / 1000000).toFixed(1) + " Mbps";
}

function guessRuntime(qualityUp) {
    return 120; // default 2 hours
}

function getInvertedSortTag(score, maxScore) {
    maxScore = maxScore || 999999;
    var val = Math.max(0, parseInt(score, 10) || 0);
    var inv = Math.max(0, maxScore - val);
    var bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    var chars = [];
    for (var i = 0; i < bin.length; i++) {
        chars.push(bin.charAt(i) === "1" ? "\uFEFF" : "\u200B");
    }
    return chars.join("");
}

// ═════════════════════════════════════════════════════════════════════════════
// RICH METADATA BUILDER (111477 style)
// ═════════════════════════════════════════════════════════════════════════════

function extractQualityLabel(text) {
    var m = text.match(/\b(2160p|4K|UHD|1080p|720p|480p|360p)\b/i);
    if (!m) return "Unknown";
    var q = m[1].toUpperCase();
    return q === "2160P" || q === "UHD" ? "4K" : q;
}

function extractSize(text) {
    var m = text.match(/\b([\d.]+\s*[KMGT]B)\b/i);
    return m ? m[1] : "";
}

function extractFps(text) {
    var m = /\b(24|25|30|48|60|120)\s*fps\b/i.exec(text);
    return m ? m[1] + "fps" : "";
}

function pickHost(url) {
    if (!url) return "Magnet";
    var low = url.toLowerCase();
    if (low.indexOf("yts") !== -1) return "YTS";
    if (low.indexOf("rarbg") !== -1) return "RARBG";
    if (low.indexOf("1337x") !== -1) return "1337x";
    if (low.indexOf("thepiratebay") !== -1) return "TPB";
    if (low.indexOf("eztv") !== -1) return "EZTV";
    if (low.indexOf("ettv") !== -1) return "ETTV";
    if (low.indexOf("torrentgalaxy") !== -1) return "TorrentGalaxy";
    if (low.indexOf("limetorrents") !== -1) return "LimeTorrents";
    if (low.indexOf("kickass") !== -1) return "Kickass";
    return "Knaben";
}

function buildRichMetadata(torrentName, size, seeders, magnetUrl) {
    var combined = (torrentName + " " + size).toLowerCase();

    // ── Quality ─────────────────────────────────────────────────────
    var quality = extractQualityLabel(torrentName);
    var qualityUp = quality.toUpperCase();

    // ── Language ──────────────────────────────────────────────────────
    var langParts = [];
    if (/\b(?:english|eng)\b/.test(combined)) langParts.push("English");
    if (/\bhindi\b/.test(combined)) langParts.push("Hindi");
    if (/\btamil\b/.test(combined)) langParts.push("Tamil");
    if (/\btelugu\b/.test(combined)) langParts.push("Telugu");
    if (/\barabic\b/.test(combined)) langParts.push("Arabic");
    if (/\bspanish\b/.test(combined)) langParts.push("Spanish");
    if (/\bfrench\b/.test(combined)) langParts.push("French");
    if (/\bgerman\b/.test(combined)) langParts.push("German");
    if (/\bjapanese\b/.test(combined)) langParts.push("Japanese");
    if (/\bkorean\b/.test(combined)) langParts.push("Korean");
    if (/\bchinese\b/.test(combined)) langParts.push("Chinese");
    if (/\bturkish\b/.test(combined)) langParts.push("Turkish");
    if (/\brussian\b/.test(combined)) langParts.push("Russian");
    if (/\bdual\b/.test(combined)) langParts.push("Dual Audio");
    if (/\bmulti\b/.test(combined)) langParts.push("Multi Audio");
    if (langParts.length === 0) langParts.push("English");

    // ── Source ────────────────────────────────────────────────────────
    var source = "WEB-DL";
    var isRemux = false;
    if (/\bremux\b/.test(combined)) { source = "Blu-ray"; isRemux = true; }
    else if (/\bblu[-\s]?ray\b/.test(combined)) source = "Blu-ray";
    else if (/\b(?:webrip|hdrip)\b/.test(combined)) source = "WEB-Rip";
    else if (/\bdvd\b/.test(combined)) source = "DVD";
    else if (/\bhdtv\b/.test(combined)) source = "HDTV";
    else if (/\bcam\b/.test(combined)) source = "CAM";
    else if (/\bts\b/.test(combined)) source = "TS";

    // ── HDR / DV ──────────────────────────────────────────────────────
    var hdrTag = "";
    if (/\b(?:hdr10\+|hdr10p)\b/.test(combined)) hdrTag = "HDR10+";
    else if (/\bhdr10\b/.test(combined)) hdrTag = "HDR10";
    else if (/\bhdr\b/.test(combined)) hdrTag = "HDR";
    else if (/\bsdr\b/.test(combined)) hdrTag = "SDR";

    var dvTag = /\b(?:dv|dolby\s*vision)\b/.test(combined) ? "DV" : "";
    var bit10Tag = /\b10bit\b/.test(combined) ? "10Bit" : "";

    // ── Codec ─────────────────────────────────────────────────────────
    var codec = "H.264";
    if (/\b(?:hevc|x265|265|h265)\b/.test(combined)) codec = "H.265";
    else if (/\bav1\b/.test(combined)) codec = "AV1";
    else if (/\bvp9\b/.test(combined)) codec = "VP9";
    if (qualityUp === "4K" || qualityUp === "2160P") codec = "H.265";

    // ── Audio ─────────────────────────────────────────────────────────
    var audio = "AAC 5.1";
    for (var i = 0; i < AUDIO_TABLE.length; i++) {
        if (AUDIO_TABLE[i][0].test(combined)) { audio = AUDIO_TABLE[i][1]; break; }
    }
    if (/\batmos\b/.test(combined)) audio += " Atmos";

    // ── FPS ───────────────────────────────────────────────────────────
    var fps = extractFps(torrentName);

    // ── Host ──────────────────────────────────────────────────────────
    var host = pickHost(magnetUrl);

    // ── Bitrate ───────────────────────────────────────────────────────
    var sizeMB = parseSizeMB(size);
    var runtime = guessRuntime(qualityUp);
    var mbps = calcMbps(sizeMB, runtime);

    // ── Build Display Lines ───────────────────────────────────────────
    var mainTitleParts = ["Knaben", qualityUp, size];
    var mainTitle = "";
    for (var ti = 0; ti < mainTitleParts.length; ti++) {
        if (mainTitleParts[ti]) {
            if (mainTitle) mainTitle += " • ";
            mainTitle += mainTitleParts[ti];
        }
    }

    var lineA = langParts.join(" • ");

    var lineBParts = [source, isRemux ? "REMUX" : "", host, mbps || "", fps];
    var lineB = "";
    for (var bi = 0; bi < lineBParts.length; bi++) {
        if (lineBParts[bi]) {
            if (lineB) lineB += " • ";
            lineB += lineBParts[bi];
        }
    }

    var lineCParts = [bit10Tag, dvTag, hdrTag, codec, audio];
    var lineC = "";
    for (var ci = 0; ci < lineCParts.length; ci++) {
        if (lineCParts[ci]) {
            if (lineC) lineC += " • ";
            lineC += lineCParts[ci];
        }
    }

    var streamTitleParts = [lineA, lineB, lineC];
    var streamTitle = "";
    for (var si = 0; si < streamTitleParts.length; si++) {
        if (streamTitleParts[si]) {
            if (streamTitle) streamTitle += "\n";
            streamTitle += streamTitleParts[si];
        }
    }

    // ── Sort Score: quality priority + size ───────────────────────────
    var qualityScore = qualityUp === "4K" || qualityUp === "2160P" ? 4000 : qualityUp === "1080P" ? 3000 : 0;
    var sizeScore = Math.round(parseSizeBytes(size) / 1048576);
    var totalScore = qualityScore + sizeScore;
    var sortTag = getInvertedSortTag(totalScore, 999999);

    return {
        quality: qualityUp,
        qualityScore: qualityScore,
        sizeScore: sizeScore,
        sortTag: sortTag,
        mainTitle: mainTitle,
        streamTitle: streamTitle,
        sizeMB: sizeMB
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// TMDB RESOLUTION
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// KNABEN SEARCH & PARSE
// ═════════════════════════════════════════════════════════════════════════════

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

function parseResults(html, searchTitle, type, season, episode) {
    var streams = [];
    var seenHashes = {};
    var searchNorm = normalize(searchTitle);

    if (!html) return streams;

    var tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) {
        console.log("[Knaben] No tbody found");
        return streams;
    }
    var tbody = tbodyMatch[1];

    var rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    var rowMatch;
    var rowCount = 0;

    while ((rowMatch = rowRegex.exec(tbody)) !== null) {
        rowCount++;
        var row = rowMatch[1];

        // Extract title
        var titleMatch = row.match(/<a[^>]*class=["'][^"']*text-wrap[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ||
                         row.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
        var torrentName = "";
        if (titleMatch) {
            torrentName = decodeEntities(titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
        }
        if (!torrentName) continue;

        // Extract magnet
        var magnetMatch = row.match(/href=["'](magnet:[^"']+)["']/i);
        var magnetUrl = magnetMatch ? magnetMatch[1] : "";
        if (!magnetUrl) continue;

        // Extract infoHash
        var infoHash = extractInfoHash(magnetUrl);
        if (!infoHash) continue;
        if (seenHashes[infoHash]) continue;
        seenHashes[infoHash] = true;

        // Extract size
        var size = "";
        var sizeFound = row.match(/([\d.]+\s*[KMGT]B)/i);
        if (sizeFound) size = sizeFound[1];

        // Extract seeders
        var seeders = 0;
        var numMatches = row.match(/>(\d{1,6}(?:,\d{3})*)</g);
        if (numMatches) {
            for (var n = 0; n < numMatches.length; n++) {
                var num = parseInt(numMatches[n].replace(/[><,]/g, ""), 10);
                if (num > seeders) seeders = num;
            }
        }

        // Parse torrent for filtering
        var parsed = parseTorrentTitle(torrentName);
        var parsedTitleNorm = normalize(parsed.title);

        // Title match
        if (parsedTitleNorm !== searchNorm && parsedTitleNorm.indexOf(searchNorm) === -1 && searchNorm.indexOf(parsedTitleNorm) === -1) {
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
            if (season && parsed.season !== null && parsed.season !== season) continue;
            if (episode && parsed.episode !== null && parsed.episode !== episode) continue;
        }

        // ── QUALITY FILTER: 4K/2160p & 1080p ONLY ─────────────────────────
        var detectedQuality = parsed.quality.toUpperCase();
        if (detectedQuality !== "4K" && detectedQuality !== "2160P" && detectedQuality !== "1080P") {
            // Try to detect from torrent name directly
            var qCheck = extractQualityLabel(torrentName).toUpperCase();
            if (qCheck !== "4K" && qCheck !== "2160P" && qCheck !== "1080P") {
                continue;
            }
            detectedQuality = qCheck;
        }

        // Build rich metadata
        var meta = buildRichMetadata(torrentName, size, seeders, magnetUrl);

        // Extract trackers
        var trackers = extractTrackers(magnetUrl);

        streams.push({
            name: meta.sortTag + meta.mainTitle,
            title: meta.mainTitle,
            size: meta.streamTitle,
            url: magnetUrl,
            infoHash: infoHash,
            quality: meta.quality,
            headers: {},
            sources: trackers.length > 0 ? trackers : null,
            _qualityScore: meta.qualityScore,
            _sizeScore: meta.sizeScore,
            _sizeRaw: size || "",
            _seeders: seeders
        });
    }

    console.log("[Knaben] Parsed " + rowCount + " rows, " + streams.length + " valid torrents after 4K/1080p filter");

    // ── SORT: 4K largest first → 1080p largest first ──────────────────
    streams.sort(function(a, b) {
        // First by quality score (descending)
        if (b._qualityScore !== a._qualityScore) {
            return b._qualityScore - a._qualityScore;
        }
        // Then by size (descending)
        return b._sizeScore - a._sizeScore;
    });

    return streams;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════════

function getStreams(tmdbId, mediaType, season, episode) {
    var type = (mediaType === "tv" || mediaType === "series") ? "tv" : "movie";
    var sea = parseInt(season, 10) || 1;
    var ep = parseInt(episode, 10) || 1;

    console.log("[Knaben] " + type + " tmdbId=" + tmdbId + (type === "tv" ? " S" + sea + "E" + ep : ""));

    return getTmdbTitle(tmdbId, type).then(function(tmdbInfo) {
        if (!tmdbInfo || !tmdbInfo.title) {
            console.log("[Knaben] TMDB title not found");
            return [];
        }
        console.log("[Knaben] TMDB title: " + tmdbInfo.title + " (" + (tmdbInfo.year || "N/A") + ")");
        return searchKnaben(tmdbInfo.title, tmdbInfo.year, type, sea, ep);
    }).catch(function(e) {
        console.log("[Knaben] Error: " + e.message);
        return [];
    });
}

function onSettings() {
    return [];
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═════════════════════════════════════════════════════════════════════════════

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams, onSettings: onSettings };
} else if (typeof globalThis !== "undefined") {
    globalThis.getStreams = getStreams;
    globalThis.onSettings = onSettings;
} else if (typeof window !== "undefined") {
    window.getStreams = getStreams;
    window.onSettings = onSettings;
}
