// Cinemana Scraper for Nuvio Local Scrapers
// Multi-language EXACT literal search | 1080p only | Verified Dub/Sub
// Fixed: Japanese/Chinese/Korean title support
// React Native compatible version (Hermes-safe, no async/await)

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try { step(generator.next(value)); } catch (e) { reject(e); }
    };
    var rejected = (value) => {
      try { step(generator.throw(value)); } catch (e) { reject(e); }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var CINEMANA_BASE = "https://cinemana.shabakaty.com/api/android";
var TMDB_BASE = "https://api.themoviedb.org/3";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15e3;
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

function safeFetch(url, options, timeout) {
  var ms = timeout || FETCH_TIMEOUT;
  var controller, tid;
  try {
    controller = new AbortController();
    tid = setTimeout(function() { controller.abort(); }, ms);
  } catch (e) { controller = null; }
  var opts = options || {};
  if (controller) opts.signal = controller.signal;
  if (!opts.headers) opts.headers = {};
  if (!opts.headers["User-Agent"]) opts.headers["User-Agent"] = UA;
  return fetch(url, opts).then(function(r) {
    if (tid) clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid) clearTimeout(tid);
    throw e;
  });
}

// ─── Title Normalization ─────────────────────────────────
// FIXED: Preserves ALL language characters (Japanese, Chinese, Korean, etc.)
function normalizeTitle(title) {
  if (!title) return "";
  return title.toLowerCase()
    .replace(/[\:\-\–—().,!?'"]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(season|s|part|vol|volume|episode|ep|chapter|ch)\s*\d+\b/g, "")
    .replace(/\bالحلقة\s*\d+\b/g, "")
    .replace(/\bالموسم\s*\d+\b/g, "")
    .trim();
}

function removeDubWords(title) {
  if (!title) return "";
  return title.toLowerCase()
    .replace(/مدبلج[ة]?/gi, "")
    .replace(/dubbed/gi, "")
    .replace(/dub/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUrl(url) {
  if (!url) return "";
  return url.replace(/\\/g, "");
}

function is1080p(q) {
  if (!q) return false;
  return q.toString().toLowerCase().indexOf("1080") !== -1;
}

function isDubbedTitle(title) {
  if (!title) return false;
  var t = title.toLowerCase();
  return t.indexOf("مدبلج") !== -1 || t.indexOf("dubbed") !== -1 || t.indexOf("dub") !== -1 || t.indexOf("مدبلجة") !== -1;
}

// ─── ULTRA-STRICT Matching ───────────────────────────────
function strictMatchScore(resultTitle, tmdbTitle) {
  var normResult = normalizeTitle(resultTitle);
  var normTmdb = normalizeTitle(tmdbTitle);

  if (!normResult || !normTmdb) return 0;

  // Exact match
  if (normResult === normTmdb) return 100;

  // Contains
  if (normResult.indexOf(normTmdb) !== -1 || normTmdb.indexOf(normResult) !== -1) {
    var shorter = normResult.length < normTmdb.length ? normResult : normTmdb;
    var longer = normResult.length < normTmdb.length ? normTmdb : normResult;
    var coverage = shorter.length / longer.length;
    if (coverage >= 0.85) {
      return Math.round(88 + (coverage * 10));
    }
  }

  // Word overlap (for space-separated languages like English/Arabic)
  var resultWords = normResult.split(" ").filter(function(w) { return w.length > 2; });
  var tmdbWords = normTmdb.split(" ").filter(function(w) { return w.length > 2; });

  var matched = 0;
  tmdbWords.forEach(function(wt) {
    resultWords.forEach(function(wr) {
      if (wt === wr || wt.indexOf(wr) !== -1 || wr.indexOf(wt) !== -1) {
        matched++;
      }
    });
  });

  var wordRatio = tmdbWords.length > 0 ? matched / tmdbWords.length : 0;
  if (wordRatio >= 0.9) {
    return Math.round(75 + (wordRatio * 15));
  }

  return Math.round(wordRatio * 70);
}

// ─── TMDB: Get ALL language titles ───────────────────────
function getTMDBInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var type = mediaType === "movie" ? "movie" : "tv";

    // 1. Get English info + original language
    var urlEn = TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=en-US";
    try {
      var r = yield safeFetch(urlEn);
      if (!r.ok) return null;
      var d = yield r.json();
      var titleEn = d.title || d.name || "";
      var origTitle = d.original_title || d.original_name || titleEn;
      var origLang = d.original_language || "en";
      var year = "";
      if (d.release_date) year = d.release_date.substring(0, 4);
      if (d.first_air_date) year = d.first_air_date.substring(0, 4);

      var titles = [];
      if (titleEn) titles.push(titleEn);
      if (origTitle && origTitle !== titleEn) titles.push(origTitle);

      // 2. Get ALL translations from TMDB (one call = all languages!)
      try {
        var urlTrans = TMDB_BASE + "/" + type + "/" + tmdbId + "/translations?api_key=" + TMDB_API_KEY;
        var rTrans = yield safeFetch(urlTrans, null, 10e3);
        if (rTrans.ok) {
          var dTrans = yield rTrans.json();
          var transList = dTrans.translations || [];
          for (var i = 0; i < transList.length; i++) {
            var trans = transList[i];
            if (trans && trans.data) {
              var tTitle = trans.data.title || trans.data.name || "";
              if (tTitle && titles.indexOf(tTitle) === -1) {
                titles.push(tTitle);
                console.log("[Cinemana] TMDB translation [" + trans.iso_639_1 + "]: " + tTitle);
              }
            }
          }
        }
      } catch (e) {
        console.log("[Cinemana] Translations error: " + e.message);
      }

      // 3. Get alternative titles as backup
      try {
        var urlAlt = TMDB_BASE + "/" + type + "/" + tmdbId + "/alternative_titles?api_key=" + TMDB_API_KEY;
        var rAlt = yield safeFetch(urlAlt, null, 8e3);
        if (rAlt.ok) {
          var dAlt = yield rAlt.json();
          var list = dAlt.results || dAlt.titles || [];
          for (var i = 0; i < list.length; i++) {
            var a = list[i].title || list[i].name || "";
            if (a && titles.indexOf(a) === -1) titles.push(a);
          }
        }
      } catch (e) {}

      // 4. Also get title in original language explicitly (for anime: Japanese, Korean, Chinese, etc.)
      if (origLang !== "en") {
        try {
          var r2 = yield safeFetch(TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=" + origLang, null, 8e3);
          if (r2.ok) { var d2 = yield r2.json(); var t2 = d2.title || d2.name || ""; if (t2 && titles.indexOf(t2) === -1) titles.push(t2); }
        } catch (e) {}
      }

      // 5. Get Arabic title explicitly
      try {
        var rAr = yield safeFetch(TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ar", null, 8e3);
        if (rAr.ok) { var dAr = yield rAr.json(); var tAr = dAr.title || dAr.name || ""; if (tAr && titles.indexOf(tAr) === -1) titles.push(tAr); }
      } catch (e) {}

      // 6. For anime (Japanese), also try to get romaji from alternative titles
      if (origLang === "ja") {
        try {
          var rAlt2 = yield safeFetch(TMDB_BASE + "/" + type + "/" + tmdbId + "/alternative_titles?api_key=" + TMDB_API_KEY, null, 8e3);
          if (rAlt2.ok) {
            var dAlt2 = yield rAlt2.json();
            var list2 = dAlt2.results || dAlt2.titles || [];
            for (var i = 0; i < list2.length; i++) {
              var a2 = list2[i].title || list2[i].name || "";
              // If it looks like romaji (has Latin chars and is Japanese-related)
              if (a2 && /[a-zA-Z]/.test(a2) && titles.indexOf(a2) === -1) {
                titles.push(a2);
                console.log("[Cinemana] Anime romaji alt: " + a2);
              }
            }
          }
        } catch (e) {}
      }

      console.log("[Cinemana] All TMDB titles: " + titles.join(" | "));
      return { titles: titles, originalLanguage: origLang, year: year, tmdbData: d };
    } catch (e) {
      console.log("[Cinemana] TMDB error: " + e.message);
      return null;
    }
  });
}

// ─── Cinemana API ────────────────────────────────────────
function searchCinemana(query, type) {
  return __async(this, null, function* () {
    var url = CINEMANA_BASE + "/AdvancedSearch?videoTitle=" + encodeURIComponent(query) + "&type=" + type;
    try {
      var r = yield safeFetch(url, null, 10e3);
      if (!r.ok) return [];
      var d = yield r.json();
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  });
}

function getTranscodedFiles(id) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(CINEMANA_BASE + "/transcoddedFiles/id/" + id, null, 10e3);
      if (!r.ok) return [];
      var d = yield r.json();
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  });
}

function getSeriesEpisodes(id) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(CINEMANA_BASE + "/videoSeason/id/" + id, null, 10e3);
      if (!r.ok) return [];
      var d = yield r.json();
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  });
}

function getVideoInfo(id) {
  return __async(this, null, function* () {
    try {
      var r = yield safeFetch(CINEMANA_BASE + "/allVideoInfo/id/" + id, null, 10e3);
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
    if (t && t.file) {
      out.push({ url: cleanUrl(t.file), lang: (t.name || t.type || "sub").toLowerCase(), label: t.name || t.type || "Subtitle" });
    }
  }
  return out;
}

// ─── Find Best Match for a specific type ─────────────────
function findBestMatch(tmdbInfo, mediaType, requireDubbed) {
  return __async(this, null, function* () {
    var searchType = mediaType === "movie" ? "movie" : "series";
    var isSeries = mediaType !== "movie";
    var allResults = [];
    var queries = [];

    // Build queries from ALL TMDB titles (multi-language!)
    for (var t = 0; t < tmdbInfo.titles.length; t++) {
      var title = tmdbInfo.titles[t];
      if (!title) continue;
      if (queries.indexOf(title) === -1) queries.push(title);

      // Clean version (no special chars, but KEEP all language chars!)
      var clean = title.replace(/[\:\-\–—().,!?'"]/g, " ").replace(/\s+/g, " ").trim();
      if (clean && clean !== title && queries.indexOf(clean) === -1) queries.push(clean);

      // First word only (for long titles)
      var first = title.split(" ")[0];
      if (first && first.length > 3 && queries.indexOf(first) === -1) queries.push(first);
    }

    // If looking for dubbed, add explicit dub queries
    if (requireDubbed) {
      var dubQueries = [];
      for (var q = 0; q < queries.length; q++) {
        if (queries[q].indexOf("مدبلج") === -1 && queries[q].indexOf("dubbed") === -1) {
          dubQueries.push(queries[q] + " مدبلج");
          dubQueries.push(queries[q] + " dubbed");
        }
      }
      queries = dubQueries;
    }

    console.log("[Cinemana] " + (requireDubbed ? "DUB" : "SUB") + " search queries (" + queries.length + " langs): " + queries.slice(0, 6).join(" | ") + (queries.length > 6 ? " ..." : ""));

    for (var q = 0; q < queries.length; q++) {
      try {
        var results = yield searchCinemana(queries[q], searchType);
        for (var r = 0; r < results.length; r++) {
          var newId = String(results[r].nb || results[r].id || "").trim();
          var existing = false;
          for (var e = 0; e < allResults.length; e++) {
            if (String(allResults[e].nb || allResults[e].id || "").trim() === newId) { existing = true; break; }
          }
          if (!existing) allResults.push(results[r]);
        }
      } catch (e) {}
    }

    console.log("[Cinemana] " + (requireDubbed ? "DUB" : "SUB") + " raw results: " + allResults.length);

    var bestMatch = null;
    var bestScore = 0;

    for (var i = 0; i < allResults.length; i++) {
      var item = allResults[i];
      var itemTitle = item.en_title || item.ar_title || item.videoTitle || item.title || item.name || "";
      var itemKind = String(item.kind || "");
      var itemYear = "";
      if (item.year) itemYear = String(item.year);
      else if (item.createdate) itemYear = String(item.createdate).substring(0, 4);

      var isItemSeries = itemKind === "2";
      if (isSeries !== isItemSeries) continue;

      // Check dubbed status
      var isDubbed = isDubbedTitle(itemTitle) || isDubbedTitle(item.ar_title) || isDubbedTitle(item.en_title);

      if (requireDubbed && !isDubbed) continue;
      if (!requireDubbed && isDubbed) continue;

      // Score against ALL TMDB titles (multi-language!)
      var score = 0;
      for (var t = 0; t < tmdbInfo.titles.length; t++) {
        var tmTitle = tmdbInfo.titles[t];
        var s = strictMatchScore(itemTitle, tmTitle);

        // For dubbed results, also score the title with dub words removed
        if (isDubbed) {
          var cleanItemTitle = removeDubWords(itemTitle);
          var cleanScore = strictMatchScore(cleanItemTitle, tmTitle);
          s = Math.max(s, cleanScore);
        }

        score = Math.max(score, s);
      }

      // Year bonus
      if (tmdbInfo.year && itemYear) {
        if (itemYear === tmdbInfo.year) score += 5;
      }

      console.log("[Cinemana] " + (requireDubbed ? "DUB" : "SUB") + " candidate: '" + itemTitle + "' -> score=" + score);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { item: item, score: score, id: String(item.nb || item.id || "").trim(), title: itemTitle, isDubbed: isDubbed };
      }
    }

    // STRICT: require 90+ for sub, 85+ for dub
    var threshold = requireDubbed ? 85 : 90;

    if (bestMatch && bestScore >= threshold) {
      console.log("[Cinemana] " + (requireDubbed ? "DUB" : "SUB") + " ACCEPTED: '" + bestMatch.title + "' (" + bestScore + ")");
      return bestMatch;
    }

    console.log("[Cinemana] " + (requireDubbed ? "DUB" : "SUB") + " REJECTED — best: " + bestScore + "/" + threshold);
    return null;
  });
}

// ─── Get streams from a match ────────────────────────────
function getStreamsFromMatch(match, mediaType, season, episode) {
  return __async(this, null, function* () {
    var streams = [];
    var nameLabel = match.isDubbed ? "Cinemana | مدبلج عربي" : "Cinemana | مترجم";

    if (mediaType === "movie") {
      var qualities = yield getTranscodedFiles(match.id);
      var info = yield getVideoInfo(match.id);
      var subs = extractSubtitles(info);

      for (var i = 0; i < qualities.length; i++) {
        var q = qualities[i];
        if (!q.videoUrl) continue;
        var qName = q.resolution || q.name || "";
        if (!is1080p(qName)) continue;
        var stream = { name: nameLabel, title: "1080p", url: cleanUrl(q.videoUrl), quality: qName };
        if (!match.isDubbed && subs.length > 0) stream.subtitles = subs;
        streams.push(stream);
      }
    } else {
      var episodes = yield getSeriesEpisodes(match.id);
      var targetSeason = Number(season || 1);
      var targetEpisode = Number(episode || 1);
      var epItem = null;

      for (var e = 0; e < episodes.length; e++) {
        var ep = episodes[e];
        if (Number(ep.season || 0) === targetSeason && Number(ep.episodeNummer || 0) === targetEpisode) {
          epItem = ep;
          break;
        }
      }

      if (!epItem) return [];
      var epId = String(epItem.nb || epItem.id || "").trim();
      if (!epId) return [];

      var qualities = yield getTranscodedFiles(epId);
      var info = yield getVideoInfo(epId);
      var subs = extractSubtitles(info);

      for (var i = 0; i < qualities.length; i++) {
        var q = qualities[i];
        if (!q.videoUrl) continue;
        var qName = q.resolution || q.name || "";
        if (!is1080p(qName)) continue;
        var stream = { name: nameLabel, title: "1080p", url: cleanUrl(q.videoUrl), quality: qName };
        if (!match.isDubbed && subs.length > 0) stream.subtitles = subs;
        streams.push(stream);
      }
    }

    return streams;
  });
}

// ─── Main ────────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    console.log("[Cinemana] === " + mediaType + "/" + tmdbId + " S" + (season || "?") + "E" + (episode || "?") + " ===");

    if (!TMDB_API_KEY || TMDB_API_KEY.indexOf("YOUR") !== -1) {
      console.log("[Cinemana] ERROR: TMDB API key not set");
      return [];
    }

    try {
      var tmdbInfo = yield getTMDBInfo(tmdbId, mediaType);
      if (!tmdbInfo) {
        console.log("[Cinemana] Failed to get TMDB info");
        return [];
      }
      console.log("[Cinemana] TMDB: '" + tmdbInfo.titles[0] + "' year=" + tmdbInfo.year + " lang=" + tmdbInfo.originalLanguage);

      var allStreams = [];

      // Find SUB (non-dubbed) — separate search, no dub keywords
      var subMatch = yield findBestMatch(tmdbInfo, mediaType, false);
      if (subMatch) {
        var subStreams = yield getStreamsFromMatch(subMatch, mediaType, season, episode);
        for (var s = 0; s < subStreams.length; s++) allStreams.push(subStreams[s]);
      }

      // Find DUB (dubbed) — separate search WITH dub keywords
      var dubMatch = yield findBestMatch(tmdbInfo, mediaType, true);
      if (dubMatch) {
        var cleanDubTitle = removeDubWords(dubMatch.title);
        var verifyScore = 0;
        for (var t = 0; t < tmdbInfo.titles.length; t++) {
          verifyScore = Math.max(verifyScore, strictMatchScore(cleanDubTitle, tmdbInfo.titles[t]));
        }

        console.log("[Cinemana] DUB verify: cleanTitle='" + cleanDubTitle + "' vs TMDB -> score=" + verifyScore);

        if (verifyScore >= 80) {
          var dubStreams = yield getStreamsFromMatch(dubMatch, mediaType, season, episode);
          for (var s = 0; s < dubStreams.length; s++) allStreams.push(dubStreams[s]);
        } else {
          console.log("[Cinemana] DUB verification FAILED (need 80+, got " + verifyScore + "). Skipping dub.");
        }
      }

      console.log("[Cinemana] === Done: " + allStreams.length + " streams in " + (Date.now() - t0) + "ms ===");
      return allStreams;
    } catch (err) {
      console.log("[Cinemana] FATAL ERROR: " + (err.message || err));
      return [];
    }
  });
}

module.exports = { getStreams };
