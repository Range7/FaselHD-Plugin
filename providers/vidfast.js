/**
 * VidFast Nuvio Provider
 * vidfast.vc embed resolver (Zen Nitro pipeline)
 * STRICT 4K & 1080p ONLY — Rich server info like 4KHDHub
 */

var BASE_URL = "https://vidfast.vc";
var DEC_API  = "https://enc-dec.app/api/dec-vidfast";
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
            key: "cfWorker",
            name: "cf_worker",
            label: "Override CF Worker URL (Optional)",
            default: ""
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
    var cfWorkerOverride = "";
    try {
        var s = customSettings;
        if (!s && typeof globalThis !== "undefined") s = globalThis.SCRAPER_SETTINGS || globalThis.SETTINGS || globalThis.settings;
        if (!s && typeof global !== "undefined") s = global.SCRAPER_SETTINGS || global.SETTINGS || global.settings;
        if (!s && typeof window !== "undefined") s = window.SCRAPER_SETTINGS || window.SETTINGS || window.settings;
        if (s) {
            var q = String(s.qualityMode || s.quality_mode || "both").toLowerCase();
            if (q === "4k" || q === "1080p") qualityMode = q;
            cfWorkerOverride = s.cfWorker || s.cf_worker || "";
        }
    } catch (e) {}
    return { qualityMode: qualityMode, cfWorkerOverride: cfWorkerOverride };
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
    console.log("[vidfast] " + type + " id=" + cleanId + (type === "tv" ? " S" + sea + "E" + ep : ""));

    if (cleanId.indexOf("tt") === 0) {
        return resolveVidFast(cleanId, type, sea, ep);
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
        console.log("[vidfast] resolved imdb=" + imdbId + " — using " + useId);
        return resolveVidFast(useId, type, sea, ep);
    })
    .catch(function(e) {
        console.log("[vidfast] TMDB lookup failed (" + e.message + "), using raw id");
        return resolveVidFast(cleanId, type, sea, ep);
    });
}

// ── VidFast Zen Nitro Pipeline ────────────────────────────────────────────────

function resolveVidFast(id, type, season, episode) {
    var settings = resolveSettings();
    var embedUrl = type === "tv"
        ? BASE_URL + "/tv/" + id + "/" + season + "/" + episode
        : BASE_URL + "/movie/" + id;

    console.log("[vidfast] embed: " + embedUrl);

    return fetchText(embedUrl, { "Referer": BASE_URL + "/" })
    .then(function(html) {
        var direct = extractDirectStreams(html);
        if (direct.length) {
            console.log("[vidfast] direct streams found in page: " + direct.length);
            return finalizeStreams(direct, settings);
        }

        var worker   = settings.cfWorkerOverride || extractWorkerUrl(html);
        var genData  = extractGenerateData(html);
        var staticP  = extractStaticPath(html);
        var serverP  = extractServerPath(html);

        console.log("[vidfast] worker=" + worker + " static=" + staticP + " server=" + serverP);

        if (!worker || !genData) {
            console.log("[vidfast] could not extract worker/data from embed page");
            return [];
        }

        return postJson(worker.replace(/\/+$/, "") + "/generate", genData, {
            "Origin": BASE_URL,
            "Referer": embedUrl
        })
        .then(function(genRes) {
            var token = (genRes && (genRes.payload || genRes.token || genRes.data)) || "";
            if (!token) {
                console.log("[vidfast] worker returned no token");
                return [];
            }

            var serversUrl = BASE_URL + "/" + staticP + "/" + serverP + "/" + token;
            console.log("[vidfast] servers API: " + serversUrl);

            return fetch(serversUrl, {
                method: "POST",
                headers: {
                    "User-Agent": UA,
                    "Accept": "application/json, text/plain, */*",
                    "Content-Type": "application/json",
                    "Origin": BASE_URL,
                    "Referer": embedUrl,
                    "X-Requested-With": "XMLHttpRequest"
                }
            })
            .then(function(r) { return r.text(); })
            .then(function(rawText) {
                return decryptOrParse(rawText);
            });
        })
        .then(function(items) {
            return finalizeStreams(items, settings);
        });
    })
    .catch(function(e) {
        console.log("[vidfast] error: " + e.message);
        return [];
    });
}

function extractWorkerUrl(html) {
    var m = html.match(/https?:\/\/[a-z0-9.-]+\.workers\.dev[^\s"'\\<>)]*/i) ||
            html.match(/https?:\/\/[a-z0-9.-]+\.pages\.dev[^\s"'\\<>)]*/i);
    if (!m) return "";
    return m[0].split("/generate")[0].replace(/\/+$/, "");
}

function extractStaticPath(html) {
    var m = html.match(/static[_-]?path["']?\s*[:=]\s*["']([^"'\s]+)["']/i) ||
            html.match(/["']\/(api|ajax|servers?)["']/i);
    return m ? m[1].replace(/^\//, "") : "api";
}

function extractServerPath(html) {
    var m = html.match(/server[_-]?path["']?\s*[:=]\s*["']([^"'\s]+)["']/i);
    return m ? m[1].replace(/^\//, "") : "servers";
}

function extractGenerateData(html) {
    var m = html.match(/\/generate["']?\s*,\s*\{[^}]*?["']data["']\s*:\s*["']([A-Za-z0-9+/=_-]{16,})["']/i) ||
            html.match(/["']data["']\s*:\s*["']([A-Za-z0-9+/=_-]{16,})["']/i) ||
            html.match(/body\s*:\s*JSON\.stringify\(\s*(\{[^)]{10,400}\})\s*\)/i);
    if (!m) return null;
    if (m[1].charAt(0) === "{") {
        try { return JSON.parse(m[1]); } catch(e) { return { data: m[1] }; }
    }
    return { data: m[1] };
}

function extractDirectStreams(html) {
    var out = [];
    var seen = {};
    var re = /https?:\/\/[^\s"'<>\\]+\.(m3u8|mp4|mkv|webm)(?:\?[^\s"'<>\\]*)?/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        var url = m[0].replace(/&amp;/g, "&");
        if (seen[url]) continue;
        seen[url] = true;
        out.push({ url: url, label: "", name: "VidFast Direct", type: url.indexOf(".m3u8") !== -1 ? "hls" : "mp4" });
    }
    return out;
}

function decryptOrParse(rawText) {
    var text = String(rawText || "").trim();
    if (!text) return Promise.resolve([]);

    try {
        var parsed = JSON.parse(text);
        return Promise.resolve(normalizeSources(parsed));
    } catch (e) {}

    return fetch(DEC_API, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ text: text })
    })
    .then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function(data) { return normalizeSources(data); })
    .catch(function(e) {
        console.log("[vidfast] decrypt failed: " + e.message);
        return [];
    });
}

function normalizeSources(data) {
    var out = [];

    function add(u, label, name, type, extra) {
        if (!u || typeof u !== "string") return;
        if (u.indexOf("http") !== 0) return;
        out.push(Object.assign({
            url: u.replace(/&amp;/g, "&"),
            label: label || "",
            name: name || "VidFast",
            type: type || (u.indexOf(".m3u8") !== -1 ? "hls" : "mp4")
        }, extra || {}));
    }

    function walk(node) {
        if (!node) return;
        if (typeof node === "string") {
            if (/^https?:\/\//.test(node)) add(node, "", "");
            return;
        }
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (typeof node === "object") {
            var url = node.url || node.link || node.file || node.src || node.stream || node.play || "";
            var label = node.label || node.quality || node.title || node.name || node.res || "";
            var type  = node.type || node.format || "";
            if (url) {
                add(url, String(label), node.server || node.name || "", String(type).toLowerCase(), {
                    size: node.size || "", codec: node.codec || "", audio: node.audio || "",
                    lang: node.lang || node.language || ""
                });
            } else {
                ["sources", "servers", "streams", "data", "list", "results", "items"].forEach(function(k) {
                    if (node[k]) walk(node[k]);
                });
            }
        }
    }

    walk(data);
    return out;
}

// ── Quality Filter + 4KHDHub-Style Stream Building ───────────────────────────

function classifyQuality(label, url) {
    var text = ((label || "") + " " + (url || "")).toLowerCase();
    if (/2160|4k|uhd/.test(text)) return "4K";
    if (/1080/.test(text)) return "1080p";
    return "";
}

function finalizeStreams(items, settings) {
    var seen = {};
    var filtered = [];

    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var q = classifyQuality(it.label, it.url);
        if (!q) continue;
        if (settings.qualityMode === "4k" && q !== "4K") continue;
        if (settings.qualityMode === "1080p" && q !== "1080p") continue;
        if (seen[it.url]) continue;
        seen[it.url] = true;
        filtered.push({ item: it, quality: q });
    }

    // ترتيب: 4K أولاً ثم 1080p
    filtered.sort(function(a, b) {
        if (a.quality === b.quality) return 0;
        return a.quality === "4K" ? -1 : 1;
    });

    console.log("[vidfast] final streams (STRICT " + settings.qualityMode + "): " + filtered.length);

    return filtered.map(function(entry, idx) {
        return makeStream(entry.item, entry.quality, idx);
    });
}

function makeStream(item, quality, rank) {
    var qUp = quality.toUpperCase(); // 4K أو 1080P
    var serverName = item.name || "VidFast";
    var typeTag = (item.type === "hls" || item.type === "m3u8") ? "HLS" : "MP4";
    var host = pickHost(item.url);

    var mainTitle = ["VidFast", qUp].filter(Boolean).join(" • ");
    if (item.size) mainTitle += " • " + item.size;

    var line1 = [serverName].filter(Boolean).join(" • ");
    var line2 = [typeTag, host, item.lang].filter(Boolean).join(" • ");
    var line3 = [item.codec, item.audio].filter(Boolean).join(" • ");
    var streamTitle = [line1, line2, line3].filter(Boolean).join("\n");

    var score = quality === "4K" ? 2 : 1;
    var sortTag = getInvertedSortTag(score, 10);

    return {
        name: sortTag + mainTitle,
        title: mainTitle,
        size: streamTitle,
        url: item.url,
        quality: qUp,
        headers: {
            "Referer": BASE_URL + "/",
            "Origin": BASE_URL,
            "User-Agent": UA
        },
        _host: host
    };
}

function pickHost(url) {
    try {
        var host = new URL(url).hostname.replace(/^www\./, "");
        return host;
    } catch (e) {
        return "CDN";
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fetchText(url, extraHeaders) {
    var headers = { "User-Agent": UA, "Accept": "text/html,application/json,*/*" };
    if (extraHeaders) {
        for (var k in extraHeaders) {
            if (Object.prototype.hasOwnProperty.call(extraHeaders, k)) headers[k] = extraHeaders[k];
        }
    }
    return fetch(url, { headers: headers, redirect: "follow" }).then(function(r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
    });
}

function postJson(url, body, extraHeaders) {
    var headers = {
        "User-Agent": UA,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };
    if (extraHeaders) {
        for (var k in extraHeaders) {
            if (Object.prototype.hasOwnProperty.call(extraHeaders, k)) headers[k] = extraHeaders[k];
        }
    }
    return fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body), redirect: "follow" })
    .then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
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
