// Cinemana Scraper for Nuvio Local Scrapers
// FAST: parallel TMDB, parallel SUB/DUB search, parallel SUB/DUB stream fetch
// Multi-quality: 4K فوق، 1080p تحته — ترتيب مضمون
// React Native compatible (Hermes-safe, no async/await)
// TMDB key: from Nuvio global only. Subtitles: translationFiles, same as code 2.

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var CINEMANA_BASE = "https://cinemana.shabakaty.com/api/android";
var CINEMANA_ROOT = "https://cinemana.shabakaty.com";
var TMDB_BASE = "https://api.themoviedb.org/3";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 8e3;
var HEADERS = { Referer: CINEMANA_ROOT + "/", Origin: CINEMANA_ROOT };

function safeFetch(url, options, timeout) {
  var ms = timeout || FETCH_TIMEOUT;
  var controller, tid;
  try { controller = new AbortController(); tid = setTimeout(function() { controller.abort(); }, ms); }
  catch (e) { controller = null; }
  var opts = options || {};
  if (controller) opts.signal = controller.signal;
  if (!opts.headers) opts.headers = {};
  if (!opts.headers["User-Agent"]) opts.headers["User-Agent"] = UA;
  return fetch(url, opts).then(function(r) { if (tid) clearTimeout(tid); return r; })
    .catch(function(e) { if (tid) clearTimeout(tid); throw e; });
}

function normalizeTitle(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[\:\-\–—().,!?'"]/g, " ").replace(/\s+/g, " ").trim();
}

function removeDubWords(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/مدبلج[ة]?/gi, "").replace(/dubbed/gi, "").replace(/dub/gi, "").replace(/\s+/g, " ").trim();
}

function cleanUrl(url) { return url ? url.replace(/\\/g, "") : ""; }
function isDubbedTitle(t) { if (!t) return false; t = t.toLowerCase(); return t.indexOf("مدبلج") !== -1 || t.indexOf("dubbed") !== -1 || t.indexOf("dub") !== -1 || t.indexOf("مدبلجة") !== -1; }
function safeMedia(url) { return /^https:\/\/([a-z0-9-]+\.)*shabakaty\.(com|cc)\//i.test(String(url || "")); }

// ─── تصنيف الجودة: يشتغل على "2160p" و "4K" و "UHD" و "1080p" و "FHD" ───
function qualityRank(qName) {
  if (qName === undefined || qName === null || qName === "") return 0;
  var s = String(qName).toLowerCase().trim();
  // حاول تلتقط الرقم أول (1080, 2160, 4320, 1440, 720...)
  var m = s.match(/(\d{3,4})/);
  if (m) {
    var n = parseInt(m[1], 10);
    if (n >= 2000) return 3;               // 4K: 2160p / 4320p
    if (n >= 1000 && n < 2000) return 2;   // 1080p
    return 0;                               // 720p وأقل — مرفوض
  }
  // ما فيه رقم — اعتمد على النص
  if (s.indexOf("4k") !== -1 || s.indexOf("uhd") !== -1) return 3;
  if (s.indexOf("1080") !== -1 || s.indexOf("fhd") !== -1 || s.indexOf("full hd") !== -1 || s.indexOf("fullhd") !== -1) return 2;
  return 0;
}
function qualityLabel(qName) {
  var r = qualityRank(qName);
  if (r === 3) return "4K";
  if (r === 2) return "1080p";
  return String(qName || "Unknown");
}

function strictMatchScore(a, b) {
  var na = normalizeTitle(a), nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1) {
    var cov = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    if (cov >= 0.85) return Math.round(88 + cov * 10);
  }
  var wa = na.split(" ").filter(function(w) { return w.length > 2; });
  var wb = nb.split(" ").filter(function(w) { return w.length > 2; });
  var matched = 0;
  wb.forEach(function(wt) { wa.forEach(function(wr) { if (wt === wr || wt.indexOf(wr) !== -1 || wr.indexOf(wt) !== -1) matched++; }); });
  var ratio = wb.length > 0 ? matched / wb.length : 0;
  return ratio >= 0.9 ? Math.round(75 + ratio * 15) : Math.round(ratio * 70);
}

// ─── TMDB ──────────────────────────────────────────────
function getTMDBInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var key = typeof TMDB_API_KEY !== 'undefined' ? TMDB_API_KEY : '';
    if (!key) { console.log("[Cinemana] TMDB_API_KEY not provided by Nuvio"); return null; }

    var type = mediaType === "movie" ? "movie" : "tv";
    var urlMain = TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + key + "&language=en-US";
    var urlTrans = TMDB_BASE + "/" + type + "/" + tmdbId + "/translations?api_key=" + key;

    try {
      var [rMain, rTrans] = yield Promise.all([
        safeFetch(urlMain),
        safeFetch(urlTrans, null, 8e3)
      ]);

      if (!rMain.ok) { console.log("[Cinemana] TMDB main returned " + rMain.status); return null; }
      var d = yield rMain.json();
      var titleEn = d.title || d.name || "";
      var origTitle = d.original_title || d.original_name || titleEn;
      var origLang = d.original_language || "en";
      var year = "";
      if (d.release_date) year = d.release_date.substring(0, 4);
      if (d.first_air_date) year = d.first_air_date.substring(0, 4);

      var titles = [];
      if (titleEn) titles.push(titleEn);
      if (origTitle && origTitle !== titleEn) titles.push(origTitle);

      if (rTrans.ok) {
        var dTrans = yield rTrans.json();
        var list = dTrans.translations || [];
        for (var i = 0; i < list.length; i++) {
          var t = list[i];
          if (t && t.data) {
            var tt = t.data.title || t.data.name || "";
            if (tt && titles.indexOf(tt) === -1) titles.push(tt);
          }
        }
      }

      if (origLang === "ja" && titles.length < 3) {
        try {
          var rAlt = yield safeFetch(TMDB_BASE + "/" + type + "/" + tmdbId + "/alternative_titles?api_key=" + key, null, 6e3);
          if (rAlt.ok) {
            var dAlt = yield rAlt.json();
            var alts = dAlt.results || dAlt.titles || [];
            for (var i = 0; i < alts.length; i++) {
              var a = alts[i].title || alts[i].name || "";
              if (a && /[a-zA-Z]/.test(a) && titles.indexOf(a) === -1) titles.push(a);
            }
          }
        } catch (e) {}
      }

      console.log("[Cinemana] TMDB titles (" + titles.length + "): " + titles.slice(0, 5).join(" | ") + (titles.length > 5 ? " ..." : ""));
      return { titles: titles, originalLanguage: origLang, year: year };
    } catch (e) {
      console.log("[Cinemana] TMDB error: " + e.message);
      return null;
    }
  });
}

// ─── Cinemana API ──────────────────────────────────────
function searchCinemana(query, type) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(CINEMANA_BASE + "/AdvancedSearch?videoTitle=" + encodeURIComponent(query) + "&type=" + type, null, 8e3);
      if (!r.ok) return [];
      var d = yield r.json();
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  });
}

function getTranscodedFiles(id) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(CINEMANA_BASE + "/transcoddedFiles/id/" + id, null, 8e3);
      if (!r.ok) return [];
      var d = yield r.json();
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  });
}

function getSeriesEpisodes(id) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(CINEMANA_BASE + "/videoSeason/id/" + id, null, 8e3);
      if (!r.ok) return [];
      var d = yield r.json();
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  });
}

// ─── Subtitles ─────────────────────────────────────────
function getTranslationFiles(id) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(CINEMANA_BASE + "/translationFiles/id/" + id, null, 8e3);
      if (!r.ok) return {};
      return yield r.json();
    } catch (e) { return {}; }
  });
}

function buildSubtitles(data) {
  var subs = [], languages = {};
  var translations = Array.isArray(data && data.translations) ? data.translations.slice() : [];
  translations.sort(function (a, b) { return (a.extention === 'vtt' ? 0 : 1) - (b.extention === 'vtt' ? 0 : 1); });
  translations.forEach(function (s) {
    if (!safeMedia(s.file) || languages[s.type] || !/^(vtt|srt)$/.test(s.extention)) return;
    languages[s.type] = true;
    subs.push({
      url: s.file,
      language: s.type === 'ar' ? 'Arabic' : s.type === 'en' ? 'English' : s.name,
      name: s.name + ' (' + s.extention + ')',
      headers: HEADERS
    });
  });
  return subs;
}

// ─── Search & Score ────────────────────────────────────
function searchAndScore(tmdbInfo, mediaType, requireDubbed) {
  return __async(this, null, function* () {
    var searchType = mediaType === "movie" ? "movie" : "series";
    var isSeries = mediaType !== "movie";
    var isAnime = tmdbInfo.originalLanguage === "ja";

    var queries = [];
    for (var t = 0; t < Math.min(tmdbInfo.titles.length, 4); t++) {
      var title = tmdbInfo.titles[t];
      if (!title) continue;
      if (queries.indexOf(title) === -1) queries.push(title);
      var clean = title.replace(/[\:\-\–—().,!?'"]/g, " ").replace(/\s+/g, " ").trim();
      if (clean && clean !== title && queries.indexOf(clean) === -1) queries.push(clean);
    }

    if (requireDubbed) {
      var dubQ = [];
      for (var q = 0; q < queries.length; q++) {
        if (queries[q].indexOf("مدبلج") === -1 && queries[q].indexOf("dubbed") === -1) {
          dubQ.push(queries[q] + " مدبلج");
        }
      }
      queries = dubQ;
    }

    console.log("[Cinemana] " + (requireDubbed ? "DUB" : "SUB") + " queries: " + queries.join(" | "));

    var searchPromises = [];
    for (var q = 0; q < queries.length; q++) {
      searchPromises.push(searchCinemana(queries[q], searchType));
    }
    var resultsArrays = yield Promise.all(searchPromises);

    var allResults = [];
    var seenIds = {};
    for (var r = 0; r < resultsArrays.length; r++) {
      var arr = resultsArrays[r];
      for (var i = 0; i < arr.length; i++) {
        var id = String(arr[i].nb || arr[i].id || "").trim();
        if (id && !seenIds[id]) { seenIds[id] = true; allResults.push(arr[i]); }
      }
    }

    console.log("[Cinemana] " + (requireDubbed ? "DUB" : "SUB") + " unique results: " + allResults.length);

    var best = null, bestScore = 0;
    for (var i = 0; i < allResults.length; i++) {
      var item = allResults[i];
      var itemTitle = item.en_title || item.ar_title || item.videoTitle || item.title || item.name || "";
      var itemKind = String(item.kind || "");
      var itemYear = item.year ? String(item.year) : (item.createdate ? String(item.createdate).substring(0, 4) : "");

      if (isSeries !== (itemKind === "2")) continue;

      var isDubbed = isDubbedTitle(itemTitle) || isDubbedTitle(item.ar_title) || isDubbedTitle(item.en_title);
      if (requireDubbed && !isDubbed) continue;
      if (!requireDubbed && isDubbed) continue;

      var score = 0;
      for (var t = 0; t < tmdbInfo.titles.length; t++) {
        var s = strictMatchScore(itemTitle, tmdbInfo.titles[t]);
        if (isDubbed) s = Math.max(s, strictMatchScore(removeDubWords(itemTitle), tmdbInfo.titles[t]));
        score = Math.max(score, s);
      }
      if (tmdbInfo.year && itemYear === tmdbInfo.year) score += 5;

      if (score > bestScore) { bestScore = score; best = { item: item, score: score, id: String(item.nb || item.id || "").trim(), title: itemTitle, isDubbed: isDubbed }; }
    }

    var threshold = isAnime ? (requireDubbed ? 70 : 75) : (requireDubbed ? 80 : 85);

    if (best && bestScore >= threshold) {
      console.log("[Cinemana] " + (requireDubbed ? "DUB" : "SUB") + " ACCEPTED: '" + best.title + "' (" + bestScore + "/" + threshold + ")");
      return best;
    }
    console.log("[Cinemana] " + (requireDubbed ? "DUB" : "SUB") + " REJECTED: best=" + bestScore + "/" + threshold);
    return null;
  });
}

// ─── Get streams ───────────────────────────────────────
function getStreamsFromMatch(match, mediaType, season, episode) {
  return __async(this, null, function* () {
    var label = match.isDubbed ? "Cinemana | مدبلج عربي" : "Cinemana | مترجم";
    var targetId = match.id;

    if (mediaType !== "movie") {
      var episodes = yield getSeriesEpisodes(match.id);
      var ts = Number(season || 1), te = Number(episode || 1);
      var epItem = null;
      for (var e = 0; e < episodes.length; e++) {
        var ep = episodes[e];
        if (Number(ep.season || 0) === ts && Number(ep.episodeNummer || 0) === te) { epItem = ep; break; }
      }
      if (!epItem) return [];
      targetId = String(epItem.nb || epItem.id || "").trim();
      if (!targetId) return [];
    }

    var [qualities, transData] = yield Promise.all([
      getTranscodedFiles(targetId),
      getTranslationFiles(targetId)
    ]);
    var subs = buildSubtitles(transData);

    var seen = {};
    var candidates = [];
    var qArr = Array.isArray(qualities) ? qualities : [];
    for (var i = 0; i < qArr.length; i++) {
      var q = qArr[i];
      if (!q.videoUrl) continue;
      // جرّب كل حقول الجودة المحتملة — أول حقل يعطي rank أعلى يفوز
      var r1 = qualityRank(q.resolution);
      var r2 = qualityRank(q.name);
      var r3 = qualityRank(q.quality);
      var rank = Math.max(r1, r2, r3);
      if (rank === 0) continue;
      var u = cleanUrl(q.videoUrl);
      if (!u || seen[u]) continue;
      seen[u] = true;
      candidates.push({ url: u, rank: rank });
    }

    if (candidates.length === 0) return [];

    // ترتيب: rank 3 (4K) قبل rank 2 (1080p)
    candidates.sort(function(a, b) { return b.rank - a.rank; });

    var streams = [];
    for (var c = 0; c < candidates.length; c++) {
      var cand = candidates[c];
      var qLabel = cand.rank === 3 ? "4K" : "1080p";
      var stream = {
        name: label,
        title: label + "\n" + qLabel,
        url: cand.url,
        quality: qLabel,
        headers: HEADERS
      };
      if (!match.isDubbed && subs.length > 0) stream.subtitles = subs;
      streams.push(stream);
    }

    console.log("[Cinemana] streams ready: " + streams.length + " (4K=" + candidates.filter(function(c){return c.rank===3;}).length + ", 1080p=" + candidates.filter(function(c){return c.rank===2;}).length + ")");
    return streams;
  });
}

// ─── Main ──────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    console.log("[Cinemana] === " + mediaType + "/" + tmdbId + " S" + (season || "?") + "E" + (episode || "?") + " ===");

    var key = typeof TMDB_API_KEY !== 'undefined' ? TMDB_API_KEY : '';
    if (!key) {
      console.log("[Cinemana] ERROR: TMDB_API_KEY not provided by Nuvio");
      return [];
    }

    try {
      var tmdbInfo = yield getTMDBInfo(tmdbId, mediaType);
      if (!tmdbInfo) { console.log("[Cinemana] TMDB failed"); return []; }
      console.log("[Cinemana] lang=" + tmdbInfo.originalLanguage + " year=" + tmdbInfo.year);

      var [subMatch, dubMatch] = yield Promise.all([
        searchAndScore(tmdbInfo, mediaType, false),
        searchAndScore(tmdbInfo, mediaType, true)
      ]);

      var jobs = [];
      if (subMatch) {
        jobs.push(getStreamsFromMatch(subMatch, mediaType, season, episode));
      }
      if (dubMatch) {
        var cleanDub = removeDubWords(dubMatch.title);
        var verifyScore = 0;
        for (var t = 0; t < tmdbInfo.titles.length; t++) {
          verifyScore = Math.max(verifyScore, strictMatchScore(cleanDub, tmdbInfo.titles[t]));
        }
        console.log("[Cinemana] DUB verify: '" + cleanDub + "' -> " + verifyScore);
        if (verifyScore >= 70) {
          jobs.push(getStreamsFromMatch(dubMatch, mediaType, season, episode));
        } else {
          console.log("[Cinemana] DUB verify FAILED (need 70+, got " + verifyScore + ")");
        }
      }

      if (jobs.length === 0) {
        console.log("[Cinemana] === Done: 0 streams in " + (Date.now() - t0) + "ms ===");
        return [];
      }

      var groups = yield Promise.all(jobs);
      var allStreams = [];
      for (var g = 0; g < groups.length; g++) {
        var arr = groups[g] || [];
        for (var s = 0; s < arr.length; s++) allStreams.push(arr[s]);
      }

      // الترتيب النهائي: 4K فوق 1080p، ومهما كان المصدر (SUB أو DUB)
      allStreams.sort(function(a, b) {
        var ra = qualityRank(a.quality);
        var rb = qualityRank(b.quality);
        return rb - ra;
      });

      console.log("[Cinemana] === Done: " + allStreams.length + " streams in " + (Date.now() - t0) + "ms ===");
      return allStreams;
    } catch (err) {
      console.log("[Cinemana] FATAL: " + (err.message || err));
      return [];
    }
  });
}

module.exports = { getStreams };
