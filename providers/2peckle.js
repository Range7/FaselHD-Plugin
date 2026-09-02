// 2Peckle Scraper for Nuvio Local Scrapers
// 1080p ONLY | LARGEST SIZE ONLY | 2Peckle ONLY via PenguPlay
// Returns exactly ONE stream — the biggest 1080p file
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
        var imdb = d.imdb_id;
        console.log("[2Peckle] TMDB imdb_id=" + imdb);

        if (imdb) {
          console.log("[2Peckle] TMDB SUCCESS: " + imdb);
          return imdb;
        }

        console.log("[2Peckle] TMDB no IMDB ID");
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

// Build PenguPlay Config — 1080p ONLY
function buildConfig() {
  return {
    auth_token: PENGU_TOKEN,
    source_2peckle: true,
    res_4k: false,
    res_1080: true
  };
}

function encodeConfig(config) {
  return encodeURIComponent(JSON.stringify(config));
}

// Extract file size in MB from text
function extractSizeMB(text) {
  if (!text) return 0;
  text = text.toLowerCase();

  var gbMatch = text.match(/(\d+\.?\d*)\s*gb/);
  if (gbMatch) {
    return parseFloat(gbMatch[1]) * 1024;
  }

  var mbMatch = text.match(/(\d+\.?\d*)\s*mb/);
  if (mbMatch) {
    return parseFloat(mbMatch[1]);
  }

  var tbMatch = text.match(/(\d+\.?\d*)\s*tb/);
  if (tbMatch) {
    return parseFloat(tbMatch[1]) * 1024 * 1024;
  }

  return 0;
}

// Get Streams from PenguPlay — 1080p ONLY, LARGEST SIZE ONLY
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
    console.log("[2Peckle] URL: " + url.substring(0, 120) + "...");

    try {
      var r = yield safeFetch(url, {
        headers: {
          "Accept": "application/json",
          "Referer": "https://pengu.uk/",
          "Origin": "https://pengu.uk"
        }
      }, 2e4);

      if (!r.ok) {
        console.log("[2Peckle] PenguPlay HTTP " + r.status);
        return [];
      }

      var d = yield r.json();
      var allStreams = d.streams || [];
      console.log("[2Peckle] PenguPlay total streams: " + allStreams.length);

      for (var i = 0; i < allStreams.length; i++) {
        console.log("[2Peckle] Raw " + i + ": name=" + JSON.stringify(allStreams[i].name) + " title=" + JSON.stringify(allStreams[i].title));
      }

      // Filter: 2Peckle ONLY (case-insensitive)
      var peckle = [];
      for (var i = 0; i < allStreams.length; i++) {
        var n = (allStreams[i].name || "").toLowerCase();
        if (n.indexOf("2peckle") !== -1) {
          peckle.push(allStreams[i]);
        }
      }
      console.log("[2Peckle] 2Peckle count: " + peckle.length);

      // Filter: 1080p ONLY + extract size
      var candidates = [];
      for (var i = 0; i < peckle.length; i++) {
        var s = peckle[i];
        var check = ((s.name || "") + " " + (s.title || "")).toLowerCase();
        var is1080 = check.indexOf("1080p") !== -1 || check.indexOf("1080") !== -1 || check.indexOf("fhd") !== -1 || check.indexOf("full hd") !== -1;

        if (!is1080) {
          console.log("[2Peckle] Skipped (not 1080p): " + (s.name || "null"));
          continue;
        }

        var sizeMB = extractSizeMB((s.name || "") + " " + (s.title || ""));
        console.log("[2Peckle] Candidate: name=" + (s.name || "null") + " size=" + sizeMB + "MB");

        candidates.push({
          stream: s,
          sizeMB: sizeMB
        });
      }

      console.log("[2Peckle] 1080p candidates: " + candidates.length);

      if (candidates.length === 0) {
        console.log("[2Peckle] No 1080p streams found");
        return [];
      }

      // Find the LARGEST size
      var best = candidates[0];
      for (var i = 1; i < candidates.length; i++) {
        if (candidates[i].sizeMB > best.sizeMB) {
          best = candidates[i];
        }
      }

      console.log("[2Peckle] BEST (largest): size=" + best.sizeMB + "MB");

      // Build size string for display
      var sizeStr = "";
      if (best.sizeMB >= 1024) {
        sizeStr = (best.sizeMB / 1024).toFixed(2) + " GB";
      } else if (best.sizeMB > 0) {
        sizeStr = best.sizeMB.toFixed(0) + " MB";
      } else {
        sizeStr = "Unknown";
      }

      // Return ONLY the best stream
      var out = [{
        name: "2Peckle",
        title: "1080p | " + sizeStr,
        url: best.stream.url,
        quality: "1080p"
      }];

      var bh = best.stream.behaviorHints || {};
      var ph = bh.proxyHeaders || {};
      var req = ph.request || {};
      if (req.Referer || req.Origin) {
        out[0].headers = {};
        if (req.Referer) out[0].headers.Referer = req.Referer;
        if (req.Origin) out[0].headers.Origin = req.Origin;
      }

      console.log("[2Peckle] FINAL: 1 stream returned");
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
