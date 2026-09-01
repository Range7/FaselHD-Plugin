// 2Peckle Scraper for Nuvio Local Scrapers
// 1080p ONLY | 2Peckle ONLY via PenguPlay
// Multi-line rich metadata display
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

// DEBUG MODE: Set to true to see ALL streams (not just 1080p 2Peckle)
var DEBUG_MODE = false;

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

// TMDB: Get IMDB ID — supports movie, tv, series, anime
function getIMDBId(tmdbId, mediaType) {
  return __async(this, null, function* () {
    // Normalize media type for TMDB
    var tmdbType;
    if (mediaType === "movie") {
      tmdbType = "movie";
    } else {
      // series, tv, anime, cartoon, donghua — all use "tv" endpoint
      tmdbType = "tv";
    }
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

        console.log("[2Peckle] TMDB no IMDB ID found for this content");
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

// TMDB: Get media details (title, year, genres, overview, etc.)
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
    hdr: false,
    bitrate: null
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
  else if (text.indexOf("korean") !== -1 || text.indexOf("kor") !== -1) meta.audioLang = "Korean";
  else if (text.indexOf("japanese") !== -1 || text.indexOf("jpn") !== -1) meta.audioLang = "Japanese";
  else if (text.indexOf("hindi") !== -1 || text.indexOf("hin") !== -1) meta.audioLang = "Hindi";
  else if (text.indexOf("spanish") !== -1 || text.indexOf("spa") !== -1) meta.audioLang = "Spanish";
  else if (text.indexOf("french") !== -1 || text.indexOf("fre") !== -1) meta.audioLang = "French";
  else if (text.indexOf("german") !== -1 || text.indexOf("ger") !== -1) meta.audioLang = "German";
  else if (text.indexOf("chinese") !== -1 || text.indexOf("chi") !== -1 || text.indexOf("mandarin") !== -1) meta.audioLang = "Chinese";
  else if (text.indexOf("portuguese") !== -1 || text.indexOf("por") !== -1) meta.audioLang = "Portuguese";
  else if (text.indexOf("russian") !== -1 || text.indexOf("rus") !== -1) meta.audioLang = "Russian";
  else if (text.indexOf("turkish") !== -1 || text.indexOf("tur") !== -1) meta.audioLang = "Turkish";

  if (text.indexOf("hdr") !== -1 || text.indexOf("hdr10") !== -1 || text.indexOf("dolby vision") !== -1) meta.hdr = true;

  var sizeMatch = text.match(/(\d+\.?\d*)\s*(gb|mb|tb)/);
  if (sizeMatch) {
    meta.size = sizeMatch[1] + " " + sizeMatch[2].toUpperCase();
  }

  var bitrateMatch = text.match(/(\d+)\s*kbps/);
  if (bitrateMatch) {
    meta.bitrate = bitrateMatch[1] + " kbps";
  }

  return meta;
}

// Detect quality from stream text
function detectQuality(text) {
  text = text.toLowerCase();
  if (text.indexOf("4k") !== -1 || text.indexOf("2160p") !== -1 || text.indexOf("2160") !== -1 || text.indexOf("uhd") !== -1) return "4K";
  if (text.indexOf("1080p") !== -1 || text.indexOf("1080") !== -1 || text.indexOf("fhd") !== -1 || text.indexOf("full hd") !== -1) return "1080p";
  if (text.indexOf("720p") !== -1 || text.indexOf("720") !== -1 || text.indexOf("hd") !== -1) return "720p";
  if (text.indexOf("480p") !== -1 || text.indexOf("480") !== -1 || text.indexOf("sd") !== -1) return "480p";
  if (text.indexOf("360p") !== -1 || text.indexOf("360") !== -1) return "360p";
  return "unknown";
}

// Build multi-line rich name for Nuvio
function buildRichName(mediaDetails, streamMeta, mediaType, season, episode, quality) {
  var title = mediaDetails.title || mediaDetails.name || "Unknown";
  var year = "";
  if (mediaType === "movie" && mediaDetails.release_date) {
    year = " (" + mediaDetails.release_date.substring(0, 4) + ")";
  } else if (mediaType !== "movie" && mediaDetails.first_air_date) {
    year = " (" + mediaDetails.first_air_date.substring(0, 4) + ")";
  }

  var lines = [];

  // Line 1: Title + Year
  lines.push("🍿 " + title + year);

  // Line 2: Quality + Source + Codecs
  var line2 = "🎞️ " + quality;
  if (streamMeta.hdr) line2 += " HDR";
  line2 += " • " + streamMeta.source;
  line2 += " • " + streamMeta.audioCodec;
  line2 += " • " + streamMeta.codec;
  lines.push(line2);

  // Line 3: Source provider
  lines.push("🛰️ Source: 2Peckle");

  // Line 4: Size + Bitrate
  var line4 = "";
  if (streamMeta.size) line4 += "💾 " + streamMeta.size;
  if (streamMeta.bitrate) {
    if (line4) line4 += " • ";
    line4 += "📊 " + streamMeta.bitrate;
  }
  if (line4) lines.push(line4);

  // Line 5: Audio + Subs
  lines.push("🎧 Audio: " + streamMeta.audioLang + "  |  📝 Subs: " + streamMeta.subs);

  // Line 6: Season/Episode for TV/Anime
  if (mediaType !== "movie" && season && episode) {
    lines.push("📺 Season " + season + "  |  Episode " + episode);
  }

  // Line 7: Rating + Runtime
  var line7 = "";
  if (mediaDetails.vote_average) {
    line7 += "⭐ TMDB: " + mediaDetails.vote_average.toFixed(1) + "/10";
  }
  if (mediaDetails.runtime && mediaType === "movie") {
    if (line7) line7 += "  |  ";
    line7 += "⏱️ " + mediaDetails.runtime + " min";
  } else if (mediaDetails.episode_run_time && mediaDetails.episode_run_time.length > 0) {
    if (line7) line7 += "  |  ";
    line7 += "⏱️ " + mediaDetails.episode_run_time[0] + " min/ep";
  }
  if (line7) lines.push(line7);

  // Line 8: Genres
  if (mediaDetails.genres && mediaDetails.genres.length > 0) {
    var genreNames = [];
    for (var i = 0; i < mediaDetails.genres.length && i < 3; i++) {
      genreNames.push(mediaDetails.genres[i].name);
    }
    lines.push("🏷️ " + genreNames.join(", "));
  }

  // Line 9: Overview snippet
  if (mediaDetails.overview) {
    var overview = mediaDetails.overview;
    if (overview.length > 80) overview = overview.substring(0, 80) + "...";
    lines.push("📖 " + overview);
  }

  // Line 10: Status + Popularity
  var line10 = "";
  if (mediaDetails.status) {
    line10 += "📌 " + mediaDetails.status;
  }
  if (mediaDetails.popularity) {
    if (line10) line10 += "  |  ";
    line10 += "🔥 Popularity: " + Math.round(mediaDetails.popularity);
  }
  if (line10) lines.push(line10);

  return lines.join("\n");
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
      // series, tv, anime, cartoon, donghua — all use series endpoint
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
      console.log("[2Peckle] PenguPlay total streams returned: " + allStreams.length);

      // DEBUG: Log ALL raw streams
      for (var i = 0; i < allStreams.length; i++) {
        var rawQ = detectQuality((allStreams[i].name || "") + " " + (allStreams[i].title || ""));
        console.log("[2Peckle] Raw " + i + ": name=" + JSON.stringify(allStreams[i].name) + " title=" + JSON.stringify(allStreams[i].title) + " detectedQ=" + rawQ);
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
        console.log("[2Peckle] WARNING: No 2Peckle streams found. Check if PenguPlay has this content.");
      }

      // Filter: 1080p ONLY + build rich metadata
      var out = [];
      for (var i = 0; i < peckle.length; i++) {
        var s = peckle[i];
        var check = ((s.name || "") + " " + (s.title || "")).toLowerCase();
        var is1080 = check.indexOf("1080p") !== -1 || check.indexOf("1080") !== -1 || check.indexOf("fhd") !== -1 || check.indexOf("full hd") !== -1;
        var detectedQ = detectQuality(check);
        console.log("[2Peckle] Stream " + i + ": name=" + (s.name || "null") + " detectedQ=" + detectedQ + " is1080=" + is1080);

        if (!is1080 && !DEBUG_MODE) {
          console.log("[2Peckle]   -> SKIPPED (not 1080p)");
          continue;
        }

        var streamMeta = extractStreamMeta(s.name, s.title);
        var displayQuality = is1080 ? "1080p" : detectedQ;
        var richName = buildRichName(mediaDetails, streamMeta, mediaType, season, episode, displayQuality);

        var stream = {
          name: richName,
          title: displayQuality,
          url: s.url,
          quality: displayQuality
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

      console.log("[2Peckle] FINAL streams count: " + out.length);
      for (var i = 0; i < out.length; i++) {
        console.log("[2Peckle]   " + i + ": " + out[i].title);
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
      // Normalize media type for TMDB lookup
      var tmdbMediaType;
      if (mediaType === "movie") {
        tmdbMediaType = "movie";
      } else {
        // series, tv, anime, cartoon, donghua, etc. — all use "tv"
        tmdbMediaType = "tv";
      }
      console.log("[2Peckle] TMDB lookup type: " + tmdbMediaType);

      var imdbPromise = getIMDBId(tmdbId, tmdbMediaType);
      var detailsPromise = getMediaDetails(tmdbId, tmdbMediaType);

      var imdbId = yield imdbPromise;
      var mediaDetails = yield detailsPromise;

      if (!mediaDetails) {
        console.log("[2Peckle] Warning: Could not fetch TMDB details, using defaults");
        mediaDetails = {};
      }

      if (!imdbId) {
        console.log("[2Peckle] CRITICAL: No IMDB ID found. This content may not have an IMDB entry.");
        console.log("[2Peckle] Common for: anime, foreign films, new releases, obscure titles.");
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
