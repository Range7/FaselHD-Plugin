// a111477 Provider for Nuvio v2 — Ultra-Reliable Edition
// Rate-limit protection: jitter delay + UA rotation + long cache
// Based on ahmedelkassrawy/nuvio-providers actual implementation
// Enhanced with 4KHDHub-style rich metadata display
// Hermes-safe: no async/await, no const/let, no arrow functions, no URL constructor

// ═════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═════════════════════════════════════════════════════════════════════════════

var TMDB_API_KEY = "b3556f3b206e16f82df4d1f6fd4545e6";
var TMDB_DIRECT = "https://api.themoviedb.org/3";
var TMDB_PROXY = "https://db.speedracelight.com/3";
var SERVICE_ORIGIN = "https://st.111477.xyz";
var DEFAULT_HOST = "https://a.111477.xyz/";
var DEBUG = true;

// Cache TTLs
var META_CACHE_TTL = 4 * 60 * 60 * 1000;      // 4 hours for TMDB metadata
var STREAM_CACHE_TTL = 3 * 60 * 60 * 1000;    // 3 hours for stream results
var ADDON_CACHE_TTL = 6 * 60 * 60 * 1000;     // 6 hours for addon manifest base

// Rate limiting
var MAX_REQUESTS_PER_MINUTE = 4;
var REQUEST_LOG = [];

// ═════════════════════════════════════════════════════════════════════════════
// USER-AGENT ROTATION
// ═════════════════════════════════════════════════════════════════════════════

var USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"
];

var REFERERS = [
    "https://st.111477.xyz/",
    "https://a.111477.xyz/",
    "https://www.google.com/",
    "https://www.themoviedb.org/"
];

function getUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getReferer() {
    return REFERERS[Math.floor(Math.random() * REFERERS.length)];
}

// ═════════════════════════════════════════════════════════════════════════════
// LOGGING
// ═════════════════════════════════════════════════════════════════════════════

function log(msg) {
    if (DEBUG) console.log("[a111477] " + msg);
}

function logError(msg) {
    console.error("[a111477] " + msg);
}

// ═════════════════════════════════════════════════════════════════════════════
// RATE LIMITING + JITTER DELAY
// ═════════════════════════════════════════════════════════════════════════════

function checkRateLimit() {
    var now = Date.now();
    REQUEST_LOG = REQUEST_LOG.filter(function(t) { return now - t < 60000; });
    if (REQUEST_LOG.length >= MAX_REQUESTS_PER_MINUTE) {
        log("RATE LIMIT: " + REQUEST_LOG.length + " requests in last 60s, throttling...");
        return false;
    }
    REQUEST_LOG.push(now);
    return true;
}

function jitterDelay(minMs, maxMs) {
    minMs = minMs || 2000;
    maxMs = maxMs || 8000;
    var delay = minMs + Math.floor(Math.random() * (maxMs - minMs));
    log("jitter delay: " + delay + "ms");
    return new Promise(function(r) { setTimeout(r, delay); });
}

function wait(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
}

// ═════════════════════════════════════════════════════════════════════════════
// HTTP with timeout + retry + jitter
// ═════════════════════════════════════════════════════════════════════════════

function fetchT(url, opts, ms) {
    ms = ms || 15000;
    var ua = getUA();
    var ref = getReferer();
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers["User-Agent"] = ua;
    if (!opts.headers["Referer"]) opts.headers["Referer"] = ref;

    return Promise.race([
        fetch(url, opts),
        new Promise(function(_, reject) {
            setTimeout(function() { reject(new Error("timeout after " + ms + "ms")); }, ms);
        })
    ]);
}

function fetchWithRetry(url, opts, maxRetries) {
    maxRetries = maxRetries || 3;
    function attempt(n) {
        return fetchT(url, opts, 15000)
        .catch(function(e) {
            if (n >= maxRetries) {
                log("fetch failed after " + maxRetries + " retries: " + e.message);
                throw e;
            }
            var delay = 2000 + Math.floor(Math.random() * 4000 * n);
            log("retry " + (n + 1) + "/" + maxRetries + " after " + delay + "ms | error: " + e.message);
            return wait(delay).then(function() { return attempt(n + 1); });
        });
    }
    return attempt(1);
}

// ═════════════════════════════════════════════════════════════════════════════
// CRYPTO (base64url)
// ═════════════════════════════════════════════════════════════════════════════

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(input) {
    var bytes = typeof input === "string" ? input.split("").map(function(c) { return c.charCodeAt(0) & 255; }) : input;
    var out = "";
    for (var i = 0; i < bytes.length; i += 3) {
        var b0 = bytes[i];
        var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        out += B64[b0 >> 2];
        out += B64[(b0 & 3) << 4 | b1 >> 4];
        out += i + 1 < bytes.length ? B64[(b1 & 15) << 2 | b2 >> 6] : "=";
        out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
    }
    return out;
}

function base64UrlEncode(input) {
    return base64Encode(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ═════════════════════════════════════════════════════════════════════════════
// CACHES
// ═════════════════════════════════════════════════════════════════════════════

var _metaCache = {};
var _streamCache = {};
var _addonBaseCache = null;
var _addonBaseCacheTime = 0;

function getMetaCache(key) {
    var c = _metaCache[key];
    if (c && c._time && (Date.now() - c._time < META_CACHE_TTL)) {
        log("meta cache HIT for " + key);
        return c.data;
    }
    return null;
}

function setMetaCache(key, data) {
    _metaCache[key] = { data: data, _time: Date.now() };
}

function getStreamCache(key) {
    var c = _streamCache[key];
    if (c && c._time && (Date.now() - c._time < STREAM_CACHE_TTL)) {
        log("stream cache HIT for " + key);
        return c.data;
    }
    return null;
}

function setStreamCache(key, data) {
    _streamCache[key] = { data: data, _time: Date.now() };
}

function getAddonBase() {
    if (_addonBaseCache && (Date.now() - _addonBaseCacheTime < ADDON_CACHE_TTL)) {
        log("addon base cache HIT");
        return _addonBaseCache;
    }
    var base = manifestBaseUrl();
    _addonBaseCache = base;
    _addonBaseCacheTime = Date.now();
    return base;
}

// ═════════════════════════════════════════════════════════════════════════════
// TMDB METADATA
// ═════════════════════════════════════════════════════════════════════════════

var _tmdbPool = [TMDB_DIRECT, TMDB_PROXY];

function resolveMeta(tmdbId, mediaType) {
    var kind = mediaType === "tv" ? "tv" : "movie";
    var ck = kind + ":" + tmdbId;
    var cached = getMetaCache(ck);
    if (cached) return Promise.resolve(cached);

    function tryHost(idx) {
        if (idx >= _tmdbPool.length) {
            log("TMDB all hosts failed for " + ck);
            return Promise.resolve(null);
        }
        var base = _tmdbPool[idx];
        var withKey = base.indexOf("api.themoviedb.org") !== -1;
        var keyParam = withKey ? "&api_key=" + TMDB_API_KEY : "";
        var url = base + "/" + kind + "/" + tmdbId + "?append_to_response=external_ids" + keyParam;

        log("TMDB host " + (idx + 1) + "/" + _tmdbPool.length + ": " + base);

        return fetchT(url, { headers: { "Accept": "application/json" } }, 12000)
        .then(function(r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
        })
        .then(function(j) {
            var title = kind === "tv" ? (j.name || j.original_name) : (j.title || j.original_title);
            var dateStr = kind === "tv" ? j.first_air_date : j.release_date;
            var year = dateStr ? parseInt(String(dateStr).slice(0, 4), 10) : null;
            var imdbId = (j.external_ids && j.external_ids.imdb_id) || j.imdb_id || null;
            var meta = { title: title, year: year, imdbId: imdbId };
            setMetaCache(ck, meta);
            log("meta resolved: title=" + title + " year=" + year + " imdb=" + imdbId);
            return meta;
        })
        .catch(function(e) {
            log("TMDB host " + (idx + 1) + " failed: " + e.message);
            return tryHost(idx + 1);
        });
    }

    return tryHost(0);
}

// ═════════════════════════════════════════════════════════════════════════════
// DEDUP & SORT
// ═════════════════════════════════════════════════════════════════════════════

function dedupByUrl(streams) {
    var seen = {};
    var out = [];
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        if (!s || !s.url || seen[s.url]) continue;
        seen[s.url] = true;
        out.push(s);
    }
    return out;
}

var QUALITY_RANK = { "4K": 5, "2160P": 5, "1080P": 4, "720P": 3, "480P": 2, "CAM": 1 };

function sortByQuality(streams) {
    return streams.slice().sort(function(a, b) {
        return (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0);
    });
}

function parseQuality(s) {
    var t = String(s || "").toUpperCase();
    if (/2160|\b4K\b|UHD/.test(t)) return "4K";
    if (/1080/.test(t)) return "1080P";
    if (/720/.test(t)) return "720P";
    if (/480/.test(t)) return "480P";
    if (/\bCAM\b/.test(t)) return "CAM";
    return "Auto";
}

// ═════════════════════════════════════════════════════════════════════════════
// CONFIG TOKEN BUILDER
// ═════════════════════════════════════════════════════════════════════════════

function manifestBaseUrl(host, sort, limit) {
    host = host || DEFAULT_HOST;
    sort = sort || "file-desc";
    limit = limit || 3;
    var config = host.trim();
    if (!config.endsWith("/")) config += "/";
    if (sort && sort !== "none") config += "::sort=" + sort;
    if (limit > 0 && limit !== 5) config += "::limit=" + limit;
    return SERVICE_ORIGIN + "/config/" + base64UrlEncode(config);
}

// ═════════════════════════════════════════════════════════════════════════════
// RICH METADATA PARSING (4KHDHub style)
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
];

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

function extractQualityLabel(text) {
    var m = text.match(/\b(2160p|4K|1080p|720p|480p|360p)\b/i);
    if (!m) return "Unknown";
    return m[1].toLowerCase() === "2160p" ? "4K" : m[1];
}

function extractSize(text) {
    var m = text.match(/\[([0-9.]+\s*[KMGT]B(?:\/E)?)\]/i) ||
            text.match(/([0-9]+(?:\.[0-9]+)?\s*[KMGT]B)/i) ||
            text.match(/\b([0-9.]+\s*GB)\b/i) ||
            text.match(/\b([0-9.]+\s*MB)\b/i);
    return m ? m[1] : "";
}

function extractFps(text) {
    var m = /\b(24|25|30|48|60|120)\s*fps\b/i.exec(text);
    return m ? m[1] + "fps" : "";
}

function pickHost(url) {
    if (!url) return "Direct";
    var low = url.toLowerCase();
    var hostMatch = low.match(/^https?:\/\/([^\/?:#]+)/);
    var hostname = hostMatch ? hostMatch[1] : "";

    if (/pixeldrain/.test(hostname)) return "PixelDrain";
    if (/mediafire/.test(hostname)) return "MediaFire";
    if (/mega\./.test(hostname)) return "Mega";
    if (/google/.test(hostname) || /drive\.google/.test(hostname)) return "Google Drive";
    if (/1fichier/.test(hostname)) return "1Fichier";
    if (/filerio/.test(hostname)) return "FileRio";
    if (/streamtape/.test(hostname)) return "StreamTape";
    if (/dood/.test(hostname)) return "DoodStream";
    if (/voe/.test(hostname)) return "Voe";
    if (/mixdrop/.test(hostname)) return "MixDrop";
    if (/upstream/.test(hostname)) return "UpStream";
    if (/vidoza/.test(hostname)) return "Vidoza";
    if (/fastdl/.test(hostname)) return "FastDL";
    if (/cdn/.test(hostname)) return "CDN";
    if (/cloudflare/.test(hostname) || /r2\.dev/.test(hostname)) return "Cloudflare";
    if (/workers\.dev/.test(hostname)) return "Cloudflare Workers";
    if (/111477/.test(hostname)) return "111477";
    return hostname.replace(/^www\./, "") || "Direct";
}

function parseSizeMB(sizeStr) {
    if (!sizeStr) return null;
    var m = /([0-9]+(?:\.[0-9]+)?)\s*(GB|MB|TB)/i.exec(sizeStr);
    if (!m) return null;
    var val = parseFloat(m[1]);
    var unit = m[2].toUpperCase();
    if (unit === "TB") return val * 1024 * 1024;
    if (unit === "GB") return val * 1024;
    if (unit === "MB") return val;
    return val;
}

function parseSize(str) {
    if (!str) return 0;
    var m = str.match(/([0-9.]+)\s*([KMGT]B)/i);
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
    if (qualityUp === "4K" || qualityUp === "2160P") return 120;
    if (qualityUp === "1080P") return 120;
    if (qualityUp === "720P") return 120;
    return 120;
}

function enrichStream(it, meta) {
    var rawTitle = it.title || it.description || it.name || "";
    var name = it.name || "";
    var url = it.url || "";
    var combined = (rawTitle + " " + name + " " + url).toLowerCase();
    var rawLines = rawTitle.split("\n");
    var line1 = rawLines[0] || "";
    var line2 = rawLines[1] || "";
    var fullText = line1 + " " + line2;

    var quality = extractQualityLabel(fullText + " " + name);
    var qualityUp = quality.toUpperCase();

    var size = extractSize(fullText);
    if (!size) size = extractSize(name);
    if (!size) size = extractSize(url);

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

    var source = "WEB-DL";
    var isRemux = false;
    if (/\bremux\b/.test(combined)) { source = "Blu-ray"; isRemux = true; }
    else if (/\bblu[-\s]?ray\b/.test(combined)) source = "Blu-ray";
    else if (/\b(?:webrip|hdrip)\b/.test(combined)) source = "WEB-Rip";
    else if (/\bdvd\b/.test(combined)) source = "DVD";
    else if (/\bhdtv\b/.test(combined)) source = "HDTV";
    else if (/\bcam\b/.test(combined)) source = "CAM";
    else if (/\bts\b/.test(combined)) source = "TS";

    var hdrTag = "";
    if (/\b(?:hdr10\+|hdr10p)\b/.test(combined)) hdrTag = "HDR10+";
    else if (/\bhdr10\b/.test(combined)) hdrTag = "HDR10";
    else if (/\bhdr\b/.test(combined)) hdrTag = "HDR";
    else if (/\bsdr\b/.test(combined)) hdrTag = "SDR";

    var dvTag = /\b(?:dv|dolby\s*vision)\b/.test(combined) ? "DV" : "";
    var bit10Tag = /\b10bit\b/.test(combined) ? "10Bit" : "";

    var codec = "H.264";
    if (/\b(?:hevc|x265|265|h265)\b/.test(combined)) codec = "H.265";
    else if (/\bav1\b/.test(combined)) codec = "AV1";
    else if (/\bvp9\b/.test(combined)) codec = "VP9";
    if (qualityUp === "4K" || qualityUp === "2160P") codec = "H.265";

    var audio = "AAC 5.1";
    for (var i = 0; i < AUDIO_TABLE.length; i++) {
        if (AUDIO_TABLE[i][0].test(combined)) { audio = AUDIO_TABLE[i][1]; break; }
    }
    if (/\batmos\b/.test(combined)) audio += " Atmos";

    var fps = extractFps(fullText);
    var host = pickHost(url);
    var sizeMB = parseSizeMB(size);
    var runtime = guessRuntime(qualityUp);
    var mbps = calcMbps(sizeMB, runtime);

    var mainTitleParts = ["111477", qualityUp, size];
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

    var qualityScore = qualityUp === "4K" ? 4000 : qualityUp === "2160P" ? 4000 :
                       qualityUp === "1080P" ? 3000 : qualityUp === "720P" ? 2000 :
                       qualityUp === "480P" ? 1000 : 500;
    var sizeScore = Math.round(parseSize(size) / 1048576);
    var totalScore = qualityScore + sizeScore;
    var sortTag = getInvertedSortTag(totalScore, 999999);

    var headers = {
        "User-Agent": getUA(),
        "Accept": "application/json, text/plain, */*",
        "Referer": getReferer()
    };
    if (it.behaviorHints && it.behaviorHints.proxyHeaders && it.behaviorHints.proxyHeaders.request) {
        var ph = it.behaviorHints.proxyHeaders.request;
        for (var k in ph) {
            if (Object.prototype.hasOwnProperty.call(ph, k)) {
                headers[k] = ph[k];
            }
        }
    }

    return {
        name: sortTag + mainTitle,
        title: mainTitle,
        size: streamTitle,
        url: url,
        quality: qualityUp,
        headers: headers,
        _host: host,
        _sizeRaw: size || "",
        _rawTitle: rawTitle
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN getStreams — Ultra-Reliable
// ═════════════════════════════════════════════════════════════════════════════

function getStreams(tmdbId, mediaType, season, episode) {
    var isTv = mediaType === "tv";
    var sea = parseInt(season, 10) || 1;
    var ep = parseInt(episode, 10) || 1;
    var cacheKey = (isTv ? "tv" : "movie") + ":" + tmdbId + ":" + sea + ":" + ep;

    log((isTv ? "tv" : "movie") + " tmdb=" + tmdbId + (isTv ? " S" + sea + "E" + ep : ""));

    // Check stream cache first
    var cachedStreams = getStreamCache(cacheKey);
    if (cachedStreams) {
        log("returning " + cachedStreams.length + " cached streams");
        return Promise.resolve(cachedStreams);
    }

    var out = [];
    var seen = {};

    return resolveMeta(tmdbId, mediaType)
    .then(function(meta) {
        var ids = [];
        if (meta && meta.imdbId && meta.imdbId.indexOf("tt") === 0) {
            ids.push(meta.imdbId);
            log("using imdb id: " + meta.imdbId);
        }
        ids.push("tmdb:" + tmdbId);
        log("fallback tmdb id: tmdb:" + tmdbId);
        return processIds(ids, isTv, sea, ep, out, seen, cacheKey);
    })
    .catch(function(e) {
        log("resolveMeta failed, trying direct tmdb id: " + e.message);
        var ids = ["tmdb:" + tmdbId];
        return processIds(ids, isTv, sea, ep, out, seen, cacheKey);
    });
}

function processIds(ids, isTv, sea, ep, out, seen, cacheKey) {
    var addonBase = getAddonBase();
    log("addonBase: " + addonBase);
    log("trying IDs: " + ids.join(", "));

    function tryId(idx) {
        if (idx >= ids.length) {
            log("all IDs exhausted");
            return Promise.resolve();
        }
        var id = ids[idx];
        var epUrl = isTv
            ? addonBase + "/stream/series/" + id + ":" + sea + ":" + ep + ".json"
            : addonBase + "/stream/movie/" + id + ".json";

        log("fetching: " + epUrl);

        // Rate limit check
        if (!checkRateLimit()) {
            log("rate limit hit, waiting before request...");
            return wait(15000).then(function() { return tryId(idx); });
        }

        return jitterDelay(1500, 5000).then(function() {
            return fetchWithRetry(epUrl, { headers: { "Accept": "application/json" } }, 3);
        })
        .then(function(r) {
            if (!r.ok) {
                log("HTTP " + r.status + " for " + id);
                return tryId(idx + 1);
            }
            return r.json();
        })
        .then(function(data) {
            if (!data || !data.streams || !Array.isArray(data.streams)) {
                log("no streams array for " + id);
                return tryId(idx + 1);
            }
            log(data.streams.length + " raw streams from " + id);

            for (var i = 0; i < data.streams.length; i++) {
                var it = data.streams[i];
                var url = it && it.url;
                if (!url || String(url).indexOf("http") !== 0 || seen[url]) continue;
                seen[url] = true;

                var enriched = enrichStream(it, {});
                if (enriched) out.push(enriched);
            }

            if (data.streams.length > 0) {
                log("success with ID: " + id);
                return Promise.resolve();
            }
            return tryId(idx + 1);
        })
        .catch(function(e) {
            log("error for " + id + ": " + e.message);
            return tryId(idx + 1);
        });
    }

    return tryId(0)
    .then(function() {
        log("total enriched streams: " + out.length);
        var result = sortByQuality(dedupByUrl(out));
        if (result.length > 0) {
            setStreamCache(cacheKey, result);
            log("cached " + result.length + " streams for " + cacheKey);
        }
        return result;
    })
    .catch(function(e) {
        logError("fatal error: " + e.message);
        return [];
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═════════════════════════════════════════════════════════════════════════════

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
} else if (typeof globalThis !== "undefined") {
    globalThis.getStreams = getStreams;
} else if (typeof window !== "undefined") {
    window.getStreams = getStreams;
}
