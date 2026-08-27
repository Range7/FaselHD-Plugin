// Cinemana Scraper for Nuvio
// Shabakaty Cinemana - Movies, TV Series & Anime
// 4K + 1080p | 4K first, then 1080p | Improved search
// React Native / Hermes compatible

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
    .replace(/[^a-z0-9\s\u0600-\u06FF]/g, "")
    .replace(/\b(season|s|part|vol|volume|episode|ep|chapter|ch)\s*\d+\b/g, "")
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

// ─── Search Cinemana Single ──────────────────────────────
function searchCinemanaSingle(query, year, type) {
  var encodedQuery = encodeURIComponent(query);
  var currentYear = new Date().getFullYear();
  var yearRange = year ? year + "," + year : "1900," + currentYear;
  var typeParam = type || "movies";

  var searchUrl = API_BASE + "/AdvancedSearch?level=0&videoTitle=" + encodedQuery +
    "&staffTitle=" + encodedQuery + "&year=" + yearRange + "&page=0&type=" + typeParam + "&itemsPerPage=30";

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

// ─── Search Cinemana — IMPROVED (both types + fallback) ─
function searchCinemana(query, year, mediaType) {
  return __async(this, null, function* () {
    var type1 = "movies";
    var type2 = "series";

    if (mediaType === "movie") {
      type1 = "movies"; type2 = "series";
    } else {
      type1 = "series"; type2 = "movies";
    }

    // Try primary type first
    var results1 = yield searchCinemanaSingle(query, year, type1).catch(function() { return []; });

    // If few results, also try secondary type
    var results2 = [];
    if (!results1 || results1.length < 3) {
      results2 = yield searchCinemanaSingle(query, year, type2).catch(function() { return []; });
    }

    // Combine and deduplicate by ID
    var combined = [];
    var seenIds = {};

    (results1 || []).forEach(function(r) {
      if (!seenIds[r.id]) {
        seenIds[r.id] = true;
        combined.push(r);
      }
    });

    (results2 || []).forEach(function(r) {
      if (!seenIds[r.id]) {
        seenIds[r.id] = true;
        combined.push(r);
      }
    });

    // If still empty, try without year restriction
    if (combined.length === 0) {
      console.log("[Cinemana] No results with year, trying without year...");
      var fallback1 = yield searchCinemanaSingle(query, null, type1).catch(function() { return []; });
      var fallback2 = yield searchCinemanaSingle(query, null, type2).catch(function() { return []; });

      (fallback1 || []).forEach(function(r) {
        if (!seenIds[r.id]) {
          seenIds[r.id] = true;
          combined.push(r);
        }
      });
      (fallback2 || []).forEach(function(r) {
        if (!seenIds[r.id]) {
          seenIds[r.id] = true;
          combined.push(r);
        }
      });
    }

    return combined;
  });
}

// ─── Score Single Title ──────────────────────────────────
function scoreTitle(tmdbTitle, resultTitle) {
  var normTmdb = normalizeTitle(tmdbTitle);
  var normResult = normalizeTitle(resultTitle);

  if (!normResult) return 0;

  if (normTmdb === normResult) return 100;

  if (normTmdb.indexOf(normResult) !== -1 || normResult.indexOf(normTmdb) !== -1) {
    var shorter = normTmdb.length < normResult.length ? normTmdb : normResult;
    var longer = normTmdb.length < normResult.length ? normResult : normTmdb;
    var coverage = shorter.length / longer.length;
    return Math.round(80 + coverage * 15);
  }

  var tmdbWords = normTmdb.split(" ").filter(function(w) { return w.length > 1; });
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
  return Math.round(40 + wordRatio * 40);
}

// ─── Find Best Match — IMPROVED ──────────────────────────
function findBestMatch(results, tmdbTitle, tmdbOriginalTitle, tmdbYear, mediaType) {
  var bestMatch = null;
  var bestScore = 0;

  console.log("[Cinemana] Matching TMDB: '" + tmdbTitle + "' | Original: '" + tmdbOriginalTitle + "' | year: " + tmdbYear);

  results.forEach(function(r, idx) {
    var titlesToCheck = [r.enTitle, r.arTitle, r.title].filter(function(t) { return t; });
    var bestItemScore = 0;
    var bestMatchReason = "";

    titlesToCheck.forEach(function(title) {
      var score = scoreTitle(tmdbTitle, title);
      if (tmdbOriginalTitle && tmdbOriginalTitle !== tmdbTitle) {
        var origScore = scoreTitle(tmdbOriginalTitle, title);
        if (origScore > score) score = origScore;
      }
      if (score > bestItemScore) bestItemScore = score;
    });

    // Year bonus
    if (tmdbYear && r.year && r.year === tmdbYear) bestItemScore += 10;
    if (r.stars && parseFloat(r.stars) > 0) bestItemScore += 2;

    // Kind matching bonus
    var expectedKind = (mediaType === "movie") ? 1 : 2;
    if (r.kind === expectedKind) bestItemScore += 5;

    console.log("  [" + (idx + 1) + "] '" + r.title + "' (kind:" + r.kind + ", year:" + r.year + ") -> score: " + bestItemScore);

    if (bestItemScore > bestScore) {
      bestScore = bestItemScore;
      bestMatch = r;
    }
  });

  // Lowered threshold to 40 for better catch rate
  if (bestScore < 40) {
    console.log("[Cinemana] No good match found. Best score: " + bestScore + " (need 40+)");
    return null;
  }

  console.log("[Cinemana] Best match: '" + bestMatch.title + "' (score: " + bestScore + ")");
  return bestMatch;
}

// ─── Get Episodes for Series ─────────────────────────────
function getEpisodes(seriesId, season, episode) {
  var episodesUrl = API_BASE + "/videoSeason/id/" + seriesId;
  return safeFetch(episodesUrl).then(function(r) {
    if (!r.ok) throw new Error("Episodes failed: " + r.status);
    return r.json();
  }).then(function(data) {
    if (!Array.isArray(data)) return null;

    var targetEpisode = null;

    // First pass: exact season + episode match
    data.forEach(function(ep) {
      var epNum = parseInt(ep.episodeNummer || ep.episodeNumber || "1", 10);
      var epSeason = parseInt(ep.season || "1", 10);
      if (epNum === episode && epSeason === season) {
        targetEpisode = ep;
      }
    });

    // Second pass: same season, match by index
    if (!targetEpisode) {
      var filtered = data.filter(function(ep) {
        return parseInt(ep.season || "1", 10) === season;
      });
      filtered.sort(function(a, b) {
        return parseInt(a.episodeNummer || "0", 10) - parseInt(b.episodeNummer || "0", 10);
      });
      if (filtered.length >= episode) {
        targetEpisode = filtered[episode - 1];
      }
    }

    // Third pass: any matching episode number
    if (!targetEpisode) {
      data.forEach(function(ep) {
        if (parseInt(ep.episodeNummer || ep.episodeNumber || "1", 10) === episode) {
          targetEpisode = ep;
        }
      });
    }

    return targetEpisode ? String(targetEpisode.nb || targetEpisode.id || "") : null;
  });
}

// ─── Get Stream Links — 4K + 1080p ONLY ──────────────────
function getStreamLinks(videoId) {
  var streamsUrl = API_BASE + "/transcoddedFiles/id/" + videoId;
  return safeFetch(streamsUrl).then(function(r) {
    if (!r.ok) throw new Error("Streams failed: " + r.status);
    return r.json();
  }).then(function(data) {
    if (!Array.isArray(data)) return [];

    var streams4K = [];
    var streams1080 = [];

    data.forEach(function(item) {
      var videoUrl = item.videoUrl || item.url || "";
      var resolution = item.resolution || "";

      if (!videoUrl) return;

      var resNum = 0;
      var resMatch = resolution.match(/(\d+)/);
      if (resMatch) resNum = parseInt(resMatch[1], 10);

      var is4K = false;
      var is1080 = false;

      if (resNum === 2160 || resolution.indexOf("2160") !== -1 || resolution.indexOf("4K") !== -1 || resolution.indexOf("4k") !== -1) {
        is4K = true;
      }
      if (resNum === 1080 || resolution.indexOf("1080") !== -1) {
        is1080 = true;
      }

      if (is4K) {
        streams4K.push({
          url: videoUrl,
          resolution: resolution,
          quality: resNum || 2160,
          name: "Cinemana | 4K",
          priority: 1
        });
      } else if (is1080) {
        streams1080.push({
          url: videoUrl,
          resolution: resolution,
          quality: resNum || 1080,
          name: "Cinemana | 1080p",
          priority: 2
        });
      }
    });

    // Sort each group by quality descending
    streams4K.sort(function(a, b) { return b.quality - a.quality; });
    streams1080.sort(function(a, b) { return b.quality - a.quality; });

    // 4K first, then 1080p
    var finalStreams = streams4K.concat(streams1080);

    if (finalStreams.length === 0) {
      console.log("[Cinemana] No 4K or 1080p streams found.");
      return [];
    }

    console.log("[Cinemana] Streams: " + streams4K.length + " x 4K, " + streams1080.length + " x 1080p");
    return finalStreams;
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
      console.log("[Cinemana] TMDB: '" + meta.title + "' | Original: '" + meta.originalTitle + "' | year: " + meta.year);

      // 2. Search Cinemana — IMPROVED
      var searchResults = yield searchCinemana(meta.searchTitle, meta.year, mediaType);

      // Also try original title if different
      if ((!searchResults || searchResults.length === 0) && meta.originalTitle && meta.originalTitle !== meta.searchTitle) {
        console.log("[Cinemana] Trying original title search...");
        searchResults = yield searchCinemana(meta.originalTitle, meta.year, mediaType);
      }

      if (!searchResults || searchResults.length === 0) {
        console.log("[Cinemana] No search results at all.");
        return [];
      }

      // 3. Find best match — IMPROVED
      var match = findBestMatch(searchResults, meta.searchTitle, meta.originalTitle, meta.year, mediaType);
      if (!match) {
        console.log("[Cinemana] No match found.");
        return [];
      }

      var videoId = match.id;
      console.log("[Cinemana] Matched ID: " + videoId + " | Title: " + match.title);

      // 4. For series/anime, find the specific episode
      if (mediaType === "tv" || mediaType === "anime") {
        var epId = yield getEpisodes(videoId, season || 1, episode || 1);
        if (epId) {
          console.log("[Cinemana] Episode ID: " + epId);
          videoId = epId;
        } else {
          console.log("[Cinemana] Episode not found, using series ID for streams.");
        }
      }

      // 5. Get stream links — 4K + 1080p
      var streams = yield getStreamLinks(videoId);
      if (!streams || streams.length === 0) {
        console.log("[Cinemana] No 4K or 1080p streams available.");
        return [];
      }

      // 6. Get subtitles
      var subtitles = yield getSubtitles(videoId);

      // 7. Build final response
      var finalStreams = streams.map(function(s) {
        var qualityLabel = s.quality >= 2000 ? "4K" : "1080p";
        var streamObj = {
          name: "Cinemana",
          title: s.name,
          url: s.url,
          quality: qualityLabel,
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

      console.log("[Cinemana] === Done: " + finalStreams.length + " streams (4K+1080p) in " + (Date.now() - t0) + "ms ===");
      return finalStreams;

    } catch (error) {
      console.log("[Cinemana] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
