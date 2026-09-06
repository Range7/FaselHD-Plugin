// DownloadEverything Provider for Nuvio — 111477-style rich metadata
// Uses proxy to bypass Cloudflare 403 on slave API
// Hermes-safe: no async/await, no const/let, no arrow functions, no URL constructor
// Shows ALL servers, filters 4K & 1080p only

// ═══ CONFIG: Replace with your Replit URL after deployment ═══
var PROXY_URL = "https://de-proxy.vercel.app/api";
// Example: "https://de-proxy-modark.repl.co/api"
// ═══════════════════════════════════════════════════════════════

var SLAVE_URL = PROXY_URL;
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
var TMDB_API_KEY = "b3556f3b206e16f82df4d1f6fd4545e6";
var TMDB_BASE = "https://api.themoviedb.org/3";

var SKIP_DOMAINS = [
    "111477.xyz", "vadapav.mov", "driveseed.org", "new3.gdflix.io",
    "rapidrar.cr", "megaup.net", "telegram.dog", "t.me"
];

var _metaCache = {};

// ═════════════════════════════════════════════════════════════════════════════
// INLINE LIBRARIES & HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function fetchT(url, opts, ms) {
    ms = ms || 15000;
    return Promise.race([
        fetch(url, opts || {}),
        new Promise(function(_, reject) {
            setTimeout(function() { reject(new Error("timeout")); }, ms);
        })
    ]);
}

function shouldSkip(url) {
    var low = url.toLowerCase();
    for (var i = 0; i < SKIP_DOMAINS.length; i++) {
        if (low.indexOf(SKIP_DOMAINS[i]) !== -1) return true;
    }
    return false;
}

function buildQueryString(obj) {
    var pairs = [];
    for (var k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
            pairs.push(encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]));
        }
    }
    return pairs.join("&");
}

// ── TMDB Metadata ──────────────────────────────────────────────────────────
function resolveMeta(tmdbId, mediaType) {
    var kind = mediaType === "tv" ? "tv" : "movie";
    var ck = kind + ":" + tmdbId;
    if (_metaCache[ck]) return Promise.resolve(_metaCache[ck]);

    var url = TMDB_BASE + "/" + kind + "/" + tmdbId + "?append_to_response=external_ids&api_key=" + TMDB_API_KEY;
    return fetchT(url, { headers: { "User-Agent": UA, "Accept": "application/json" } }, 8000)
    .then(function(r) {
        if (!r.ok) throw new Error("TMDB " + r.status);
        return r.json();
    })
    .then(function(j) {
        var title = kind === "tv" ? (j.name || j.original_name) : (j.title || j.original_title);
        var dateStr = kind === "tv" ? j.first_air_date : j.release_date;
        var year = dateStr ? parseInt(String(dateStr).slice(0, 4), 10) : null;
        var imdbId = (j.external_ids && j.external_ids.imdb_id) || null;
        var meta = { title: title, year: year, imdbId: imdbId };
        _metaCache[ck] = meta;
        return meta;
    })
    .catch(function(e) {
        console.log("[DE] TMDB error: " + e.message);
        return { title: "", year: null, imdbId: null };
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// RICH METADATA PARSING (111477 style)
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
    if (/hakunaymatata/.test(hostname)) return "Moviebox";
    if (/hubcloud/.test(hostname)) return "HubCloud";
    if (/clicknupload/.test(hostname)) return "ClicknUpload";
    if (/downloadeverything/.test(hostname)) return "DE";
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

// ═════════════════════════════════════════════════════════════════════════════
// LINK RESOLVERS
// ═════════════════════════════════════════════════════════════════════════════

function resolveHubCloud(hubUrl) {
    return fetchT(hubUrl, {
        headers: { "User-Agent": UA, "Referer": "https://downloadeverythingfromeverywhere.com/" }
    }, 10000)
    .then(function(r) { return r.text(); })
    .then(function(html) {
        var hubPhpMatch = html.match(/https?:\/\/[^\s"<>]*\/hubcloud\.php\?[^\s"<>]*/);
        if (!hubPhpMatch) return null;
        var phpUrl = hubPhpMatch[0];
        return fetchT(phpUrl, {
            headers: { "User-Agent": UA, "Referer": hubUrl }
        }, 10000)
        .then(function(r2) { return r2.text(); })
        .then(function(phpBody) {
            var r2Match = phpBody.match(/https?:\/\/[a-zA-Z0-9.\-_]+\.r2\.cloudflarestorage\.com\/[^\s"<>]+/);
            if (r2Match) return r2Match[0].replace(/&amp;/g, "&");
            var pixelMatch = phpBody.match(/https?:\/\/pixel\.hubcloud\.[a-z]+\/\?id=[^\s"<>]+/);
            if (pixelMatch) return pixelMatch[0];
            return null;
        });
    })
    .catch(function() { return null; });
}

function parseFormInputs(formHtml) {
    var params = {};
    var re = /<input[^>]+name=["\x27]([^"\x27]+)["\x27][^>]+value=["\x27]([^"\x27]*)["\x27]/gi;
    var m;
    while ((m = re.exec(formHtml)) !== null) {
        params[m[1]] = m[2];
    }
    return params;
}

function resolveClicknUpload(clicknUrl) {
    var cookies = "";
    return fetchT(clicknUrl, {
        headers: { "User-Agent": UA, "Referer": "https://downloadeverythingfromeverywhere.com/" }
    }, 10000)
    .then(function(r1) {
        cookies = r1.headers.get("set-cookie") || "";
        return r1.text();
    })
    .then(function(html1) {
        var formMatch = html1.match(/<form[^>]+method=["\x27]POST["\x27][^>]*>([\s\S]*?)<\/form>/i);
        if (!formMatch) return null;
        var params1 = parseFormInputs(formMatch[1]);
        params1["method_free"] = "Slow Download";

        return fetchT(clicknUrl, {
            method: "POST",
            headers: {
                "User-Agent": UA,
                "Referer": clicknUrl,
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookies
            },
            body: buildQueryString(params1)
        }, 10000)
        .then(function(r2) { return r2.text(); })
        .then(function(html2) {
            var formMatch2 = html2.match(/<form[^>]+method=["\x27]POST["\x27][^>]*>([\s\S]*?)<\/form>/i);
            if (!formMatch2) return null;
            var params2 = parseFormInputs(formMatch2[1]);
            params2["down_script"] = "1";

            return new Promise(function(resolve) {
                setTimeout(function() {
                    fetchT(clicknUrl, {
                        method: "POST",
                        headers: {
                            "User-Agent": UA,
                            "Referer": clicknUrl,
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Cookie": cookies
                        },
                        body: buildQueryString(params2)
                    }, 10000)
                    .then(function(r3) { return r3.text(); })
                    .then(function(html3) {
                        var directMatch = html3.match(/https?:\/\/[a-zA-Z0-9.\-_:]+\/d\/[a-zA-Z0-9_\-/]+/) ||
                                          html3.match(/window\.open\(["\x27](https?:\/\/[^"\x27]+)["\x27]\)/);
                        if (directMatch) {
                            var found = directMatch[1] || directMatch[0];
                            if (found.indexOf("clicknupload.") !== -1 && found.indexOf("/d/") === -1) {
                                resolve(null);
                            } else {
                                resolve(found);
                            }
                        } else {
                            resolve(null);
                        }
                    })
                    .catch(function() { resolve(null); });
                }, 4500);
            });
        });
    })
    .catch(function() { return null; });
}

function resolveLink(item) {
    var rawUrl = item.url || "";
    if (!rawUrl || shouldSkip(rawUrl)) return Promise.resolve(null);

    if (rawUrl.indexOf("hakunaymatata.com") !== -1) {
        return Promise.resolve({ url: rawUrl, provider: "Moviebox", headers: { "User-Agent": "Lavf/60.16.100" } });
    }
    else if (rawUrl.indexOf("pixeldrain.dev") !== -1 || rawUrl.indexOf("pixeldrain.com") !== -1) {
        var pm = rawUrl.match(/pixeldrain\.(?:dev|com)\/(?:u|l)\/([a-zA-Z0-9_-]+)/);
        if (pm) {
            return Promise.resolve({
                url: "https://pixeldrain.com/api/file/" + pm[1],
                provider: "Pixeldrain",
                headers: { "User-Agent": UA }
            });
        }
    }
    else if (rawUrl.indexOf("hubcloud.") !== -1 || rawUrl.indexOf("vcloud.zip") !== -1) {
        return resolveHubCloud(rawUrl).then(function(url) {
            if (!url) return null;
            return { url: url, provider: "HubCloud", headers: { "User-Agent": UA } };
        });
    }
    else if (rawUrl.indexOf("clicknupload.") !== -1) {
        return resolveClicknUpload(rawUrl).then(function(url) {
            if (!url) return null;
            return { url: url, provider: "ClicknUpload", headers: { "User-Agent": UA } };
        });
    }
    else if (/\.(?:mp4|mkv)(?:\?|$)/i.test(rawUrl) &&
             rawUrl.indexOf("111477.xyz") === -1 &&
             rawUrl.indexOf("vadapav.mov") === -1 &&
             rawUrl.indexOf(".cyou/res/") === -1) {
        return fetchT(rawUrl, { method: "HEAD", headers: { "User-Agent": UA } }, 3000)
        .then(function(r) {
            if (r.status === 200 || r.status === 206 || r.status === 302) {
                return { url: rawUrl, provider: item.site || "DirectStream", headers: { "User-Agent": UA } };
            }
            return null;
        })
        .catch(function() { return null; });
    }

    return Promise.resolve(null);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICH STREAM (111477 style)
// ═════════════════════════════════════════════════════════════════════════════

function enrichStream(item, resolved, meta) {
    var rawTitle = item.name || item.release || meta.title || "";
    var url = resolved.url || "";
    var provider = resolved.provider || item.site || "DownloadEverything";
    var combined = (rawTitle + " " + provider + " " + url).toLowerCase();
    var tags = Array.isArray(item.tags) ? item.tags : [];

    var quality = extractQualityLabel(rawTitle + " " + tags.join(" "));
    if (quality === "Unknown") {
        quality = extractQualityLabel(url);
    }
    var qualityUp = quality.toUpperCase();

    if (qualityUp !== "4K" && qualityUp !== "2160P" && qualityUp !== "1080P") {
        return null;
    }

    var size = extractSize(rawTitle);
    if (!size) size = extractSize(tags.join(" "));
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

    var fps = extractFps(rawTitle + " " + tags.join(" "));
    var host = pickHost(url);

    var sizeMB = parseSizeMB(size);
    var runtime = guessRuntime(qualityUp);
    var mbps = calcMbps(sizeMB, runtime);

    var mainTitleParts = [provider, qualityUp];
    if (size) mainTitleParts.push(size);
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

    var qualityScore = qualityUp === "4K" ? 4000 : qualityUp === "2160P" ? 4000 : 3000;
    var sizeScore = Math.round(parseSize(size) / 1048576);
    var totalScore = qualityScore + sizeScore;
    var sortTag = getInvertedSortTag(totalScore, 999999);

    var headers = resolved.headers || { "User-Agent": UA };

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
// MAIN getStreams
// ═════════════════════════════════════════════════════════════════════════════

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    var isTv = mediaType === "tv";
    var season = parseInt(seasonNum, 10) || 1;
    var episode = parseInt(episodeNum, 10) || 1;

    console.log("[DE] " + (isTv ? "tv" : "movie") + " tmdb=" + tmdbId + (isTv ? " S" + season + "E" + episode : ""));

    return resolveMeta(tmdbId, mediaType)
    .then(function(meta) {
        var payload = {
            mode: isTv ? "series" : "movie",
            title: meta.title || ""
        };
        if (meta.year) payload.year = String(meta.year);
        if (tmdbId) payload.tmdb_id = String(tmdbId);
        if (meta.imdbId) payload.imdb_id = meta.imdbId;
        if (isTv) {
            payload.season = String(season);
            payload.episode = String(episode);
        }

        var bodyStr = JSON.stringify(payload);
        console.log("[DE] Payload: " + bodyStr);

        var reqOpts = {
            method: "POST",
            headers: {
                "User-Agent": UA,
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                "Content-Type": "application/json; charset=utf-8",
                "DNT": "1"
            },
            body: bodyStr
        };

        return fetchT(SLAVE_URL, reqOpts, 20000)
        .then(function(r) {
            console.log("[DE] Status: " + r.status);
            if (!r.ok) {
                return r.text().then(function(errBody) {
                    console.log("[DE] Error: " + errBody);
                    throw new Error("Slave " + r.status);
                });
            }
            return r.text();
        })
        .then(function(text) {
            console.log("[DE] Response len=" + text.length);
            if (!text || text.length < 10) {
                console.log("[DE] Empty response");
                return [];
            }

            var lines = text.split(/\r?\n/);
            var promises = [];
            var totalHits = 0;
            var skippedQuality = 0;

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line) continue;
                try {
                    var parsed = JSON.parse(line);
                    if (parsed.t === "hit" && Array.isArray(parsed.links)) {
                        var site = parsed.site || "DownloadEverything";
                        var links = parsed.links;
                        totalHits += links.length;
                        console.log("[DE] Hit from " + site + ": " + links.length + " link(s)");

                        for (var j = 0; j < links.length; j++) {
                            var linkItem = links[j];
                            if (!linkItem || typeof linkItem !== "object") continue;
                            linkItem.site = site;

                            var preTags = Array.isArray(linkItem.tags) ? linkItem.tags : [];
                            var preQuality = extractQualityLabel((linkItem.name || "") + " " + preTags.join(" "));
                            if (preQuality === "Unknown") preQuality = extractQualityLabel(linkItem.url || "");
                            var preQualityUp = preQuality.toUpperCase();
                            if (preQualityUp !== "4K" && preQualityUp !== "2160P" && preQualityUp !== "1080P") {
                                skippedQuality++;
                                continue;
                            }

                            (function(itemCopy) {
                                var p = resolveLink(itemCopy)
                                .then(function(resolved) {
                                    if (!resolved || !resolved.url) return null;
                                    var enriched = enrichStream(itemCopy, resolved, meta);
                                    if (enriched) {
                                        console.log("[DE] [+] " + enriched.title);
                                    }
                                    return enriched;
                                })
                                .catch(function() { return null; });
                                promises.push(p);
                            })(linkItem);
                        }
                    }
                } catch (e) {
                    console.log("[DE] Parse error: " + e.message);
                }
            }

            console.log("[DE] Candidates=" + totalHits + " skipped=" + skippedQuality + " resolving=" + promises.length);
            if (promises.length === 0) return [];

            return Promise.all(promises).then(function(results) {
                var out = [];
                var seen = {};
                for (var k = 0; k < results.length; k++) {
                    var s = results[k];
                    if (s && s.url && !seen[s.url]) {
                        seen[s.url] = true;
                        out.push(s);
                    }
                }
                out.sort(function(a, b) {
                    var qa = a.quality === "4K" || a.quality === "2160P" ? 2 : 1;
                    var qb = b.quality === "4K" || b.quality === "2160P" ? 2 : 1;
                    return qb - qa;
                });
                console.log("[DE] Final streams: " + out.length);
                return out;
            });
        })
        .catch(function(e) {
            console.error("[DE] Slave failed: " + e.message);
            return [];
        });
    })
    .catch(function(e) {
        console.error("[DE] Fatal: " + e.message);
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
