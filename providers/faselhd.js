// ═══════════════════════════════════════════════════════════════
//  FaselHD Plugin for Nuvio — Using faselhdx-proxy-psi.vercel.app
//  Backend proxy by Range7 (github.com/Range7/faselhdx-proxy)
//  STRICT 1080p ONLY
//  Date: 2026-09-03
// ═══════════════════════════════════════════════════════════════

"use strict";

var PROXY_URL = "https://faselhdx-proxy-psi.vercel.app";

function log(msg) {
  console.log("[FaselHD-Proxy] " + msg);
}

// ── Safe fetch with timeout ────────────────────────────────────
async function safeFetch(url, opts) {
  var controller = new AbortController();
  var tid = setTimeout(function () { controller.abort(); }, 25000);
  try {
    var res = await fetch(url, Object.assign({ signal: controller.signal }, opts || {}));
    clearTimeout(tid);
    return res;
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

// ── Resolve TMDB ID → Internal ID ──────────────────────────────
async function resolveId(tmdbId, mediaType) {
  var type = mediaType === "movie" ? "movie" : "tv";
  var url = PROXY_URL + "/resolve/" + type + "/" + tmdbId;
  log("Resolving: " + url);

  var res = await safeFetch(url);
  if (!res.ok) {
    log("Resolve failed: HTTP " + res.status);
    return null;
  }
  var data = await res.json();
  log("Resolved: id=" + data.id + " title=" + data.title);
  return data;
}

// ── Get sources from API ───────────────────────────────────────
async function getSources(internalId, mediaType, season, episode) {
  var url;
  if (mediaType === "movie") {
    url = PROXY_URL + "/api/movie/" + internalId;
  } else {
    url = PROXY_URL + "/api/serie/" + internalId + "/" + season + "/" + episode;
  }
  log("API: " + url);

  var res = await safeFetch(url);
  if (!res.ok) {
    log("API failed: HTTP " + res.status);
    return [];
  }
  var data = await res.json();

  if (data.sources && data.sources.length) {
    log("Found " + data.sources.length + " sources");
    return data.sources;
  }

  // Alternative: check other fields
  if (data.episodes && data.episodes.length) {
    log("Found " + data.episodes.length + " episodes");
    // Find matching episode
    for (var i = 0; i < data.episodes.length; i++) {
      var ep = data.episodes[i];
      if (parseInt(ep.episode) === parseInt(episode)) {
        return ep.sources || [];
      }
    }
  }

  log("No sources found");
  return [];
}

// ── Extract direct video URL ───────────────────────────────────
async function extractVideo(embedUrl) {
  var url = PROXY_URL + "/extract?url=" + encodeURIComponent(embedUrl);
  log("Extract: " + url);

  var res = await safeFetch(url);
  if (!res.ok) {
    log("Extract failed: HTTP " + res.status);
    return [];
  }
  var data = await res.json();
  log("Extract returned " + data.length + " streams");
  return data;
}

// ── Check if URL is direct video ───────────────────────────────
function isDirectVideo(url) {
  return /\.(mp4|m3u8)(?:\?|$)/i.test(url);
}

// ── Quality helper ─────────────────────────────────────────────
function parseQuality(q) {
  if (!q) return "";
  var text = String(q).toLowerCase();
  if (text.indexOf("1080") >= 0) return "1080p";
  if (text.indexOf("720") >= 0) return "720p";
  if (text.indexOf("480") >= 0) return "480p";
  if (text.indexOf("360") >= 0) return "360p";
  return "";
}

// ── MAIN ENTRY POINT ───────────────────────────────────────────
async function getStreams(tmdbId, mediaType, season, episode) {
  log("=== getStreams === tmdbId=" + tmdbId + " type=" + mediaType + " S=" + season + " E=" + episode);

  if (!tmdbId) {
    log("No TMDB ID");
    return [];
  }

  try {
    // Step 1: Resolve TMDB ID
    var resolved = await resolveId(tmdbId, mediaType);
    if (!resolved || !resolved.id) {
      log("Resolve returned no ID");
      return [];
    }

    // Step 2: Get sources
    var sources = await getSources(resolved.id, mediaType, season || 1, episode || 1);
    if (!sources.length) {
      log("No sources from API");
      return [];
    }

    // Step 3: Extract direct URLs
    var streams = [];

    for (var i = 0; i < sources.length && streams.length < 5; i++) {
      var source = sources[i];
      log("Processing source " + i + ": " + source.url + " quality=" + source.quality);

      var sourceQuality = parseQuality(source.quality);

      // If already direct video URL
      if (isDirectVideo(source.url)) {
        if (sourceQuality === "1080p" || !sourceQuality) {
          streams.push({
            name: "FaselHD",
            title: "فاصل إعلاني · " + (sourceQuality || "1080p"),
            url: source.url,
            quality: sourceQuality || "1080p",
            headers: { Referer: "https://fslhd.co/" }
          });
          log("Added direct video: " + source.url);
        } else {
          log("Skipped non-1080p direct: " + sourceQuality);
        }
        continue;
      }

      // Need extraction via proxy
      try {
        var extracted = await extractVideo(source.url);
        for (var j = 0; j < extracted.length; j++) {
          var stream = extracted[j];
          var q = parseQuality(stream.quality);

          // STRICT 1080p ONLY
          if (q !== "1080p") {
            log("Rejected non-1080p: " + q);
            continue;
          }

          streams.push({
            name: "FaselHD",
            title: "فاصل إعلاني · " + q,
            url: stream.url,
            quality: q,
            headers: { Referer: source.url }
          });
          log("Added extracted 1080p: " + stream.url);
        }
      } catch (e) {
        log("Extract error: " + (e.message || e));
      }
    }

    // Final safety filter
    var filtered = streams.filter(function (s) {
      return s.quality === "1080p";
    });

    log("Returning " + filtered.length + " x 1080p streams");
    return filtered;

  } catch (e) {
    log("Fatal error: " + (e.message || e));
    return [];
  }
}

module.exports = { getStreams: getStreams };
