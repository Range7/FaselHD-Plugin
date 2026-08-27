// Cinemana Scraper for Nuvio
// Shabakaty Cinemana - Arabic content streaming
// React Native / Hermes compatible — Promise chains only

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

var API_BASE = "https://cinemana.shabakaty.cc/api/android";
var MAIN_URL = "https://cinemana.shabakaty.cc";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15000;
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
  if (!opts.headers["Accept"]) opts.headers["Accept"] = "application/json";
  if (!opts.headers["Referer"]) opts.headers["Referer"] = MAIN_URL;

  return fetch(url, opts).then(function(r) {
    if (tid) clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid) clearTimeout(tid);
    throw e;
  });
}

// ─── Title Normalization ─────────────────────────────────
function normalizeTitle(title) {
  if (!title) return "";
  return title.toLowerCase()
    .replace(/[:\-–—().,!?'"]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s؀-ۿ]/g, "") // Keep Arabic chars
    .replace(/(season|s|part|vol|volume|episode|ep|chapter|ch)\s*\d+/g, "")
    .trim();
}

// ─── TMDB Metadata ───────────────────────────────────────
function getTmdbMeta(tmdbId, mediaType) {
  var tmdbPath = mediaType === "movie" ? "movie" : "tv";
  var tmdbUrl = "https://api.themoviedb.org/3/" + tmdbPath + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  return safeFetch(tmdbUrl, {
    headers: { "User-Agent": UA, "Accept": "application/json" }
  }).then(function(r) {
    if (!r.ok) throw new Error("TMDB API error: " + r.status);
    return r.json();
  }).then(function(data) {
    var title = data.title || data.name || "";
    var originalTitle = data.original_title || data.original_name || "";
    var year = (data.release_date || data.first_air_date || "").substring(0, 4);
    return {
      title: title,
      originalTitle: originalTitle,
      searchTitle: title || originalTitle,
      year: year
    };
  });
}

// ─── Search Cinemana ─────────────────────────────────────
function searchCinemana(query, year, mediaType) {
  var encodedQuery = encodeURIComponent(query);
  var currentYear = new Date().getFullYear();
  var yearRange = year ? year + "," + year : "1900," + currentYear;
  var type = mediaType === "movie" ? "movies" : "series";
  var searchUrl = API_BASE + "/AdvancedSearch?level=0&videoTitle=" + encodedQuery +
    "&staffTitle=" + encodedQuery + "&year=" + yearRange + "&page=0&type=" + type + "&itemsPerPage=30";

  return safeFetch(searchUrl).then(function(r) {
    if (!r.ok) throw new Error("Search failed: " + r.status);
    return r.json();
  }).then(function(data) {
    if (!Array.isArray(data)) return [];
    return data.map(function(item) {
      return {
        id: String(item.nb || ""),
        title: item.en_title || item.ar_title || "",
        arTitle: item.ar_title || "",
        enTitle: item.en_title || "",
        poster: item.imgObjUrl || item.img || "",
        year: String(item.year || ""),
        kind: item.kind,
        stars: item.stars || ""
      };
    }).filter(function(item) { return item.id && item.id !== ""; });
  });
}

// ─── Find Best Match ─────────────────────────────────────
function findBestMatch(results, tmdbTitle, tmdbYear) {
  var normTmdb = normalizeTitle(tmdbTitle);
  var tmdbWords = normTmdb.split(" ").filter(function(w) { return w.length > 1; });
  var bestMatch = null;
  var bestScore = 0;

  console.log("[Cinemana] Matching TMDB: '" + tmdbTitle + "' (year: " + tmdbYear + ")");

  results.forEach(function(r, idx) {
    var titlesToCheck = [r.enTitle, r.arTitle, r.title].filter(function(t) { return t; });
    var bestItemScore = 0;

    titlesToCheck.forEach(function(title) {
      var normResult = normalizeTitle(title);
      var score = 0;

      if (normTmdb === normResult) {
        score = 100;
      } else if (normTmdb.indexOf(normResult) !== -1 || normResult.indexOf(normTmdb) !== -1) {
        var shorter = normTmdb.length < normResult.length ? normTmdb : normResult;
        var longer = normTmdb.length < normResult.length ? normResult : normTmdb;
        var coverage = shorter.length / longer.length;
        score = Math.round(80 + coverage * 15);
      } else {
        var resultWords = normResult.split(" ").filter(function(w) { return w.length > 1; });
        var matchedWords = 0;
        tmdbWords.forEach(function(wt) {
          resultWords.forEach(function(wr) {
            if (wt === wr || wt.indexOf(wr) !== -1 || wr.indexOf(wt) !== -1) {
              matchedWords++;
            }
          });
        });
        var wordRatio = tmdbWords.length > 0 ? matchedWords / tmdbWords.length : 0;
        score = Math.round(40 + wordRatio * 40);
      }

      if (tmdbYear && r.year && r.year === tmdbYear) score += 10;
      if (r.stars && parseFloat(r.stars) > 0) score += 2;

      if (score > bestItemScore) bestItemScore = score;
    });

    console.log("  [" + (idx + 1) + "] '" + r.title + "' -> score: " + bestItemScore);

    if (bestItemScore > bestScore) {
      bestScore = bestItemScore;
      bestMatch = r;
    }
  });

  if (bestScore < 50) {
    console.log("[Cinemana] No good match found. Best score: " + bestScore);
    return null;
  }

  console.log("[Cinemana] Best match: '" + bestMatch.title + "' (score: " + bestScore + ")");
  return bestMatch;
}

// ─── Get Video Details ───────────────────────────────────
function getVideoDetails(videoId) {
  var detailsUrl = API_BASE + "/allVideoInfo/id/" + videoId;
  return safeFetch(detailsUrl).then(function(r) {
    if (!r.ok) throw new Error("Details failed: " + r.status);
    return r.json();
  });
}

// ─── Get Episodes for Series ─────────────────────────────
function getEpisodes(seriesId, season, episode) {
  var episodesUrl = API_BASE + "/videoSeason/id/" + seriesId;
  return safeFetch(episodesUrl).then(function(r) {
    if (!r.ok) throw new Error("Episodes failed: " + r.status);
    return r.json();
  }).then(function(data) {
    if (!Array.isArray(data)) return null;

    // Find the specific episode
    var targetEpisode = null;
    data.forEach(function(ep) {
      var epNum = parseInt(ep.episodeNummer || "1", 10);
      var epSeason = parseInt(ep.season || "1", 10);
      if (epNum === episode && epSeason === season) {
        targetEpisode = ep;
      }
    });

    // If not found by exact match, try by index
    if (!targetEpisode) {
      var filtered = data.filter(function(ep) {
        return parseInt(ep.season || "1", 10) === season;
      });
      if (filtered.length >= episode) {
        targetEpisode = filtered[episode - 1];
      }
    }

    // Last resort: return the episode with matching episodeNummer
    if (!targetEpisode) {
      data.forEach(function(ep) {
        if (parseInt(ep.episodeNummer || "1", 10) === episode) {
          targetEpisode = ep;
        }
      });
    }

    return targetEpisode ? String(targetEpisode.nb || targetEpisode.id || "") : null;
  });
}

// ─── Get Stream Links ────────────────────────────────────
function getStreamLinks(videoId) {
  var streamsUrl = API_BASE + "/transcoddedFiles/id/" + videoId;
  return safeFetch(streamsUrl).then(function(r) {
    if (!r.ok) throw new Error("Streams failed: " + r.status);
    return r.json();
  }).then(function(data) {
    if (!Array.isArray(data)) return [];

    var streams = [];
    data.forEach(function(item) {
      var videoUrl = item.videoUrl || item.url || "";
      var resolution = item.resolution || "";
      if (videoUrl) {
        var quality = 0;
        var resMatch = resolution.match(/(\d+)/);
        if (resMatch) quality = parseInt(resMatch[1], 10);

        streams.push({
          url: videoUrl,
          resolution: resolution,
          quality: quality,
          name: "Cinemana | " + (resolution || "Default")
        });
      }
    });

    // Sort by quality descending
    streams.sort(function(a, b) { return b.quality - a.quality; });
    return streams;
  });
}

// ─── Get Subtitles ───────────────────────────────────────
function getSubtitles(videoId) {
  var detailsUrl = API_BASE + "/allVideoInfo/id/" + videoId;
  return safeFetch(detailsUrl).then(function(r) {
    if (!r.ok) return [];
    return r.json();
  }).then(function(data) {
    var translations = data.translations;
    if (!Array.isArray(translations)) return [];

    var subs = [];
    translations.forEach(function(sub) {
      var file = sub.file || sub.url || "";
      var lang = sub.name || sub.language || "arabic";
      var ext = (sub.extention || sub.ext || "").toLowerCase();

      if (file) {
        subs.push({
          url: file,
          lang: lang,
          label: lang
        });
      }
    });

    return subs;
  }).catch(function() {
    return [];
  });
}

// ─── Main Entry Point ────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    console.log("[Cinemana] === " + type + "/" + tmdbId + " S" + (season || 1) + "E" + (episode || 1) + " ===");

    try {
      // 1. Get TMDB metadata
      var meta = yield getTmdbMeta(tmdbId, mediaType);
      console.log("[Cinemana] TMDB: '" + meta.title + "' (year: " + meta.year + ")");

      // 2. Search Cinemana
      var searchResults = yield searchCinemana(meta.searchTitle, meta.year, mediaType);
      if (!searchResults || searchResults.length === 0) {
        console.log("[Cinemana] No search results.");
        return [];
      }

      // 3. Find best match
      var match = findBestMatch(searchResults, meta.searchTitle, meta.year);
      if (!match) {
        console.log("[Cinemana] No match found.");
        return [];
      }

      var videoId = match.id;
      console.log("[Cinemana] Matched ID: " + videoId);

      // 4. For series, find the specific episode
      if (mediaType === "tv") {
        var epId = yield getEpisodes(videoId, season || 1, episode || 1);
        if (epId) {
          console.log("[Cinemana] Episode ID: " + epId);
          videoId = epId;
        } else {
          console.log("[Cinemana] Episode not found, using series ID.");
        }
      }

      // 5. Get stream links
      var streams = yield getStreamLinks(videoId);
      if (!streams || streams.length === 0) {
        console.log("[Cinemana] No streams found.");
        return [];
      }

      // 6. Get subtitles
      var subtitles = yield getSubtitles(videoId);

      // 7. Build final response
      var finalStreams = streams.map(function(s) {
        var streamObj = {
          name: "Cinemana",
          title: s.name,
          url: s.url,
          quality: s.resolution || s.quality + "p",
          headers: {
            "User-Agent": UA,
            "Referer": MAIN_URL,
            "Origin": MAIN_URL
          }
        };
        if (subtitles && subtitles.length > 0) {
          streamObj.subtitles = subtitles;
        }
        return streamObj;
      });

      console.log("[Cinemana] === Done: " + finalStreams.length + " streams in " + (Date.now() - t0) + "ms ===");
      return finalStreams;

    } catch (error) {
      console.log("[Cinemana] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
