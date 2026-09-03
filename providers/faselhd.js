// ═══════════════════════════════════════════════════════════════
//  FaselHD DEBUG Plugin — Shows every step in logs
//  Date: 2026-09-03
// ═══════════════════════════════════════════════════════════════

"use strict";

var PROXY_URL = "https://faselhdx-proxy-psi.vercel.app";

function log(msg) {
  console.log("[FaselHD-DEBUG] " + msg);
}

async function safeFetch(url, opts) {
  log("FETCH: " + url);
  try {
    var res = await fetch(url, opts || {});
    log("RESPONSE: " + res.status + " " + res.statusText);
    return res;
  } catch (e) {
    log("FETCH ERROR: " + (e.message || e));
    throw e;
  }
}

async function fetchJson(url, opts) {
  var res = await safeFetch(url, opts);
  if (!res.ok) {
    log("HTTP ERROR: " + res.status);
    return null;
  }
  try {
    var text = await res.text();
    log("RESPONSE BODY: " + text.substring(0, 500));
    return JSON.parse(text);
  } catch (e) {
    log("JSON PARSE ERROR: " + (e.message || e));
    return null;
  }
}

// ── MAIN ───────────────────────────────────────────────────────
async function getStreams(tmdbId, mediaType, season, episode) {
  log("========================================");
  log("START: tmdbId=" + tmdbId + " type=" + mediaType + " S=" + season + " E=" + episode);

  if (!tmdbId) {
    log("ERROR: No TMDB ID");
    return [];
  }

  var type = mediaType === "movie" ? "movie" : "tv";

  // Step 1: Resolve
  var resolveUrl = PROXY_URL + "/resolve/" + type + "/" + tmdbId;
  log("STEP 1: Resolve URL = " + resolveUrl);

  var resolved;
  try {
    resolved = await fetchJson(resolveUrl);
  } catch (e) {
    log("STEP 1 FAILED: " + (e.message || e));
    return [];
  }

  if (!resolved) {
    log("STEP 1: No response from resolve");
    return [];
  }

  log("STEP 1 SUCCESS: " + JSON.stringify(resolved));

  if (!resolved.id) {
    log("STEP 1: No internal ID found");
    return [];
  }

  // Step 2: Get sources from API
  var apiUrl;
  if (mediaType === "movie") {
    apiUrl = PROXY_URL + "/api/movie/" + resolved.id;
  } else {
    apiUrl = PROXY_URL + "/api/serie/" + resolved.id + "/" + (season || 1) + "/" + (episode || 1);
  }
  log("STEP 2: API URL = " + apiUrl);

  var apiData;
  try {
    apiData = await fetchJson(apiUrl);
  } catch (e) {
    log("STEP 2 FAILED: " + (e.message || e));
    return [];
  }

  if (!apiData) {
    log("STEP 2: No response from API");
    return [];
  }

  log("STEP 2 SUCCESS: keys=" + Object.keys(apiData).join(", "));

  // Check for sources
  var sources = [];
  if (apiData.sources && Array.isArray(apiData.sources)) {
    sources = apiData.sources;
    log("STEP 2: Found " + sources.length + " sources in apiData.sources");
  } else if (apiData.episodes && Array.isArray(apiData.episodes)) {
    log("STEP 2: Found " + apiData.episodes.length + " episodes");
    for (var i = 0; i < apiData.episodes.length; i++) {
      var ep = apiData.episodes[i];
      if (parseInt(ep.episode) === parseInt(episode || 1)) {
        sources = ep.sources || [];
        log("STEP 2: Found " + sources.length + " sources for episode " + episode);
        break;
      }
    }
  } else {
    log("STEP 2: No sources or episodes found");
    log("STEP 2: Response keys: " + Object.keys(apiData).join(", "));
    return [];
  }

  if (!sources.length) {
    log("STEP 2: sources array is empty");
    return [];
  }

  // Log each source
  for (var s = 0; s < sources.length; s++) {
    log("SOURCE " + s + ": " + JSON.stringify(sources[s]).substring(0, 200));
  }

  // Step 3: Extract/Process sources
  var streams = [];

  for (var j = 0; j < sources.length && streams.length < 5; j++) {
    var source = sources[j];
    var sourceUrl = source.url || source.link || "";
    var sourceQuality = (source.quality || "").toString().toLowerCase();

    log("STEP 3: Processing source " + j);
    log("STEP 3: URL=" + sourceUrl.substring(0, 100));
    log("STEP 3: Quality=" + sourceQuality);

    if (!sourceUrl) {
      log("STEP 3: Empty URL, skipping");
      continue;
    }

    // Check if direct video
    var isDirect = /\.(mp4|m3u8)(\?|$)/i.test(sourceUrl);
    log("STEP 3: isDirect=" + isDirect);

    if (isDirect) {
      // Check quality
      var is1080 = sourceQuality.indexOf("1080") >= 0 || !sourceQuality;
      log("STEP 3: is1080=" + is1080);

      if (is1080) {
        streams.push({
          name: "FaselHD",
          title: "فاصل إعلاني · " + (sourceQuality || "1080p"),
          url: sourceUrl,
          quality: "1080p",
          headers: { Referer: "https://fslhd.co/" }
        });
        log("STEP 3: ADDED direct stream");
      } else {
        log("STEP 3: SKIPPED non-1080p: " + sourceQuality);
      }
      continue;
    }

    // Need extraction
    var extractUrl = PROXY_URL + "/extract?url=" + encodeURIComponent(sourceUrl);
    log("STEP 3: Extract URL=" + extractUrl);

    try {
      var extracted = await fetchJson(extractUrl);
      if (!extracted || !Array.isArray(extracted)) {
        log("STEP 3: Extract returned invalid data");
        continue;
      }

      log("STEP 3: Extract returned " + extracted.length + " streams");

      for (var k = 0; k < extracted.length; k++) {
        var stream = extracted[k];
        var q = (stream.quality || "").toString().toLowerCase();
        log("STEP 3: Extracted stream " + k + " quality=" + q);

        if (q.indexOf("1080") >= 0 || !q) {
          streams.push({
            name: "FaselHD",
            title: "فاصل إعلاني · " + (q || "1080p"),
            url: stream.url,
            quality: "1080p",
            headers: { Referer: sourceUrl }
          });
          log("STEP 3: ADDED extracted stream");
        } else {
          log("STEP 3: SKIPPED extracted non-1080p: " + q);
        }
      }
    } catch (e) {
      log("STEP 3: Extract failed: " + (e.message || e));
    }
  }

  // Final filter
  var filtered = streams.filter(function (s) {
    return s.quality === "1080p";
  });

  log("FINAL: Returning " + filtered.length + " streams");
  for (var f = 0; f < filtered.length; f++) {
    log("FINAL STREAM " + f + ": " + filtered[f].url.substring(0, 100));
  }

  return filtered;
}

module.exports = { getStreams: getStreams };
