// 2Peckle Scraper for Nuvio Local Scrapers
// 1080p ONLY | LARGEST SIZE ONLY | FAST | STRONG TOKEN ENCRYPTION
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
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

// ============================================================
// STRONG TOKEN DECODER — 4 layers of obfuscation
// Layer 1: Base64 | Layer 2: XOR | Layer 3: Hex | Layer 4: Decoy injection
// ============================================================
function _dT() {
  // Layer 4: Obfuscated hex with decoy bytes (every 17th pair is decoy 0xDE)
  var obf = "f15480b24f83d67c04211389c46a87dcde5692f409317c31fff16abe844f" +
    "80c21cde05490786fd459cbf4aaeca7d056b259adec27bbe855792dd7f30" +
    "404af1";

  // Layer 3: Remove decoy bytes and parse hex
  var bytes = [];
  var pairIdx = 0;
  for (var i = 0; i < obf.length; i += 2) {
    var b = parseInt(obf.substring(i, i + 2), 16);
    pairIdx++;
    // Skip decoy bytes at positions 17, 34, 51, ...
    if (pairIdx % 17 === 0) {
      continue;
    }
    bytes.push(b);
  }

  // Layer 2: XOR decode with rotating key
  var key = [0xa7, 0x3f, 0xd2, 0xe8, 0x1b, 0xc5, 0x90, 0x4e, 0x66, 0x11, 0x77, 0xcc];
  var xored = "";
  for (var i = 0; i < bytes.length; i++) {
    xored += String.fromCharCode(bytes[i] ^ key[i % key.length]);
  }

  // Layer 1: Base64 decode
  try {
    if (typeof atob !== "undefined") {
      return atob(xored);
    } else if (typeof Buffer !== "undefined") {
      return Buffer.from(xored, "base64").toString("utf8");
    } else {
      // Fallback base64 decoder for any JS environment
      var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      var out = "";
      var j = 0;
      while (j < xored.length) {
        var e1 = chars.indexOf(xored.charAt(j++));
        var e2 = chars.indexOf(xored.charAt(j++));
        var e3 = chars.indexOf(xored.charAt(j++));
        var e4 = chars.indexOf(xored.charAt(j++));
        var c1 = (e1 << 2) | (e2 >> 4);
        var c2 = ((e2 & 15) << 4) | (e3 >> 2);
        var c3 = ((e3 & 3) << 6) | e4;
        out += String.fromCharCode(c1);
        if (e3 !== 64) out += String.fromCharCode(c2);
        if (e4 !== 64) out += String.fromCharCode(c3);
      }
      return out;
    }
  } catch (e) {
    console.log("[2Peckle] Token decode error: " + e.message);
    return "";
  }
}

function safeFetch(url, options, timeout) {
  var ms = timeout || 8e3;
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

// TMDB: Get IMDB ID — FAST, single attempt
function getIMDBId(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var tmdbType = mediaType === "movie" ? "movie" : "tv";
    var url = TMDB_BASE + "/" + tmdbType + "/" + tmdbId + "/external_ids?api_key=" + TMDB_API_KEY;

    try {
      var r = yield safeFetch(url, null, 8e3);
      if (!r.ok) {
        console.log("[2Peckle] TMDB HTTP " + r.status);
        return null;
      }
      var d = yield r.json();
      return d.imdb_id || null;
    } catch (e) {
      console.log("[2Peckle] TMDB error: " + (e.message || e));
      return null;
    }
  });
}

// Build PenguPlay Config
function buildConfig() {
  return {
    auth_token: _dT(),
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
  var gbMatch = text.match(/(\\d+\\.?\\d*)\\s*gb/);
  if (gbMatch) return parseFloat(gbMatch[1]) * 1024;
  var mbMatch = text.match(/(\\d+\\.?\\d*)\\s*mb/);
  if (mbMatch) return parseFloat(mbMatch[1]);
  var tbMatch = text.match(/(\\d+\\.?\\d*)\\s*tb/);
  if (tbMatch) return parseFloat(tbMatch[1]) * 1024 * 1024;
  return 0;
}

// Get Streams from PenguPlay — 1080p ONLY, LARGEST SIZE ONLY
function getPenguStreams(imdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var config = buildConfig();
    var configEncoded = encodeConfig(config);
    var se = Number(season || 1);
    var ep = Number(episode || 1);

    var endpoint;
    if (mediaType === "movie") {
      endpoint = "/stream/movie/" + imdbId + ".json";
    } else {
      endpoint = "/stream/series/" + imdbId + ":" + se + ":" + ep + ".json";
    }

    var url = PENGU_BASE + "/" + configEncoded + endpoint;
    console.log("[2Peckle] PenguPlay URL: " + url.substring(0, 100) + "...");

    try {
      var r = yield safeFetch(url, {
        headers: {
          "Accept": "application/json",
          "Referer": "https://pengu.uk/",
          "Origin": "https://pengu.uk"
        }
      }, 12e3);

      if (!r.ok) {
        console.log("[2Peckle] PenguPlay HTTP " + r.status);
        return [];
      }

      var d = yield r.json();
      var allStreams = d.streams || [];
      console.log("[2Peckle] Total streams: " + allStreams.length);

      // Filter: 2Peckle ONLY (case-insensitive)
      var peckle = [];
      for (var i = 0; i < allStreams.length; i++) {
        var n = (allStreams[i].name || "").toLowerCase();
        if (n.indexOf("2peckle") !== -1) {
          peckle.push(allStreams[i]);
        }
      }
      console.log("[2Peckle] 2Peckle streams: " + peckle.length);

      // Filter: 1080p ONLY + extract size
      var candidates = [];
      for (var i = 0; i < peckle.length; i++) {
        var s = peckle[i];
        var check = ((s.name || "") + " " + (s.title || "")).toLowerCase();
        var is1080 = check.indexOf("1080p") !== -1 || check.indexOf("1080") !== -1 || check.indexOf("fhd") !== -1 || check.indexOf("full hd") !== -1;
        if (!is1080) continue;

        var sizeMB = extractSizeMB((s.name || "") + " " + (s.title || ""));
        candidates.push({ stream: s, sizeMB: sizeMB });
      }

      console.log("[2Peckle] 1080p candidates: " + candidates.length);
      if (candidates.length === 0) return [];

      // Find LARGEST
      var best = candidates[0];
      for (var i = 1; i < candidates.length; i++) {
        if (candidates[i].sizeMB > best.sizeMB) best = candidates[i];
      }

      // Build size string
      var sizeStr = "";
      if (best.sizeMB >= 1024) sizeStr = (best.sizeMB / 1024).toFixed(2) + " GB";
      else if (best.sizeMB > 0) sizeStr = best.sizeMB.toFixed(0) + " MB";
      else sizeStr = "Unknown";

      // Build stream with FULL headers for playback
      var stream = {
        name: "2Peckle",
        title: "1080p | " + sizeStr,
        url: best.stream.url,
        quality: "1080p"
      };

      // Extract and apply ALL headers from PenguPlay for playback
      var bh = best.stream.behaviorHints || {};
      var proxyHeaders = bh.proxyHeaders || {};
      var reqHeaders = proxyHeaders.request || {};

      // Method 1: Direct headers (Nuvio/Stremio standard)
      if (reqHeaders["Referer"] || reqHeaders["Origin"] || reqHeaders["User-Agent"]) {
        stream.headers = {};
        for (var key in reqHeaders) {
          stream.headers[key] = reqHeaders[key];
        }
      }

      // Method 2: behaviorHints (for players that need it)
      stream.behaviorHints = {
        notWebReady: false,
        proxyHeaders: {
          request: reqHeaders
        }
      };

      // If no proxy headers but URL needs referer, add default
      if (!stream.headers && !reqHeaders["Referer"]) {
        stream.headers = {
          "Referer": "https://pengu.uk/",
          "Origin": "https://pengu.uk"
        };
        stream.behaviorHints.proxyHeaders.request = stream.headers;
      }

      console.log("[2Peckle] Best stream: " + stream.title);
      console.log("[2Peckle] URL: " + stream.url.substring(0, 80) + "...");

      return [stream];

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
    console.log("[2Peckle] START: tmdbId=" + tmdbId + " type=" + mediaType);

    if (!TMDB_API_KEY || TMDB_API_KEY.indexOf("YOUR") !== -1) {
      console.log("[2Peckle] ERROR: TMDB key not set");
      return [];
    }

    try {
      var tmdbMediaType = mediaType === "anime" ? "tv" : mediaType;
      var imdbId = yield getIMDBId(tmdbId, tmdbMediaType);

      if (!imdbId) {
        console.log("[2Peckle] No IMDB ID");
        return [];
      }

      var streams = yield getPenguStreams(imdbId, mediaType, season, episode);
      console.log("[2Peckle] END: " + streams.length + " streams in " + (Date.now() - t0) + "ms");
      return streams;
    } catch (err) {
      console.log("[2Peckle] FATAL: " + (err.message || err));
      return [];
    }
  });
}

module.exports = { getStreams };
