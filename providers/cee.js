// Cee Scraper for Nuvio Local Scrapers
// FAST: parallel TMDB, reduced queries, parallel SUB/DUB search
// Multi-language | 1080p only | Verified Dub/Sub
// React Native compatible (Hermes-safe, no async/await)

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var CEE_BASE = "https://cee.buzz/api/android";
var TMDB_BASE = "https://api.themoviedb.org/3";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 8e3;
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

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
function is1080p(q) { return q ? q.toString().toLowerCase().indexOf("1080") !== -1 : false; }
function isDubbedTitle(t) { if (!t) return false; t = t.toLowerCase(); return t.indexOf("مدبلج") !== -1 || t.indexOf("dubbed") !== -1 || t.indexOf("dub") !== -1 || t.indexOf("مدبلجة") !== -1; }

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

// ─── TMDB: 2 parallel calls only ─────────────────────────
function getTMDBInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var type = mediaType === "movie" ? "movie" : "tv";
    var urlMain = TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=en-US";
    var urlTrans = TMDB_BASE + "/" + type + "/" + tmdbId + "/translations?api_key=" + TMDB_API_KEY;

    try {
      // Fetch both in parallel
      var [rMain, rTrans] = yield Promise.all([
        safeFetch(urlMain),
        safeFetch(urlTrans, null, 8e3)
      ]);

      if (!rMain.ok) { console.log("[Cee] TMDB main returned " + rMain.status); return null; }
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

      // Parse translations (all languages in one call!)
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

      // For anime: try to get romaji from English alternative titles
      if (origLang === "ja" && titles.length < 3) {
        try {
          var rAlt = yield safeFetch(TMDB_BASE + "/" + type + "/" + tmdbId + "/alternative_titles?api_key=" + TMDB_API_KEY, null, 6e3);
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

      console.log("[Cee] TMDB titles (" + titles.length + "): " + titles.slice(0, 5).join(" | ") + (titles.length > 5 ? " ..." : ""));
      return { titles: titles, originalLanguage: origLang, year: year };
    } catch (e) {
      console.log("[Cee] TMDB error: " + e.message);
      return null;
    }
  });
}

// ─── Cee API ──────────────────────────────────────
function searchCee(query, type) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(CEE_BASE + "/AdvancedSearch?videoTitle=" + encodeURIComponent(query) + "&type=" + type, null, 8e3);
      if (!r.ok) return [];
      var d = yield r.json();
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  });
}

function getTranscodedFiles(id) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(CEE_BASE + "/transcoddedFiles/id/" + id, null, 8e3);
      if (!r.ok) return [];
      var d = yield r.json();
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  });
}

function getSeriesEpisodes(id) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(CEE_BASE + "/videoSeason/id/" + id, null, 8e3);
      if (!r.ok) return [];
      var d = yield r.json();
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  });
}

function getVideoInfo(id) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(CEE_BASE + "/allVideoInfo/id/" + id, null, 8e3);
      if (!r.ok) return null;
      return yield r.json();
    } catch (e) { return null; }
  });
}

function extractSubtitles(info) {
  var out = [];
  if (!info || !info.translations) return out;
  var tracks = info.translations;
  for (var i = 0; i < tracks.length; i++) {
    var t = tracks[i];
    if (t && t.file) out.push({ url: cleanUrl(t.file), lang: (t.name || t.type || "sub").toLowerCase(), label: t.name || t.type || "Subtitle" });
  }
  return out;
}

// ─── Search & Score ─────────────────────────────────────
function searchAndScore(tmdbInfo, mediaType, requireDubbed) {
  return __async(this, null, function* () {
    var searchType = mediaType === "movie" ? "movie" : "series";
    var isSeries = mediaType !== "movie";
    var isAnime = tmdbInfo.originalLanguage === "ja";

    // Build only TOP 4 queries (fast!)
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

    console.log("[Cee] " + (requireDubbed ? "DUB" : "SUB") + " queries: " + queries.join(" | "));

    // Search all queries in parallel!
    var searchPromises = [];
    for (var q = 0; q < queries.length; q++) {
      searchPromises.push(searchCee(queries[q], searchType));
    }
    var resultsArrays = yield Promise.all(searchPromises);

    // Deduplicate
    var allResults = [];
    var seenIds = {};
    for (var r = 0; r < resultsArrays.length; r++) {
      var arr = resultsArrays[r];
      for (var i = 0; i < arr.length; i++) {
        var id = String(arr[i].nb || arr[i].id || "").trim();
        if (id && !seenIds[id]) { seenIds[id] = true; allResults.push(arr[i]); }
      }
    }

    console.log("[Cee] " + (requireDubbed ? "DUB" : "SUB") + " unique results: " + allResults.length);

    // Score
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
      console.log("[Cee] " + (requireDubbed ? "DUB" : "SUB") + " ACCEPTED: '" + best.title + "' (" + bestScore + "/" + threshold + ")");
      return best;
    }
    console.log("[Cee] " + (requireDubbed ? "DUB" : "SUB") + " REJECTED: best=" + bestScore + "/" + threshold);
    return null;
  });
}

// ─── Get streams ────────────────────────────────────────
function getStreamsFromMatch(match, mediaType, season, episode) {
  return __async(this, null, function* () {
    var streams = [];
    var label = match.isDubbed ? "Cee | مدبلج عربي" : "Cee | مترجم";
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

    // Fetch video info + transcoded files in parallel
    var [qualities, info] = yield Promise.all([
      getTranscodedFiles(targetId),
      getVideoInfo(targetId)
    ]);
    var subs = extractSubtitles(info);

    for (var i = 0; i < qualities.length; i++) {
      var q = qualities[i];
      if (!q.videoUrl) continue;
      var qName = q.resolution || q.name || "";
      if (!is1080p(qName)) continue;
      var stream = { name: label, title: "1080p", url: cleanUrl(q.videoUrl), quality: qName };
      if (!match.isDubbed && subs.length > 0) stream.subtitles = subs;
      streams.push(stream);
    }
    return streams;
  });
}

// ─── Main ───────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    console.log("[Cee] === " + mediaType + "/" + tmdbId + " S" + (season || "?") + "E" + (episode || "?") + " ===");

    if (!TMDB_API_KEY || TMDB_API_KEY.indexOf("YOUR") !== -1) {
      console.log("[Cee] ERROR: TMDB API key not set");
      return [];
    }

    try {
      var tmdbInfo = yield getTMDBInfo(tmdbId, mediaType);
      if (!tmdbInfo) { console.log("[Cee] TMDB failed"); return []; }
      console.log("[Cee] lang=" + tmdbInfo.originalLanguage + " year=" + tmdbInfo.year);

      // Search SUB and DUB in parallel!
      var [subMatch, dubMatch] = yield Promise.all([
        searchAndScore(tmdbInfo, mediaType, false),
        searchAndScore(tmdbInfo, mediaType, true)
      ]);

      var allStreams = [];

      if (subMatch) {
        var subStreams = yield getStreamsFromMatch(subMatch, mediaType, season, episode);
        for (var s = 0; s < subStreams.length; s++) allStreams.push(subStreams[s]);
      }

      if (dubMatch) {
        var cleanDub = removeDubWords(dubMatch.title);
        var verifyScore = 0;
        for (var t = 0; t < tmdbInfo.titles.length; t++) {
          verifyScore = Math.max(verifyScore, strictMatchScore(cleanDub, tmdbInfo.titles[t]));
        }
        console.log("[Cee] DUB verify: '" + cleanDub + "' -> " + verifyScore);
        if (verifyScore >= 70) {
          var dubStreams = yield getStreamsFromMatch(dubMatch, mediaType, season, episode);
          for (var s = 0; s < dubStreams.length; s++) allStreams.push(dubStreams[s]);
        } else {
          console.log("[Cee] DUB verify FAILED (need 70+, got " + verifyScore + ")");
        }
      }

      console.log("[Cee] === Done: " + allStreams.length + " streams in " + (Date.now() - t0) + "ms ===");
      return allStreams;
    } catch (err) {
      console.log("[Cee] FATAL: " + (err.message || err));
      return [];
    }
  });
}

module.exports = { getStreams };
