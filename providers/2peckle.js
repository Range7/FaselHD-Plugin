// 2Peckle Scraper for Nuvio Local Scrapers
// 4K + 1080p ONLY | 2Peckle ONLY via PenguPlay
// Ultra-obfuscated token (XOR + hex + reverse + junk-interleave + reverse)
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

// ═══════════════════════════════════════════════════════════════
// TOKEN OBFUSCATION - 5 layers
// Layer 5: Reverse
// Layer 4: Junk hex chars interleaved
// Layer 3: Reverse
// Layer 2: Hex decode
// Layer 1: XOR with rotating 8-byte key
// ═══════════════════════════════════════════════════════════════

function _dT() {
  var obf = "a73dc352ef7906962dbf45d969f3861ea233c155ed72079f29be42d169f88618a732c35def7405982db540da6ef38617a033c258ed78079f2fbc41df6bf18315a032c059ec72019c2fbc42d06bfe851ea03fc256ed7c";
  var key = [0x4A, 0x7F, 0x91, 0x2E, 0xB3, 0x68, 0xD5, 0x0C];
  var junk = "abcdef0123456789";
  // Layer 5: reverse
  var d5 = "";
  for (var i = obf.length - 1; i >= 0; i--) d5 += obf[i];
  // Layer 4: remove junk (keep every even index)
  var d4 = "";
  for (var i = 0; i < d5.length; i += 2) d4 += d5[i];
  // Layer 3: reverse
  var d3 = "";
  for (var i = d4.length - 1; i >= 0; i--) d3 += d4[i];
  // Layer 2: hex decode
  var d2 = [];
  for (var i = 0; i < d3.length; i += 2) {
    d2.push(parseInt(d3.substring(i, i + 2), 16));
  }
  // Layer 1: XOR
  var out = "";
  for (var i = 0; i < d2.length; i++) {
    out += String.fromCharCode(d2[i] ^ key[i % key.length]);
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

// ─── TMDB: Get IMDB ID from TMDB ID ─────────────────────
function getIMDBId(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var type = mediaType === "movie" ? "movie" : "tv";
    var url = TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=en-US";
    try {
      var r = yield safeFetch(url, null, 1e4);
      if (!r.ok) return null;
      var d = yield r.json();
      var imdb = d.imdb_id;
      if (!imdb && type === "tv" && season && episode) {
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
function buildConfig() {
  var token = _dT();
  return {
    auth_token: token,
    source_2peckle: true,
    res_4k: true,
    res_1080: true
  };
}

function encodeConfig(config) {
  return encodeURIComponent(JSON.stringify(config));
}

// ─── Get Streams from PenguPlay ─────────────────────────
function getPenguStreams(imdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var config = buildConfig();
    var configEncoded = encodeConfig(config);
    var endpoint = mediaType === "movie"
      ? "/stream/movie/" + imdbId + ".json"
      : "/stream/series/" + imdbId + ":" + (season || 1) + ":" + (episode || 1) + ".json";
    var url = PENGU_BASE + "/" + configEncoded + endpoint;
    console.log("[2Peckle] URL: " + url.substring(0, 100) + "...");
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
      console.log("[2Peckle] Total: " + allStreams.length);
      // Filter: 2Peckle ONLY
      var peckle = [];
      for (var i = 0; i < allStreams.length; i++) {
        if ((allStreams[i].name || "").indexOf("2Peckle") !== -1) {
          peckle.push(allStreams[i]);
        }
      }
      console.log("[2Peckle] After 2Peckle filter: " + peckle.length);
      // Filter: 4K + 1080p ONLY
      var filtered = [];
      for (var i = 0; i < peckle.length; i++) {
        var s = peckle[i];
        var check = (s.name || "") + " " + (s.title || "");
        var is4k = check.indexOf("4K") !== -1 || check.indexOf("2160p") !== -1 || check.indexOf("2160") !== -1;
        var is1080 = check.indexOf("1080p") !== -1 || check.indexOf("1080") !== -1;
        if (is4k || is1080) filtered.push(s);
      }
      console.log("[2Peckle] After quality filter: " + filtered.length);
      // Convert to Nuvio format
      var out = [];
      for (var i = 0; i < filtered.length; i++) {
        var s = filtered[i];
        var check = (s.name || "") + " " + (s.title || "");
        var qName = check.indexOf("4K") !== -1 || check.indexOf("2160p") !== -1 || check.indexOf("2160") !== -1 ? "4K" : "1080p";
        var stream = {
          name: "2Peckle",
          title: qName,
          url: s.url,
          quality: qName
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
      return out;
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
        console.log("[2Peckle] No IMDB ID for TMDB " + tmdbId);
        return [];
      }
      console.log("[2Peckle] IMDB: " + imdbId);
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
