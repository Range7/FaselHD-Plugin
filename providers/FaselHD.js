// FaselHD 1080p-Only Scraper for Nuvio
// Local scraper - NO backend required
// Uses FaselHD's own /resolve/ API (same as Range7's approach)
// Version: 1.0.0 | Author: He

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try { step(generator.next(value)); } catch (e) { reject(e); }
    };
    var rejected = (value) => {
      try { step(generator.throw(value)); } catch (e) { reject(e); }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var BASE_URL = "https://web920x.faselhdx.life";
var RESOLVE_URL = BASE_URL + "/main";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15000;

function safeFetch(url, options, timeout) {
  var ms = timeout || FETCH_TIMEOUT;
  var controller;
  var tid;
  try {
    controller = new AbortController();
    tid = setTimeout(function() { controller.abort(); }, ms);
  } catch (e) { controller = null; }
  var opts = options || {};
  if (controller) opts.signal = controller.signal;
  if (!opts.headers) opts.headers = {};
  if (!opts.headers["User-Agent"]) opts.headers["User-Agent"] = UA;
  if (!opts.headers["Referer"]) opts.headers["Referer"] = BASE_URL + "/";
  if (!opts.headers["Accept"]) opts.headers["Accept"] = "application/json, text/html, */*";
  return fetch(url, opts).then(function(r) {
    if (tid) clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid) clearTimeout(tid);
    throw e;
  });
}

function filter1080p(streams) {
  return streams.filter(function(s) {
    var url = (s.url || "").toLowerCase();
    var title = (s.title || s.name || "").toLowerCase();
    var quality = (s.quality || "").toLowerCase();

    // Must contain 1080 indicator OR master/playlist/index
    var is1080 = url.indexOf("hd1080") !== -1 || 
                 url.indexOf("1080") !== -1 || 
                 url.indexOf("playlist") !== -1 || 
                 url.indexOf("master") !== -1 || 
                 url.indexOf("index") !== -1;
    var title1080 = title.indexOf("1080") !== -1 || quality.indexOf("1080") !== -1;

    // Must NOT contain lower quality
    var notLower = url.indexOf("hd720") === -1 && url.indexOf("720") === -1 && 
                   url.indexOf("hd480") === -1 && url.indexOf("480") === -1 &&
                   url.indexOf("hd360") === -1 && url.indexOf("360") === -1 &&
                   url.indexOf("hd240") === -1 && url.indexOf("240") === -1;

    return (is1080 || title1080) && notLower;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    var idStr = type === "movie" 
      ? String(tmdbId) 
      : String(tmdbId) + ":" + String(season || 1) + ":" + String(episode || 1);

    console.log("[FaselHD-1080p] === " + type + "/" + idStr + " ===");

    try {
      // Primary: Use FaselHD's own resolve endpoint
      var resolveUrl = RESOLVE_URL + "/resolve/" + type + "/" + idStr;
      console.log("[FaselHD-1080p] Calling: " + resolveUrl);

      var response = yield safeFetch(resolveUrl, {
        headers: {
          "User-Agent": UA,
          "Referer": BASE_URL + "/",
          "Accept": "application/json, text/html, */*"
        }
      }, FETCH_TIMEOUT);

      // Fallback: Try without /main if 404
      if (!response.ok && response.status === 404) {
        resolveUrl = BASE_URL + "/resolve/" + type + "/" + idStr;
        console.log("[FaselHD-1080p] Fallback: " + resolveUrl);
        response = yield safeFetch(resolveUrl, {
          headers: {
            "User-Agent": UA,
            "Referer": BASE_URL + "/",
            "Accept": "application/json, text/html, */*"
          }
        }, FETCH_TIMEOUT);
      }

      if (!response.ok) {
        console.log("[FaselHD-1080p] HTTP " + response.status);
        return [];
      }

      var data = yield response.json();
      var streams = data.streams || [];

      console.log("[FaselHD-1080p] Total: " + streams.length + " streams");

      // STRICT 1080p ONLY filter
      var filtered = filter1080p(streams);
      console.log("[FaselHD-1080p] 1080p: " + filtered.length + " streams");

      // Map to Nuvio format
      var result = filtered.map(function(s, idx) {
        return {
          name: "FaselHD 1080p",
          title: s.title || "1080p",
          url: s.url,
          quality: "1080p",
          headers: s.headers || {
            "User-Agent": UA,
            "Referer": BASE_URL + "/",
            "Origin": BASE_URL
          }
        };
      });

      console.log("[FaselHD-1080p] === Done: " + result.length + " streams in " + (Date.now() - t0) + "ms ===");
      return result;

    } catch (error) {
      console.log("[FaselHD-1080p] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
