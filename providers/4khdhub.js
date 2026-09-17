/**
 * 4KHDHub provider — regex-based
 * - No cheerio dependency (works in any sandbox)
 * - Catches any hubcloud/hubdrive link
 * - Only 4K and 1080p, largest per tier
 * - Name: "4KHDHub • 4K • 4.6GB"
 * - 4K renders first via invisible sort tag
 * - Anime skipped
 */
var BASE_URL = "https://4khdhub.one";
var TMDB_URL = "https://api.themoviedb.org/3";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

function fetchText(url, referer) {
  var headers = { "User-Agent": USER_AGENT, "Accept": "text/html,application/json,*/*" };
  if (referer) headers.Referer = referer;
  return fetch(url, { headers: headers, redirect: "follow" }).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return r.text();
  });
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, function(_, d) { return String.fromCharCode(parseInt(d, 10)); });
}

function absolutize(url, base) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  var origin = String(base || BASE_URL).match(/^(https?:\/\/[^\/]+)/i);
  origin = origin ? origin[1] : BASE_URL;
  if (url.charAt(0) === "/") return origin + url;
  return origin + "/" + url;
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function getMetadata(tmdbId, mediaType) {
  var type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
  var url = TMDB_URL + "/" + type + "/" + encodeURIComponent(tmdbId) + "?api_key=" + TMDB_KEY;
  return fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } })
    .then(function(r) { if (!r.ok) throw new Error("TMDB " + r.status); return r.json(); })
    .then(function(d) {
      var date = type === "tv" ? d.first_air_date : d.release_date;
      var year = date ? parseInt(String(date).slice(0, 4), 10) : null;
      var genres = d.genres || [];
      var hasAnimation = false;
      for (var i = 0; i < genres.length; i++) {
        if (genres[i] && genres[i].name && genres[i].name.toLowerCase() === "animation") { hasAnimation = true; break; }
      }
      var lang = d.original_language || "";
      var countries = d.origin_country || [];
      var isAnime = hasAnimation && (lang === "ja" || countries.indexOf("JP") !== -1);
      return { title: type === "tv" ? d.name : d.title, year: year, isAnime: isAnime };
    });
}

function extractPostUrls(html) {
  var urls = [], seen = {};
  var re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var href = decodeHtml(m[1]);
    if (!/^https?:\/\/[a-z0-9.-]*4khdhub\.[a-z]+/i.test(href)) continue;
    if (href.indexOf("/category/") !== -1) continue;
    if (href.indexOf("/tag/") !== -1) continue;
    if (href.indexOf("/page/") !== -1) continue;
    if (href.indexOf("?s=") !== -1) continue;
    if (href.indexOf("/author/") !== -1) continue;
    if (href.indexOf("/contact") !== -1) continue;
    if (href.indexOf("/dmca") !== -1) continue;
    if (href.indexOf("/privacy") !== -1) continue;
    if (/\.(css|js|png|jpg|jpeg|gif|svg|webp|ico)($|\?)/i.test(href)) continue;
    var clean = href.split("#")[0].split("?")[0].replace(/\/+$/, "");
    if (seen[clean]) continue;
    seen[clean] = 1;
    var text = decodeHtml(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    urls.push({ url: clean, title: text });
  }
  return urls;
}

function pickBestPost(postUrls, metadata, isSeries, season) {
  if (!postUrls.length) return "";
  var normTitle = norm(metadata.title);
  var best = null, bestScore = -1;
  for (var i = 0; i < postUrls.length; i++) {
    var p = postUrls[i];
    var slug = p.url.split("/").filter(Boolean).pop().replace(/[-_+]/g, " ");
    var combined = norm(p.title + " " + slug);
    var score = 0;
    if (combined.indexOf(normTitle) !== -1) score += 100;
    var words = normTitle.split(" ").filter(function(w) { return w.length > 2; });
    var matched = 0;
    for (var w = 0; w < words.length; w++) {
      if (combined.indexOf(words[w]) !== -1) matched++;
    }
    score += (matched / Math.max(words.length, 1)) * 60;
    if (metadata.year) {
      var ym = combined.match(/\b(19|20)\d{2}\b/);
      if (ym) {
        var py = parseInt(ym[0], 10);
        if (py === metadata.year) score += 40;
        else if (Math.abs(py - metadata.year) > 1) score -= 30;
      }
    }
    if (isSeries) {
      if (/series/i.test(slug)) score += 15;
      if (season) {
        var sm = combined.match(/(?:season\s*|s)(\d+)/i);
        if (sm && parseInt(sm[1], 10) === parseInt(season, 10)) score += 30;
        else if (sm) score -= 40;
      }
    } else {
      if (/movie/i.test(slug)) score += 15;
    }
    if (score > bestScore) { bestScore = score; best = p.url; }
  }
  return bestScore >= 40 ? best : "";
}

function findPostUrl(metadata, isSeries, season) {
  var queries = [];
  if (isSeries && season) queries.push(metadata.title + " Season " + season);
  if (metadata.year) queries.push(metadata.title + " " + metadata.year);
  queries.push(metadata.title);
  var seen = {}, uniq = [];
  for (var i = 0; i < queries.length; i++) {
    if (!seen[queries[i]]) { seen[queries[i]] = 1; uniq.push(queries[i]); }
  }
  function tryQuery(idx) {
    if (idx >= uniq.length) return Promise.resolve("");
    var q = uniq[idx];
    var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(q);
    return fetchText(searchUrl).then(function(html) {
      var posts = extractPostUrls(html);
      var best = pickBestPost(posts, metadata, isSeries, season);
      if (best) return best;
      return tryQuery(idx + 1);
    }).catch(function() { return tryQuery(idx + 1); });
  }
  return tryQuery(0);
}

function extractHubCloudLinks(html, pageUrl) {
  var links = [], seen = {};
  var re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var href = decodeHtml(m[1]);
    var text = decodeHtml(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!href) continue;
    var isHubCloud = /hubcloud/i.test(href) || /hubcloud/i.test(text);
    var isHubDrive = /hubdrive/i.test(href) || /hubdrive/i.test(text);
    if (!isHubCloud && !isHubDrive) continue;
    var abs = absolutize(href, pageUrl);
    if (!abs || seen[abs]) continue;
    seen[abs] = 1;
    links.push({ url: abs, text: text, isDrive: isHubDrive && !isHubCloud });
  }
  return links;
}

function extractFinalUrls(html) {
  var urls = [], seen = {};
  var patterns = [
    /https?:\/\/[a-z0-9.-]+\.r2\.dev\/[^\s"'<>\\]+/gi,
    /https?:\/\/[a-z0-9.-]+\.r2\.cloudflarestorage\.com\/[^\s"'<>\\]+/gi,
    /https?:\/\/[a-z0-9.-]+\.workers\.dev\/[^\s"'<>\\]+/gi,
    /https?:\/\/[a-z0-9.-]+\.buzz\/[^\s"'<>\\]+/gi,
    /https?:\/\/[a-z0-9.-]*pixeldrain\.[a-z0-9.-]+\/api\/file\/[A-Za-z0-9_-]+/gi,
    /https?:\/\/[a-z0-9.-]*pixeldrain\.[a-z0-9.-]+\/u\/[A-Za-z0-9_-]+/gi
  ];
  for (var p = 0; p < patterns.length; p++) {
    var re = patterns[p], mm;
    while ((mm = re.exec(html)) !== null) {
      var u = mm[0].replace(/&amp;/g, "&").replace(/\\\//g, "/").replace(/[),;.]+$/, "");
      if (seen[u]) continue;
      seen[u] = 1;
      urls.push(u);
    }
  }
  return urls;
}

function extractHeaderInfo(html) {
  var title = "";
  var tm = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (tm) title = decodeHtml(tm[1]).trim();
  var quality = "Unknown";
  if (/\b(2160p|4k)\b/i.test(html)) quality = "2160p";
  else if (/\b1080p\b/i.test(html)) quality = "1080p";
  else if (/\b720p\b/i.test(html)) quality = "720p";
  var size = "Unknown";
  var sm = html.match(/(\d+\.?\d*)\s*(GB|MB)/i);
  if (sm) size = sm[1] + " " + sm[2].toUpperCase();
  return { title: title, quality: quality, size: size };
}

function resolveHubCloud(url, referer) {
  return fetchText(url, referer || BASE_URL).then(function(html) {
    var redirect = null;
    var rm = html.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/i);
    if (rm) redirect = rm[1];
    if (!redirect) {
      var hm = html.match(/id=["']download["'][^>]*href=["']([^"']+)["']/i);
      if (hm) redirect = hm[1];
    }
    var urls = extractFinalUrls(html);
    var info = extractHeaderInfo(html);
    if (redirect) {
      var nextUrl = absolutize(redirect, url);
      return fetchText(nextUrl, url).then(function(html2) {
        var urls2 = extractFinalUrls(html2);
        var info2 = extractHeaderInfo(html2);
        for (var i = 0; i < urls2.length; i++) {
          if (urls.indexOf(urls2[i]) === -1) urls.push(urls2[i]);
        }
        return { urls: urls, info: info2.title ? info2 : info };
      }).catch(function() { return { urls: urls, info: info }; });
    }
    return { urls: urls, info: info };
  }).catch(function() {
    return { urls: [], info: { title: "", quality: "Unknown", size: "Unknown" } };
  });
}

function resolveHubDrive(url, referer) {
  return fetchText(url, referer || BASE_URL).then(function(html) {
    var hc = html.match(/href=["'](https?:\/\/[^"']*hubcloud[^"']+)["']/i);
    if (hc) return resolveHubCloud(hc[1], url);
    var urls = extractFinalUrls(html);
    var info = extractHeaderInfo(html);
    return { urls: urls, info: info };
  }).catch(function() {
    return { urls: [], info: { title: "", quality: "Unknown", size: "Unknown" } };
  });
}

function qualityRank(q) {
  var s = String(q || "").toLowerCase();
  if (s.indexOf("2160") !== -1 || s.indexOf("4k") !== -1) return 3;
  if (s.indexOf("1080") !== -1) return 2;
  if (s.indexOf("720") !== -1) return 1;
  return 0;
}

function shortLabel(rank) {
  if (rank === 3) return "4K";
  if (rank === 2) return "1080p";
  return "";
}

function sizeToBytes(s) {
  var m = String(s || "").match(/([\d.]+)\s*(TB|GB|MB|KB)/i);
  if (!m) return 0;
  var n = parseFloat(m[1]);
  var u = m[2].toUpperCase();
  if (u === "TB") return n * 1024 * 1024 * 1024 * 1024;
  if (u === "GB") return n * 1024 * 1024 * 1024;
  if (u === "MB") return n * 1024 * 1024;
  return n * 1024;
}

function sortTag(rank) {
  if (rank === 3) return "\u200B";
  if (rank === 2) return "\u200B\u200B";
  return "\u200B\u200B\u200B";
}

function getStreams(tmdbId, mediaType, season, episode) {
  var isSeries = mediaType === "tv" || mediaType === "series";
  if (!tmdbId || (!isSeries && mediaType !== "movie")) return Promise.resolve([]);

  return getMetadata(tmdbId, mediaType).then(function(meta) {
    if (meta.isAnime) {
      console.log("[4KHDHub] Anime skipped: " + meta.title);
      return [];
    }
    return findPostUrl(meta, isSeries, season).then(function(postUrl) {
      if (!postUrl) { console.log("[4KHDHub] no post found"); return []; }
      console.log("[4KHDHub] post: " + postUrl);
      return fetchText(postUrl).then(function(html) {
        var hubLinks = extractHubCloudLinks(html, postUrl);
        console.log("[4KHDHub] hub links: " + hubLinks.length);
        if (!hubLinks.length) return [];
        var jobs = hubLinks.map(function(link) {
          return link.isDrive ? resolveHubDrive(link.url, postUrl) : resolveHubCloud(link.url, postUrl);
        });
        return Promise.all(jobs);
      });
    }).then(function(resolved) {
      if (!resolved || !resolved.length) return [];
      var all = [], seen = {};
      for (var i = 0; i < resolved.length; i++) {
        var r = resolved[i];
        if (!r || !r.urls) continue;
        var info = r.info || {};
        for (var j = 0; j < r.urls.length; j++) {
          var u = r.urls[j];
          if (seen[u]) continue;
          seen[u] = 1;
          all.push({ url: u, quality: info.quality || "Unknown", size: info.size || "Unknown", title: info.title || "" });
        }
      }
      var filtered = [];
      for (var k = 0; k < all.length; k++) {
        var rank = qualityRank(all[k].quality);
        if (rank === 3 || rank === 2) filtered.push(all[k]);
      }
      if (!filtered.length) return [];
      var best4K = null, best4KB = -1;
      var best1080 = null, best1080B = -1;
      for (var m = 0; m < filtered.length; m++) {
        var s = filtered[m];
        var rank2 = qualityRank(s.quality);
        var b = sizeToBytes(s.size);
        if (rank2 === 3 && b > best4KB) { best4K = s; best4KB = b; }
        else if (rank2 === 2 && b > best1080B) { best1080 = s; best1080B = b; }
      }
      var out = [];
      if (best4K) out.push(best4K);
      if (best1080) out.push(best1080);
      for (var n = 0; n < out.length; n++) {
        var it = out[n];
        var rk = qualityRank(it.quality);
        var ql = shortLabel(rk);
        var szl = (it.size && it.size !== "Unknown") ? it.size : "";
        var parts = ["4KHDHub"];
        if (ql) parts.push(ql);
        if (szl) parts.push(szl);
        var visibleName = parts.join(" \u2022 ");
        out[n]._name = sortTag(rk) + visibleName;
      }
      out.sort(function(a, b) { return qualityRank(b.quality) - qualityRank(a.quality); });
      var streams = [];
      for (var p = 0; p < out.length; p++) {
        streams.push({
          name: out[p]._name || "4KHDHub",
          title: out[p].title || "",
          url: out[p].url,
          quality: out[p].quality,
          headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }
        });
      }
      console.log("[4KHDHub] streams: " + streams.length);
      return streams;
    });
  }).catch(function(e) {
    console.error("[4KHDHub] " + (e && e.message ? e.message : e));
    return [];
  });
}

module.exports = { getStreams: getStreams };
