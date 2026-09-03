// ═══════════════════════════════════════════════════════════════
//  FaselHD Provider for Nuvio — Direct Scrape via CF Proxy
//  Uses /api/fetch (Puppeteer) + enc: decryption
//  STRICT 1080p ONLY
// ═══════════════════════════════════════════════════════════════

"use strict";

var PROXY_URL  = "https://faselhdx-proxy-psi.vercel.app";
var FASEL_BASE = "https://web920x.faselhdx.life";
var TMDB_KEY   = "439c478a771f35c05022f9feabcca01c";
var UA         = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

// ── Fetch via proxy (/api/fetch returns JSON {html, url, status}) ──
async function proxyFetch(targetUrl, opts) {
    opts = opts || {};
    var method = opts.method || "GET";
    var body   = opts.body   || "";

    var proxyUrl = PROXY_URL + "/api/fetch?url=" + encodeURIComponent(targetUrl);
    if (method === "POST" && body) {
        proxyUrl += "&method=POST&body=" + encodeURIComponent(body);
    }

    try {
        var r = await fetch(proxyUrl, {
            headers: { "User-Agent": UA },
            method: "GET"
        });
        if (!r.ok) return null;
        var j = await r.json();
        if (j.error) { console.log("[FaselHD] proxy error: " + j.error); return null; }
        return { html: j.html || "", url: j.url || targetUrl, status: j.status || 200 };
    } catch (e) {
        console.log("[FaselHD] proxyFetch error: " + e.message);
        return null;
    }
}

// ── enc: decryption (same as Cloudstream) ──────────────────────────
function decryptFaselUrl(url) {
    if (!url || url.indexOf("enc:") !== 0) return url;
    var key1 = "V2@%YSU2B]G~";
    var key2 = "bv0fim4qf17";

    function ie(c) {
        var x = c.charCodeAt(0);
        if (x >= 97 && x <= 122) return x - 97;
        if (x >= 65 && x <= 90) return x - 65 + 26;
        if (x >= 48 && x <= 57) return x - 48 + 52;
        if (x === 43) return 62;
        if (x === 47) return 63;
        return 0;
    }
    function bn(x) {
        if (x <= 25) return String.fromCharCode(x + 97);
        if (x <= 51) return String.fromCharCode(x - 26 + 65);
        if (x <= 61) return String.fromCharCode(x - 52 + 48);
        if (x === 62) return '+';
        if (x === 63) return '/';
        return ' ';
    }
    function dec(e, k) {
        var r = '';
        for (var i = 0; i < e.length; i++) {
            var kc = k[i % (k.length - 1)];
            var M = ie(e[i]) - ie(kc);
            r += bn(M < 0 ? M + 64 : M);
        }
        return r;
    }
    try { return dec(dec(url.substring(4), key2), key1); }
    catch (e) { return url; }
}

// ── TMDB info ─────────────────────────────────────────────────────
async function getTMDBInfo(tmdbId, mediaType) {
    var type = mediaType === "movie" ? "movie" : "tv";
    var url  = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US";
    try {
        var r = await fetch(url);
        if (!r.ok) return null;
        var d = await r.json();
        return {
            title:         d.title || d.name || "",
            originalTitle: d.original_title || d.original_name || "",
            year:          (d.release_date || d.first_air_date || "").substring(0, 4),
            lang:          d.original_language || ""
        };
    } catch (e) { return null; }
}

// ── Text normalization ────────────────────────────────────────────
function normalizeText(str) {
    if (!str) return "";
    return str.toLowerCase()
        .replace(/[:\-\–—().,!?'"]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/مترجم/g, "").replace(/مدبلج/g, "")
        .replace(/فيلم/g, "").replace(/مسلسل/g, "")
        .trim();
}

// ── Parse search results from FaselHD HTML ────────────────────────
function parseSearchResults(html, base) {
    var out = [];
    // Try postDiv blocks
    var reBlock = /<div[^>]*class=["'][^"']*postDiv[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
    var blocks  = html.match(reBlock);
    if (!blocks) {
        reBlock = /<article[^>]*>[\s\S]*?<\/article>/gi;
        blocks  = html.match(reBlock);
    }
    if (!blocks) return out;

    for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        var hrefM  = b.match(/<a[^>]*href=["']([^"']+)["']/i);
        var titleM = b.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i) ||
                     b.match(/class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/[^>]*>/i);
        if (hrefM && titleM) {
            var href = hrefM[1];
            if (href.indexOf("http") !== 0) href = base + (href.indexOf("/") === 0 ? "" : "/") + href;
            out.push({
                url:   href,
                title: titleM[1].replace(/<[^>]+>/g, "").trim()
            });
        }
    }
    return out;
}

// ── Search FaselHD (HTML + AJAX fallback) ─────────────────────────
async function searchFaselHD(query) {
    var searchUrl = FASEL_BASE + "/?s=" + encodeURIComponent(query);
    var res = await proxyFetch(searchUrl);
    if (!res) return [];
    var results = parseSearchResults(res.html, FASEL_BASE);
    if (results.length > 0) return results;

    // AJAX fallback
    try {
        var ajaxUrl = FASEL_BASE + "/wp-admin/admin-ajax.php";
        var body = "action=dtc_live&trsearch=" + encodeURIComponent(query);
        var ajaxRes = await proxyFetch(ajaxUrl, { method: "POST", body: body });
        if (ajaxRes && ajaxRes.html) {
            return parseSearchResults(ajaxRes.html, FASEL_BASE);
        }
    } catch (e) {}
    return [];
}

// ── Extract iframe URL from page HTML ─────────────────────────────
function extractIframe(html, baseUrl) {
    var m = html.match(/<iframe[^>]*src=["']([^"']+)["']/i);
    if (m) {
        var u = m[1].replace(/&amp;/g, "&");
        if (u.indexOf("http") !== 0) {
            if (u.indexOf("//") === 0) u = "https:" + u;
            else u = baseUrl + (u.indexOf("/") === 0 ? "" : "/") + u;
        }
        return u;
    }

    m = html.match(/player_iframe\.location\.href\s*=\s*["']([^"']+)["']/i);
    if (m) {
        var u = m[1].replace(/&amp;/g, "&");
        if (u.indexOf("http") !== 0) {
            if (u.indexOf("//") === 0) u = "https:" + u;
            else u = baseUrl + (u.indexOf("/") === 0 ? "" : "/") + u;
        }
        return u;
    }

    // Look for player/embed URLs in scripts
    m = html.match(/["'](https?:\/\/[^"']*(?:player|embed)[^"']*)["']/i);
    if (m) return m[1];

    return null;
}

// ── Guess quality from URL string ─────────────────────────────────
function guessQuality(url) {
    var u = url.toLowerCase();
    if (u.indexOf("hd1080") !== -1 || u.indexOf("1080") !== -1) return "1080p";
    if (u.indexOf("hd720")  !== -1 || u.indexOf("720")  !== -1) return "720p";
    if (u.indexOf("480")    !== -1) return "480p";
    if (u.indexOf("360")    !== -1) return "360p";
    return "unknown";
}

// ── Extract m3u8 from iframe/player HTML ──────────────────────────
function extractM3U8(html, referer) {
    var streams = [];
    var seen = {};

    // 1) jwplayer setup with sources
    var jw = html.match(/jwplayer\s*\([^)]*\)\s*\.\s*setup\s*\(\s*(\{[\s\S]*?\})\s*\)/);
    if (jw) {
        try {
            var srcMatch = jw[1].match(/sources\s*:\s*(\[[\s\S]*?\])/);
            if (srcMatch) {
                var fileRe = /file\s*:\s*["']([^"']+)["']/g, fm;
                while ((fm = fileRe.exec(srcMatch[1])) !== null) {
                    var u = decryptFaselUrl(fm[1]);
                    if (u.indexOf(".m3u8") !== -1 && !seen[u]) {
                        seen[u] = true;
                        streams.push({ url: u, quality: guessQuality(u), referer: referer });
                    }
                }
            }
        } catch (e) {}
    }

    // 2) Direct m3u8 strings
    var m3u8Re = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi, mm;
    while ((mm = m3u8Re.exec(html)) !== null) {
        var u = mm[0].replace(/\\(.)/g, "$1");
        if (!seen[u]) { seen[u] = true; streams.push({ url: u, quality: guessQuality(u), referer: referer }); }
    }

    // 3) enc: encrypted URLs
    var encRe = /["'](enc:[^"']+)["']/g, em;
    while ((em = encRe.exec(html)) !== null) {
        var u = decryptFaselUrl(em[1]);
        if (u.indexOf(".m3u8") !== -1 && !seen[u]) {
            seen[u] = true;
            streams.push({ url: u, quality: guessQuality(u), referer: referer });
        }
    }

    return streams;
}

// ── Navigate to specific episode (TV only) ────────────────────────
async function getEpisodeUrl(seriesUrl, season, episode) {
    var res = await proxyFetch(seriesUrl);
    if (!res) return null;
    var html = res.html;

    var sNum = parseInt(season  || 1);
    var eNum = parseInt(episode || 1);

    // Find season divs
    var seasonRe = /<div[^>]*class=["'][^"']*seasonDiv[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
    var seasonBlocks = html.match(seasonRe);
    var seasonUrl = null;

    if (seasonBlocks && seasonBlocks[sNum - 1]) {
        var onclk = seasonBlocks[sNum - 1].match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
        if (onclk) {
            seasonUrl = onclk[1];
            if (seasonUrl.indexOf("http") !== 0) seasonUrl = FASEL_BASE + (seasonUrl.indexOf("/") === 0 ? "" : "/") + seasonUrl;
        }
    }
    if (!seasonUrl) seasonUrl = seriesUrl;

    var sRes = await proxyFetch(seasonUrl);
    if (!sRes) return null;
    var sHtml = sRes.html;

    // Try episode patterns
    var patterns = [
        new RegExp('<a[^>]*href=["\']([^"\']*الحلقة[-\\s]*' + eNum + '[^"\']*)["\']','i'),
        new RegExp('<a[^>]*href=["\']([^"\']*episode[-\\s]*' + eNum + '[^"\']*)["\']','i'),
        new RegExp('<a[^>]*href=["\']([^"\']*ep[-\\s]*' + eNum + '[^"\']*)["\']','i')
    ];
    for (var i = 0; i < patterns.length; i++) {
        var m = sHtml.match(patterns[i]);
        if (m) {
            var u = m[1];
            if (u.indexOf("http") !== 0) u = FASEL_BASE + (u.indexOf("/") === 0 ? "" : "/") + u;
            return u;
        }
    }

    // Fallback: epAll div
    var epAll = sHtml.match(/id=["']epAll["'][\s\S]*?<\/div>/i);
    if (epAll) {
        var aRe = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, am;
        while ((am = aRe.exec(epAll[0])) !== null) {
            var txt = am[2].replace(/<[^>]+>/g,"").trim();
            var num = txt.match(/\d+/);
            if (num && parseInt(num[0]) === eNum) {
                var u = am[1];
                if (u.indexOf("http") !== 0) u = FASEL_BASE + (u.indexOf("/") === 0 ? "" : "/") + u;
                return u;
            }
        }
    }
    return null;
}

// ── Title matching score ──────────────────────────────────────────
function scoreMatch(tmdbTitle, resultTitle) {
    var a = normalizeText(tmdbTitle);
    var b = normalizeText(resultTitle);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return 85;

    var wa = a.split(" ").filter(function(w){ return w.length > 2; });
    var wb = b.split(" ").filter(function(w){ return w.length > 2; });
    var matched = 0;
    for (var i = 0; i < wb.length; i++)
        for (var j = 0; j < wa.length; j++)
            if (wb[i] === wa[j]) matched++;

    return wb.length > 0 ? Math.round((matched / wb.length) * 70) : 0;
}

// ── MAIN ENTRY ────────────────────────────────────────────────────
async function getStreams(tmdbId, mediaType, season, episode) {
    if (!tmdbId) {
        console.log("[FaselHD] No TMDB ID");
        return [];
    }

    // 1) Get TMDB info
    var info = await getTMDBInfo(tmdbId, mediaType);
    if (!info || !info.title) {
        console.log("[FaselHD] TMDB lookup failed");
        return [];
    }
    console.log("[FaselHD] TMDB: " + info.title + " (" + info.year + ")");

    // 2) Search FaselHD
    var queries = [info.title];
    if (info.originalTitle && info.originalTitle !== info.title) queries.push(info.originalTitle);

    var all = [];
    for (var i = 0; i < queries.length; i++) {
        console.log("[FaselHD] Searching: " + queries[i]);
        var r = await searchFaselHD(queries[i]);
        for (var j = 0; j < r.length; j++) all.push(r[j]);
    }

    // Deduplicate
    var seenUrls = {}, unique = [];
    for (var i = 0; i < all.length; i++) {
        if (!seenUrls[all[i].url]) { seenUrls[all[i].url] = true; unique.push(all[i]); }
    }
    console.log("[FaselHD] Unique results: " + unique.length);

    // 3) Score & pick best match
    var best = null, bestScore = 0;
    for (var i = 0; i < unique.length; i++) {
        var sc = scoreMatch(info.title, unique[i].title);
        if (info.originalTitle) sc = Math.max(sc, scoreMatch(info.originalTitle, unique[i].title));
        if (info.year) {
            var yr = unique[i].title.match(/\b(19|20)\d{2}\b/);
            if (yr && yr[0] === info.year) sc += 10;
        }
        if (sc > bestScore) { bestScore = sc; best = unique[i]; }
    }

    if (!best || bestScore < 40) {
        console.log("[FaselHD] No good match (best=" + bestScore + ")");
        return [];
    }
    console.log("[FaselHD] Best match: " + best.title + " (" + bestScore + ") -> " + best.url);

    var pageUrl = best.url;

    // 4) For TV: navigate to specific episode
    if (mediaType !== "movie") {
        var epUrl = await getEpisodeUrl(pageUrl, season, episode);
        if (epUrl) {
            console.log("[FaselHD] Episode URL: " + epUrl);
            pageUrl = epUrl;
        } else {
            console.log("[FaselHD] Episode not found, using series page");
        }
    }

    // 5) Get page and extract iframe
    var pageRes = await proxyFetch(pageUrl);
    if (!pageRes) {
        console.log("[FaselHD] Failed to load page");
        return [];
    }

    var iframeUrl = extractIframe(pageRes.html, pageUrl);
    if (!iframeUrl) {
        console.log("[FaselHD] No iframe found");
        return [];
    }
    console.log("[FaselHD] Iframe: " + iframeUrl);

    // 6) Get iframe content and extract m3u8
    var ifrRes = await proxyFetch(iframeUrl);
    if (!ifrRes) {
        console.log("[FaselHD] Failed to load iframe");
        return [];
    }

    var rawStreams = extractM3U8(ifrRes.html, iframeUrl);
    console.log("[FaselHD] Raw streams: " + rawStreams.length);

    // ═══════════════════════════════════════════════════════════════
    //  STRICT 1080p ONLY — drop everything else
    // ═══════════════════════════════════════════════════════════════
    var hdStreams = rawStreams.filter(function(s) {
        return s.quality === "1080p" || s.url.toLowerCase().indexOf("1080") !== -1 || s.url.toLowerCase().indexOf("hd1080") !== -1;
    });

    console.log("[FaselHD] 1080p streams: " + hdStreams.length);

    if (hdStreams.length === 0) {
        console.log("[FaselHD] No 1080p found. Available qualities: " +
            rawStreams.map(function(s){ return s.quality; }).join(", "));
        return [];
    }

    return hdStreams.map(function(s) {
        return {
            name:    "FaselHD",
            title:   "فاصل إعلاني · 1080p",
            url:     s.url,
            quality: "1080p",
            headers: {
                Referer:      s.referer || iframeUrl,
                "User-Agent": UA
            }
        };
    });
}

module.exports = { getStreams: getStreams };
