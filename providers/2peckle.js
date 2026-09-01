// 2Peckle Scraper for Nuvio Local Scrapers
// 1080p ONLY | 2Peckle ONLY via PenguPlay
// Rich metadata in 'name' field for Nuvio display
// Supports: Movies, Series, Anime, Korean, Chinese, Indian, English
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

// TMDB: Get media details
function getMediaDetails(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var tmdbType = mediaType === "movie" ? "movie" : "tv";
    var url = TMDB_BASE + "/" + tmdbType + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=en-US";
    try {
      var r = yield safeFetch(url, null, 15e3);
      if (!r.ok) return null;
      var d = yield r.json();
      return d;
    } catch (e) {
      console.log("[2Peckle] TMDB details error: " + (e.message || e));
      return null;
    }
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

// Extract metadata from stream title/name
function extractStreamMeta(rawName, rawTitle) {
  var text = ((rawName || "") + " " + (rawTitle || "")).toLowerCase();
  var meta = {
    source: "WEB-DL",
    codec: "H.264",
    audioCodec: "DDP5.1",
    audioLang: "English",
    subs: "English",
    size: null,
    hdr: false
  };

  if (text.indexOf("webrip") !== -1) meta.source = "WEBRip";
  else if (text.indexOf("bluray") !== -1 || text.indexOf("blu-ray") !== -1) meta.source = "BluRay";
  else if (text.indexOf("dvd") !== -1) meta.source = "DVD";
  else if (text.indexOf("hdtv") !== -1) meta.source = "HDTV";
  else if (text.indexOf("bdrip") !== -1) meta.source = "BDRip";

  if (text.indexOf("hevc") !== -1 || text.indexOf("h.265") !== -1 || text.indexOf("x265") !== -1) meta.codec = "HEVC";
  else if (text.indexOf("av1") !== -1) meta.codec = "AV1";
  else if (text.indexOf("vp9") !== -1) meta.codec = "VP9";

  if (text.indexOf("aac") !== -1) meta.audioCodec = "AAC";
  else if (text.indexOf("dts") !== -1) meta.audioCodec = "DTS";
  else if (text.indexOf("truehd") !== -1) meta.audioCodec = "TrueHD";
  else if (text.indexOf("ac3") !== -1) meta.audioCodec = "AC3";

  if (text.indexOf("arabic") !== -1 || text.indexOf("عربي") !== -1) meta.audioLang = "Arabic";
  else if (text.indexOf("korean") !== -1) meta.audioLang = "Korean";
  else if (text.indexOf("japanese") !== -1) meta.audioLang = "Japanese";
  else if (text.indexOf("hindi") !== -1) meta.audioLang = "Hindi";
  else if (text.indexOf("spanish") !== -1) meta.audioLang = "Spanish";
  else if (text.indexOf("french") !== -1) meta.audioLang = "French";
  else if (text.indexOf("german") !== -1) meta.audioLang = "German";

  if (text.indexOf("hdr") !== -1 || text.indexOf("hdr10") !== -1 || text.indexOf("dolby vision") !== -1) meta.hdr = true;

  var sizeMatch = text.match(/(\d+\.?\d*)\s*(gb|mb|tb)/);
  if (sizeMatch) {
    meta.size = sizeMatch[1] + " " + sizeMatch[2].toUpperCase();
  }

  return meta;
}

// Build rich display name — SINGLE LINE (guaranteed Nuvio compatible)
function buildRichName(mediaDetails, streamMeta, mediaType, season, episode) {
  var title = mediaDetails.title || mediaDetails.name || "Unknown";
  var year = "";
  if (mediaType === "movie" && mediaDetails.release_date) {
    year = " (" + mediaDetails.release_date.substring(0, 4) + ")";
  } else if (mediaType !== "movie" && mediaDetails.first_air_date) {
    year = " (" + mediaDetails.first_air_date.substring(0, 4) + ")";
  }

  var parts = [];
  parts.push("🍿 " + title + year);

  var qualityPart = "🎞️ 1080p";
  if (streamMeta.hdr) qualityPart += " HDR";
  qualityPart += " • " + streamMeta.source;
  qualityPart += " • " + streamMeta.audioCodec;
  qualityPart += " • " + streamMeta.codec;
  parts.push(qualityPart);

  parts.push("🛰️ 2Peckle");

  if (streamMeta.size) {
    parts.push("💾 " + streamMeta.size);
  }

  parts.push("🎧 " + streamMeta.audioLang + "  |  📝 " + streamMeta.subs);

  if (mediaType !== "movie" && season && episode) {
    parts.push("📺 S" + season + "E" + episode);
  }

  if (mediaDetails.vote_average) {
    parts.push("⭐ " + mediaDetails.vote_average.toFixed(1) + "/10");
  }

  if (mediaDetails.runtime && mediaType === "movie") {
    parts.push("⏱️ " + mediaDetails.runtime + "min");
  } else if (mediaDetails.episode_run_time && mediaDetails.episode_run_time.length > 0) {
    parts.push("⏱️ " + mediaDetails.episode_run_time[0] + "min/ep");
  }

  if (mediaDetails.genres && mediaDetails.genres.length > 0) {
    var genreNames = [];
    for (var i = 0; i < mediaDetails.genres.length && i < 3; i++) {
      genreNames.push(mediaDetails.genres[i].name);
    }
    parts.push("🏷️ " + genreNames.join(", "));
  }

  // SINGLE LINE — uses " | " separator (guaranteed Nuvio compatible)
  return parts.join(" | ");
}

// Get Streams from PenguPlay
function getPenguStreams(imdbId, mediaType, season, episode, mediaDetails) {
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
      console.log("[2Peckle] PenguPlay streams: " + allStreams.length);

      for (var i = 0; i < allStreams.length; i++) {
        console.log("[2Peckle] Raw " + i + ": name=" + JSON.stringify(allStreams[i].name) + " title=" + JSON.stringify(allStreams[i].title));
      }

      // Filter: 2Peckle ONLY
      var peckle = [];
      for (var i = 0; i < allStreams.length; i++) {
        var n = allStreams[i].name || "";
        if (n.indexOf("2Peckle") !== -1) {
          peckle.push(allStreams[i]);
        }
      }
      console.log("[2Peckle] 2Peckle count: " + peckle.length);

      // Filter: 1080p ONLY + build rich metadata
      var out = [];
      for (var i = 0; i < peckle.length; i++) {
        var s = peckle[i];
        var check = ((s.name || "") + " " + (s.title || "")).toLowerCase();
        var is1080 = check.indexOf("1080p") !== -1 || check.indexOf("1080") !== -1 || check.indexOf("fhd") !== -1 || check.indexOf("full hd") !== -1;
        console.log("[2Peckle] Quality: name=" + (s.name || "null") + " -> 1080=" + is1080);
        if (!is1080) continue;

        var streamMeta = extractStreamMeta(s.name, s.title);
        var richName = buildRichName(mediaDetails, streamMeta, mediaType, season, episode);

        var stream = {
          name: richName,
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
        console.log("[2Peckle]   " + i + ": " + out[i].name.substring(0, 80) + "...");
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

      var imdbPromise = getIMDBId(tmdbId, tmdbMediaType);
      var detailsPromise = getMediaDetails(tmdbId, tmdbMediaType);

      var imdbId = yield imdbPromise;
      var mediaDetails = yield detailsPromise;

      if (!mediaDetails) {
        console.log("[2Peckle] Warning: Could not fetch TMDB details, using defaults");
        mediaDetails = {};
      }

      if (!imdbId) {
        console.log("[2Peckle] CRITICAL: No IMDB ID. Returning empty.");
        return [];
      }

      console.log("[2Peckle] IMDB ID obtained: " + imdbId);
      var streams = yield getPenguStreams(imdbId, mediaType, season, episode, mediaDetails);
      console.log("[2Peckle] ====== END ====== " + streams.length + " streams in " + (Date.now() - t0) + "ms");
      return streams;
    } catch (err) {
      console.log("[2Peckle] FATAL: " + (err.message || err));
      return [];
    }
  });
}

module.exports = { getStreams };
