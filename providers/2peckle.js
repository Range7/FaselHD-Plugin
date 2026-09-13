/**
 * 2Peckle Nuvio Provider
 * PenguPlay (pengu.uk) Stremio addon — 2Peckle source only
 * STRICT 4K & 1080p ONLY — Rich server info like 4KHDHub
 *
 * Parses pengu.uk stream format:
 *   name:        "🔥4K UHD" / "🚀 FHD"
 *   description: "🎬 Title\n🎥 Source 🎞️ Codec\n🔊 Audio\n📦 Size 📊 Bitrate\n🏷️ Group\n💻 Web Link 🔍2Peckle"
 *   behaviorHints.videoSize: exact bytes
 */

var ADDON_BASE = "https://pengu.uk";
// PenguPlay config (URL-encoded JSON): auth_token + 2Peckle only + 4K/1080p only
var ADDON_CONFIG = "%7B%22auth_token%22%3A%227MhHl1FbijCQ-IMd8Bevfb6kIWIQOwd9HvS2OHkREYM%22%2C%22source_2peckle%22%3A%22checked%22%2C%22res_2160%22%3A%22checked%22%2C%22res_1080%22%3A%22checked%22%2C%22res_720%22%3A%22unchecked%22%2C%22res_480%22%3A%22unchecked%22%2C%22res_360%22%3A%22unchecked%22%7D";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

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

function getInvertedSortTag(score, maxScore) {
    maxScore = maxScore || 999999;
    var val = Math.max(0, parseInt(score, 10) || 0);
    var inv = Math.max(0, maxScore - val);
    var bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    var chars = [];
    for (var i = 0; i < bin.length; i++) {
        chars.push(bin.charAt(i) === "1" ? "﻿" : "​");
    }
    return chars.join("");
}

function onSettings() {
    return [
        {
            type: "select",
            key: "qualityMode",
            name: "quality_mode",
            label: "Quality Filter",
            options: [
                { label: "4K + 1080p", value: "both" },
                { label: "4K ONLY", value: "4k" },
                { label: "1080p ONLY", value: "1080p" }
            ],
            default: "both"
        },
        {
            type: "text",
            key: "tmdbKey",
            name: "tmdb_key",
            label: "Custom TMDB API Key (Optional)",
            default: ""
        }
    ];
}

function resolveSettings(customSettings) {
    var qualityMode = "both";
    try {
        var s = customSettings;
        if (!s && typeof globalThis !== "undefined") s = globalThis.SCRAPER_SETTINGS || globalThis.SETTINGS || globalThis.settings;
        if (!s && typeof global !== "undefined") s = global.SCRAPER_SETTINGS || global.SETTINGS || global.settings;
        if (!s && typeof window !== "undefined") s = window.SCRAPER_SETTINGS || window.SETTINGS || window.settings;
        if (s) {
            var q = String(s.qualityMode || s.quality_mode || "both").toLowerCase();
            if (q === "4k" || q === "1080p") qualityMode = q;
        }
    } catch (e) {}
    return { qualityMode: qualityMode };
}

// ── Entry Point ───────────────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
    var rawId = tmdbId;
    if (typeof tmdbId === "object" && tmdbId !== null) {
        rawId = tmdbId.tmdbId || tmdbId.id || tmdbId.imdbId || tmdbId.imdb_id || tmdbId;
    }
    var cleanId = String(rawId || "").replace(/^(?:tmdb|imdb):/i, "").trim();

    var type = (mediaType === "tv" || mediaType === "series") ? "tv" : "movie";
    var ep   = parseInt(episode, 10) || 1;
    var sea  = parseInt(season, 10)  || 1;
    console.log("[2peckle] " + type + " id=" + cleanId + (type === "tv" ? " S" + sea + "E" + ep : ""));

    if (cleanId.indexOf("tt") === 0) {
        return resolvePengu(cleanId, type, sea, ep);
    }

    var tmdbKey = getTmdbKey();
    var tmdbEndpoint = type === "tv" ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + tmdbEndpoint + "/" + cleanId +
              "?api_key=" + tmdbKey + "&append_to_response=external_ids";

    return fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
    .then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function(data) {
        var imdbId = (data.external_ids && data.external_ids.imdb_id) || "";
        var useId = imdbId || cleanId;
        console.log("[2peckle] resolved imdb=" + imdbId + " — using " + useId);
        return resolvePengu(useId, type, sea, ep);
    })
    .catch(function(e) {
        console.log("[2peckle] TMDB lookup failed (" + e.message + "), using raw id");
        return resolvePengu(cleanId, type, sea, ep);
    });
}

// ── PenguPlay (2Peckle) Pipeline ─────────────────────────────────────────────

function resolvePengu(id, type, season, episode) {
    var settings = resolveSettings();

    var url = ADDON_BASE + "/" + ADDON_CONFIG + "/stream/" +
        (type === "tv" ? "series/" + id + ":" + season + ":" + episode : "movie/" + id) + ".json";

    console.log("[2peckle] addon: " + url);

    return fetch(url, {
        headers: {
            "User-Agent": UA,
            "Accept": "application/json"
        },
        redirect: "follow"
    })
    .then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function(data) {
        var streams = (data && data.streams) || [];
        console.log("[2peckle] addon returned " + streams.length + " stream(s)");
        return finalizeStreams(streams, settings);
    })
    .catch(function(e) {
        console.log("[2peckle] error: " + e.message);
        return [];
    });
}

// ── Parsers ──────────────────────────────────────────────────────────────────

// الجودة: نعتمد على bingeGroup و name و filename (FHD = 1080p)
function classifyQuality(s) {
    var text = [
        s.name || "",
        (s.behaviorHints && s.behaviorHints.bingeGroup) || "",
        (s.behaviorHints && s.behaviorHints.filename) || "",
        s.description || ""
    ].join(" ").toLowerCase();

    if (/4k|2160|uhd/.test(text)) return "4K";
    if (/1080|fhd/.test(text)) return "1080p";
    return "";
}

// نص نظيف بدون إيموجي (للـ labels مثل "4K UHD" / "FHD")
function stripEmoji(text) {
    return String(text || "")
        .replace(/[\p{Extended_Pictographic}\uFE0F\u20E3]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

function formatBytes(bytes) {
    var n = parseInt(bytes, 10);
    if (!n || n <= 0) return "";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + " GB";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
    return n + " B";
}

// استخراج معلومات السيرفر من description (سطور الإيموجي)
function parseServerInfo(description) {
    var d = String(description || "");
    var info = {};

    // 🎥 BluRay 🎞️ HEVC  →  source + codec
    var mSrc = d.match(/🎥\s*([^🎞\n]+?)\s*(?:🎞️|\n|$)/);
    if (mSrc) info.source = mSrc[1].trim();
    var mCodec = d.match(/🎞️\s*([^\n]+)/);
    if (mCodec) info.codec = mCodec[1].trim();

    // 🔊 7.1 / 🎧 AAC  →  audio
    var mAudio = d.match(/(?:🔊|🎧)\s*([^\n]+)/);
    if (mAudio) info.audio = mAudio[1].trim();

    // 📦 28.8 GB  →  size
    var mSize = d.match(/📦\s*([\d.]+\s*(?:GB|MB|TB))/i);
    if (mSize) info.size = mSize[1].toUpperCase().replace(/\s+/g, " ");

    // 📊 27.1 Mbps  →  bitrate
    var mRate = d.match(/📊\s*([\d.]+\s*Mbps)/i);
    if (mRate) info.bitrate = mRate[1];

    return info;
}

// ── Quality Filter + 4KHDHub-Style Stream Building ───────────────────────────

function finalizeStreams(streams, settings) {
    var seen = {};
    var filtered = [];

    for (var i = 0; i < streams.length; i++) {
        var s = streams[i] || {};

        // نتجاهل رسالة الدعم وأي بث بدون رابط مباشر
        var url = s.url || "";
        if (!/^https?:\/\//i.test(url)) continue;
        // حماية إضافية: أي شي يشبه إعلان الدعم ينحذف
        if (/donate|support the project/i.test((s.name || "") + " " + (s.description || ""))) continue;

        var bh = s.behaviorHints || {};
        var fullText = (s.name || "") + "\n" + (s.description || "") + "\n" +
            (bh.bingeGroup || "") + "\n" + (bh.filename || "") + "\n" + url;

        // تأكد إن السيرفر هو 2Peckle (حماية إضافية)
        if (!/2peckle/i.test(fullText)) continue;

        var q = classifyQuality(s);
        if (!q) continue;
        if (settings.qualityMode === "4k" && q !== "4K") continue;
        if (settings.qualityMode === "1080p" && q !== "1080p") continue;

        if (seen[url]) continue;
        seen[url] = true;

        filtered.push({ stream: s, url: url, quality: q });
    }

    // ترتيب: 4K أولاً، وبنفس الجودة الأكبر حجماً أولاً (largest file priority مثل 4KHDHub)
    filtered.sort(function(a, b) {
        if (a.quality !== b.quality) return a.quality === "4K" ? -1 : 1;
        var sa = (a.stream.behaviorHints && a.stream.behaviorHints.videoSize) || 0;
        var sb = (b.stream.behaviorHints && b.stream.behaviorHints.videoSize) || 0;
        return sb - sa;
    });

    console.log("[2peckle] final streams (STRICT " + settings.qualityMode + "): " + filtered.length);

    return filtered.map(function(entry, idx) {
        return makeStream(entry, idx);
    });
}

function makeStream(entry, rank) {
    var s = entry.stream;
    var q = entry.quality; // "4K" أو "1080p"
    var qUp = q.toUpperCase(); // 4K أو 1080P

    // label من اسم البث: "🔥4K UHD" → "4K UHD" / "🚀 FHD" → "FHD"
    var label = stripEmoji(s.name);
    if (!label) label = qUp;
    if (q === "1080p" && !/1080/i.test(label)) label = "1080p " + label; // FHD → 1080p FHD

    // الحجم: videoSize بالبايت أولاً، ثم 📦 من الوصف
    var serverInfo = parseServerInfo(s.description);
    var size = formatBytes(s.behaviorHints && s.behaviorHints.videoSize) || serverInfo.size || "";

    var host = pickHost(entry.url);
    var typeTag = /\.m3u8(\?|$)/i.test(entry.url) ? "HLS" : (/\.mkv(\?|$)/i.test(entry.url) ? "MKV" : "MP4");

    // العنوان الرئيسي: 2Peckle • 4K UHD • 28.81 GB
    var mainTitle = ["2Peckle", label].filter(Boolean).join(" • ");
    if (size) mainTitle += " • " + size;

    // معلومات السيرفر (نفس أسلوب 4KHDHub) — ثلاث سطور
    var line1 = [serverInfo.source, serverInfo.codec, serverInfo.audio].filter(Boolean).join(" • ");
    var line2 = [serverInfo.bitrate].filter(Boolean).join(" • ");
    var line3 = [typeTag, host].filter(Boolean).join(" • ");
    var streamTitle = [line1, line2, line3].filter(Boolean).join("\n");
    if (!streamTitle) streamTitle = "2Peckle";

    var score = q === "4K" ? 2 : 1;
    var sortTag = getInvertedSortTag(score, 10);

    return {
        name: sortTag + mainTitle,
        title: mainTitle,
        size: streamTitle,
        url: entry.url,
        quality: qUp,
        headers: {
            "User-Agent": UA,
            "Referer": ADDON_BASE + "/",
            "Accept": "*/*"
        },
        _host: host
    };
}

function pickHost(url) {
    try {
        if (typeof URL === "function") {
            return new URL(url).hostname.replace(/^www\./, "");
        }
        var m = String(url).match(/^https?:\/\/([^\/]+)/i);
        return m ? m[1].replace(/^www\./, "") : "CDN";
    } catch (e) {
        return "CDN";
    }
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
