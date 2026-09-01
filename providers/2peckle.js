// PenguPlay 2Peckle Scraper for Nuvio Local Scrapers
// 4K + 1080p ONLY | 2Peckle ONLY
// Ultra-obfuscated token (multi-layer XOR + junk interleave + reverse + base64)
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
var FETCH_TIMEOUT = 15e3;
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

// ═══════════════════════════════════════════════════════════════
// ULTRA OBFUSCATED TOKEN - Multi-layer protection
// Layer 6: URL-safe base64
// Layer 5: Reversed string
// Layer 4: Junk characters interleaved
// Layer 3: Standard base64
// Layer 2: XOR with rotating 8-byte key
// Layer 1: Chunk-reversal
// ═══════════════════════════════════════════════════════════════

function _dT() {
  // Layer 6 decode
  var e6 = "cT1qPWNBVjFPbUhjQXc1UXlkck9rUWQ0V21QZElPQkw2NHpOc2tsb2VNWG9RNEpaQ0c3YjB6dEdtcWZkWXJSWEtZRGI4eDEwdWFud2dUWklTY0xXRXk5MTJIdnRvUGhQYWJUQU1HRjUrdTNFd2RwR2ljYmZVaE5B";
  var d6 = _b64d(e6);
  // Layer 5: reverse
  var d5 = d6.split("").reverse().join("");
  // Layer 4: remove junk (keep every even index)
  var d4 = "";
  for (var i = 0; i < d5.length; i += 2) d4 += d5[i];
  // Layer 3: decode base64
  var d3 = _b64d(d4);
  // Layer 2: XOR with rotating key
  var key = [0x4A, 0x7F, 0x91, 0x2E, 0xB3, 0x68, 0xD5, 0x0C];
  var d2 = "";
  for (var i = 0; i < d3.length; i++) {
    d2 += String.fromCharCode(d3.charCodeAt(i) ^ key[i % key.length]);
  }
  // Layer 1: reverse chunks
  var chunks = [];
  for (var i = 0; i < d2.length; i += 4) chunks.push(d2.substring(i, i + 4));
  var orig = "";
  for (var i = 0; i < chunks.length; i++) orig += chunks[i].split("").reverse().join("");
  return orig;
}

function _b64d(s) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out = "";
  var i = 0;
  s = s.replace(/[^A-Za-z0-9+\/]/g, "");
  while (i < s.length) {
    var e1 = chars.indexOf(s.charAt(i++));
    var e2 = chars.indexOf(s.charAt(i++));
    var e3 = chars.indexOf(s.charAt(i++));
    var e4 = chars.indexOf(s.charAt(i++));
    var c1 = (e1 << 2) | (e2 >> 4);
    var c2 = ((e2 & 15) << 4) | (e3 >> 2);
    var c3 = ((e3 & 3) << 6) | e4;
    out += String.fromCharCode(c1);
    if (e3 !== 64) out += String.fromCharCode(c2);
    if (e4 !== 64) out += String.fromCharCode(c3);
  }
  return out;
}

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

// ─── TMDB: Get IMDB ID ──────────────────────────────────
function getIMDBId(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var type = mediaType === "movie" ? "movie" : "tv";
    var url = TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=en-US";
    try {
      var r = yield safeFetch(url, null, 1e4);
      if (!r.ok) return null;
      var d = yield r.json();
      var imdb = d.imdb_id || (d.external_ids && d.external_ids.imdb_id);
      if (!imdb && type === "tv") {
        // For TV, get episode external IDs
        var season = arguments[2] || 1;
        var episode = arguments[3] || 1;
        var epUrl = TMDB_BASE + "/tv/" + tmdbId + "/season/" + season + "/episode/" + episode + "/external_ids?api_key=" + TMDB_API_KEY;
        try {
          var r2 = yield safeFetch(epUrl, null, 1e4);
          if (r2.ok) {
            var d2 = yield r2.json();
            imdb = d2.imdb_id;
          }
        } catch (e) {}
      }
      return imdb;
    } catch (e) {
      console.log("[2Peckle] TMDB error: " + e.message);
      return null;
    }
  });
}

// ─── Build PenguPlay Config ─────────────────────────────
function buildPenguConfig() {
  var token = _dT();
  return {
    auth_token: token,
    source_2peckle: true,
    res_4k: true,
    res_1080: true
  };
}

function encodeConfig(config) {
  var json = JSON.stringify(config, function(key, value) {
    if (typeof value === "boolean") return value;
    return value;
  });
  // URL-encode the JSON (this is PenguPlay's format)
  var encoded = encodeURIComponent(json);
  return encoded;
}

// ─── Get PenguPlay Streams ──────────────────────────────
function getPenguStreams(imdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var config = buildPenguConfig();
    var configEncoded = encodeConfig(config);

    var endpoint;
    if (mediaType === "movie") {
      endpoint = "/stream/movie/" + imdbId + ".json";
    } else {
      endpoint = "/stream/series/" + imdbId + ":" + (season || 1) + ":" + (episode || 1) + ".json";
    }

    var url = PENGU_BASE + "/" + configEncoded + endpoint;
    console.log("[2Peckle] Calling: " + url.substring(0, 80) + "...");

    try {
      var r = yield safeFetch(url, {
        headers: {
          "Accept": "application/json",
          "Referer": "https://pengu.uk/",
          "Origin": "https://pengu.uk"
        }
      }, 2e4);

      if (!r.ok) {
        console.log("[2Peckle] HTTP " + r.status);
        return [];
      }

      var d = yield r.json();
      var allStreams = d.streams || [];
      console.log("[2Peckle] Total streams from PenguPlay: " + allStreams.length);

      // Filter: 2Peckle ONLY
      var peckleStreams = [];
      for (var i = 0; i < allStreams.length; i++) {
        var s = allStreams[i];
        var name = s.name || "";
        if (name.indexOf("2Peckle") !== -1) {
          peckleStreams.push(s);
        }
      }
      console.log("[2Peckle] After 2Peckle filter: " + peckleStreams.length);

      // Filter: 4K + 1080p ONLY
      var qualityStreams = [];
      for (var i = 0; i < peckleStreams.length; i++) {
        var s = peckleStreams[i];
        var title = s.title || "";
        var name = s.name || "";
        var checkStr = (title || "") + " " + (name || "");
        var is4k = checkStr.indexOf("4K") !== -1 || checkStr.indexOf("2160p") !== -1 || checkStr.indexOf("2160") !== -1;
        var is1080 = checkStr.indexOf("1080p") !== -1 || checkStr.indexOf("1080") !== -1;
        if (is4k || is1080) {
          qualityStreams.push(s);
        }
      }
      console.log("[2Peckle] After 4K/1080p filter: " + qualityStreams.length);

      // Convert to Nuvio format
      var nuvioStreams = [];
      for (var i = 0; i < qualityStreams.length; i++) {
        var s = qualityStreams[i];
        var qName = "1080p";
        var title = s.title || "";
        var name = s.name || "";
        var checkStr = title + " " + name;
        if (checkStr.indexOf("4K") !== -1 || checkStr.indexOf("2160p") !== -1 || checkStr.indexOf("2160") !== -1) {
          qName = "4K";
        }

        var stream = {
          name: "2Peckle",
          title: qName,
          url: s.url,
          quality: qName
        };

        // Add subtitles if available
        var bh = s.behaviorHints || {};
        var proxyHeaders = bh.proxyHeaders || {};
        var reqHeaders = proxyHeaders.request || {};
        if (reqHeaders.Referer) {
          stream.headers = { Referer: reqHeaders.Referer };
        }
        if (reqHeaders.Origin) {
          if (!stream.headers) stream.headers = {};
          stream.headers.Origin = reqHeaders.Origin;
        }

        nuvioStreams.push(stream);
      }

      return nuvioStreams;
    } catch (e) {
      console.log("[2Peckle] Error: " + e.message);
      return [];
    }
  });
}

// ─── Main ───────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    console.log("[2Peckle] === " + mediaType + "/" + tmdbId + " S" + (season || "?") + "E" + (episode || "?") + " ===");

    if (!TMDB_API_KEY || TMDB_API_KEY.indexOf("YOUR") !== -1) {
      console.log("[2Peckle] ERROR: TMDB API key not set");
      return [];
    }

    try {
      var imdbId = yield getIMDBId(tmdbId, mediaType, season, episode);
      if (!imdbId) {
        console.log("[2Peckle] Could not get IMDB ID for TMDB " + tmdbId);
        return [];
      }
      console.log("[2Peckle] IMDB ID: " + imdbId);

      var streams = yield getPenguStreams(imdbId, mediaType, season, episode);
      console.log("[2Peckle] === Done: " + streams.length + " streams in " + (Date.now() - t0) + "ms ===");
      return streams;
    } catch (err) {
      console.log("[2Peckle] FATAL: " + (err.message || err));
      return [];
    }
  });
}

module.exports = { getStreams };
