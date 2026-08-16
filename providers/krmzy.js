// Krmzy Scraper for Nuvio Local Scrapers
// Based on krmzy-addon by maje7d
// React Native compatible version

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

// src/krmzy/index.js
var BASE_URL = "https://krmzi.net";
var TMDB_API_KEY = "15d2850027b7744312013263e12089b3";
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
  if (!opts.headers["Referer"])
    opts.headers["Referer"] = BASE_URL + "/";
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

function getMediaTitle(tmdbId, type) {
  return __async(this, null, function* () {
    try {
      var mediaType = type === "series" ? "tv" : "movie";
      var response = yield safeFetch(
        "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ar-SA"
      );
      var data = yield response.json();
      return data.title || data.name || data.original_title || data.original_name || null;
    } catch (e) {
      return null;
    }
  });
}

function extractIframes(html) {
  var streams = [];
  var iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
  var match;
  var index = 1;
  while ((match = iframeRegex.exec(html)) !== null) {
    var src = match[1];
    if (src.startsWith("//"))
      src = "https:" + src;
    streams.push({
      name: "Krmzy",
      title: "سيرفر " + index + " (1080p)",
      url: src,
      headers: {
        "User-Agent": UA,
        "Referer": BASE_URL + "/"
      }
    });
    index++;
  }
  return streams;
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    console.log("[Krmzy] === " + type + "/" + tmdbId + " ===");
    try {
      var title = yield getMediaTitle(tmdbId, type);
      if (!title) {
        console.log("[Krmzy] Could not get title from TMDB");
        return [];
      }
      var searchQuery = title;
      if (type === "series" && season && episode) {
        searchQuery += " الموسم " + season + " الحلقة " + episode;
      }
      var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(searchQuery);
      console.log("[Krmzy] Searching: " + searchUrl);
      var searchRes = yield safeFetch(searchUrl);
      var html = yield searchRes.text();
      var linkMatch = html.match(/href="(https?:\/\/[^"]*(?:post|movie|watch|video|series)[^"]*)"/i);
      if (!linkMatch) {
        console.log("[Krmzy] No result found for: " + searchQuery);
        return [];
      }
      var pageUrl = linkMatch[1];
      console.log("[Krmzy] Found page: " + pageUrl);
      var pageRes = yield safeFetch(pageUrl);
      var pageHtml = yield pageRes.text();
      var streams = extractIframes(pageHtml);
      console.log("[Krmzy] === Done: " + streams.length + " streams in " + (Date.now() - t0) + "ms ===");
      return streams;
    } catch (error) {
      console.log("[Krmzy] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
