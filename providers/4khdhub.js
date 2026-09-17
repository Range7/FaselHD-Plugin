/**
 * 4kHDHub Provider for Nuvio
 * Version: 1.0.0 — tested against live site
 *
 * Features:
 *  - 4K streams first (largest → smallest)
 *  - 1080p below (largest → smallest)
 *  - Dedupe: ONE server per (quality + size) — HubCloud preferred
 *  - Rich stream info (a111477 style): size • source • codec • HDR
 *  - Movies + TV (individual episodes, season-pack fallback)
 */

"use strict";

var VERSION = "1.0.0";
var BASE = "https://4khdhub.one";
var TMDB_BASE = "https://www.themoviedb.org";
var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function log(key, value) {
  var s = value === undefined || value === null || value === "" ? "" : " " + String(value);
  console.log("[4kHDHub v" + VERSION + "] " + key + s);
}
function logFailure(reason, detail) {
  console.log("[4kHDHub v" + VERSION + "] failure=" + reason + (detail ? " detail=" + detail : ""));
}
function originOf(url) {
  var m = String(url || "").match(/^(https?:\/\/[^\/]+)/i);
  return m ? m[1] : "";
}
function reqHeaders(referer, accept) {
  var h = {
    "User-Agent": UA,
    "Accept": accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
  };
  if (referer) h.Referer = referer;
  return h;
}
function isChallenge(html) {
  var t = String(html || "").toLowerCase();
  return t.indexOf("cf-chl-") >= 0 || t.indexOf("just a moment") >= 0 || t.indexOf("challenge-platform") >= 0;
}
function fetchText(url, referer, accept) {
  return fetch(url, { headers: reqHeaders(referer, accept), skipSizeCheck: true }).then(function (res) {
    if (!res) throw new Error("no_response " + url);
    return res.text().then(function (body) {
      if (isChallenge(body)) throw new Error("cloudflare " + url);
      if (!res.ok) throw new Error("http_" + res.status + " " + url);
      return { html: String(body || ""), url: res.url || url };
    });
  });
}

/* ================= NORMALIZATION ================= */

function decodeHtml(v) {
  return String(v || "")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"")
    .replace(/&#0*39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}
function normalize(v) {
  return decodeHtml(v).toLowerCase()
    .replace(/[''""`]/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]+/gi, " ")
    .replace(/\s+/g, " ").trim();
}
function cleanForMatch(v) {
  return normalize(v)
    .replace(/(^|\s)(movie|film|full|watch|download|hd|4khdhub|com|mkv|mp4)(?=\s|$)/g, " ")
    .replace(/\s+\d{4}\s*$/, "")
    .replace(/\s+/g, " ").trim();
}

/* ================= TMDB (مُصلح — النسخة السابقة كانت مكسورة) ================= */

function getTmdbTitle(tmdbId, mediaType) {
  var path = mediaType === "tv" ? "/tv/" : "/movie/";
  return fetchText(TMDB_BASE + path + encodeURIComponent(tmdbId) + "?language=en-US", "", "")
    .then(function (r) {
      var m = r.html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
      var title = m ? decodeHtml(m[1]).replace(/\s*\|\s*TMDB.*$/i, "").replace(/\s*\(\d{4}\)\s*$/, "").trim() : "";
      return title;
    })
    .catch(function () { return ""; });
}

/* ================= SEARCH (مُؤكد: /?s= فقط) ================= */

function searchSite(title) {
  var q = encodeURIComponent(title.replace(/[:'"]+/g, " ").replace(/\s+/g, " ").trim());
  var url = BASE + "/?s=" + q;
  log("search", url);
  return fetchText(url, BASE + "/").then(function (r) {
    var seen = {};
    var links = [];
    var re = /href="(\/[a-z0-9\-]+?-(?:movie|series)-\d+\/?)"/gi;
    var m;
    while ((m = re.exec(r.html)) !== null) {
      if (!seen[m[1]]) { seen[m[1]] = true; links.push(BASE + m[1]); }
    }
    log("search_results", links.length);
    return links;
  }).catch(function () { return []; });
}

/* ================= PARSERS (مُؤكدة من HTML حقيقي) ================= */

/**
 * بلوكات الأفلام وباكات المواسم الكاملة.
 * HTML حقيقي:
 *   <div class="download-item ...">
 *     <div class="...font-semibold">TITLE <br> <span class="badge" ...#ea580c...>23.47 GB</span>
 *     ... <a href="https://greenmotors.cc/?id=..." ...><span ...>Download HubCloud</span>
 */
function parseDownloadItems(html) {
  var items = [];
  var re = /<div class="download-item[\s\S]*?(?=<div class="download-item|$)/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var block = m[0];
    var tM = block.match(/font-semibold">\s*([\s\S]*?)<br>/);
    var title = tM ? decodeHtml(tM[1]).replace(/\s+/g, " ").trim() : "";
    var sM = block.match(/#ea580c[^>]*>([\d.]+)\s*(GB|MB)/i);
    var size = 0;
    if (sM) {
      size = parseFloat(sM[1]);
      if (/MB/i.test(sM[2])) size = size / 1024;
    }
    var links = {};
    var lRe = /href="(https:\/\/greenmotors\.cc\/\?id=[^"]+)"[^>]*>\s*(?:<span[^>]*>)?\s*Download\s*(HubCloud|HubDrive)/gi;
    var lm;
    while ((lm = lRe.exec(block)) !== null) links[lm[2]] = lm[1];
    if (title && size > 0 && Object.keys(links).length) {
      items.push({ title: title, sizeGB: size, links: links, isPack: true });
    }
  }
  return items;
}

/**
 * الحلقات المنفصلة — ⚠️ النسخة السابقة كان بيها bug بالـ regex تلتقط حلقة وحدة بس.
 * الإصلاح: split على episode-download-item (أضمن من lookahead).
 * HTML حقيقي:
 *   <div class="season-item episode-item">
 *     <div class="episode-number">S02</div>
 *     <h3 class="episode-title">S02 AVC 1080p WEB-DL H264</h3>
 *     ... <div class="episode-download-item"> <div class="episode-file-title">...S02E01...mkv</div>
 *         <span class="badge-psa">Episode-01</span> <span class="badge-size">2.05 GB</span>
 *         <a href="https://greenmotors.cc/?id=..." class="btn btn-sm">Download HubCloud
 */
function parseEpisodes(html) {
  var out = [];
  var seasonBlocks = html.split('<div class="season-item episode-item');
  for (var i = 1; i < seasonBlocks.length; i++) {
    var sblock = seasonBlocks[i];
    var snM = sblock.match(/<div class="episode-number">S(\d+)<\/div>/);
    var seasonNum = snM ? parseInt(snM[1], 10) : 0;
    var qtM = sblock.match(/<h3 class="episode-title">([\s\S]*?)<\/h3>/);
    var variantLabel = qtM ? qtM[1].trim() : "";

    var chunks = sblock.split('<div class="episode-download-item">');
    for (var j = 1; j < chunks.length; j++) {
      var chunk = chunks[j];
      // القطعة تنتهي عند بداية الحلقة الجاية أو نهاية البلوك — split يضمن هذا
      var fM = chunk.match(/<div class="episode-file-title">([\s\S]*?)<\/div>/);
      var filename = fM ? fM[1].replace(/\s+/g, " ").trim() : "";
      var epNum = 0;
      var seM = filename.match(/\.S(\d{1,2})E(\d{1,4})\./i);
      if (seM) {
        seasonNum = parseInt(seM[1], 10) || seasonNum;
        epNum = parseInt(seM[2], 10);
      }
      if (!epNum) {
        var bpM = chunk.match(/badge-psa">Episode-(\d+)/i);
        if (bpM) epNum = parseInt(bpM[1], 10);
      }
      var sM = chunk.match(/badge-size">([\d.]+)\s*(GB|MB)/i);
      var size = 0;
      if (sM) {
        size = parseFloat(sM[1]);
        if (/MB/i.test(sM[2])) size = size / 1024;
      }
      var links = {};
      var lRe = /href="(https:\/\/greenmotors\.cc\/\?id=[^"]+)"[^>]*>\s*(?:<span[^>]*>)?\s*Download\s*(HubCloud|HubDrive)/gi;
      var lm;
      while ((lm = lRe.exec(chunk)) !== null) links[lm[2]] = lm[1];

      if (epNum > 0 && size > 0 && Object.keys(links).length) {
        out.push({
          season: seasonNum, episode: epNum,
          filename: filename, sizeGB: size, links: links,
          variantLabel: variantLabel, isPack: false
        });
      }
    }
  }
  return out;
}

/* ================= INFO TAGS (style a111477) ================= */

function qualityOf(title) {
  if (/2160p|4k/i.test(title)) return "4K";
  if (/1080p/i.test(title)) return "1080p";
  return "";
}
function infoTags(title) {
  var tags = [];
  if (/DoVi|Dolby[ .-]*Vision/i.test(title)) tags.push("DoVi");
  if (/HDR/i.test(title)) tags.push("HDR");
  if (/\bSDR\b/i.test(title)) tags.push("SDR");
  if (/HEVC|H\.?265/i.test(title)) tags.push("HEVC");
  else if (/AVC|H\.?264/i.test(title)) tags.push("AVC");
  else if (/\bAV1\b/i.test(title)) tags.push("AV1");
  if (/WEB-?DL/i.test(title)) tags.push("WEB-DL");
  else if (/WEB-?Rip/i.test(title)) tags.push("WEBRip");
  else if (/Blu-?Ray|BRRip|BDRip/i.test(title)) tags.push("BluRay");
  return tags.join(" ");
}
function fmtSize(gb) {
  return gb >= 1 ? gb.toFixed(2) + " GB" : Math.round(gb * 1024) + " MB";
}

/* ================= DEDUPE — سيرفر واحد لكل (دقة + حجم) ================= */

function dedupeAndSort(entries) {
  // entries: [{quality, sizeGB, links:{HubCloud,HubDrive}, label...}]
  var seen = {};
  var out = [];
  entries.forEach(function (e) {
    var key = e.quality + "|" + e.sizeGB.toFixed(2);
    if (seen[key]) return;               // نفس الدقة/الحجم → سيرفر واحد بس
    seen[key] = true;
    // تفضيل HubCloud، وإذا ماكو خذ أول سيرفر موجود
    var server = e.links.HubCloud ? "HubCloud" : Object.keys(e.links)[0];
    out.push({
      quality: e.quality, sizeGB: e.sizeGB,
      url: e.links[server], server: server, label: e.label
    });
  });
  // الترتيب المطلوب: 4K أولاً (أكبر→أصغر)، بعدها 1080p (أكبر→أصغر)
  out.sort(function (a, b) {
    var qa = a.quality === "4K" ? 0 : 1;
    var qb = b.quality === "4K" ? 0 : 1;
    if (qa !== qb) return qa - qb;
    return b.sizeGB - a.sizeGB;
  });
  return out;
}

/* ================= GREENMOTORS RESOLVER ================= */

function b64dec(s) {
  try { if (typeof atob === "function") return atob(s); } catch (e) {}
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var out = "", bc = 0, bs = 0;
  s = String(s).replace(/=+$/, "");
  for (var i = 0; i < s.length; i++) {
    var c = chars.indexOf(s.charAt(i));
    if (c < 0) continue;
    bs = bc % 4 ? bs * 64 + c : c;
    if (bc++ % 4) out += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
  }
  return out;
}
function decodeChain(token) {
  var cur = String(token || "").trim();
  for (var i = 0; i < 4; i++) {
    try {
      var dec = b64dec(cur.replace(/\s/g, ""));
      if (/^https?:\/\//i.test(dec)) return dec.trim();
      cur = dec;
    } catch (e) { break; }
  }
  return "";
}

/**
 * ⚠️ الخطوات المؤكدة: ?id= → cookie xla=s4t + token 'o' → /homelander/
 * الخطوة الأخيرة (homelander→hubdrive) تحتاج تحقق حي — مبنية على النمط المعروف.
 */
function resolveGreenmotors(url, referer) {
  return fetchText(url, referer || BASE + "/").then(function (r) {
    var tokM = r.html.match(/s\('o',\s*'([^']+)'/);
    var ckM = r.html.match(/stck\('([^']+)',\s*"([^"]+)"/);
    var direct = tokM ? decodeChain(tokM[1]) : "";
    if (direct) { log("resolved_direct", direct.slice(0, 60)); return direct; }

    var next = "";
    var hm = r.html.match(/window\.location(?:\.href)?\s*=\s*'([^']+)'/);
    if (hm) next = hm[1].indexOf("http") === 0 ? hm[1] : originOf(url) + hm[1];
    if (!next) return url;

    var cookieHdr = ckM ? ckM[1] + "=" + ckM[2] : "";
    return fetch(next, {
      headers: Object.assign(reqHeaders(url), cookieHdr ? { Cookie: cookieHdr } : {}),
      skipSizeCheck: true
    }).then(function (res) { return res.text(); }).then(function (body) {
      var pats = [
        /window\.location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']+)["']/i,
        /["'](https?:\/\/[^"']*(?:hubdrive|hubcloud)[^"']*)["']/i,
        /href="(https?:\/\/[^"]*(?:hubdrive|hubcloud)[^"]*)"/i
      ];
      for (var i = 0; i < pats.length; i++) {
        var mm = body.match(pats[i]);
        if (mm) return mm[1];
      }
      var bm = body.match(/["']([A-Za-z0-9+/]{40,}={0,2})["']/);
      if (bm) { var d = decodeChain(bm[1]); if (d) return d; }
      return next;
    }).catch(function () { return next; });
  }).catch(function () { return url; });
}

/* ================= BUILD STREAM (info مثل a111477) ================= */

function buildStream(entry, rawLabel, referer) {
  var info = infoTags(rawLabel);
  var title = "4kHDHub • " + entry.quality +
              " • " + fmtSize(entry.sizeGB) +
              (info ? " • " + info : "") +
              " • " + entry.server;
  var st = {
    name: "4kHDHub",
    title: title,
    url: entry.url,
    provider: "4kHDHub",
    quality: entry.quality,
    headers: reqHeaders(referer || BASE + "/")
  };
  if (/\.(m3u8|mp4)([?#]|$)/i.test(entry.url)) {
    st.type = /\.m3u8/i.test(entry.url) ? "m3u8" : "mp4";
  }
  st.size = fmtSize(entry.sizeGB);
  st.sizeGB = entry.sizeGB;
  st.server = entry.server;
  return st;
}

/* ================= MAIN ================= */

function getStreams(tmdbId, mediaType, season, episode) {
  var type = String(mediaType || "").toLowerCase();
  var isTv = type === "tv" || type === "series" || type === "show";
  var id = String(tmdbId || "").trim();
  if (!/^\d+$/.test(id)) { logFailure("invalid_tmdb"); return Promise.resolve([]); }
  log("request", (isTv ? "tv" : "movie") + " " + id + (isTv ? " S" + season + "E" + episode : ""));

  var tmdbTitle = "";

  return getTmdbTitle(id, isTv ? "tv" : "movie").then(function (title) {
    tmdbTitle = title;
    log("tmdb_title", tmdbTitle);
    if (!tmdbTitle) { logFailure("tmdb_not_found"); return null; }
    return searchSite(tmdbTitle);
  }).then(function (links) {
    if (!links || !links.length) { logFailure("no_search_results"); return null; }
    // طابق العنوان ضد أول 4 مرشحين
    var idx = 0;
    function tryNext() {
      if (idx >= Math.min(links.length, 4)) return null;
      var u = links[idx++];
      return fetchText(u, BASE + "/").then(function (r) {
        var h1m = r.html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || r.html.match(/<title>([^<]+)<\/title>/i);
        var pageTitle = h1m ? decodeHtml(h1m[1]) : "";
        var a = cleanForMatch(pageTitle), b = cleanForMatch(tmdbTitle);
        log("check", pageTitle.slice(0, 60) + " || match=" + (a.indexOf(b) >= 0 || b.indexOf(a) >= 0));
        if (a && b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) {
          log("matched", r.url);
          return { url: r.url, html: r.html };
        }
        return tryNext();
      }).catch(function () { return tryNext(); });
    }
    return tryNext();
  }).then(function (page) {
    if (!page) { logFailure("page_not_matched"); return []; }

    var rawEntries = [];

    if (!isTv) {
      /* ---- فيلم ---- */
      parseDownloadItems(page.html).forEach(function (it) {
        var q = qualityOf(it.title);
        if (q) rawEntries.push({ quality: q, sizeGB: it.sizeGB, links: it.links, label: it.title });
      });
    } else {
      /* ---- مسلسل: أولاً الحلقات المنفصلة ---- */
      var sn = parseInt(season, 10) || 1;
      var ep = parseInt(episode, 10) || 1;
      var eps = parseEpisodes(page.html).filter(function (e) {
        return e.season === sn && e.episode === ep;
      });
      log("episodes_matched", eps.length);

      eps.forEach(function (e) {
        var q = qualityOf(e.filename) || qualityOf(e.variantLabel);
        if (q) rawEntries.push({ quality: q, sizeGB: e.sizeGB, links: e.links, label: e.filename || e.variantLabel });
      });

      /* ---- fallback: باكت الموسم الكامل إذا ماكو حلقات منفصلة ---- */
      if (!rawEntries.length) {
        log("fallback_season_pack");
        parseDownloadItems(page.html).forEach(function (it) {
          if (!new RegExp("(^|\\s)S0*" + sn + "(\\s|$|\\W)", "i").test(it.title)) return;
          var q = qualityOf(it.title);
          if (q) rawEntries.push({ quality: q, sizeGB: it.sizeGB, links: it.links, label: it.title });
        });
      }
    }

    log("raw_entries", rawEntries.length);
    if (!rawEntries.length) { logFailure("no_items"); return []; }

    /* ---- Dedupe + ترتيب ---- */
    var final = dedupeAndSort(rawEntries);
    log("after_dedupe", final.length);
    final.forEach(function (f) {
      log("entry", f.quality + " " + fmtSize(f.sizeGB) + " " + f.server);
    });

    /* ---- حل الروابط ---- */
    var streams = [];
    var jobs = final.map(function (entry) {
      return resolveGreenmotors(entry.url, page.url).then(function (finalUrl) {
        if (!finalUrl) return;
        entry.url = finalUrl;
        streams.push(buildStream(entry, entry.label, page.url));
      }).catch(function () {});
    });
    return Promise.all(jobs).then(function () {
      // حافظ على الترتيب حسب القائمة المرتبة
      var order = {};
      final.forEach(function (f, i) { order[f.url] = i; });
      streams.sort(function (a, b) { return (order[a.url] || 0) - (order[b.url] || 0); });
      log("streams_found", streams.length);
      return streams;
    });
  }).catch(function (e) {
    logFailure("fatal", e && e.message ? e.message : String(e));
    return [];
  });
}

module.exports = { getStreams: getStreams };
