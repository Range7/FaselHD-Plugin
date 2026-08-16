// Krmzy Scraper for Nuvio Local Scrapers
// Based on krmzy-addon by maje7d
// Domain updated: qrmzi.tv (krmzi.net is dead)
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
var BASE_URL = "https://www.qrmzi.tv";
var TMDB_API_KEY = "15d2850027b7744312013263e12089b3";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15e3;

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
  if (!opts.headers["Accept"])
    opts.headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  if (!opts.headers["Accept-Language"])
    opts.headers["Accept-Language"] = "ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7";
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

function getMediaInfo(tmdbId, type) {
  return __async(this, null, function* () {
    try {
      var mediaType = type === "series" ? "tv" : "movie";
      var response = yield safeFetch(
        "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ar-SA&append_to_response=alternative_titles"
      );
      var data = yield response.json();
      var titles = [];
      if (data.title) titles.push(data.title);
      if (data.name) titles.push(data.name);
      if (data.original_title && data.original_title !== data.title) titles.push(data.original_title);
      if (data.original_name && data.original_name !== data.name) titles.push(data.original_name);
      if (data.alternative_titles && data.alternative_titles.titles) {
        data.alternative_titles.titles.forEach(function(t) {
          if (t.title && titles.indexOf(t.title) === -1) titles.push(t.title);
        });
      }
      return { titles: titles, year: data.release_date || data.first_air_date || "" };
    } catch (e) {
      return { titles: [], year: "" };
    }
  });
}

function searchOnSite(query) {
  return __async(this, null, function* () {
    try {
      var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);
      console.log("[Krmzy] Searching: " + searchUrl);
      var searchRes = yield safeFetch(searchUrl);
      var html = yield searchRes.text();
      if (!html || html.length < 100) {
        console.log("[Krmzy] Empty response");
        return null;
      }
      var patterns = [
        /<a[^>]+href=["'](https?:\/\/[^"']*\/(?:episode|series|movies)\/[^"']+)["']/i,
        /<a[^>]+href=["'](https?:\/\/[^"']*qrmzi\.tv\/[^"']+)["']/i,
        /<a[^>]+href=["'](https?:\/\/[^"']{20,})["']/i
      ];
      for (var p = 0; p < patterns.length; p++) {
        var match = html.match(patterns[p]);
        if (match && match[1]) {
          var link = match[1];
          if (link.match(/\/(page|category|tag|author|wp-content|wp-includes)\//i)) continue;
          if (link.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff)$/i)) continue;
          console.log("[Krmzy] Found link: " + link);
          return link;
        }
      }
      console.log("[Krmzy] No valid link found");
      return null;
    } catch (e) {
      console.log("[Krmzy] Search error: " + e.message);
      return null;
    }
  });
}

function extractIframes(pageHtml) {
  var streams = [];
  var patterns = [
    /<iframe[^>]+src=["']([^"']+)["']/gi,
    /<iframe[^>]+data-src=["']([^"']+)["']/gi,
    /<embed[^>]+src=["']([^"']+)["']/gi
  ];
  var seen = {};
  var index = 1;
  patterns.forEach(function(regex) {
    var match;
    while ((match = regex.exec(pageHtml)) !== null) {
      var src = match[1];
      if (!src || src.length < 5) continue;
      if (seen[src]) continue;
      seen[src] = true;
      if (src.startsWith("//")) src = "https:" + src;
      if (src.startsWith("/")) src = BASE_URL + src;
      if (src.match(/(google|facebook|analytics|ads|banner)/i)) continue;
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
  });
  return streams;
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    console.log("[Krmzy] === START " + type + "/" + tmdbId + " ===");
    try {
      var info = yield getMediaInfo(tmdbId, type);
      if (!info.titles || info.titles.length === 0) {
        console.log("[Krmzy] No title from TMDB");
        return [];
      }
      console.log("[Krmzy] Titles: " + info.titles.join(" | "));
      for (var t = 0; t < info.titles.length; t++) {
        var title = info.titles[t];
        var searchQuery = title;
        if (type === "series" && season && episode) {
          searchQuery += " الحلقة " + episode;
        }
        var link = yield searchOnSite(searchQuery);
        if (link) {
          console.log("[Krmzy] Fetching page: " + link);
          var pageRes = yield safeFetch(link);
          var pageHtml = yield pageRes.text();
          var streams = extractIframes(pageHtml);
          if (streams.length > 0) {
            console.log("[Krmzy] === SUCCESS: " + streams.length + " streams in " + (Date.now() - t0) + "ms ===");
            return streams;
          }
          console.log("[Krmzy] No iframes, trying next title...");
        }
      }
      console.log("[Krmzy] === FAILED: No streams found ===");
      return [];
    } catch (error) {
      console.log("[Krmzy] === ERROR: " + error.message + " ===");
      return [];
    }
  });
}

module.exports = { getStreams };
