/**
 * 4KHDHub Nuvio Provider
 * Enhanced search + 1080p only + Pixeldrain only + Largest Pixeldrain server
 */

var BASE_URL = "https://4khdhub.one";
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

var cdnCache = {};
var gxUrlCache = {};
var searchCache = {};

function onSettings() {
    return [
        {
            type: "select",
            key: "sortBy",
            name: "sort_by",
            label: "Sort By",
            options: [
                { label: "Quality (High to Low) + Size", value: "quality" },
                { label: "Size (Largest First)", value: "size" }
            ],
            default: "quality"
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
    var sortBy = "quality";
    try {
        var s = customSettings;
        if (!s && typeof globalThis !== "undefined") {
            s = globalThis.SCRAPER_SETTINGS || globalThis.SETTINGS || globalThis.settings;
        }
        if (!s && typeof global !== "undefined") {
            s = global.SCRAPER_SETTINGS || global.SETTINGS || global.settings;
        }
        if (!s && typeof window !== "undefined") {
            s = window.SCRAPER_SETTINGS || window.SETTINGS || window.settings;
        }
        if (s) {
            var val = s.sortBy || s.sort_by || s.sort || "";
            if (typeof val === "object" && val !== null) {
                val = val.value || val.key || "";
            }
            var str = String(val).toLowerCase();
            if (str.indexOf("size") !== -1 || str.indexOf("largest") !== -1) {
                sortBy = "size";
            }
        }
    } catch (e) {
        console.error("[4khdhub] resolveSettings error: " + e.message);
    }
    return { sortBy: sortBy };
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

function getStreams(tmdbId, mediaType, season, episode) {
    var rawId = tmdbId;
    if (typeof tmdbId === "object" && tmdbId !== null) {
        rawId = tmdbId.tmdbId || tmdbId.id || tmdbId.imdbId || tmdbId.imdb_id || tmdbId;
    }
    var cleanId = String(rawId || "").replace(/^(?:tmdb|imdb):/i, "").trim();

    var type = (mediaType === "tv" || mediaType === "series") ? "tv" : "movie";
    var ep   = parseInt(episode, 10) || 1;
    var sea  = parseInt(season, 10)  || 1;
    console.log("[4khdhub] " + type + " id=" + cleanId + (type === "tv" ? " S" + sea + "E" + ep : ""));

    var tmdbKey = getTmdbKey();
    var isImdb = cleanId.indexOf("tt") === 0;
    var tmdbEndpoint = type === "tv" ? "tv" : "movie";
    var tmdbPath = isImdb
        ? "/3/find/" + cleanId + "?api_key=" + tmdbKey + "&external_source=imdb_id"
        : "/3/" + tmdbEndpoint + "/" + cleanId + "?api_key=" + tmdbKey;

    var tmdbHosts = ["https://api.themoviedb.org", "https://api.tmdb.org"];

    function tryTmdb(idx) {
        if (idx >= tmdbHosts.length) {
            console.error("[4khdhub] TMDB all hosts failed");
            return Promise.resolve([]);
        }
        var url = tmdbHosts[idx] + tmdbPath;
        return fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
        .then(function(r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
        })
        .then(function(data) {
            var item = data;
            var imdbId = "";
            if (isImdb) {
                var results = type === "tv" ? (data.tv_results || []) : (data.movie_results || []);
                if (!results.length) results = (data.movie_results || []).concat(data.tv_results || []);
                item = results[0] || {};
                imdbId = cleanId;
            }
            var title = item.title || item.name || "";
            var rawDate = item.release_date || item.first_air_date || "";
            var year  = rawDate ? rawDate.substring(0, 4) : "";
            var runtime = null;

            // ── فحص الأنمي: إذا كان النوع Animation واللغة الأصلية يابانية → رفض ─────
            var genres = item.genres || [];
            var isAnimation = false;
            for (var g = 0; g < genres.length; g++) {
                if (genres[g] && genres[g].name && genres[g].name.toLowerCase() === "animation") {
                    isAnimation = true;
                    break;
                }
            }
            var originalLang = item.original_language || "";
            var originCountry = item.origin_country || [];
            var isJapaneseAnime = isAnimation && (originalLang === "ja" || originCountry.indexOf("JP") !== -1);
            
            if (isJapaneseAnime) {
                console.log("[4khdhub] Japanese Anime detected, skipping: " + title);
                return [];
            }
            // ───────────────────────────────────────────────────────────────────────────

            if (type === "tv") {
                runtime = (item.episode_run_time && item.episode_run_time[0]) || null;
                imdbId = imdbId || (item.external_ids && item.external_ids.imdb_id) || "";
            } else {
                runtime = item.runtime || null;
                imdbId = imdbId || item.imdb_id || "";
            }
            if (!title) { console.log("[4khdhub] TMDB no title"); return []; }
            console.log("[4khdhub] " + title + " (" + year + ") runtime=" + runtime + "min imdb=" + imdbId);
            return scrape4KHDHub(title, year, type, sea, ep, runtime, imdbId);
        })
        .catch(function(e) {
            console.log("[4khdhub] TMDB host " + tmdbHosts[idx] + " failed: " + e.message + " — trying next");
            return tryTmdb(idx + 1);
        });
    }

    return tryTmdb(0);
}

function scrape4KHDHub(title, year, type, season, episode, runtime, imdbId) {
    var cleanTitle = title.replace(/&/g, "and").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    var searchCacheKey = cleanTitle + "|" + year + "|" + type + "|" + season;
    
    if (searchCache[searchCacheKey]) {
        console.log("[4khdhub] search cache hit: " + searchCache[searchCacheKey]);
        return fetchText(searchCache[searchCacheKey]).then(function(postHtml) {
            return processPostPage(postHtml, searchCache[searchCacheKey], type, season, episode, title, runtime);
        });
    }

    var strategies = [];
    
    if (imdbId) {
        strategies.push({
            name: "imdb",
            url: BASE_URL + "/?s=" + encodeURIComponent(imdbId)
        });
    }
    
    if (year) {
        strategies.push({
            name: "title_year",
            url: BASE_URL + "/?s=" + encodeURIComponent(cleanTitle + " " + year)
        });
    }
    
    if (type === "tv") {
        strategies.push({
            name: "title_season",
            url: BASE_URL + "/?s=" + encodeURIComponent(cleanTitle + " Season " + season)
        });
    }
    
    strategies.push({
        name: "title",
        url: BASE_URL + "/?s=" + encodeURIComponent(cleanTitle)
    });

    strategies.push({
        name: "wp_api",
        url: BASE_URL + "/wp-json/wp/v2/posts?search=" + encodeURIComponent(cleanTitle + (year ? " " + year : "")) + "&per_page=20"
    });

    var strategyIndex = 0;

    function tryNextStrategy() {
        if (strategyIndex >= strategies.length) {
            console.log("[4khdhub] all search strategies failed");
            return [];
        }
        var strategy = strategies[strategyIndex++];
        console.log("[4khdhub] search strategy [" + strategy.name + "]: " + strategy.url);

        return fetchText(strategy.url)
        .then(function(html) {
            if (!html) return tryNextStrategy();

            var postUrl = null;
            
            if (strategy.name === "wp_api") {
                try {
                    var posts = JSON.parse(html);
                    if (posts && posts.length > 0) {
                        postUrl = posts[0].link;
                    }
                } catch(e) {}
            } else {
                postUrl = findBestPostUrl(html, title, year, type, season);
            }

            if (!postUrl) {
                console.log("[4khdhub] strategy [" + strategy.name + "] no post found");
                return tryNextStrategy();
            }

            console.log("[4khdhub] post found: " + postUrl);
            searchCache[searchCacheKey] = postUrl;
            return fetchText(postUrl).then(function(postHtml) {
                return processPostPage(postHtml, postUrl, type, season, episode, title, runtime);
            });
        })
        .catch(function(e) {
            console.log("[4khdhub] strategy [" + strategy.name + "] error: " + e.message);
            return tryNextStrategy();
        });
    }

    return tryNextStrategy();
}

function absoluteUrl(url, base) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    base = base || BASE_URL;
    try {
        return new URL(url, base).toString();
    } catch(e) {
        if (url.indexOf("/") === 0) {
            var m = base.match(/^https?:\/\/[^\/]+/i);
            return (m ? m[0] : BASE_URL) + url;
        }
        return base.replace(/\/+$/, "") + "/" + url;
    }
}

function findBestPostUrl(html, title, year, type, season) {
    var normTitle = norm(title);
    var targetYear = year ? parseInt(year, 10) : 0;
    var targetSeason = type === "tv" ? parseInt(season, 10) : 0;

    var linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var candidates = [];
    var seen = {};
    var m;

    while ((m = linkRegex.exec(html)) !== null) {
        var rawHref = m[1];
        var href = absoluteUrl(rawHref, BASE_URL);
        var innerHtml = m[2];
        var text = decodeEntities(innerHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

        if (seen[href]) continue;
        if (href.indexOf("4khdhub.one") === -1) continue;
        if (href.indexOf("/category/") !== -1 || href.indexOf("/tag/") !== -1 ||
            href.indexOf("/page/") !== -1 || href.indexOf("?s=") !== -1 ||
            href.indexOf("/author/") !== -1 || href === BASE_URL || href === BASE_URL + "/") continue;
        if (/\.(css|js|png|jpg|jpeg|gif|svg|webp|ico)($|\?)/i.test(href)) continue;

        seen[href] = true;
        var slugText = href.split("/").filter(Boolean).pop().replace(/[-_+]/g, " ");
        candidates.push({ url: href, title: text || slugText, slug: slugText });
    }

    if (candidates.length === 0) return null;

    var best = null;
    var bestScore = -1;

    var tokens = normTitle.split(/\s+/).filter(function(t) { return t.length > 1; });
    var condensedTitle = tokens.map(function(t) { return t.charAt(0); }).join("");

    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        var normPost = norm(c.title + " " + c.slug);
        var normSlug = norm(c.slug);
        var score = 0;

        if (normSlug.indexOf(normTitle) !== -1 || normPost.indexOf(normTitle) !== -1) {
            score += 200;
        }
        
        if (condensedTitle.length >= 2) {
            var condensedSlug = normSlug.replace(/\s/g, "");
            if (condensedSlug.indexOf(condensedTitle) !== -1) {
                score += 100;
            }
        }

        var matched = tokens.filter(function(t) {
            return new RegExp("(?:^|[\\s-])" + t + "(?:[\\s-]|$)", "i").test(normPost);
        });
        score += (matched.length / Math.max(tokens.length, 1)) * 150;

        var ym = (c.title + " " + c.slug).match(/\b(19|20)\d{2}\b/);
        var postYear = ym ? parseInt(ym[0], 10) : 0;
        if (targetYear && postYear) {
            if (postYear === targetYear) score += 80;
            else if (Math.abs(postYear - targetYear) > 1) score -= 100;
        }

        if (type === "tv" && targetSeason) {
            var sm = (c.title + " " + c.slug).match(/\b(?:season\s*0*(\d+)|s0*(\d+))\b/i);
            var postSeason = sm ? parseInt(sm[1] || sm[2], 10) : 0;
            if (postSeason === targetSeason) score += 100;
            else if (postSeason && postSeason !== targetSeason) score -= 150;
        }

        if (type === "tv" && /\bseries\b/i.test(normSlug)) score += 30;
        if (type === "movie" && /\bmovie\b/i.test(normSlug)) score += 30;

        if (score > bestScore) {
            bestScore = score;
            best = c.url;
        }
    }

    console.log("[4khdhub] best post score: " + bestScore);
    return bestScore >= 40 ? best : null;
}

function processPostPage(html, postUrl, type, season, episode, showTitle, runtime) {
    var isTv = type === "tv";
    var settings = resolveSettings();

    var downloadLinks = extractDownloadLinks(html, isTv, season, episode);
    console.log("[4khdhub] download links found: " + downloadLinks.length);

    if (!downloadLinks.length) return [];

    var resolves = downloadLinks.map(function(item) {
        return resolveDirect(item.url, postUrl)
        .then(function(res) {
            if (!res) return [];
            var urls = Array.isArray(res) ? res : [res];
            var list = [];
            for (var i = 0; i < urls.length; i++) {
                var st = makeStream(item, urls[i], isTv, showTitle, season, episode, settings, runtime);
                if (st) list.push(st);
            }
            return list;
        })
        .catch(function() { return []; });
    });

    return Promise.all(resolves).then(function(streamGroups) {
        var out = [];
        var seen = {};
        for (var i = 0; i < streamGroups.length; i++) {
            var grp = streamGroups[i];
            if (!grp) continue;
            var list = Array.isArray(grp) ? grp : [grp];
            for (var j = 0; j < list.length; j++) {
                var s = list[j];
                if (s && s.url && !seen[s.url]) {
                    seen[s.url] = true;
                    out.push(s);
                }
            }
        }

        // فلترة 1080p فقط
        out = out.filter(function(s) {
            return (s.quality || "").toUpperCase() === "1080P";
        });

        // فلترة إضافية: فقط Pixeldrain
        out = out.filter(function(s) {
            return (s._host === "PixelDrain" || s.url.toLowerCase().indexOf("pixeldrain") !== -1);
        });

        // ترتيب تنازلي حسب الحجم (الأكبر أولاً)
        if (out.length > 1) {
            out.sort(function(a, b) {
                return parseSize(b._sizeRaw) - parseSize(a._sizeRaw);
            });
            // نرجع فقط الأكبر حجماً
            out = [out[0]];
        }

        console.log("[4khdhub] final streams (1080p Pixeldrain only, largest): " + out.length);
        return out;
    });
}

function extractDownloadLinks(html, isTv, season, episode) {
    var items = [];
    var seenUrls = {};

    if (isTv) {
        var targetEp = parseInt(episode, 10) || 1;
        var targetSea = parseInt(season, 10) || 1;
        var sPad = targetSea < 10 ? "0" + targetSea : "" + targetSea;
        var ePad = targetEp < 10 ? "0" + targetEp : "" + targetEp;

        var epPatterns = [
            new RegExp("(?:Episode|Ep|E)[\\s.-]*0*" + targetEp + "\\b", "i"),
            new RegExp("S" + sPad + "[\\s.-]*E" + ePad, "i"),
            new RegExp("Season\\s*0*" + targetSea + "\\s*Episode\\s*0*" + targetEp, "i")
        ];

        var episodeSection = html;
        var epSectionStart = html.indexOf("S" + sPad + "E" + ePad);
        if (epSectionStart < 0) {
            epSectionStart = html.indexOf("Season " + targetSea);
        }
        if (epSectionStart >= 0) {
            var epSectionEnd = html.indexOf("Season " + (targetSea + 1), epSectionStart);
            if (epSectionEnd < 0) epSectionEnd = html.length;
            episodeSection = html.substring(epSectionStart, epSectionEnd);
        }

        var aRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = aRe.exec(episodeSection)) !== null) {
            var href = m[1];
            var btnText = decodeEntities(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

            var startIdx = Math.max(0, m.index - 800);
            var context = episodeSection.substring(startIdx, m.index + 300).replace(/<[^>]+>/g, " ");

            var isTargetEpisode = false;
            for (var p = 0; p < epPatterns.length; p++) {
                if (epPatterns[p].test(context) || epPatterns[p].test(btnText)) {
                    isTargetEpisode = true;
                    break;
                }
            }

            if (!isTargetEpisode) continue;
            if (!isHubUrl(href)) continue;
            if (seenUrls[href]) continue;
            seenUrls[href] = true;

            var label = extractQualityLabel(context + " " + btnText);
            var size  = extractSize(context + " " + btnText);

            items.push({
                url: href,
                label: label,
                size: size,
                rawLabel: context.slice(0, 200)
            });
        }
    } else {
        var aRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = aRe.exec(html)) !== null) {
            var href = m[1];
            var btnText = decodeEntities(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

            if (!isHubUrl(href)) continue;
            if (seenUrls[href]) continue;
            seenUrls[href] = true;

            var startIdx = Math.max(0, m.index - 1000);
            var context = html.substring(startIdx, m.index + 300).replace(/<[^>]+>/g, " ");

            var label = extractQualityLabel(context + " " + btnText);
            var size  = extractSize(context + " " + btnText);

            items.push({
                url: href,
                label: label,
                size: size,
                rawLabel: context.slice(0, 200)
            });
        }
    }

    if (isTv && items.length === 0) {
        console.log("[4khdhub] no episode-specific links, trying full page extraction");
        var aRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = aRe.exec(html)) !== null) {
            var href = m[1];
            if (!isHubUrl(href)) continue;
            if (seenUrls[href]) continue;
            seenUrls[href] = true;

            var startIdx = Math.max(0, m.index - 500);
            var context = html.substring(startIdx, m.index + 200).replace(/<[^>]+>/g, " ");

            items.push({
                url: href,
                label: extractQualityLabel(context),
                size: extractSize(context),
                rawLabel: context.slice(0, 200)
            });
        }
    }

    return items;
}

function isHubUrl(url) {
    if (!url || typeof url !== "string") return false;
    var low = url.toLowerCase();
    return /hubcloud\.[a-z0-9.-]+/i.test(low) ||
           /hubdrive\.[a-z0-9.-]+/i.test(low) ||
           /hubcdn\.[a-z0-9.-]+/i.test(low) ||
           /hblinks\.[a-z0-9.-]+/i.test(low) ||
           /gadgetsweb\.[a-z0-9.-]+/i.test(low) ||
           /oxxfile\.[a-z0-9.-]+/i.test(low) ||
           low.indexOf("/drive/") !== -1 ||
           low.indexOf("/file/") !== -1 ||
           low.indexOf(".r2.dev") !== -1 ||
           low.indexOf("workers.dev") !== -1;
}

function resolveDirect(url, referer) {
    var low = (url || "").toLowerCase();
    if (/hubdrive\.[a-z0-9.-]+/i.test(low) || low.indexOf("/file/") !== -1) {
        return resolveHubDrive(url);
    }
    if (/hubcloud\.[a-z0-9.-]+/i.test(low) || low.indexOf("/drive/") !== -1) {
        return resolveHubCloud(url);
    }
    if (/hubcdn\.[a-z0-9.-]+/i.test(low)) {
        return resolveHubCdn(url);
    }
    if (isDirectCdn(url)) {
        return Promise.resolve([stripToken(url)]);
    }
    return Promise.resolve([]);
}

function resolveHubCloud(startUrl) {
    var driveMatch = startUrl.match(/\/drive\/([A-Za-z0-9_\-]+)/);
    var driveId = driveMatch ? driveMatch[1] : "";

    if (driveId && cdnCache[driveId]) {
        var cached = cdnCache[driveId];
        var cachedList = Array.isArray(cached) ? cached : [cached];
        console.log("[4khdhub-resolver] L0 cache hit (" + cachedList.length + " streams)");
        return Promise.resolve(cachedList);
    }

    return fetchText(startUrl, { "Referer": BASE_URL + "/" })
    .then(function(html) {
        var directList = extractAllCdnsFromBridgePage(html);
        if (directList.length) {
            var selectedDirect = directList.slice(0, 3);
            if (driveId) cdnCache[driveId] = selectedDirect;
            return selectedDirect;
        }

        var tm = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        var filename = tm ? tm[1].trim() : "";
        var cdnHash = filename ? md5(filename) : "";

        if (driveId && gxUrlCache[driveId]) {
            var cachedBridgeUrl = gxUrlCache[driveId];
            return fetchText(cachedBridgeUrl, { "Referer": startUrl })
            .then(function(html2) {
                var cdnList = extractAllCdnsFromBridgePage(html2);
                if (cdnList.length) {
                    var selected = cdnList.slice(0, 3);
                    if (driveId) cdnCache[driveId] = selected;
                    return selected;
                }
                return [];
            });
        }

        var bridgeUrl = null;

        var b64Match = html.match(/(?:id=["']download["'][^>]+x-href|x-href[^>]+id=["']download["'])[^>]*=["']([A-Za-z0-9+/=]{20,})["']/i) ||
                       html.match(/x-href=["']([A-Za-z0-9+/=]{20,})["']/i) ||
                       html.match(/data-href=["']([A-Za-z0-9+/=]{20,})["']/i);
        if (b64Match) {
            try {
                var decoded = b64Match[1].indexOf("http") === 0 ? b64Match[1] : atob(b64Match[1]);
                if (decoded && decoded.indexOf("http") === 0) {
                    bridgeUrl = decoded;
                }
            } catch(e) {}
        }

        if (!bridgeUrl) {
            var jsMatch = html.match(/var\s+(?:url|download_url|redirect_url|link)\s*=\s*['"](https?:\/\/[^'"]+)['"]/i) ||
                          html.match(/window\.location(?:\.href)?\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
            if (jsMatch) {
                bridgeUrl = jsMatch[1].replace(/&amp;/g, "&");
            }
        }

        if (!bridgeUrl) {
            var btnMatch = html.match(/<a\s+[^>]*id=["']download["'][^>]*href=["'](https?:\/\/[^"']+)["']/i) ||
                           html.match(/<a\s+[^>]*class=["'][^"']*btn[^"']*["'][^>]*href=["'](https?:\/\/[^"']*(?:hubcloud\.php|download\.php|drive\.php)[^"']*)["']/i) ||
                           html.match(/href=["'](https?:\/\/[^"']*(?:hubcloud\.php|download\.php)[^"']*)["']/i);
            if (btnMatch) {
                bridgeUrl = btnMatch[1].replace(/&amp;/g, "&");
            }
        }

        if (!bridgeUrl) {
            var tokenPathMatch = html.match(/var\s+url\s*=\s*['"](\/drive\/[^'"]+token=[^'"]+)['"]/i) ||
                                 html.match(/href=["'](\/drive\/[^'"]+token=[^'"]+)["']/i);
            if (tokenPathMatch) {
                bridgeUrl = absoluteUrl(tokenPathMatch[1].replace(/&amp;/g, "&"), startUrl);
            }
        }

        if (bridgeUrl) {
            bridgeUrl = absoluteUrl(bridgeUrl, startUrl);
            if (driveId) gxUrlCache[driveId] = bridgeUrl;

            return fetchText(bridgeUrl, { "Referer": startUrl })
            .then(function(html2) {
                var cdnList = extractAllCdnsFromBridgePage(html2);
                if (cdnList.length) {
                    var selected = cdnList.slice(0, 3);
                    if (driveId) cdnCache[driveId] = selected;
                    return selected;
                }
                var first = extractFirstCdnUrl(html2);
                return first ? [first] : [];
            });
        }

        return [];
    })
    .catch(function(e) {
        console.log("[4khdhub-resolver] HubCloud error: " + e.message);
        return [];
    });
}

function extractAllCdnsFromBridgePage(html) {
    if (!html || typeof html !== "string") return [];
    var list = [];
    var seen = {};

    function add(u) {
        if (!u) return;
        var clean = stripToken(u.replace(/&amp;/g, "&"));
        if (!clean || clean.indexOf(".zip") !== -1 || seen[clean]) return;
        seen[clean] = true;
        list.push(clean);
    }

    var fslMatch = html.match(/<a[^>]+id=["']fsl["'][^>]+href=["']([^"']+)["']/i) ||
                   html.match(/href=["']([^"']+)["'][^>]+id=["']fsl["']/i);
    if (fslMatch) add(fslMatch[1]);

    var cdnPatterns = [
        /https?:\/\/[a-z0-9.-]*auvps\.buzz\/[^\s"'<>]+/gi,
        /https?:\/\/[a-z0-9.-]*homelander\.buzz\/[^\s"'<>]+/gi,
        /https?:\/\/[a-z0-9.-]*obsession\.buzz\/[^\s"'<>]+/gi,
        /https?:\/\/[a-z0-9.-]*mandalorian\.buzz\/[^\s"'<>]+/gi,
        /https?:\/\/[a-z0-9.-]*noirspy\.buzz\/[^\s"'<>]+/gi,
        /https?:\/\/[a-z0-9.-]+\.buzz\/[^\s"'<>]+/gi,
        /https?:\/\/[a-z0-9.-]+\.r2\.dev\/[^\s"'<>]+/gi,
        /https?:\/\/[a-z0-9.-]+\.r2\.cloudflarestorage\.com\/[^\s"'<>]+/gi,
        /https?:\/\/cloudserver[^\s"'<>]+\.workers\.dev\/[^\s"'<>]+/gi,
        /https?:\/\/[a-z0-9.-]+\.workers\.dev\/[^\s"'<>]+/gi,
        /https?:\/\/fsl-buckets\.life\/[^\s"'<>]+/gi
    ];

    for (var i = 0; i < cdnPatterns.length; i++) {
        var matches = html.match(cdnPatterns[i]);
        if (matches) {
            for (var j = 0; j < matches.length; j++) {
                add(matches[j]);
            }
        }
    }

    var pxlMatch = html.match(/var\s+pxl\s*=\s*["']https:\/\/pixeldrain\.[a-z0-9.-]+\/u\/([A-Za-z0-9_-]+)["']/i) ||
                   html.match(/href=["']https:\/\/pixeldrain\.[a-z0-9.-]+\/u\/([A-Za-z0-9_-]+)["']/i);
    if (pxlMatch && pxlMatch[1]) {
        add("https://pixeldrain.com/api/file/" + pxlMatch[1]);
    }

    return list;
}

function extractCdnFromBridgePage(html) {
    var all = extractAllCdnsFromBridgePage(html);
    return all.length ? all[0] : null;
}

function resolveHubDrive(hubdriveUrl) {
    return fetchText(hubdriveUrl, { "Referer": BASE_URL + "/" })
    .then(function(html) {
        var hcMatch = html.match(/href=["'](https?:\/\/(?:[a-z0-9.-]*hubcloud|[a-z0-9.-]*hub-cloud)\.[a-z0-9.-]+\/drive\/[A-Za-z0-9_\-]+)["']/i) ||
                      html.match(/href=["'](https?:\/\/[^"']*hubcloud\.[^"']+)["']/i);
        if (hcMatch && hcMatch[1]) {
            return resolveHubCloud(hcMatch[1].replace(/&amp;/g, "&"));
        }
        return [];
    })
    .catch(function(e) {
        console.log("[4khdhub-resolver] HubDrive error: " + e.message);
        return [];
    });
}

function resolveHubCdn(hubcdnUrl) {
    return fetchText(hubcdnUrl, { "Referer": BASE_URL + "/" })
    .then(function(html) {
        var reurlMatch = html.match(/var reurl\s*=\s*["'][^"']*\?r=([A-Za-z0-9+/=]+)["']/i);
        if (reurlMatch && reurlMatch[1]) {
            try {
                var decoded = atob(reurlMatch[1]);
                if (decoded.indexOf("hubcloud") !== -1) return resolveHubCloud(decoded);
                if (decoded.indexOf("hubdrive") !== -1) return resolveHubDrive(decoded);
                if (isDirectCdn(decoded)) return [stripToken(decoded)];
            } catch(e) {}
        }
        var nextMatch = html.match(/href=["'](https?:\/\/[^"']*(?:hubcloud|hubdrive)\.[a-z0-9.-]+\/[^"']+)["']/i);
        if (nextMatch) {
            var nextUrl = nextMatch[1].replace(/&amp;/g, "&");
            if (nextUrl.indexOf("hubcloud") !== -1) return resolveHubCloud(nextUrl);
            if (nextUrl.indexOf("hubdrive") !== -1) return resolveHubDrive(nextUrl);
        }
        return [];
    })
    .catch(function() { return []; });
}

function isDirectCdn(url) {
    if (!url) return false;
    var low = url.toLowerCase();
    return low.indexOf(".r2.dev") !== -1 || low.indexOf(".r2.cloudflarestorage.com") !== -1 ||
           low.indexOf(".buzz/") !== -1 || low.indexOf("workers.dev/") !== -1 ||
           low.indexOf("pixeldrain.dev/api/file/") !== -1;
}

function extractFirstCdnUrl(html) {
    var m = html.match(/href=["'](https?:\/\/[^"']+(?:\.r2\.dev|\.buzz|\.workers\.dev)[^"']+)["']/i);
    return m ? stripToken(m[1]) : null;
}

var AUDIO_TABLE = [
    [/ddp.?51.*truehd.*71|truehd.*71.*ddp.?51/i, "DDP 5.1 + TrueHD 7.1"],
    [/ddp.?51.*ddp.?71|ddp.?71.*ddp.?51/i, "DDP 5.1 + DDP 7.1"],
    [/ddp.?51.*aac.?71|aac.?71.*ddp.?51/i, "DDP 5.1 + AAC 7.1"],
    [/ddp.?51/i, "DDP 5.1"],
    [/truehd/i, "TrueHD 7.1"],
    [/aac.*71|71.*aac/i, "AAC 7.1"],
    [/aac/i, "AAC 5.1"],
];

function parseSizeMB(sizeStr) {
    if (!sizeStr) return null;
    var m = /(\d+\.?\d*)\s*(GB|MB)/i.exec(sizeStr);
    if (!m) return null;
    var val = parseFloat(m[1]);
    return m[2].toUpperCase() === "GB" ? val * 1024 : val;
}

function calcMbps(sizeMB, runtimeMinutes) {
    if (!sizeMB || !runtimeMinutes) return null;
    var bits = sizeMB * 1024 * 1024 * 8;
    var seconds = runtimeMinutes * 60;
    return (bits / seconds / 1000000).toFixed(1) + " Mbps";
}

function extractFps(text) {
    var m = /\b(24|25|30|48|60|120)\s*fps\b/i.exec(text);
    return m ? m[1] + "fps" : "";
}

function makeStream(item, cdnUrl, isTv, showTitle, season, episode, settings, runtime) {
    if (!cdnUrl) return null;
    settings = settings || resolveSettings();

    var label  = item.label    || "Unknown";
    var size   = item.size     || "";
    var decodedUrl = "";
    try { decodedUrl = decodeURIComponent(cdnUrl); } catch(e) { decodedUrl = cdnUrl; }
    var raw    = (item.rawLabel || "") + " " + label + " " + decodedUrl;

    var quality = extractQualityLabel(raw);
    if (!size) {
        size = extractSize(raw);
    }

    var combined = raw.toLowerCase();
    var langParts = [];
    if (/\b(?:english|eng)\b/.test(combined)) langParts.push("English");
    if (/\bhindi\b/.test(combined)) langParts.push("Hindi");
    if (/\btamil\b/.test(combined)) langParts.push("Tamil");
    if (/\btelugu\b/.test(combined)) langParts.push("Telugu");

    var source = "WEB-DL";
    var isRemux = false;
    if (/\bremux\b/.test(combined)) { source = "Blu-ray"; isRemux = true; }
    else if (/\bblu[-\s]?ray\b/.test(combined)) source = "Blu-ray";
    else if (/\b(?:webrip|hdrip)\b/.test(combined)) source = "WEB-Rip";

    var hdrTag = "";
    if (/\b(?:hdr10\+|hdr10p)\b/.test(combined)) hdrTag = "HDR10+";
    else if (/\bhdr10\b/.test(combined)) hdrTag = "HDR10";
    else if (/\bhdr\b/.test(combined)) hdrTag = "HDR";
    else if (/\bsdr\b/.test(combined)) hdrTag = "SDR";

    var bit10Tag = /\b10bit\b/.test(combined) ? "10Bit" : "";
    var dvTag = /\b(?:dv|dolby\s*vision)\b/.test(combined) ? "DV" : "";
    var codec = (/\b(?:hevc|x265|265)\b/.test(combined) || quality.toUpperCase() === "2160P") ? "H.265" : "H.264";
    var isImax = /\bimax\b/.test(combined);

    var audio = "DDP 5.1";
    for (var i = 0; i < AUDIO_TABLE.length; i++) {
        if (AUDIO_TABLE[i][0].test(combined)) { audio = AUDIO_TABLE[i][1]; break; }
    }
    if (/\batmos\b/.test(combined)) audio += " Atmos";

    var sizeMB = parseSizeMB(size);
    var mbps = calcMbps(sizeMB, runtime);
    var fps = extractFps(raw);

    var qualityUp = quality.toUpperCase();
    var mainTitle = ["4KHDHub", qualityUp, size].filter(Boolean).join(" • ");
    var line1 = langParts.join(" • ");
    var line2 = [source, isRemux && "REMUX", isImax && "IMAX", pickCdn(cdnUrl), mbps, fps].filter(Boolean).join(" • ");
    var line3 = [bit10Tag, dvTag, hdrTag, codec, audio].filter(Boolean).join(" • ");
    var streamTitle = [line1, line2, line3].filter(Boolean).join("\n");

    var sizeInMB = Math.round(parseSize(size) / 1048576);
    var sortTag = getInvertedSortTag(sizeInMB, 999999);

    return {
        name: sortTag + mainTitle,
        title: mainTitle,
        size: streamTitle,
        url: cdnUrl,
        quality: qualityUp,
        headers: { Referer: BASE_URL + "/" },
        _host: pickCdn(cdnUrl),
        _sizeRaw: size || "",
    };
}

function pad(n) { return n < 10 ? "0" + n : "" + n; }

function extractQualityLabel(text) {
    var m = text.match(/\b(2160p|4K|1080p|720p|480p|360p)\b/i);
    if (!m) return "Unknown";
    return m[1].toLowerCase() === "2160p" ? "4K" : m[1];
}

function extractSize(text) {
    var m = text.match(/\[([0-9.]+\s*[KMGT]B(?:\/E)?)\]/i) || text.match(/(\d+(?:\.\d+)?\s*[KMGT]B)/i);
    return m ? m[1] : "";
}

function pickCdn(url) {
    var low = url.toLowerCase();
    if (low.indexOf("auvps.buzz") !== -1)            return "Auvps Buzz";
    if (low.indexOf("homelander.buzz") !== -1)       return "Homelander Buzz";
    if (low.indexOf("obsession.buzz") !== -1)        return "Obsession Buzz";
    if (low.indexOf("mandalorian.buzz") !== -1)      return "Mandalorian Buzz";
    if (low.indexOf("noirspy.buzz") !== -1)          return "Noirspy Buzz";
    if (low.indexOf(".buzz") !== -1)                 return "Buzz CDN";
    if (low.indexOf(".r2.dev") !== -1)               return "Cloudflare R2";
    if (low.indexOf("r2.cloudflarestorage") !== -1)  return "FSLv2 (S3)";
    if (low.indexOf("cloudserver") !== -1)           return "CloudServer CDN";
    if (low.indexOf("workers.dev") !== -1)           return "Workers CDN";
    if (low.indexOf("pixeldrain") !== -1)            return "PixelDrain";
    return "Direct CDN";
}

function mapQuality(label) {
    var l = (label || "").toLowerCase();
    if (l.indexOf("2160") !== -1 || l.indexOf("4k") !== -1) return "4K";
    if (l.indexOf("1080") !== -1) return "1080p";
    if (l.indexOf("720")  !== -1) return "720p";
    if (l.indexOf("480")  !== -1) return "480p";
    return "HD";
}

function norm(s) {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function stripToken(url) {
    return url.split("?token=")[0].split("&token=")[0];
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

function decodeEntities(str) {
    if (!str) return "";
    var entities = { "&nbsp;": " ", "&amp;": "&", "&quot;": "\"", "&lt;": "<", "&gt;": ">", "&#038;": "&" };
    return str.replace(/&(nbsp|amp|quot|lt|gt|#038);/g, function(m) { return entities[m] || m; })
              .replace(/&#(\d+);/g, function(m, dec) { return String.fromCharCode(dec); });
}

function fetchText(url, extraHeaders) {
    var headers = { "User-Agent": UA, "Accept": "text/html,application/json,*/*" };
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

// ── Pure JS MD5 Implementation ────────────────────────────────────────────────

function md5(string) {
    function md5cycle(x, k) {
        var a = x[0], b = x[1], c = x[2], d = x[3];
        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);
        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);
        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);
        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);
        x[0] = add32(a, x[0]);
        x[1] = add32(b, x[1]);
        x[2] = add32(c, x[2]);
        x[3] = add32(d, x[3]);
    }
    function cmn(q, a, b, x, s, t) {
        a = add32(add32(a, q), add32(x, t));
        return add32((a << s) | (a >>> (32 - s)), b);
    }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
    function md51(s) {
        var n = s.length, state = [1732584193, -271733879, -1732584194, 271733878], i;
        for (i = 64; i <= s.length; i += 64) {
            md5cycle(state, md5blk(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        var tail = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
        for (i = 0; i < s.length; i++) {
            tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        }
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(state, tail);
            for (i = 0; i < 16; i++) tail[i] = 0;
        }
        tail[14] = n * 8;
        md5cycle(state, tail);
        return state;
    }
    function md5blk(s) {
        var md5blks = [], i;
        for (i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
        }
        return md5blks;
    }
    var hex_chr = '0123456789abcdef'.split('');
    function rhex(n) {
        var s = '', j = 0;
        for (; j < 4; j++) {
            s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
        }
        return s;
    }
    function hex(x) {
        for (var i = 0; i < x.length; i++) x[i] = rhex(x[i]);
        return x.join('');
    }
    function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
    return hex(md51(string));
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
