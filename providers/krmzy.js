// Krmzy Scraper for Nuvio Local Scrapers
// Adapted from maje7d/krmzy-addon for Nuvio Plugin Architecture

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

var BASE_URL = "https://krmzi.net";
var TMDB_API_KEY = "15d2850027b7744312013263e12089b3";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15000;

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
  if (controller) opts.signal = controller.signal;
  if (!opts.headers) opts.headers = {};
  if (!opts.headers["User-Agent"]) opts.headers["User-Agent"] = UA;
  if (!opts.headers["Referer"]) opts.headers["Referer"] = BASE_URL + "/";
  return fetch(url, opts).then(function(r) {
    if (tid) clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid) clearTimeout(tid);
    throw e;
  });
}

function getMediaTitle(tmdbId, mediaType) {
  return __async(this, null, function* () {
    try {
      var type = mediaType === "movie" ? "movie" : "tv";
      var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ar-SA";
      var response = yield safeFetch(url, {}, 8000);
      if (!response.ok) return null;
      var data = yield response.json();
      return data.title || data.name || data.original_title || data.original_name || null;
    } catch (e) {
      console.log("[Krmzy] TMDB error: " + e.message);
      return null;
    }
  });
}

function searchKrmzy(title, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      var searchQuery = title;
      if (mediaType !== "movie" && season && episode) {
        searchQuery += " الموسم " + season + " الحلقة " + episode;
      }
      var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(searchQuery);
      console.log("[Krmzy] Searching: " + searchUrl);
      var response = yield safeFetch(searchUrl);
      if (!response.ok) {
        console.log("[Krmzy] Search returned " + response.status);
        return null;
      }
      var html = yield response.text();
      var linkMatch = html.match(/href="(https?:\/\/[^"]*(?:post|movie|watch|video|series)[^"]*)"/i);
      if (!linkMatch) {
        console.log("[Krmzy] No result link found");
        return null;
      }
      return linkMatch[1];
    } catch (e) {
      console.log("[Krmzy] Search error: " + e.message);
      return null;
    }
  });
}

function extractStreams(pageUrl) {
  return __async(this, null, function* () {
    try {
      var response = yield safeFetch(pageUrl);
      if (!response.ok) return [];
      var html = yield response.text();
      var streams = [];
      var iframeRegex = /\]+src=["']([^"']+)["']/gi;
      var match;
      var index = 1;
      while ((match = iframeRegex.exec(html)) !== null) {
        var src = match[1];
        if (src.startsWith("//")) src = "https:" + src;
        if (src.startsWith("/")) src = BASE_URL + src;
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
    } catch (e) {
      console.log("[Krmzy] Extract error: " + e.message);
      return [];
    }
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    var idStr = String(tmdbId);
    if (type !== "movie") {
      idStr += ":" + String(season || 1) + ":" + String(episode || 1);
    }
    console.log("[Krmzy] === " + type + "/" + idStr + " ===");
    try {
      var title = yield getMediaTitle(tmdbId, mediaType);
      if (!title) {
        console.log("[Krmzy] Could not resolve title from TMDB");
        return [];
      }
      console.log("[Krmzy] Title: " + title);
      var pageUrl = yield searchKrmzy(title, mediaType, season, episode);
      if (!pageUrl) {
        console.log("[Krmzy] No page found on Krmzi");
        return [];
      }
      console.log("[Krmzy] Page: " + pageUrl);
      var streams = yield extractStreams(pageUrl);
      console.log("[Krmzy] === Done: " + streams.length + " streams in " + (Date.now() - t0) + "ms ===");
      return streams;
    } catch (error) {
      console.log("[Krmzy] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
