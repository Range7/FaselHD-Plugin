// 2Peckle Scraper for Nuvio Local Scrapers
// DEBUG VERSION — Shows ALL streams for diagnosis
// Supports: Movies, Series, Anime, Korean, Chinese, Indian, English
// React Native compatible (Hermes-safe, no async/await)

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var PENGU_BASE = "https://pengu.uk";
var TMDB_BASE = "https://api.themoviedb.org/3";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 2e4;
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

// IMPORTANT: Replace this with your actual PenguPlay token from the addon settings
// Your addon token (from logs): VDYLQvoGDqE81gFZawUIeLDQqzIg3VBFws4Ux9f-c5U
// If this token doesn't work, copy the one from your PenguPlay addon URL
var PENGU_TOKEN = "VDYLQvoGDqE81gFZawUIeLDQqzIg3VBFws4Ux9f-c5U";

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

// TMDB: Get IMDB ID
function getIMDBId(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var tmdbType = mediaType === "movie" ? "movie" : "tv";
    console.log("[2Peckle] TMDB START: type=" + tmdbType + " tmdbId=" + tmdbId);

    var url = TMDB_BASE + "/" + tmdbType + "/" + tmdbId + "/external_ids?api_key=" + TMDB_API_KEY;
    var lastError = null;

    for (var attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log("[2Peckle] TMDB attempt " + attempt + " URL=" + url);
        var r = yield safeFetch(url, null, 15e3);
        console.log("[2Peckle] TMDB status: " + r.status);

        if (!r.ok) {
          lastError = "HTTP " + r.status;
          if (attempt < 3) {
            yield new Promise(function(res) { setTimeout(res, 1500); });
            continue;
          }
          console.log("[2Peckle] TMDB failed: " + lastError);
          return null;
        }

        var d = yield r.json();
        console.log("[2Peckle] TMDB response keys: " + Object.keys(d).join(","));

        var imdb = d.imdb_id;
        console.log("[2Peckle] TMDB imdb_id=" + imdb);

        if (imdb) {
          console.log("[2Peckle] TMDB SUCCESS: " + imdb);
          return imdb;
        }

        console.log("[2Peckle] TMDB no IMDB ID found");
        return null;
      } catch (e) {
        lastError = e.message || String(e);
        console.log("[2Peckle] TMDB error: " + lastError);
        if (attempt < 3) {
          yield new Promise(function(res) { setTimeout(res, 1500); });
        }
      }
    }

    console.log("[2Peckle] TMDB ALL FAILED: " + lastError);
    return null;
  });
}

// Build PenguPlay Config
function buildConfig() {
  return {
    auth_token: PENGU_TOKEN,
    source_2peckle: true,
    res_4k: true,
    res_1080: true
  };
}

function encodeConfig(config) {
  return encodeURIComponent(JSON.stringify(config));
}

// DEBUG: Show all streams, no filtering
function getPenguStreams(imdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var config = buildConfig();
    var configEncoded = encodeConfig(config);
    var se = Number(season || 1);
    var ep = Number(episode || 1);

    console.log("[2Peckle] PenguPlay START: imdb=" + imdbId + " type=" + mediaType + " s=" + se + " e=" + ep);

    var endpoint;
    if (mediaType === "movie") {
      endpoint = "/stream/movie/" + imdbId + ".json";
    } else {
      endpoint = "/stream/series/" + imdbId + ":" + se + ":" + ep + ".json";
    }

    var url = PENGU_BASE + "/" + configEncoded + endpoint;
    console.log("[2Peckle] FULL URL: " + url);

    try {
      var r = yield safeFetch(url, {
        headers: {
          "Accept": "application/json",
          "Referer": "https://pengu.uk/",
          "Origin": "https://pengu.uk"
        }
      }, 2e4);

      console.log("[2Peckle] PenguPlay HTTP status: " + r.status);

      if (!r.ok) {
        console.log("[2Peckle] PenguPlay FAILED with HTTP " + r.status);
        return [];
      }

      var d = yield r.json();
      var allStreams = d.streams || [];
      console.log("[2Peckle] PenguPlay total streams: " + allStreams.length);

      if (allStreams.length === 0) {
        console.log("[2Peckle] WARNING: PenguPlay returned 0 streams!");
        console.log("[2Peckle] This usually means: bad token, or content not available");
        return [];
      }

      // DEBUG: Log every single stream
      for (var i = 0; i < allStreams.length; i++) {
        var s = allStreams[i];
        console.log("[2Peckle] Stream " + i + ":");
        console.log("  name:  " + JSON.stringify(s.name));
        console.log("  title: " + JSON.stringify(s.title));
        console.log("  url:   " + (s.url ? s.url.substring(0, 60) + "..." : "null"));
      }

      // Filter: 2Peckle ONLY (case-insensitive)
      var peckle = [];
      for (var i = 0; i < allStreams.length; i++) {
        var n = (allStreams[i].name || "").toLowerCase();
        if (n.indexOf("2peckle") !== -1) {
          peckle.push(allStreams[i]);
        }
      }
      console.log("[2Peckle] After 2Peckle filter: " + peckle.length);

      if (peckle.length === 0) {
        console.log("[2Peckle] WARNING: No 2Peckle streams found!");
        console.log("[2Peckle] Available sources: " + allStreams.map(function(s) { return s.name; }).join(", "));
      }

      // DEBUG: Show ALL qualities (not just 1080p)
      var out = [];
      for (var i = 0; i < peckle.length; i++) {
        var s = peckle[i];
        var check = ((s.name || "") + " " + (s.title || "")).toLowerCase();

        // Detect quality for display
        var quality = "Unknown";
        if (check.indexOf("4k") !== -1 || check.indexOf("2160p") !== -1) quality = "4K";
        else if (check.indexOf("1080p") !== -1 || check.indexOf("1080") !== -1 || check.indexOf("fhd") !== -1) quality = "1080p";
        else if (check.indexOf("720p") !== -1 || check.indexOf("720") !== -1) quality = "720p";
        else if (check.indexOf("480p") !== -1 || check.indexOf("480") !== -1) quality = "480p";

        console.log("[2Peckle] Adding stream: name=" + (s.name || "null") + " quality=" + quality);

        var stream = {
          name: "2Peckle",
          title: quality,
          url: s.url,
          quality: quality
        };

        var bh = s.behaviorHints || {};
        var ph = bh.proxyHeaders || {};
        var req = ph.request || {};
        if (req.Referer || req.Origin) {
          stream.headers = {};
          if (req.Referer) stream.headers.Referer = req.Referer;
          if (req.Origin) stream.headers.Origin = req.Origin;
        }

        out.push(stream);
      }

      console.log("[2Peckle] FINAL count: " + out.length);
      return out;
    } catch (e) {
      console.log("[2Peckle] PenguPlay error: " + (e.message || e));
      return [];
    }
  });
}

// Main
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    console.log("[2Peckle] ====== START ======");
    console.log("[2Peckle] tmdbId=" + tmdbId + " mediaType=" + mediaType);
    console.log("[2Peckle] season=" + season + " episode=" + episode);

    if (!TMDB_API_KEY || TMDB_API_KEY.indexOf("YOUR") !== -1) {
      console.log("[2Peckle] ERROR: TMDB key not set");
      return [];
    }

    try {
      var tmdbMediaType = mediaType === "anime" ? "tv" : mediaType;
      console.log("[2Peckle] TMDB type will be: " + tmdbMediaType);

      var imdbId = yield getIMDBId(tmdbId, tmdbMediaType);

      if (!imdbId) {
        console.log("[2Peckle] CRITICAL: No IMDB ID. Returning empty.");
        return [];
      }

      console.log("[2Peckle] IMDB ID obtained: " + imdbId);
      var streams = yield getPenguStreams(imdbId, mediaType, season, episode);
      console.log("[2Peckle] ====== END ====== " + streams.length + " streams in " + (Date.now() - t0) + "ms");
      return streams;
    } catch (err) {
      console.log("[2Peckle] FATAL: " + (err.message || err));
      return [];
    }
  });
}

module.exports = { getStreams };
