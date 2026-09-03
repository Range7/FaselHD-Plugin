// ═══════════════════════════════════════════════════════════════
//  FaselHD Plugin — Based on original working code
//  Minimal changes: 1080p filter + Nuvio-compatible properties
//  The original code showed 480p, so async/await DOES work in Nuvio
//  Date: 2026-09-03
// ═══════════════════════════════════════════════════════════════

"use strict";

var BASE_URL = "https://fslhd.co";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

// ── Helper: Fetch with timeout ─────────────────────────────────
async function fetchText(url, opts) {
  var controller = new AbortController();
  var tid = setTimeout(function () { controller.abort(); }, 15000);
  try {
    var res = await fetch(url, Object.assign({ signal: controller.signal }, opts || {}));
    clearTimeout(tid);
    if (!res.ok) return "";
    return await res.text();
  } catch (e) {
    clearTimeout(tid);
    return "";
  }
}

async function fetchJson(url, opts) {
  var controller = new AbortController();
  var tid = setTimeout(function () { controller.abort(); }, 15000);
  try {
    var res = await fetch(url, Object.assign({ signal: controller.signal }, opts || {}));
    clearTimeout(tid);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    clearTimeout(tid);
    return null;
  }
}

// ── TMDB: Get titles in Arabic & English ──────────────────────
async function getTitles(tmdbId, mediaType) {
  var path = mediaType === "movie" ? "movie" : "tv";
  var [ar, en] = await Promise.all([
    fetchJson("https://api.themoviedb.org/3/" + path + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=ar-SA"),
    fetchJson("https://api.themoviedb.org/3/" + path + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US")
  ]);
  ar = ar || {}; en = en || {};
  var titles = [];
  var seen = {};
  function add(t) { if (t && !seen[t]) { seen[t] = true; titles.push(t); } }
  add(ar.name || ar.title);
  add(en.name || en.title);
  add(en.original_name || en.original_title);
  var year = ((en.first_air_date || en.release_date || "") + "").split("-")[0];
  return { titles: titles, year: year };
}

// ── Search FaselHD ─────────────────────────────────────────────
async function searchFaselhd(query) {
  var html = await fetchText(BASE_URL + "/?s=" + encodeURIComponent(query));
  if (!html) return [];
  var results = [];
  var re = /<a\s+href="([^"]+)"\s+class="movie-card">/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var url = m[1];
    var titleMatch = html.slice(m.index, m.index + 500).match(/<div[^>]*class="movie-title"[^>]*>([\s\S]*?)<\/div>/);
    var title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
    if (url && title) results.push({ url: url, title: title });
  }
  return results;
}

// ── Normalize & similarity ─────────────────────────────────────
function normalize(s) {
  return (s || "").toLowerCase()
    .replace(/مشاهدة|انمي|أنمي|مترجم|مترجمة|اون لاين|أون لاين|كامل|HD|1080p|720p/g, " ")
    .replace(/ى/g, "ي").replace(/[إأآ]/g, "ا")
    .replace(/[^\w\s\u0600-\u06FF]/g, " ").replace(/\s+/g, " ").trim();
}

function similarity(a, b) {
  var na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.indexOf(nb) > -1 || nb.indexOf(na) > -1) return 85;
  var wa = na.split(" "), hits = 0;
  for (var i = 0; i < wa.length; i++) if (nb.indexOf(wa[i]) > -1) hits++;
  return Math.round((hits / Math.max(wa.length, 1)) * 100);
}

// ── Pick best match ────────────────────────────────────────────
function pickBest(results, titles, year, type, season, episode) {
  if (type !== "movie" && episode) {
    var exact = results.filter(function (r) {
      var m = r.title.match(/الحلق[ةه][\s\-]*(\d+)/);
      return m && parseInt(m[1]) === parseInt(episode);
    });
    if (exact.length) return exact[0];
  }
  var scored = results.map(function (r) {
    var s = 0;
    for (var i = 0; i < titles.length; i++) s = Math.max(s, similarity(r.title, titles[i]));
    if (year && r.title.indexOf(year) > -1) s += 10;
    if (type === "movie" && /الحلق[ةه]|حلق[ةه]|ep\s*\d/i.test(r.title)) s -= 30;
    return { r: r, s: s };
  });
  scored.sort(function (a, b) { return b.s - a.s; });
  return scored.length && scored[0].s >= 40 ? scored[0].r : null;
}

// ── Quality helpers ────────────────────────────────────────────
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

// ── Dean Edwards unpacker ──────────────────────────────────────
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

// ── Extract streams — STRICT 1080p ONLY ────────────────────────
async function extractStreamsFromPage(pageUrl) {
  var html = await fetchText(pageUrl);
  if (!html) return [];

  // Find all server buttons
  var btns = [];
  var btnRe = /<button[^>]*class="server-btn[^"]*"[^>]*data-src="([^"]+)"[^>]*>\s*<span>([^<]+)<\/span>/g;
  var bm;
  while ((bm = btnRe.exec(html)) !== null) {
    btns.push({ url: bm[1], label: bm[2] });
  }

  console.log("[FaselHD] Found " + btns.length + " server buttons");
  for (var i = 0; i < btns.length; i++) {
    console.log("[FaselHD] Button " + i + ": " + btns[i].label + " -> " + btns[i].url);
  }

  // STRICT 1080p ONLY: filter buttons BEFORE processing
  var filteredBtns = [];
  for (var j = 0; j < btns.length; j++) {
    var btn = btns[j];
    var isUpdown = /updown\.icu/i.test(btn.url);
    var isDood = /dood|lulu/i.test(btn.url);

    if (isDood) continue; // Skip dood/lulu

    if (isUpdown) {
      // updown URLs contain resolution: embed-xxxx-WxH.html
      var resMatch = btn.url.match(/-(\d{3,4})x(\d{3,4})\.html/);
      if (resMatch) {
        var height = parseInt(resMatch[2]);
        var q = heightToQuality(height);
        console.log("[FaselHD] updown resolution: " + resMatch[1] + "x" + resMatch[2] + " = " + q);
        if (q === "1080p") {
          filteredBtns.push(btn);
        }
      } else {
        // URL doesn't have resolution — check label
        var labelQ = qualityFromLabel(btn.label);
        console.log("[FaselHD] updown no resolution, label quality: " + labelQ);
        if (labelQ === "1080p") {
          filteredBtns.push(btn);
        }
      }
    } else {
      // Other hosts — check label only
      var otherQ = qualityFromLabel(btn.label);
      console.log("[FaselHD] Other host quality: " + otherQ);
      if (otherQ === "1080p") {
        filteredBtns.push(btn);
      }
    }
  }

  console.log("[FaselHD] After 1080p filter: " + filteredBtns.length + " buttons");

  if (filteredBtns.length === 0) {
    console.log("[FaselHD] No 1080p buttons found on page");
    return [];
  }

  var streams = [];

  for (var k = 0; k < filteredBtns.length && streams.length < 3; k++) {
    var btn = filteredBtns[k];
    try {
      if (/updown\.icu/i.test(btn.url)) {
        var page = await fetchText(btn.url, { headers: { Referer: BASE_URL } });
        var decoded = unpackPacked(page);
        var link = "";
        var mp4Match = decoded.match(/https?:\/\/[^"'\\\s]+\.mp4[^"'\\\s]*/);
        var m3u8Match = decoded.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/);
        if (mp4Match) link = mp4Match[0];
        else if (m3u8Match) link = m3u8Match[0];

        if (link) {
          console.log("[FaselHD] Found link: " + link);
          // Check link quality from URL
          var linkRes = link.match(/(\d{3,4})x(\d{3,4})/);
          var linkQ = linkRes ? heightToQuality(parseInt(linkRes[2])) : "1080p";

          if (linkQ === "1080p") {
            streams.push({
              name: "FaselHD",
              title: "فاصل إعلاني · 1080p",
              url: link,
              link: link, // Keep original for compatibility
              quality: "1080p",
              headers: { Referer: "https://updown.icu/" }
            });
            console.log("[FaselHD] Added 1080p stream");
          } else {
            console.log("[FaselHD] Rejected link quality: " + linkQ);
          }
        }
      } else if (/streamwish|earnvids|myvid|cybervynx|vidhide|filemoon|voe/i.test(btn.url)) {
        var page2 = await fetchText(btn.url, { headers: { Referer: BASE_URL } });
        var direct = (page2.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/) || [])[0];
        if (direct) {
          streams.push({
            name: "FaselHD",
            title: "فاصل إعلاني · 1080p · " + btn.label,
            url: direct,
            link: direct,
            quality: "1080p",
            headers: { Referer: btn.url }
          });
        }
      }
    } catch (e) {
      console.log("[FaselHD] Error processing button: " + (e.message || e));
    }
  }

  console.log("[FaselHD] Total streams: " + streams.length);
  return streams;
}

// ── MAIN: Get streams ──────────────────────────────────────────
async function getStreams(url, type, season, episode) {
  var tmdbId = url;
  console.log("[FaselHD] getStreams called: tmdbId=" + tmdbId + " type=" + type + " S=" + season + " E=" + episode);

  if (!tmdbId) {
    console.log("[FaselHD] No TMDB ID");
    return [];
  }

  try {
    var info = await getTitles(tmdbId, type);
    console.log("[FaselHD] TMDB titles: " + info.titles.join(" | "));
    if (!info.titles.length) {
      console.log("[FaselHD] No titles from TMDB");
      return [];
    }

    var candidates = [];
    var searches = [];

    if (type !== "movie" && episode) {
      searches.push(searchFaselhd(info.titles[0] + " الحلقة " + episode));
    }
    for (var t = 0; t < info.titles.length; t++) {
      searches.push(searchFaselhd(info.titles[t]));
    }

    var results = await Promise.all(searches);
    for (var r = 0; r < results.length; r++) {
      candidates = candidates.concat(results[r]);
    }

    console.log("[FaselHD] Total candidates: " + candidates.length);
    if (!candidates.length) {
      console.log("[FaselHD] No search results");
      return [];
    }

    var best = pickBest(candidates, info.titles, info.year, type, season, episode);
    if (!best) {
      console.log("[FaselHD] No good match found");
      return [];
    }
    console.log("[FaselHD] Best match: " + best.title + " -> " + best.url);

    var streams = await extractStreamsFromPage(best.url);

    // Final safety filter: only 1080p
    var filtered = streams.filter(function (s) {
      return s.quality === "1080p";
    });

    console.log("[FaselHD] Returning " + filtered.length + " x 1080p streams");
    return filtered;

  } catch (e) {
    console.log("[FaselHD] Fatal error: " + (e.message || e));
    return [];
  }
}

module.exports = { getStreams: getStreams };
