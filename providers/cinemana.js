// Cinemana Scraper for Nuvio Local Scrapers
// Multi-language exact search + 1080p only + Dubbed & Subtitled (strict verification)
// React Native compatible version (Hermes-safe, no async/await)
// Format: name="Cinemana | مدبلج عربي/mترجم", title="1080p"

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

function normalizeText(str) {
  if (!str) return "";
  return str.toString().toLowerCase().trim().replace(/\s+/g, " ").replace(/[^\w\s]/g, "");
}

function similarityScore(a, b) {
  var na = normalizeText(a);
  var nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1) return 90;
  var wa = na.split(" ");
  var wb = nb.split(" ");
  var common = 0;
  for (var i = 0; i < wa.length; i++) {
    if (wa[i].length > 2 && wb.indexOf(wa[i]) !== -1) common++;
  }
  if (wa.length > 0) return Math.floor((common / wa.length) * 80);
  return 0;
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

function removeDubWords(title) {
  if (!title) return "";
  return title.toLowerCase()
    .replace(/مدبلج[ة]?/g, "")
    .replace(/dubbed/g, "")
    .replace(/dub/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// TMDB
// ============================================================
function getTMDBInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var type = mediaType === "movie" ? "movie" : "tv";
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

      if (origLang !== "en") {
        try {
          var r2 = yield safeFetch(TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=" + origLang, null, 8e3);
          if (r2.ok) { var d2 = yield r2.json(); var t2 = d2.title || d2.name || ""; if (t2 && titles.indexOf(t2) === -1) titles.push(t2); }
        } catch (e) {}
      }

      try {
        var rAr = yield safeFetch(TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ar", null, 8e3);
        if (rAr.ok) { var dAr = yield rAr.json(); var tAr = dAr.title || dAr.name || ""; if (tAr && titles.indexOf(tAr) === -1) titles.push(tAr); }
      } catch (e) {}

      try {
        var rAlt = yield safeFetch(TMDB_BASE + "/" + type + "/" + tmdbId + "/alternative_titles?api_key=" + TMDB_API_KEY, null, 8e3);
        if (rAlt.ok) { var dAlt = yield rAlt.json(); var list = dAlt.results || dAlt.titles || []; for (var i = 0; i < list.length; i++) { var a = list[i].title || list[i].name || ""; if (a && titles.indexOf(a) === -1) titles.push(a); } }
      } catch (e) {}

      return { titles: titles, originalLanguage: origLang, year: year, tmdbData: d };
    } catch (e) {
      console.log("[Cinemana] TMDB error: " + e.message);
      return null;
    }
  });
}

// ============================================================
// Cinemana API
// ============================================================
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

// ============================================================
// Score a candidate against TMDB info
// ============================================================
function scoreCandidate(item, tmdbInfo, isSeries) {
  var itemTitle = item.en_title || item.ar_title || item.videoTitle || item.title || item.name || "";
  var itemOriginal = item.other_title || item.original_title || itemTitle;
  var itemKind = String(item.kind || "");
  var itemYear = "";
  if (item.year) itemYear = String(item.year);
  else if (item.createdate) itemYear = String(item.createdate).substring(0, 4);

  var isItemSeries = itemKind === "2";
  if (isSeries !== isItemSeries) return { score: -999, isDubbed: false, title: itemTitle };

  var score = 0;
  for (var t = 0; t < tmdbInfo.titles.length; t++) {
    score = Math.max(score, similarityScore(itemTitle, tmdbInfo.titles[t]));
    score = Math.max(score, similarityScore(itemOriginal, tmdbInfo.titles[t]));
  }

  // Also score against title WITHOUT dub words (for dubbed results)
  var cleanItemTitle = removeDubWords(itemTitle);
  var cleanItemOriginal = removeDubWords(itemOriginal);
  for (var t = 0; t < tmdbInfo.titles.length; t++) {
    score = Math.max(score, similarityScore(cleanItemTitle, tmdbInfo.titles[t]));
    score = Math.max(score, similarityScore(cleanItemOriginal, tmdbInfo.titles[t]));
  }

  if (tmdbInfo.year && itemYear) {
    if (itemYear === tmdbInfo.year) score += 25;
    else if (Math.abs(Number(itemYear) - Number(tmdbInfo.year)) <= 1) score += 10;
  }

  var dubbed = isDubbedTitle(itemTitle) || isDubbedTitle(item.ar_title) || isDubbedTitle(item.en_title);

  return { score: score, isDubbed: dubbed, title: itemTitle, id: String(item.nb || item.id || "").trim(), item: item };
}

// ============================================================
// Find matches — strict: only return dubbed if it truly matches
// ============================================================
function findMatches(tmdbInfo, mediaType) {
  return __async(this, null, function* () {
    var searchType = mediaType === "movie" ? "movie" : "series";
    var isSeries = mediaType !== "movie";
    var allResults = [];
    var queries = [];

    // Build queries
    for (var t = 0; t < tmdbInfo.titles.length; t++) {
      var title = tmdbInfo.titles[t];
      if (title && queries.indexOf(title) === -1) queries.push(title);
      var clean = title.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
      if (clean && clean !== title && queries.indexOf(clean) === -1) queries.push(clean);
      var first = title.split(" ")[0];
      if (first && first.length > 3 && queries.indexOf(first) === -1) queries.push(first);
    }

    // Search with original queries
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

    // Score all results
    var scored = [];
    for (var i = 0; i < allResults.length; i++) {
      var sc = scoreCandidate(allResults[i], tmdbInfo, isSeries);
      if (sc.score >= 30) {
        scored.push(sc);
        console.log("[Cinemana] Candidate: " + sc.title + " | score=" + sc.score + " | dubbed=" + sc.isDubbed);
      }
    }

    if (scored.length === 0) {
      console.log("[Cinemana] No matches from original search");
      return { sub: null, dub: null };
    }

    scored.sort(function(a, b) { return b.score - a.score; });

    // Pick best sub (non-dubbed)
    var bestSub = null;
    for (var i = 0; i < scored.length; i++) {
      if (!scored[i].isDubbed) { bestSub = scored[i]; break; }
    }

    // Pick best dub — MUST have high score AND match the title closely
    var bestDub = null;
    for (var i = 0; i < scored.length; i++) {
      if (scored[i].isDubbed) {
        // STRICT: dubbed must score 60+ AND year must match (if available)
        if (scored[i].score >= 60) {
          var itemYear = "";
          if (scored[i].item.year) itemYear = String(scored[i].item.year);
          else if (scored[i].item.createdate) itemYear = String(scored[i].item.createdate).substring(0, 4);

          if (!tmdbInfo.year || !itemYear || itemYear === tmdbInfo.year) {
            bestDub = scored[i];
            break;
          }
        }
      }
    }

    // If no good dub found in original search, try explicit dubbed search
    if (!bestDub) {
      console.log("[Cinemana] No verified dub in original results. Trying explicit dub search...");
      var dubQueries = [];
      for (var q = 0; q < queries.length; q++) {
        if (queries[q].indexOf("مدبلج") === -1 && queries[q].indexOf("dubbed") === -1) {
          dubQueries.push(queries[q] + " مدبلج");
          dubQueries.push(queries[q] + " dubbed");
        }
      }

      var dubResults = [];
      for (var q = 0; q < dubQueries.length; q++) {
        try {
          var results = yield searchCinemana(dubQueries[q], searchType);
          for (var r = 0; r < results.length; r++) {
            var newId = String(results[r].nb || results[r].id || "").trim();
            var existing = false;
            for (var e = 0; e < dubResults.length; e++) {
              if (String(dubResults[e].nb || dubResults[e].id || "").trim() === newId) { existing = true; break; }
            }
            if (!existing) dubResults.push(results[r]);
          }
        } catch (e) {}
      }

      // Score dub results with HIGHER threshold
      var dubScored = [];
      for (var i = 0; i < dubResults.length; i++) {
        var sc = scoreCandidate(dubResults[i], tmdbInfo, isSeries);
        // For explicit dub search, require 70+ score
        if (sc.score >= 70 && sc.isDubbed) {
          dubScored.push(sc);
          console.log("[Cinemana] Dub candidate: " + sc.title + " | score=" + sc.score);
        }
      }

      if (dubScored.length > 0) {
        dubScored.sort(function(a, b) { return b.score - a.score; });
        bestDub = dubScored[0];
      }
    }

    console.log("[Cinemana] Final: sub=" + (bestSub ? bestSub.title + "(" + bestSub.score + ")" : "none") + 
                " | dub=" + (bestDub ? bestDub.title + "(" + bestDub.score + ")" : "none"));

    return { sub: bestSub, dub: bestDub };
  });
}

// ============================================================
// Get streams from a match
// ============================================================
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

// ============================================================
// Main
// ============================================================
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
      console.log("[Cinemana] TMDB titles: " + tmdbInfo.titles.join(" | "));
      console.log("[Cinemana] TMDB year: " + tmdbInfo.year);

      var matches = yield findMatches(tmdbInfo, mediaType);
      var allStreams = [];

      if (matches.sub) {
        var subStreams = yield getStreamsFromMatch(matches.sub, mediaType, season, episode);
        for (var s = 0; s < subStreams.length; s++) allStreams.push(subStreams[s]);
      }

      if (matches.dub) {
        var dubStreams = yield getStreamsFromMatch(matches.dub, mediaType, season, episode);
        for (var s = 0; s < dubStreams.length; s++) allStreams.push(dubStreams[s]);
      }

      if (allStreams.length === 0) {
        console.log("[Cinemana] No streams found");
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
