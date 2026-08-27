// FaselHD Scraper for Nuvio Local Scrapers
// React Native compatible version
// ENHANCED: 1080p ONLY + Rich Metadata Display + Beautiful Icons

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var BACKEND_BASE = "http://145.241.158.129:3112";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 12e3;

function safeFetch(url, options, timeout) {
  var ms = timeout || FETCH_TIMEOUT;
  var controller;
  var tid;
  try {
    controller = new AbortController();
    tid = setTimeout(function() {
      controller.abort();
    }, ms);
  } catch (e) {
    controller = null;
  }
  var opts = options || {};
  if (controller)
    opts.signal = controller.signal;
  if (!opts.headers)
    opts.headers = {};
  if (!opts.headers["User-Agent"])
    opts.headers["User-Agent"] = UA;
  return fetch(url, opts).then(function(r) {
    if (tid)
      clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid)
      clearTimeout(tid);
    throw e;
  });
}

// ─── Format Bytes to Human Readable ────────────────────
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "غير معروف";
  var sizes = ["B", "KB", "MB", "GB", "TB"];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

// ─── Extract Quality Number ──────────────────────────────
function extractQuality(str) {
  if (!str) return 0;
  var match = String(str).match(/(\d{3,4})[pP]?/);
  return match ? parseInt(match[1], 10) : 0;
}

// ─── Build Rich Title with Beautiful Icons ───────────────
function buildRichTitle(stream, meta) {
  var lines = [];

  // Line 1: Server + Quality + Source
  var serverLine = "🧊 FaselHD | 1080p | 📡 المصدر: FaselHD";
  lines.push(serverLine);

  // Line 2: Title
  var title = meta.title || stream.title || "محتوى بدون عنوان";
  var year = meta.year || "";
  lines.push("🍿 " + title + (year ? " (" + year + ")" : ""));

  // Line 3: Technical specs
  var quality = "1080p";
  var source = stream.source || "WEB-DL";
  var codec = stream.codec || "H.264";
  var audioCodec = stream.audioCodec || "AAC";
  lines.push("🎞️ " + quality + " • " + source + " • " + audioCodec + " • " + codec);

  // Line 4: Source detail
  lines.push("🛰️ المصدر: FaselHD | سيرفر عربي");

  // Line 5: Size
  var size = stream.size || stream.fileSize || 0;
  lines.push("💾 الحجم: " + (size ? formatSize(size) : "غير محدد"));

  // Line 6: Audio
  lines.push("🎧 الصوت: عربي (ترجمة صلبة)");

  // Line 7: Subtitles
  lines.push("📝 الترجمة: عربية صلبة (مدمجة)");

  // Line 8: Extra info
  lines.push("⚡ النوع: HLS Stream | 🌐 اللغة: العربية | 📺 جودة: Full HD");

  // Line 9: More extras
  var extraInfo = [];
  if (stream.episode) extraInfo.push("📺 الحلقة: " + stream.episode);
  if (stream.season) extraInfo.push("📂 الموسم: " + stream.season);
  if (stream.duration) extraInfo.push("⏱️ المدة: " + stream.duration);
  if (extraInfo.length > 0) {
    lines.push("🔎 " + extraInfo.join(" | "));
  }

  return lines.join("\n");
}

// ─── Get TMDB Metadata ───────────────────────────────────
function getTmdbMeta(tmdbId, mediaType) {
  var tmdbPath = mediaType === "movie" ? "movie" : "tv";
  var tmdbUrl = "https://api.themoviedb.org/3/" + tmdbPath + "/" + tmdbId + "?api_key=1865f43a0549ca50d341dd9ab8b29f49";

  return safeFetch(tmdbUrl, {
    headers: { "User-Agent": UA, "Accept": "application/json" }
  }).then(function(r) {
    if (!r.ok) return { title: "", year: "" };
    return r.json();
  }).then(function(data) {
    return {
      title: data.title || data.name || "",
      year: (data.release_date || data.first_air_date || "").substring(0, 4),
      originalLang: data.original_language || "",
      overview: data.overview || "",
      rating: data.vote_average || 0,
      poster: data.poster_path ? "https://image.tmdb.org/t/p/w500" + data.poster_path : ""
    };
  }).catch(function() {
    return { title: "", year: "" };
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    var idStr;
    if (type === "movie") {
      idStr = String(tmdbId);
    } else {
      idStr = String(tmdbId) + ":" + String(season || 1) + ":" + String(episode || 1);
    }
    console.log("[FaselHD] === " + type + "/" + idStr + " ===");

    try {
      // Get TMDB metadata for rich display
      var meta = yield getTmdbMeta(tmdbId, mediaType);

      var url = BACKEND_BASE + "/resolve/" + type + "/" + idStr;
      var response = yield safeFetch(url);
      if (!response.ok) {
        console.log("[FaselHD] Backend returned " + response.status);
        return [];
      }
      var data = yield response.json();
      var streams = data.streams || [];

      // STRICT: 1080p ONLY
      var filteredStreams = [];
      var seenUrls = {};

      streams.forEach(function(stream) {
        var streamUrl = stream.url || stream.link || "";
        var qualityStr = stream.quality || stream.resolution || stream.title || "";
        var qualityNum = extractQuality(qualityStr);

        // If no quality info, try to infer from title or URL
        if (qualityNum === 0) {
          if (streamUrl.indexOf("1080") !== -1) qualityNum = 1080;
          else if (stream.title && stream.title.indexOf("1080") !== -1) qualityNum = 1080;
        }

        // STRICT FILTER: Only 1080p
        if (qualityNum !== 1080) {
          console.log("[FaselHD] Skipping non-1080p stream: " + qualityStr);
          return;
        }

        // Deduplicate
        if (seenUrls[streamUrl]) return;
        seenUrls[streamUrl] = true;

        // Build rich title
        var richTitle = buildRichTitle(stream, meta);

        var enrichedStream = {
          name: "FaselHD 🧊",
          title: richTitle,
          url: streamUrl,
          quality: "1080p",
          headers: {
            "User-Agent": UA,
            "Referer": "https://www.faselhd.club/",
            "Origin": "https://www.faselhd.club"
          }
        };

        // Preserve subtitles if available
        if (stream.subtitles && Array.isArray(stream.subtitles)) {
          enrichedStream.subtitles = stream.subtitles;
        }

        filteredStreams.push(enrichedStream);
      });

      console.log("[FaselHD] === Done: " + filteredStreams.length + " x 1080p streams in " + (Date.now() - t0) + "ms ===");
      return filteredStreams;
    } catch (error) {
      console.log("[FaselHD] Error: " + error.message);
      return [];
    }
  });
}
module.exports = { getStreams };
