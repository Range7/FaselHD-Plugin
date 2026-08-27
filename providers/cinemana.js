// Cinemana Scraper for Nuvio Local Scrapers
// Multi-language exact search + 1080p only + Dubbed & Subtitled
// React Native compatible version (Hermes-safe, no async/await)
// Format matches MovieBox: name="Cinemana | مدبلج عربي", title="1080p"

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
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
  var controller;
  var tid;
  try {
    controller = new AbortController();
    tid = setTimeout(function() {
      controller.abort();
    }, ms);
  } catch (e) {
    controller = null;
  }
  var opts = options || {};
  if (controller)
    opts.signal = controller.signal;
  if (!opts.headers)
    opts.headers = {};
  if (!opts.headers["User-Agent"])
    opts.headers["User-Agent"] = UA;
  return fetch(url, opts).then(function(r) {
    if (tid)
      clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid)
      clearTimeout(tid);
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
  if (wa.length > 0) {
    return Math.floor((common / wa.length) * 80);
  }
  return 0;
}

function cleanUrl(url) {
  if (!url) return "";
  return url.replace(/\\/g, "");
}

function is1080p(qualityStr) {
  if (!qualityStr) return false;
  var q = qualityStr.toString().toLowerCase();
  return q.indexOf("1080") !== -1;
}

function isDubbedTitle(title) {
  if (!title) return false;
  var t = title.toLowerCase();
  return t.indexOf("مدبلج") !== -1 || t.indexOf("dubbed") !== -1 || t.indexOf("dub") !== -1 || t.indexOf("مدبلجة") !== -1;
}

// ============================================================
// TMDB: Get all possible titles
// ============================================================
function getTMDBInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var type = mediaType === "movie" ? "movie" : "tv";
    var urlEn = TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=en-US";

    try {
      var responseEn = yield safeFetch(urlEn);
      if (!responseEn.ok) return null;
      var dataEn = yield responseEn.json();
      var titleEn = dataEn.title || dataEn.name || "";
      var originalTitle = dataEn.original_title || dataEn.original_name || titleEn;
      var originalLang = dataEn.original_language || "en";
      var year = "";
      if (dataEn.release_date) year = dataEn.release_date.substring(0, 4);
      if (dataEn.first_air_date) year = dataEn.first_air_date.substring(0, 4);

      var titles = [];
      if (titleEn) titles.push(titleEn);
      if (originalTitle && originalTitle !== titleEn) titles.push(originalTitle);

      if (originalLang !== "en") {
        try {
          var urlOrig = TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=" + originalLang;
          var resp = yield safeFetch(urlOrig, null, 8e3);
          if (resp.ok) {
            var d = yield resp.json();
            var t = d.title || d.name || "";
            if (t && titles.indexOf(t) === -1) titles.push(t);
          }
        } catch (e) {}
      }

      try {
        var urlAr = TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ar";
        var respAr = yield safeFetch(urlAr, null, 8e3);
        if (respAr.ok) {
          var dAr = yield respAr.json();
          var tAr = dAr.title || dAr.name || "";
          if (tAr && titles.indexOf(tAr) === -1) titles.push(tAr);
        }
      } catch (e) {}

      try {
        var urlAlt = TMDB_BASE + "/" + type + "/" + tmdbId + "/alternative_titles?api_key=" + TMDB_API_KEY;
        var respAlt = yield safeFetch(urlAlt, null, 8e3);
        if (respAlt.ok) {
          var dAlt = yield respAlt.json();
          var list = dAlt.results || dAlt.titles || [];
          for (var i = 0; i < list.length; i++) {
            var a = list[i].title || list[i].name || "";
            if (a && titles.indexOf(a) === -1) titles.push(a);
          }
        }
      } catch (e) {}

      return { titles: titles, originalLanguage: originalLang, year: year, tmdbData: dataEn };
    } catch (e) {
      console.log("[Cinemana] TMDB error: " + e.message);
      return null;
    }
  });
}

// ============================================================
// Cinemana API calls
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
// Find ALL matches (dubbed + subtitled)
// ============================================================
function findAllMatches(tmdbInfo, mediaType) {
  return __async(this, null, function* () {
    var searchType = mediaType === "movie" ? "movie" : "series";
    var allResults = [];
    var queries = [];

    for (var t = 0; t < tmdbInfo.titles.length; t++) {
      var title = tmdbInfo.titles[t];
      if (title && queries.indexOf(title) === -1) queries.push(title);
      var clean = title.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
      if (clean && clean !== title && queries.indexOf(clean) === -1) queries.push(clean);
      var first = title.split(" ")[0];
      if (first && first.length > 3 && queries.indexOf(first) === -1) queries.push(first);
    }

    var dubbedQueries = [];
    for (var q = 0; q < queries.length; q++) {
      if (queries[q].indexOf("مدبلج") === -1 && queries[q].indexOf("dubbed") === -1) {
        dubbedQueries.push(queries[q] + " مدبلج");
        dubbedQueries.push(queries[q] + " dubbed");
      }
    }
    queries = queries.concat(dubbedQueries);

    console.log("[Cinemana] Search queries: " + queries.join(" | "));

    for (var q = 0; q < queries.length; q++) {
      try {
        var results = yield searchCinemana(queries[q], searchType);
        for (var r = 0; r < results.length; r++) {
          var newId = String(results[r].nb || results[r].id || "").trim();
          var existing = false;
          for (var e = 0; e < allResults.length; e++) {
            if (String(allResults[e].nb || allResults[e].id || "").trim() === newId) {
              existing = true;
              break;
            }
          }
          if (!existing) allResults.push(results[r]);
        }
      } catch (e) {}
    }

    console.log("[Cinemana] Total unique results: " + allResults.length);

    var matches = [];
    var isSeries = mediaType !== "movie";

    for (var i = 0; i < allResults.length; i++) {
      var item = allResults[i];
      var itemTitle = item.en_title || item.ar_title || item.videoTitle || item.title || item.name || "";
      var itemOriginal = item.other_title || item.original_title || itemTitle;
      var itemKind = String(item.kind || "");
      var itemYear = "";
      if (item.year) itemYear = String(item.year);
      else if (item.createdate) itemYear = String(item.createdate).substring(0, 4);

      var isItemSeries = itemKind === "2";
      if (isSeries !== isItemSeries) continue;

      var score = 0;
      for (var t = 0; t < tmdbInfo.titles.length; t++) {
        score = Math.max(score, similarityScore(itemTitle, tmdbInfo.titles[t]));
        score = Math.max(score, similarityScore(itemOriginal, tmdbInfo.titles[t]));
      }

      if (tmdbInfo.year && itemYear) {
        if (itemYear === tmdbInfo.year) score += 25;
        else if (Math.abs(Number(itemYear) - Number(tmdbInfo.year)) <= 1) score += 10;
      }

      if (isSeries !== isItemSeries) score -= 30;

      console.log("[Cinemana] Candidate: " + itemTitle + " | score=" + score + " | year=" + itemYear);

      if (score >= 25) {
        var dubbed = isDubbedTitle(itemTitle) || isDubbedTitle(item.ar_title) || isDubbedTitle(item.en_title);
        matches.push({
          item: item,
          score: score,
          id: String(item.nb || item.id || "").trim(),
          isDubbed: dubbed,
          title: itemTitle
        });
      }
    }

    if (matches.length === 0) {
      console.log("[Cinemana] No matches, trying fallback");
      var bestScore = -999;
      var bestItem = null;
      for (var i = 0; i < allResults.length; i++) {
        var item = allResults[i];
        var itemTitle = item.en_title || item.ar_title || item.videoTitle || item.title || item.name || "";
        var s = 0;
        for (var t = 0; t < tmdbInfo.titles.length; t++) {
          s = Math.max(s, similarityScore(itemTitle, tmdbInfo.titles[t]));
        }
        var itemYear = "";
        if (item.year) itemYear = String(item.year);
        if (tmdbInfo.year && itemYear === tmdbInfo.year) s += 20;
        if (s > bestScore) {
          bestScore = s;
          bestItem = item;
        }
      }
      if (bestItem) {
        var dubbed = isDubbedTitle(bestItem.en_title || bestItem.ar_title || bestItem.title || bestItem.name || "");
        matches.push({ item: bestItem, score: bestScore, id: String(bestItem.nb || bestItem.id || "").trim(), isDubbed: dubbed, title: bestItem.en_title || bestItem.ar_title || "" });
      }
    }

    matches.sort(function(a, b) { return b.score - a.score; });

    var finalMatches = [];
    var seenDubbed = { dubbed: false, sub: false };
    for (var i = 0; i < matches.length; i++) {
      var key = matches[i].isDubbed ? "dubbed" : "sub";
      if (!seenDubbed[key]) {
        seenDubbed[key] = true;
        finalMatches.push(matches[i]);
      }
    }

    console.log("[Cinemana] Final matches: " + finalMatches.length);
    for (var i = 0; i < finalMatches.length; i++) {
      console.log("[Cinemana] Match " + (i+1) + ": " + finalMatches[i].title + " | ID=" + finalMatches[i].id + " | Dubbed=" + finalMatches[i].isDubbed);
    }

    return finalMatches;
  });
}

// ============================================================
// Get streams from a match — MovieBox format
// ============================================================
function getStreamsFromMatch(match, mediaType, season, episode) {
  return __async(this, null, function* () {
    var streams = [];
    // MovieBox format: name = "Provider | Label", title = "1080p"
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
        var stream = {
          name: nameLabel,
          title: "1080p",
          url: cleanUrl(q.videoUrl),
          quality: qName
        };
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
        var stream = {
          name: nameLabel,
          title: "1080p",
          url: cleanUrl(q.videoUrl),
          quality: qName
        };
        if (!match.isDubbed && subs.length > 0) stream.subtitles = subs;
        streams.push(stream);
      }
    }

    return streams;
  });
}

// ============================================================
// Main: Get streams
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

      var matches = yield findAllMatches(tmdbInfo, mediaType);
      if (matches.length === 0) {
        console.log("[Cinemana] No matches found");
        return [];
      }

      var allStreams = [];
      for (var m = 0; m < matches.length; m++) {
        var matchStreams = yield getStreamsFromMatch(matches[m], mediaType, season, episode);
        for (var s = 0; s < matchStreams.length; s++) {
          allStreams.push(matchStreams[s]);
        }
      }

      console.log("[Cinemana] === Done: " + allStreams.length + " streams (1080p only) in " + (Date.now() - t0) + "ms ===");
      return allStreams;
    } catch (err) {
      console.log("[Cinemana] FATAL ERROR: " + (err.message || err));
      return [];
    }
  });
}

module.exports = { getStreams };
