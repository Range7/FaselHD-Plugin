// Cinemana Scraper for Nuvio Local Scrapers
// Multi-language exact search + 1080p only
// React Native compatible version (Hermes-safe, no async/await)
// API: https://cinemana.shabakaty.com/api/android

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

// ============================================================
// TMDB: Get title in English + original language
// ============================================================
function getTMDBInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var type = mediaType === "movie" ? "movie" : "tv";
    var urlEn = TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=en-US";

    try {
      var responseEn = yield safeFetch(urlEn);
      if (!responseEn.ok) {
        console.log("[Cinemana] TMDB EN returned " + responseEn.status);
        return null;
      }
      var dataEn = yield responseEn.json();
      var titleEn = dataEn.title || dataEn.name || "";
      var originalTitle = dataEn.original_title || dataEn.original_name || titleEn;
      var originalLang = dataEn.original_language || "en";
      var year = "";
      if (dataEn.release_date) year = dataEn.release_date.substring(0, 4);
      if (dataEn.first_air_date) year = dataEn.first_air_date.substring(0, 4);

      var titles = [titleEn, originalTitle];

      // Also get title in original language
      if (originalLang !== "en") {
        try {
          var urlOrig = TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=" + originalLang;
          var responseOrig = yield safeFetch(urlOrig, null, 8e3);
          if (responseOrig.ok) {
            var dataOrig = yield responseOrig.json();
            var titleOrig = dataOrig.title || dataOrig.name || "";
            if (titleOrig && titleOrig !== titleEn && titleOrig !== originalTitle) {
              titles.push(titleOrig);
            }
          }
        } catch (e) {}
      }

      // Get alternative titles
      try {
        var urlAlt = TMDB_BASE + "/" + type + "/" + tmdbId + "/alternative_titles?api_key=" + TMDB_API_KEY;
        var responseAlt = yield safeFetch(urlAlt, null, 8e3);
        if (responseAlt.ok) {
          var dataAlt = yield responseAlt.json();
          var altList = dataAlt.results || dataAlt.titles || [];
          for (var i = 0; i < altList.length; i++) {
            var altTitle = altList[i].title || altList[i].name || "";
            if (altTitle && titles.indexOf(altTitle) === -1) {
              titles.push(altTitle);
            }
          }
        }
      } catch (e) {}

      return {
        titles: titles,
        originalLanguage: originalLang,
        year: year,
        tmdbData: dataEn
      };
    } catch (e) {
      console.log("[Cinemana] TMDB error: " + e.message);
      return null;
    }
  });
}

// ============================================================
// Cinemana: Search
// ============================================================
function searchCinemana(query, type) {
  return __async(this, null, function* () {
    var encoded = encodeURIComponent(query);
    var url = CINEMANA_BASE + "/AdvancedSearch?videoTitle=" + encoded + "&type=" + type;
    try {
      var response = yield safeFetch(url, null, 10e3);
      if (!response.ok) {
        console.log("[Cinemana] Search returned " + response.status);
        return [];
      }
      var data = yield response.json();
      if (Array.isArray(data)) {
        console.log("[Cinemana] Search found " + data.length + " for: " + query);
        return data;
      }
      return [];
    } catch (e) {
      console.log("[Cinemana] Search error: " + e.message);
      return [];
    }
  });
}

function getTranscodedFiles(cinemanaId) {
  return __async(this, null, function* () {
    var url = CINEMANA_BASE + "/transcoddedFiles/id/" + cinemanaId;
    try {
      var response = yield safeFetch(url, null, 10e3);
      if (!response.ok) return [];
      var data = yield response.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  });
}

function getSeriesEpisodes(seriesId) {
  return __async(this, null, function* () {
    var url = CINEMANA_BASE + "/videoSeason/id/" + seriesId;
    try {
      var response = yield safeFetch(url, null, 10e3);
      if (!response.ok) return [];
      var data = yield response.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  });
}

function getVideoInfo(cinemanaId) {
  return __async(this, null, function* () {
    var url = CINEMANA_BASE + "/allVideoInfo/id/" + cinemanaId;
    try {
      var response = yield safeFetch(url, null, 10e3);
      if (!response.ok) return null;
      return yield response.json();
    } catch (e) {
      return null;
    }
  });
}

function extractSubtitles(videoInfo) {
  var out = [];
  if (!videoInfo || !videoInfo.translations) return out;
  var tracks = videoInfo.translations;
  for (var i = 0; i < tracks.length; i++) {
    var t = tracks[i];
    if (t && t.file) {
      out.push({
        url: cleanUrl(t.file),
        lang: (t.name || t.type || "sub").toLowerCase(),
        label: t.name || t.type || "Subtitle"
      });
    }
  }
  return out;
}

// ============================================================
// Find best match
// ============================================================
function findBestMatch(tmdbInfo, mediaType) {
  return __async(this, null, function* () {
    var searchType = mediaType === "movie" ? "movie" : "series";
    var allResults = [];
    var queries = [];

    // Build unique queries from all titles
    for (var t = 0; t < tmdbInfo.titles.length; t++) {
      var title = tmdbInfo.titles[t];
      if (title && queries.indexOf(title) === -1) {
        queries.push(title);
      }
      // Also add without special chars
      var clean = title.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
      if (clean && clean !== title && queries.indexOf(clean) === -1) {
        queries.push(clean);
      }
      // Also add first word only (for long titles)
      var firstWord = title.split(" ")[0];
      if (firstWord && firstWord.length > 3 && queries.indexOf(firstWord) === -1) {
        queries.push(firstWord);
      }
    }

    console.log("[Cinemana] Search queries: " + queries.join(" | "));

    for (var q = 0; q < queries.length; q++) {
      try {
        var results = yield searchCinemana(queries[q], searchType);
        for (var r = 0; r < results.length; r++) {
          // Avoid duplicates
          var existing = false;
          var newId = String(results[r].nb || results[r].id || "").trim();
          for (var e = 0; e < allResults.length; e++) {
            var exId = String(allResults[e].nb || allResults[e].id || "").trim();
            if (exId === newId) {
              existing = true;
              break;
            }
          }
          if (!existing) {
            allResults.push(results[r]);
          }
        }
      } catch (e) {}
    }

    if (allResults.length === 0) {
      console.log("[Cinemana] No search results found");
      return null;
    }

    console.log("[Cinemana] Total unique results: " + allResults.length);

    var scored = [];
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

      // Score against ALL TMDB titles
      var score = 0;
      for (var t = 0; t < tmdbInfo.titles.length; t++) {
        var tmTitle = tmdbInfo.titles[t];
        score = Math.max(score, similarityScore(itemTitle, tmTitle));
        score = Math.max(score, similarityScore(itemOriginal, tmTitle));
      }

      // Year is very important
      if (tmdbInfo.year && itemYear) {
        if (itemYear === tmdbInfo.year) {
          score += 25;
        } else if (Math.abs(Number(itemYear) - Number(tmdbInfo.year)) <= 1) {
          score += 10;
        }
      }

      // Type mismatch penalty
      if (isSeries !== isItemSeries) {
        score -= 30;
      }

      console.log("[Cinemana] Candidate: " + itemTitle + " | score=" + score + " | year=" + itemYear + " | kind=" + itemKind);

      if (score >= 30) {
        scored.push({
          item: item,
          score: score,
          id: String(item.nb || item.id || "").trim()
        });
      }
    }

    if (scored.length === 0) {
      console.log("[Cinemana] No results passed threshold, using fallback");
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
        console.log("[Cinemana] Fallback match: " + bestScore);
        return {
          item: bestItem,
          score: bestScore,
          id: String(bestItem.nb || bestItem.id || "").trim()
        };
      }
      return null;
    }

    scored.sort(function(a, b) {
      return b.score - a.score;
    });

    console.log("[Cinemana] Best match: " + scored[0].score + " -> ID " + scored[0].id);
    return scored[0];
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
      console.log("[Cinemana] TMDB year: " + tmdbInfo.year + " | lang: " + tmdbInfo.originalLanguage);

      var match = yield findBestMatch(tmdbInfo, mediaType);
      if (!match || !match.id) {
        console.log("[Cinemana] No match found on Cinemana");
        return [];
      }

      var cinemanaId = match.id;
      console.log("[Cinemana] Matched ID: " + cinemanaId + " (score: " + match.score + ")");

      var streams = [];

      if (mediaType === "movie") {
        var qualities = yield getTranscodedFiles(cinemanaId);
        var info = yield getVideoInfo(cinemanaId);
        var subs = extractSubtitles(info);
        console.log("[Cinemana] Movie qualities raw: " + qualities.length);

        for (var i = 0; i < qualities.length; i++) {
          var q = qualities[i];
          if (!q.videoUrl) continue;
          var qName = q.resolution || q.name || "";
          if (!is1080p(qName)) {
            console.log("[Cinemana] Skipping non-1080p: " + qName);
            continue;
          }
          var stream = {
            url: cleanUrl(q.videoUrl),
            quality: qName,
            title: "Cinemana 1080p"
          };
          if (subs.length > 0) {
            stream.subtitles = subs;
          }
          streams.push(stream);
        }
      } else {
        var episodes = yield getSeriesEpisodes(cinemanaId);
        console.log("[Cinemana] Series episodes found: " + episodes.length);

        var targetSeason = Number(season || 1);
        var targetEpisode = Number(episode || 1);
        var episodeItem = null;

        for (var e = 0; e < episodes.length; e++) {
          var ep = episodes[e];
          var epSeason = Number(ep.season || 0);
          var epNum = Number(ep.episodeNummer || 0);
          if (epSeason === targetSeason && epNum === targetEpisode) {
            episodeItem = ep;
            break;
          }
        }

        if (!episodeItem) {
          console.log("[Cinemana] Episode S" + targetSeason + "E" + targetEpisode + " not found");
          return [];
        }

        var epId = String(episodeItem.nb || episodeItem.id || "").trim();
        if (!epId) {
          console.log("[Cinemana] Episode has no ID");
          return [];
        }

        console.log("[Cinemana] Episode ID: " + epId);
        var qualities = yield getTranscodedFiles(epId);
        var info = yield getVideoInfo(epId);
        var subs = extractSubtitles(info);
        console.log("[Cinemana] Episode qualities raw: " + qualities.length);

        for (var i = 0; i < qualities.length; i++) {
          var q = qualities[i];
          if (!q.videoUrl) continue;
          var qName = q.resolution || q.name || "";
          if (!is1080p(qName)) {
            console.log("[Cinemana] Skipping non-1080p: " + qName);
            continue;
          }
          var stream = {
            url: cleanUrl(q.videoUrl),
            quality: qName,
            title: "Cinemana 1080p"
          };
          if (subs.length > 0) {
            stream.subtitles = subs;
          }
          streams.push(stream);
        }
      }

      console.log("[Cinemana] === Done: " + streams.length + " streams (1080p only) in " + (Date.now() - t0) + "ms ===");
      return streams;
    } catch (err) {
      console.log("[Cinemana] FATAL ERROR: " + (err.message || err));
      return [];
    }
  });
}

module.exports = { getStreams };
