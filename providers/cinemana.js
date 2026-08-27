// Cinemana Scraper for Nuvio
// Shabakaty Cinemana - Movies, TV Series & Anime
// 4K + 1080p | 4K first, then 1080p | Fixed matching & dedup
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

// ─── Find Best Match in Array ────────────────────────────
function findBestInArray(results, tmdbTitle, tmdbOriginalTitle, tmdbYear) {
  var bestMatch = null;
  var bestScore = 0;

  results.forEach(function(r, idx) {
    var titlesToCheck = [r.enTitle, r.arTitle, r.title].filter(function(t) { return t; });
    var bestItemScore = 0;

    titlesToCheck.forEach(function(title) {
      var score = scoreTitle(tmdbTitle, title);
      if (tmdbOriginalTitle && tmdbOriginalTitle !== tmdbTitle) {
        var origScore = scoreTitle(tmdbOriginalTitle, title);
        if (origScore > score) score = origScore;
      }
      if (score > bestItemScore) bestItemScore = score;
    });

    if (tmdbYear && r.year && r.year === tmdbYear) bestItemScore += 10;
    if (r.stars && parseFloat(r.stars) > 0) bestItemScore += 2;

    if (bestItemScore > bestScore) {
      bestScore = bestItemScore;
      bestMatch = r;
    }
  });

  return { match: bestMatch, score: bestScore };
}

// ─── Search Cinemana — FIXED (strict type first) ─────────
function searchCinemana(query, year, mediaType) {
  return __async(this, null, function* () {
    var primaryType = (mediaType === "movie") ? "movies" : "series";
    var secondaryType = (mediaType === "movie") ? "series" : "movies";
    var expectedKind = (mediaType === "movie") ? 1 : 2;

    console.log("[Cinemana] Searching PRIMARY type: " + primaryType);
    var primaryResults = yield searchCinemanaSingle(query, year, primaryType).catch(function() { return []; });

    // Filter primary results by expected kind
    var filteredPrimary = primaryResults.filter(function(r) { return r.kind === expectedKind; });

    console.log("[Cinemana] Primary results: " + primaryResults.length + " total, " + filteredPrimary.length + " matching kind");

    var primaryMatch = findBestInArray(filteredPrimary, query, null, year);

    // If primary has a STRONG match (70+), use it immediately
    if (primaryMatch.match && primaryMatch.score >= 70) {
      console.log("[Cinemana] Strong primary match: '" + primaryMatch.match.title + "' (score: " + primaryMatch.score + ")");
      return [primaryMatch.match];
    }

    // If primary has a decent match (50+), check secondary for better match
    if (primaryMatch.match && primaryMatch.score >= 50) {
      console.log("[Cinemana] Decent primary match, checking secondary...");
      var secondaryResults = yield searchCinemanaSingle(query, year, secondaryType).catch(function() { return []; });
      var filteredSecondary = secondaryResults.filter(function(r) { return r.kind !== expectedKind; });
      var secondaryMatch = findBestInArray(filteredSecondary, query, null, year);

      if (secondaryMatch.match && secondaryMatch.score > primaryMatch.score + 15) {
        console.log("[Cinemana] Secondary match is much better, using it.");
        return [secondaryMatch.match];
      }

      console.log("[Cinemana] Using primary match.");
      return [primaryMatch.match];
    }

    // If primary is weak or empty, try secondary
    console.log("[Cinemana] Weak/empty primary, trying secondary type: " + secondaryType);
    var secondaryResults = yield searchCinemanaSingle(query, year, secondaryType).catch(function() { return []; });
    var filteredSecondary = secondaryResults.filter(function(r) { return r.kind !== expectedKind; });
    var secondaryMatch = findBestInArray(filteredSecondary, query, null, year);

    // Also try without year on primary
    if (!primaryMatch.match || primaryMatch.score < 50) {
      console.log("[Cinemana] Trying primary without year...");
      var primaryNoYear = yield searchCinemanaSingle(query, null, primaryType).catch(function() { return []; });
      var filteredNoYear = primaryNoYear.filter(function(r) { return r.kind === expectedKind; });
      var noYearMatch = findBestInArray(filteredNoYear, query, null, null);

      if (noYearMatch.match && noYearMatch.score >= 50) {
        if (!primaryMatch.match || noYearMatch.score > primaryMatch.score) {
          primaryMatch = noYearMatch;
        }
      }
    }

    // Pick best between primary and secondary
    if (primaryMatch.match && secondaryMatch.match) {
      if (primaryMatch.score >= secondaryMatch.score) {
        console.log("[Cinemana] Final: primary match '" + primaryMatch.match.title + "' (score: " + primaryMatch.score + ")");
        return [primaryMatch.match];
      } else {
        console.log("[Cinemana] Final: secondary match '" + secondaryMatch.match.title + "' (score: " + secondaryMatch.score + ")");
        return [secondaryMatch.match];
      }
    }

    if (primaryMatch.match) {
      console.log("[Cinemana] Final: primary match '" + primaryMatch.match.title + "' (score: " + primaryMatch.score + ")");
      return [primaryMatch.match];
    }

    if (secondaryMatch.match) {
      console.log("[Cinemana] Final: secondary match '" + secondaryMatch.match.title + "' (score: " + secondaryMatch.score + ")");
      return [secondaryMatch.match];
    }

    console.log("[Cinemana] No match found at all.");
    return [];
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

// ─── Get Stream Links — 4K + 1080p, deduped, 4K first ────
function getStreamLinks(videoId) {
  var streamsUrl = API_BASE + "/transcoddedFiles/id/" + videoId;
  return safeFetch(streamsUrl).then(function(r) {
    if (!r.ok) throw new Error("Streams failed: " + r.status);
    return r.json();
  }).then(function(data) {
    if (!Array.isArray(data)) return [];

    var seenResolutions = {};
    var streams = [];

    data.forEach(function(item) {
      var videoUrl = item.videoUrl || item.url || "";
      var resolution = item.resolution || "";

      if (!videoUrl) return;

      var resNum = 0;
      var resMatch = resolution.match(/(\d+)/);
      if (resMatch) resNum = parseInt(resMatch[1], 10);

      var is4K = false;
      var is1080 = false;
      var resKey = "";

      if (resNum === 2160 || resolution.indexOf("2160") !== -1 || resolution.indexOf("4K") !== -1 || resolution.indexOf("4k") !== -1) {
        is4K = true;
        resKey = "2160";
      } else if (resNum === 1080 || resolution.indexOf("1080") !== -1) {
        is1080 = true;
        resKey = "1080";
      }

      if (!is4K && !is1080) return;

      // DEDUPLICATE: only keep first URL per resolution
      if (seenResolutions[resKey]) return;
      seenResolutions[resKey] = true;

      var qualityNum = is4K ? 2160 : 1080;
      var label = is4K ? "4K" : "1080p";

      streams.push({
        url: videoUrl,
        resolution: resolution,
        qualityNum: qualityNum,
        name: "Cinemana | " + label,
        qualityLabel: label
      });
    });

    // Sort by quality descending: 2160 first, then 1080
    streams.sort(function(a, b) { return b.qualityNum - a.qualityNum; });

    if (streams.length === 0) {
      console.log("[Cinemana] No 4K or 1080p streams found.");
      return [];
    }

    console.log("[Cinemana] Streams: " + streams.map(function(s) { return s.qualityLabel; }).join(", "));
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

      // 2. Search Cinemana — FIXED strict type matching
      var searchResults = yield searchCinemana(meta.searchTitle, meta.year, mediaType);

      // Also try original title if different and no results
      if ((!searchResults || searchResults.length === 0) && meta.originalTitle && meta.originalTitle !== meta.searchTitle) {
        console.log("[Cinemana] Trying original title search...");
        searchResults = yield searchCinemana(meta.originalTitle, meta.year, mediaType);
      }

      if (!searchResults || searchResults.length === 0) {
        console.log("[Cinemana] No search results at all.");
        return [];
      }

      var match = searchResults[0];
      console.log("[Cinemana] Selected: '" + match.title + "' (ID: " + match.id + ", kind: " + match.kind + ")");

      var videoId = match.id;

      // 3. For series/anime, find the specific episode
      if (mediaType === "tv" || mediaType === "anime") {
        var epId = yield getEpisodes(videoId, season || 1, episode || 1);
        if (epId) {
          console.log("[Cinemana] Episode ID: " + epId);
          videoId = epId;
        } else {
          console.log("[Cinemana] Episode not found, using series ID for streams.");
        }
      }

      // 4. Get stream links — 4K + 1080p, deduped
      var streams = yield getStreamLinks(videoId);
      if (!streams || streams.length === 0) {
        console.log("[Cinemana] No 4K or 1080p streams available.");
        return [];
      }

      // 5. Get subtitles
      var subtitles = yield getSubtitles(videoId);

      // 6. Build final response — 4K first, then 1080p
      var finalStreams = streams.map(function(s) {
        var streamObj = {
          name: "Cinemana",
          title: s.name,
          url: s.url,
          quality: s.qualityNum + "p",  // "2160p" or "1080p" for proper sorting
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
