// a111477 Provider for Nuvio — 2Peckle-style sorting
// Hermes-safe: no async/await, no const/let, no arrow functions, no URL constructor
// TMDB key: read from Nuvio-injected global only. No embedded fallback.

var TMDB_API_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "";
var TMDB_DIRECT = "https://api.themoviedb.org/3";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var SERVICE_ORIGIN = "https://st.111477.xyz";
var DEFAULT_HOST = "https://a.111477.xyz/";

var _metaCache = {};

// ── Crypto (base64url) ──────────────────────────────────────────────────────
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

// ── getInvertedSortTag (نفس 2Peckle) ────────────────────────────────────────
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

// ── TMDB Metadata Resolution ────────────────────────────────────────────────
function resolveMeta(tmdbId, mediaType) {
    var kind = mediaType === "tv" ? "tv" : "movie";
    var ck = kind + ":" + tmdbId;
    if (_metaCache[ck]) return Promise.resolve(_metaCache[ck]);

    if (!TMDB_API_KEY) {
        console.log("[a111477] TMDB_API_KEY not provided by Nuvio");
        return Promise.resolve(null);
    }

    var url = TMDB_DIRECT + "/" + kind + "/" + tmdbId +
              "?append_to_response=external_ids&api_key=" + TMDB_API_KEY;

    console.log("[a111477] TMDB URL: " + url);

    return fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
    .then(function(r) {
        console.log("[a111477] TMDB status=" + r.status);
        if (r.status && r.status >= 400) throw new Error("HTTP " + r.status);
        return r.text();
    })
    .then(function(txt) {
        var j = null;
        try { j = JSON.parse(txt); }
        catch(e) { console.log("[a111477] JSON parse error"); return null; }
        if (!j) return null;
        var title = kind === "tv" ? (j.name || j.original_name) : (j.title || j.original_title);
        var dateStr = kind === "tv" ? j.first_air_date : j.release_date;
        var year = dateStr ? parseInt(String(dateStr).slice(0, 4), 10) : null;
        var imdbId = (j.external_ids && j.external_ids.imdb_id) || j.imdb_id || null;
        var meta = { title: title, year: year, imdbId: imdbId };
        _metaCache[ck] = meta;
        console.log("[a111477] TMDB resolved: title=" + title + " imdb=" + imdbId);
        return meta;
    })
    .catch(function(e) {
        console.log("[a111477] TMDB error: " + e.message);
        return null;
    });
}

// ── Dedup ───────────────────────────────────────────────────────────────────
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

// ── Config Token Builder ────────────────────────────────────────────────────
function manifestBaseUrl(host, sort, limit) {
    host = host || DEFAULT_HOST;
    sort = sort || "file-desc";
    limit = limit || 3;
    var config = host.trim();
    if (config.charAt(config.length - 1) !== "/") config += "/";
    if (sort && sort !== "none") config += "::sort=" + sort;
    if (limit > 0 && limit !== 5) config += "::limit=" + limit;
    return SERVICE_ORIGIN + "/config/" + base64UrlEncode(config);
}

// ── Rich Metadata Parsing ───────────────────────────────────────────────────
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
    [/mp3/i, "MP3"]
];

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
    var runtime = 120;
    var mbps = calcMbps(sizeMB, runtime);

    var mainTitle = "111477 • " + qualityUp;
    if (size) mainTitle += " • " + size;

    var lineA = langParts.join(" • ");
    var lineBParts = [];
    if (source) lineBParts.push(source);
    if (isRemux) lineBParts.push("REMUX");
    if (host) lineBParts.push(host);
    if (mbps) lineBParts.push(mbps);
    if (fps) lineBParts.push(fps);
    var lineB = lineBParts.join(" • ");

    var lineCParts = [];
    if (bit10Tag) lineCParts.push(bit10Tag);
    if (dvTag) lineCParts.push(dvTag);
    if (hdrTag) lineCParts.push(hdrTag);
    if (codec) lineCParts.push(codec);
    if (audio) lineCParts.push(audio);
    var lineC = lineCParts.join(" • ");

    var streamTitleParts = [];
    if (lineA) streamTitleParts.push(lineA);
    if (lineB) streamTitleParts.push(lineB);
    if (lineC) streamTitleParts.push(lineC);
    var streamTitle = streamTitleParts.join("\n");

    return {
        name: mainTitle,
        title: mainTitle,
        size: streamTitle,
        url: url,
        quality: qualityUp,
        headers: {
            "User-Agent": UA,
            "Accept": "application/json, text/plain, */*",
            "Referer": SERVICE_ORIGIN + "/"
        },
        _host: host,
        _sizeRaw: size || ""
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN getStreams
// ═════════════════════════════════════════════════════════════════════════════

function getStreams(tmdbId, mediaType, season, episode) {
    var out = [];
    var seen = {};
    var isTv = mediaType === "tv";
    var sea = parseInt(season, 10) || 1;
    var ep = parseInt(episode, 10) || 1;

    console.log("[a111477] START " + (isTv ? "tv" : "movie") + " tmdb=" + tmdbId + (isTv ? " S" + sea + "E" + ep : ""));

    return resolveMeta(tmdbId, mediaType)
    .then(function(meta) {
        console.log("[a111477] meta=" + JSON.stringify(meta));

        var ids = [];
        if (meta && meta.imdbId && String(meta.imdbId).indexOf("tt") === 0) {
            ids.push(meta.imdbId);
        }
        ids.push("tmdb:" + tmdbId);

        var addonBase = manifestBaseUrl();
        console.log("[a111477] addonBase=" + addonBase);
        console.log("[a111477] trying IDs: " + ids.join(", "));

        function tryId(idx) {
            if (idx >= ids.length) return Promise.resolve();
            var id = ids[idx];
            var epUrl = isTv
                ? addonBase + "/stream/series/" + id + ":" + sea + ":" + ep + ".json"
                : addonBase + "/stream/movie/" + id + ".json";

            console.log("[a111477] fetching: " + epUrl);

            return fetch(epUrl, { headers: { "User-Agent": UA, "Accept": "application/json" } })
            .then(function(r) {
                console.log("[a111477] status=" + r.status + " for " + id);
                if (r.status && r.status >= 400) {
                    return tryId(idx + 1);
                }
                return r.text();
            })
            .then(function(txt) {
                var data = null;
                try { data = JSON.parse(txt); }
                catch(e) {
                    console.log("[a111477] JSON parse error for " + id);
                    return tryId(idx + 1);
                }

                if (!data || !data.streams || !Array.isArray(data.streams) || data.streams.length === 0) {
                    console.log("[a111477] no streams for " + id);
                    return tryId(idx + 1);
                }

                console.log("[a111477] " + data.streams.length + " raw streams from " + id);

                for (var i = 0; i < data.streams.length; i++) {
                    var it = data.streams[i];
                    var url = it && it.url;
                    if (!url || String(url).indexOf("http") !== 0 || seen[url]) continue;
                    seen[url] = true;

                    var enriched = enrichStream(it, meta);
                    if (enriched) out.push(enriched);
                }

                return Promise.resolve();
            })
            .catch(function(e) {
                console.log("[a111477] error for " + id + ": " + e.message);
                return tryId(idx + 1);
            });
        }

        return tryId(0);
    })
    .then(function() {
        console.log("[a111477] total enriched: " + out.length);

        var filtered = dedupByUrl(out);

        filtered.sort(function(a, b) {
            var qa = String(a.quality || "").toUpperCase();
            var qb = String(b.quality || "").toUpperCase();

            var aIs4K = (qa === "4K" || qa === "2160P");
            var bIs4K = (qb === "4K" || qb === "2160P");
            if (aIs4K && !bIs4K) return -1;
            if (!aIs4K && bIs4K) return 1;

            var aIs1080 = (qa === "1080P");
            var bIs1080 = (qb === "1080P");
            if (aIs1080 && !bIs1080) return -1;
            if (!aIs1080 && bIs1080) return 1;

            return parseSize(b._sizeRaw) - parseSize(a._sizeRaw);
        });

        for (var t = 0; t < filtered.length; t++) {
            var q = String(filtered[t].quality || "").toUpperCase();
            var score = (q === "4K" || q === "2160P") ? 2 : (q === "1080P" ? 1 : 0);
            var sortTag = getInvertedSortTag(score, 10);
            filtered[t].name = sortTag + filtered[t].title;
        }

        console.log("[a111477] after sort: " + filtered.length);
        return filtered;
    })
    .catch(function(e) {
        console.log("[a111477] FATAL: " + e.message);
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
