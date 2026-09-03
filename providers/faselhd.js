// FaselHD Hybrid Plugin for Nuvio
// Series: Backend #1 (145.241.158.129:3112) - FAST, RELIABLE, TESTED
// Movies: Render Stremio Addon (faselhdx.onrender.com) - IMDB-based
// Anime/Asian/Korean/Arabic/Hindi: All supported via both backends

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

// ─── Configuration ────────────────────────────────────────────────────
var SERIES_BACKEND = "http://145.241.158.129:3112";
var MOVIE_BACKEND = "https://faselhdx.onrender.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 30e3;

// ─── Safe Fetch ───────────────────────────────────────────────────────
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

// ─── TMDB: Get IMDB ID from TMDB ID ──────────────────────────────────
function getImdbId(tmdbId, mediaType) {
  return __async(this, null, function* () {
    try {
      var endpoint = mediaType === "tv" ? "tv" : "movie";
      var url = "https://api.themoviedb.org/3/" + endpoint + "/" + tmdbId + "/external_ids?api_key=" + TMDB_API_KEY;
      console.log("[FaselHD] TMDB lookup: " + tmdbId);
      var response = yield safeFetch(url, { headers: { "Accept": "application/json" } }, 10e3);
      if (!response.ok) return null;
      var data = yield response.json();
      var imdbId = data.imdb_id;
      console.log("[FaselHD] IMDB ID: " + imdbId);
      return imdbId;
    } catch (e) {
      console.log("[FaselHD] TMDB lookup failed: " + e.message);
      return null;
    }
  });
}

// ─── SERIES: Backend #1 (Fast & Reliable) ─────────────────────────────
function getSeriesStreams(tmdbId, season, episode) {
  return __async(this, null, function* () {
    var idStr = String(tmdbId) + ":" + String(season || 1) + ":" + String(episode || 1);
    console.log("[FaselHD] Series Backend#1: " + idStr);
    try {
      var url = SERIES_BACKEND + "/resolve/series/" + idStr;
      var response = yield safeFetch(url, {}, 15e3);
      if (!response.ok) {
        console.log("[FaselHD] Backend#1 error: " + response.status);
        return [];
      }
      var data = yield response.json();
      var allStreams = data.streams || [];
      console.log("[FaselHD] Backend#1 raw: " + allStreams.length + " streams");

      // Filter 1080p only
      var filtered = allStreams.filter(function(s) {
        var q = (s.quality || s.resolution || s.label || s.name || "").toString().toLowerCase();
        return q.indexOf("1080") !== -1;
      });

      console.log("[FaselHD] Backend#1 filtered: " + filtered.length + " x 1080p");
      return formatStreams(filtered);
    } catch (e) {
      console.log("[FaselHD] Backend#1 fail: " + e.message);
      return [];
    }
  });
}

// ─── MOVIES: Render Stremio Addon ─────────────────────────────────────
function getMovieStreams(tmdbId) {
  return __async(this, null, function* () {
    console.log("[FaselHD] Movie Render backend: " + tmdbId);
    try {
      // Step 1: Get IMDB ID from TMDB
      var imdbId = yield getImdbId(tmdbId, "movie");
      if (!imdbId) {
        console.log("[FaselHD] No IMDB ID found for movie " + tmdbId);
        return [];
      }

      // Step 2: Call Render backend in Stremio format
      var url = MOVIE_BACKEND + "/stream/movie/" + imdbId + ".json";
      console.log("[FaselHD] Render URL: " + url);
      var response = yield safeFetch(url, {}, 30e3);
      if (!response.ok) {
        console.log("[FaselHD] Render HTTP: " + response.status);
        return [];
      }
      var data = yield response.json();
      var streams = data.streams || [];
      console.log("[FaselHD] Render returned: " + streams.length + " streams");
      return formatStreams(streams);
    } catch (e) {
      console.log("[FaselHD] Render fail: " + e.message);
      return [];
    }
  });
}

// ─── Format Streams for Nuvio ─────────────────────────────────────────
function formatStreams(rawStreams) {
  if (!rawStreams || rawStreams.length === 0) return [];
  var result = [];
  for (var i = 0; i < rawStreams.length; i++) {
    var s = rawStreams[i];
    var url = s.url || s.link || s.stream || s.video || "";
    if (!url || !url.startsWith("http")) continue;

    var quality = s.quality || s.resolution || s.label || s.name || "Auto";
    var title = s.title || s.name || ("FaselHD " + String(i + 1));

    result.push({
      name: "FaselHD",
      title: title + " (" + quality + ")",
      url: url,
      quality: quality,
      headers: s.headers || { "User-Agent": UA, "Referer": "https://www.fasel-hd.cam/" },
      provider: "faselhd",
      subtitles: s.subtitles || []
    });
  }
  return result;
}

// ─── Main Entry Point ─────────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType === undefined) mediaType = "movie";
  return __async(this, null, function* () {
    var t0 = Date.now();
    var isMovie = mediaType === "movie";
    console.log("[FaselHD] === START === tmdbId=" + tmdbId + " type=" + mediaType + " S=" + season + " E=" + episode);

    var streams = [];

    if (isMovie) {
      // Movies: Use Render Stremio backend
      streams = yield getMovieStreams(tmdbId);
    } else {
      // Series: Use Backend #1 (fast & reliable)
      streams = yield getSeriesStreams(tmdbId, season, episode);
    }

    console.log("[FaselHD] === DONE === " + streams.length + " streams in " + (Date.now() - t0) + "ms");
    return streams;
  });
}

module.exports = { getStreams: getStreams };
