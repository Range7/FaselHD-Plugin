// ═══════════════════════════════════════════════════════════════
//  FaselHD Plugin for Nuvio — FINAL VERSION
//  100% Promise chains (QuickJS/Hermes compatible)
//  Fixed: url (not link), title, quality, flexible regex
//  Date: 2026-09-03
// ═══════════════════════════════════════════════════════════════

"use strict";

var BASE_URL = "https://fslhd.co";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";
var TIMEOUT = 15000;

function log(msg) {
  console.log("[FaselHD] " + msg);
}

// ── Safe Fetch (NO AbortController — QuickJS compatible) ──────
function safeFetch(url, opts) {
  var o = { method: "GET", headers: { "User-Agent": UA } };
  if (opts && opts.headers) {
    var keys = Object.keys(opts.headers);
    for (var i = 0; i < keys.length; i++) {
      o.headers[keys[i]] = opts.headers[keys[i]];
    }
  }
  return fetch(url, o);
}

function fetchText(url, opts) {
  return safeFetch(url, opts).then(function (r) {
    return r.ok ? r.text() : "";
  }).catch(function () { return ""; });
}

function fetchJson(url, opts) {
  return safeFetch(url, opts).then(function (r) {
    return r.ok ? r.json() : null;
  }).catch(function () { return null; });
}

// ── TMDB Titles ────────────────────────────────────────────────
function getTitles(tmdbId, mediaType) {
  var path = mediaType === "movie" ? "movie" : "tv";
  var urlAr = "https://api.themoviedb.org/3/" + path + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=ar-SA";
  var urlEn = "https://api.themoviedb.org/3/" + path + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US";

  return Promise.all([fetchJson(urlAr), fetchJson(urlEn)]).then(function (res) {
    var ar = res[0] || {};
    var en = res[1] || {};
    var titles = [];
    var seen = {};

    function add(t) {
      if (t && !seen[t]) {
        seen[t] = true;
        titles.push(t);
      }
    }

    add(ar.name || ar.title);
    add(en.name || en.title);
    add(en.original_name || en.original_title);

    var year = ((en.first_air_date || en.release_date || "") + "").split("-")[0];
    return { titles: titles, year: year };
  }).catch(function () {
    return { titles: [], year: "" };
  });
}

// ── Search FaselHD ─────────────────────────────────────────────
function searchFaselhd(query) {
  return fetchText(BASE_URL + "/?s=" + encodeURIComponent(query)).then(function (html) {
    if (!html) return [];
    var results = [];
    // FLEXIBLE regex — works with ANY attribute order
    var re = /(<a\b[^>]*class="movie-card"[^>]*>)([\s\S]*?)<\/a>/g;
    var m;
    while ((m = re.exec(html)) !== null) {
      var fullTag = m[1];
      var inner = m[2];
      var hrefMatch = fullTag.match(/href="([^"]+)"/);
      var url = hrefMatch ? hrefMatch[1] : "";
      var tm = inner.match(/<div[^>]*class="movie-title"[^>]*>\s*([\s\S]*?)\s*<\/div>/);
      var title = tm ? tm[1].replace(/\s+/g, " ").trim() : "";
      if (url && title) results.push({ url: url, title: title });
    }
    return results;
  });
}

// ── Title Matching ─────────────────────────────────────────────
function normalize(s) {
  return (s || "").toLowerCase()
    .replace(/مشاهدة|انمي|أنمي|مترجم|مترجمة|اون لاين|أون لاين|كامل|HD|1080p|720p/g, " ")
    .replace(/ى/g, "ي")
    .replace(/[إأآ]/g, "ا")
    .replace(/[^\w\s\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function similarity(a, b) {
  var na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.indexOf(nb) > -1 || nb.indexOf(na) > -1) return 85;
  var wa = na.split(" "), hits = 0;
  for (var i = 0; i < wa.length; i++) {
    if (nb.indexOf(wa[i]) > -1) hits++;
  }
  return Math.round((hits / Math.max(wa.length, 1)) * 100);
}

// ── Dean Edwards Unpacker ──────────────────────────────────────
function unpackPacked(html) {
  var m = html.match(/\}\('(.*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'(.*?)'\.split\('\|'\)\)/);
  if (!m) return "";
  var payload = m[1], base = parseInt(m[2]), count = parseInt(m[3]), keys = m[4].split("|");
  var alpha = "0123456789abcdefghijklmnopqrstuvwxyz";
  function enc(n) {
    if (n === 0) return "0";
    var s = "";
    while (n > 0) { s = alpha[n % base] + s; n = Math.floor(n / base); }
    return s;
  }
  var decoded = payload;
  for (var i = count - 1; i >= 0; i--) {
    if (i < keys.length && keys[i]) {
      var pattern = "\\b" + enc(i).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b";
      decoded = decoded.replace(new RegExp(pattern, "g"), keys[i]);
    }
  }
  return decoded;
}

// ── Extract Streams ────────────────────────────────────────────
function extractStreamsFromPage(pageUrl) {
  return fetchText(pageUrl).then(function (html) {
    if (!html) return [];

    // Extract ALL server buttons (flexible regex)
    var btns = [];
    var btnRe = /(<button\b[^>]*>)([\s\S]*?)<\/button>/g;
    var bm;
    while ((bm = btnRe.exec(html)) !== null) {
      var tag = bm[1];
      var inner = bm[2];
      var ds = tag.match(/data-src="([^"]+)"/);
      if (!ds) continue;
      var labelMatch = inner.match(/<span>\s*([^<]+?)\s*<\/span>/);
      var label = labelMatch ? labelMatch[1] : "Server";
      btns.push({ url: ds[1], label: label });
    }

    // Priority: updown.icu first, then others (skip dood/lulu)
    var ordered = btns.filter(function (b) { return /updown\.icu/i.test(b.url); })
      .concat(btns.filter(function (b) { return !/updown|dood|d0o0d|lulu/i.test(b.url); }))
      .slice(0, 4);

    var streams = [];

    function processNext(index) {
      if (index >= ordered.length || streams.length >= 3) {
        return Promise.resolve(streams);
      }
      var btn = ordered[index];

      if (/updown\.icu/i.test(btn.url)) {
        var qm = btn.url.match(/-(\d{3,4})x(\d{3,4})\.html/);
        var quality = qm ? heightToQuality(parseInt(qm[2])) : "";
        return fetchText(btn.url, { headers: { Referer: BASE_URL } }).then(function (page) {
          var decoded = unpackPacked(page);
          var link = "";
          var mp4Match = decoded.match(/https?:\/\/[^"'\\\s]+\.mp4[^"'\\\s]*/);
          var m3u8Match = decoded.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/);
          if (mp4Match) link = mp4Match[0];
          else if (m3u8Match) link = m3u8Match[0];

          if (link) {
            // ✅ FIXED: url (not link), title, quality
            streams.push({
              name: "FaselHD",
              title: "فاصل إعلاني" + (quality ? " · " + quality : ""),
              url: link,
              quality: quality,
              headers: { Referer: "https://updown.icu/", "User-Agent": UA }
            });
          }
          return processNext(index + 1);
        }).catch(function () { return processNext(index + 1); });
      } else if (/streamwish|earnvids|myvid|cybervynx|vidhide|filemoon|voe/i.test(btn.url)) {
        return fetchText(btn.url, { headers: { Referer: BASE_URL } }).then(function (page2) {
          var direct = (page2.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/) || [])[0];
          if (direct) {
            var q = qualityFromLabel(btn.label);
            streams.push({
              name: "FaselHD",
              title: "فاصل إعلاني · " + btn.label + (q ? " · " + q : ""),
              url: direct,
              quality: q,
              headers: { Referer: btn.url }
            });
          }
          return processNext(index + 1);
        }).catch(function () { return processNext(index + 1); });
      }
      return processNext(index + 1);
    }

    return processNext(0);
  });
}

function heightToQuality(h) {
  if (h >= 2000) return "4K";
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 400) return "480p";
  return h + "p";
}

function qualityFromLabel(label) {
  var text = (label || "").toLowerCase();
  if (text.indexOf("1080") >= 0) return "1080p";
  if (text.indexOf("720") >= 0) return "720p";
  if (text.indexOf("480") >= 0) return "480p";
  if (text.indexOf("360") >= 0) return "360p";
  return "";
}

// ── Pick Best Result ───────────────────────────────────────────
function pickBest(results, titles, year, type, season, episode) {
  if (type !== "movie" && episode) {
    var epPatterns = [
      new RegExp("(?:الحلق[ةه]|حلق[ةه])[\\s\\-._]*(\\d+)"),
      new RegExp("\\bep[\\s\\-._]*(\\d+)\\b"),
      new RegExp("\\bh\\s*(\\d+)\\b")
    ];
    for (var p = 0; p < epPatterns.length; p++) {
      var exact = [];
      for (var i = 0; i < results.length; i++) {
        var m = results[i].title.match(epPatterns[p]);
        if (m && parseInt(m[1]) === parseInt(episode)) exact.push(results[i]);
      }
      if (exact.length) return exact[0];
    }
  }

  var scored = [];
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var s = 0;
    for (var t = 0; t < titles.length; t++) {
      s = Math.max(s, similarity(r.title, titles[t]));
    }
    if (year && r.title.indexOf(year) > -1) s += 10;
    var isEpisode = /الحلق[ةه]|حلق[ةه]|ep\s*\d|h\s*\d/i.test(r.title);
    if (type === "movie" && isEpisode) s -= 30;
    scored.push({ r: r, s: s });
  }

  scored.sort(function (a, b) { return b.s - a.s; });
  return scored.length && scored[0].s >= 40 ? scored[0].r : null;
}

// ── MAIN ENTRY POINT ───────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  var idStr = String(tmdbId || "");
  var idm = idStr.match(/tmdb[^\d]*(\d+)/) || idStr.match(/(\d{4,})/);
  var realTmdbId = idm ? idm[1] : idStr;

  if (!realTmdbId) {
    log("No TMDB ID found");
    return Promise.resolve([]);
  }

  log("TMDB ID: " + realTmdbId + " | Type: " + mediaType);

  return getTitles(realTmdbId, mediaType).then(function (info) {
    if (!info.titles.length) {
      log("No titles found from TMDB");
      return [];
    }
    log("Titles: " + info.titles.join(" | "));

    var candidates = [];
    var searchPromises = [];

    // For series: direct episode search
    if (mediaType !== "movie" && episode) {
      searchPromises.push(
        searchFaselhd(info.titles[0] + " الحلقة " + episode).then(function (res) {
          candidates = candidates.concat(res);
        })
      );
    }

    // Search all titles
    for (var t = 0; t < info.titles.length; t++) {
      (function (title) {
        searchPromises.push(
          searchFaselhd(title).then(function (res) {
            candidates = candidates.concat(res);
          })
        );
      })(info.titles[t]);
    }

    return Promise.all(searchPromises).then(function () {
      if (!candidates.length) {
        log("No search results from FaselHD");
        return [];
      }
      log("Candidates: " + candidates.length);

      var best = pickBest(candidates, info.titles, info.year, mediaType, season, episode);
      if (!best) {
        log("No good match found");
        return [];
      }
      log("Best match: " + best.title + " -> " + best.url);

      return extractStreamsFromPage(best.url);
    });
  }).catch(function (e) {
    log("Error: " + (e && e.message ? e.message : String(e)));
    return [];
  });
}

module.exports = { getStreams: getStreams };
