// FaselHD API Scraper for Nuvio
// Backend: https://faselhd-api-two.vercel.app
// Endpoints: /search, /movies/{id}, /series/{id}, /stream/{id}
// Supports: Movies, Series, Anime, Asian, Arabic, Hindi, etc.

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

var API_BASE = "https://faselhd-api-two.vercel.app";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var TMDB_BASE = "https://api.themoviedb.org/3";
var UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1";
var FETCH_TIMEOUT = 25e3;

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
  return fetch(url, opts).then(function(r) {
    if (tid) clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid) clearTimeout(tid);
    throw e;
  });
}

// ─── TMDB Lookup ─────────────────────────────────────────────────────
function getTMDBDetails(tmdbId, mediaType) {
  return __async(this, null, function* () {
    try {
      var endpoint = mediaType === "tv" ? "tv" : "movie";
      var url = TMDB_BASE + "/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
      var response = yield safeFetch(url, { headers: { "Accept": "application/json" } }, 10e3);
      if (!response.ok) throw new Error("TMDB error: " + response.status);
      var data = yield response.json();
      var title = mediaType === "tv" ? data.name : data.title;
      var year = (mediaType === "tv" ? data.first_air_date : data.release_date) || "";
      year = year ? year.split("-")[0] : "";
      console.log("[FaselHD] TMDB:", title, year ? "(" + year + ")" : "");
      return { title: title, year: year, originalTitle: data.original_title || data.original_name || title };
    } catch (e) {
      console.error("[FaselHD] TMDB failed:", e.message);
      return { title: "", year: "" };
    }
  });
}

// ─── Title Normalization ──────────────────────────────────────────────
function normalizeTitle(title) {
  if (!title) return "";
  return title.toLowerCase()
    .replace(/[\[\]()]/g, "")
    .replace(/[:\-_.]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function titleSimilarity(t1, t2) {
  var n1 = normalizeTitle(t1);
  var n2 = normalizeTitle(t2);
  if (n1 === n2) return 1;
  var w1 = n1.split(/\s+/).filter(function(w) { return w.length > 0; });
  var w2 = n2.split(/\s+/).filter(function(w) { return w.length > 0; });
  if (w1.length === 0 || w2.length === 0) return 0;
  var set1 = new Set(w1);
  var set2 = new Set(w2);
  var intersection = w1.filter(function(w) { return set2.has(w); });
  var union = new Set([].concat(w1, w2));
  var score = intersection.length / union.size;
  if (w1.length > 0 && w1.every(function(w) { return set2.has(w); })) score += 0.2;
  return score;
}

// ─── Search FaselHD API ───────────────────────────────────────────────
function searchFaselHD(query) {
  return __async(this, null, function* () {
    try {
      var url = API_BASE + "/search?q=" + encodeURIComponent(query);
      console.log("[FaselHD] Searching:", query);
      var response = yield safeFetch(url, {}, 20e3);
      if (!response.ok) {
        console.log("[FaselHD] Search HTTP:", response.status);
        return [];
      }
      var data = yield response.json();
      var results = Array.isArray(data) ? data : (data.results || data.movies || data.series || []);
      console.log("[FaselHD] Search results:", results.length);
      return results;
    } catch (e) {
      console.error("[FaselHD] Search error:", e.message);
      return [];
    }
  });
}

// ─── Get Series Details (seasons/episodes) ────────────────────────────
function getSeriesDetails(seriesId) {
  return __async(this, null, function* () {
    try {
      var url = API_BASE + "/series/" + encodeURIComponent(seriesId);
      var response = yield safeFetch(url, {}, 20e3);
      if (!response.ok) return null;
      var data = yield response.json();
      return data;
    } catch (e) {
      console.error("[FaselHD] Series details error:", e.message);
      return null;
    }
  });
}

// ─── Get Movie Details ────────────────────────────────────────────────
function getMovieDetails(movieId) {
  return __async(this, null, function* () {
    try {
      var url = API_BASE + "/movies/" + encodeURIComponent(movieId);
      var response = yield safeFetch(url, {}, 20e3);
      if (!response.ok) return null;
      var data = yield response.json();
      return data;
    } catch (e) {
      console.error("[FaselHD] Movie details error:", e.message);
      return null;
    }
  });
}

// ─── Get Streams by ID ────────────────────────────────────────────────
function getStreamById(contentId) {
  return __async(this, null, function* () {
    try {
      var url = API_BASE + "/stream/" + encodeURIComponent(contentId);
      console.log("[FaselHD] Getting stream:", contentId);
      var response = yield safeFetch(url, {}, 20e3);
      if (!response.ok) {
        console.log("[FaselHD] Stream HTTP:", response.status);
        return [];
      }
      var data = yield response.json();
      var streams = Array.isArray(data) ? data : (data.streams || data.links || data.videos || data.sources || []);
      console.log("[FaselHD] Stream results:", streams.length);
      return streams;
    } catch (e) {
      console.error("[FaselHD] Stream error:", e.message);
      return [];
    }
  });
}

// ─── Main: getStreams ─────────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType === undefined) mediaType = "movie";
  if (season === undefined) season = null;
  if (episode === undefined) episode = null;

  return __async(this, null, function* () {
    var t0 = Date.now();
    var isMovie = mediaType === "movie";
    console.log("[FaselHD] === START === TMDB:", tmdbId, "Type:", mediaType, "S:", season, "E:", episode);

    try {
      // 1. Get TMDB title
      var tmdbInfo = yield getTMDBDetails(tmdbId, mediaType);
      if (!tmdbInfo.title) {
        console.log("[FaselHD] No TMDB title, trying ID search...");
        // Fallback: try searching by TMDB ID
        var idResults = yield searchFaselHD(String(tmdbId));
        if (idResults.length > 0) {
          console.log("[FaselHD] Found by TMDB ID");
          // Use first result
          var firstResult = idResults[0];
          var contentId = firstResult.id || firstResult._id || firstResult.url || firstResult.link;
          if (contentId) {
            var streams = yield getStreamById(contentId);
            return formatStreams(streams, tmdbInfo.title, isMovie, season, episode);
          }
        }
        console.log("[FaselHD] No title and no ID match");
        return [];
      }

      // 2. Search FaselHD by title
      var searchQuery = tmdbInfo.title;
      var searchResults = yield searchFaselHD(searchQuery);

      // If no results, try original title
      if (searchResults.length === 0 && tmdbInfo.originalTitle && tmdbInfo.originalTitle !== tmdbInfo.title) {
        console.log("[FaselHD] Trying original title...");
        searchResults = yield searchFaselHD(tmdbInfo.originalTitle);
      }

      // If still no results, try Arabic prefix for movies
      if (searchResults.length === 0 && isMovie) {
        console.log("[FaselHD] Trying Arabic prefix...");
        searchResults = yield searchFaselHD("فيلم " + searchQuery);
      }

      if (searchResults.length === 0) {
        console.log("[FaselHD] No search results");
        return [];
      }

      // 3. Find best match
      var bestMatch = null;
      var bestScore = 0;
      for (var i = 0; i < searchResults.length; i++) {
        var r = searchResults[i];
        var resultTitle = r.title || r.name || r.originalTitle || "";
        var score = titleSimilarity(tmdbInfo.title, resultTitle);
        if (tmdbInfo.year && r.year) {
          var diff = Math.abs(parseInt(tmdbInfo.year) - parseInt(r.year));
          if (diff === 0) score += 0.3;
          else if (diff <= 1) score += 0.15;
        }
        // Check type match
        var resultType = (r.type || "").toLowerCase();
        if (isMovie && (resultType.includes("movie") || resultType.includes("فلم") || resultType.includes("فيلم"))) score += 0.2;
        if (!isMovie && (resultType.includes("series") || resultType.includes("مسلسل"))) score += 0.2;

        if (score > bestScore && score > 0.25) {
          bestScore = score;
          bestMatch = r;
        }
      }

      if (!bestMatch && searchResults.length > 0) {
        bestMatch = searchResults[0];
        console.log("[FaselHD] No good match, using first result");
      }

      if (!bestMatch) {
        console.log("[FaselHD] No match found");
        return [];
      }

      console.log("[FaselHD] Match:", bestMatch.title || bestMatch.name, "Score:", bestScore);

      // 4. Get content ID
      var contentId = bestMatch.id || bestMatch._id || bestMatch.contentId || bestMatch.faselId;
      if (!contentId && bestMatch.url) {
        // Extract ID from URL
        var urlMatch = bestMatch.url.match(/\/([^\/]+)$/);
        if (urlMatch) contentId = urlMatch[1];
      }

      if (!contentId) {
        console.log("[FaselHD] No content ID found");
        return [];
      }

      console.log("[FaselHD] Content ID:", contentId);

      // 5. For series, we may need to get episode-specific ID
      var streamId = contentId;
      if (!isMovie && season && episode) {
        console.log("[FaselHD] Getting series details for S" + season + "E" + episode);
        var seriesDetails = yield getSeriesDetails(contentId);
        if (seriesDetails && seriesDetails.seasons) {
          // Try to find matching season/episode
          var targetSeason = seriesDetails.seasons.find(function(s) {
            return String(s.seasonNumber || s.number || s.season) === String(season);
          });
          if (targetSeason && targetSeason.episodes) {
            var targetEpisode = targetSeason.episodes.find(function(e) {
              return String(e.episodeNumber || e.number || e.episode) === String(episode);
            });
            if (targetEpisode && (targetEpisode.id || targetEpisode._id)) {
              streamId = targetEpisode.id || targetEpisode._id;
              console.log("[FaselHD] Episode ID:", streamId);
            }
          }
        }
      }

      // 6. Get streams
      var rawStreams = yield getStreamById(streamId);
      var formatted = formatStreams(rawStreams, tmdbInfo.title, isMovie, season, episode);

      console.log("[FaselHD] === DONE === " + formatted.length + " streams in " + (Date.now() - t0) + "ms");
      return formatted;

    } catch (error) {
      console.error("[FaselHD] Fatal error:", error.message);
      return [];
    }
  });
}

// ─── Format Streams for Nuvio ─────────────────────────────────────────
function formatStreams(rawStreams, title, isMovie, season, episode) {
  if (!rawStreams || rawStreams.length === 0) return [];

  var streamTitle = title || "FaselHD";
  if (!isMovie && season && episode) {
    streamTitle += " S" + String(season).padStart(2, "0") + "E" + String(episode).padStart(2, "0");
  }

  var result = [];
  for (var i = 0; i < rawStreams.length; i++) {
    var s = rawStreams[i];
    var url = s.url || s.link || s.src || s.file || s.uri || "";
    if (!url || !url.startsWith("http")) continue;

    var quality = s.quality || s.resolution || s.label || s.name || "Auto";
    var name = s.name || s.hoster || s.server || ("FaselHD " + String(i + 1));

    result.push({
      name: "FaselHD",
      title: name + " — " + streamTitle + " (" + quality + ")",
      url: url,
      quality: quality,
      headers: s.headers || { "User-Agent": UA, "Referer": "https://www.fasel-hd.cam/" },
      provider: "faselhd",
      subtitles: s.subtitles || []
    });
  }

  // Sort by quality
  var qualityOrder = { "4K": 6, "2160p": 6, "1440p": 5, "1080p": 4, "1080": 4, "720p": 3, "720": 3, "480p": 2, "480": 2, "360p": 1, "360": 1, "Auto": 0 };
  result.sort(function(a, b) {
    return (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
  });

  return result;
}

module.exports = { getStreams: getStreams };
