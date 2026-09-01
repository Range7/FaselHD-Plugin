// 2Peckle Scraper for Nuvio Local Scrapers
// 1080p ONLY | 2Peckle ONLY via PenguPlay
// Supports: English, Anime, Korean, Chinese, Indian
// Ultra-obfuscated token
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

// TOKEN OBFUSCATION - 5 layers
function _dT() {
  var obf = "a73dc352ef7906962dbf45d969f3861ea233c155ed72079f29be42d169f88618a732c35def7405982db540da6ef38617a033c258ed78079f2fbc41df6bf18315a032c059ec72019c2fbc42d06bfe851ea03fc256ed7c";
  var key = [0x4A, 0x7F, 0x91, 0x2E, 0xB3, 0x68, 0xD5, 0x0C];
  var d5 = "";
  for (var i = obf.length - 1; i >= 0; i--) d5 += obf[i];
  var d4 = "";
  for (var i = 0; i < d5.length; i += 2) d4 += d5[i];
  var d3 = "";
  for (var i = d4.length - 1; i >= 0; i--) d3 += d4[i];
  var d2 = [];
  for (var i = 0; i < d3.length; i += 2) d2.push(parseInt(d3.substring(i, i + 2), 16));
  var out = "";
  for (var i = 0; i < d2.length; i++) out += String.fromCharCode(d2[i] ^ key[i % key.length]);
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

// TMDB: Get IMDB ID — FIXED: handles all non-movie types as "tv"
function getIMDBId(tmdbId, mediaType) {
  return __async(this, null, function* () {
    // FIX: Any non-movie type goes to TMDB "tv" endpoint
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
        console.log("[2Peckle] TMDB keys: " + Object.keys(d).join(","));

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
  var token = _dT();
  return {
    auth_token: token,
    source_2peckle: true,
    res_4k: false,
    res_1080: true
  };
}

function encodeConfig(config) {
  return encodeURIComponent(JSON.stringify(config));
}

// Get Streams from PenguPlay — 1080p ONLY
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

      // Filter: 2Peckle ONLY — FIXED: case-insensitive
      var peckle = [];
      for (var i = 0; i < allStreams.length; i++) {
        var n = (allStreams[i].name || "").toLowerCase();
        if (n.indexOf("2peckle") !== -1) {
          peckle.push(allStreams[i]);
        }
      }
      console.log("[2Peckle] 2Peckle count: " + peckle.length);

      // Filter: 1080p ONLY (case-insensitive)
      var out = [];
      for (var i = 0; i < peckle.length; i++) {
        var s = peckle[i];
        var check = ((s.name || "") + " " + (s.title || "")).toLowerCase();
        var is1080 = check.indexOf("1080p") !== -1 || check.indexOf("1080") !== -1 || check.indexOf("fhd") !== -1 || check.indexOf("full hd") !== -1;
        console.log("[2Peckle] Quality check: name=" + (s.name || "null") + " -> 1080=" + is1080);
        if (!is1080) continue;

        var stream = {
          name: "2Peckle",
          title: "1080p",
          url: s.url,
          quality: "1080p"
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

      console.log("[2Peckle] FINAL 1080p count: " + out.length);
      for (var i = 0; i < out.length; i++) {
        console.log("[2Peckle]   " + i + ": 1080p");
      }

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
    console.log("[2Peckle] season=" + season + " (type=" + typeof season + ")");
    console.log("[2Peckle] episode=" + episode + " (type=" + typeof episode + ")");

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
