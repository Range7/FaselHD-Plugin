// Krmzy Scraper for Nuvio Local Scrapers
// Adapted from maje7d/krmzy-addon for Nuvio Plugin Architecture
// FIXED: domain (krmzi.net -> krmzy.com), regex escaping, added fallbacks

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

var BASE_URL = "https://krmzy.com";
var TMDB_API_KEY = "ce91d0c4d737fceb1801c2bf58417b4b";
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
  if (!opts.headers["Accept"]) opts.headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8";
  if (!opts.headers["Accept-Language"]) opts.headers["Accept-Language"] = "ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7";
  return fetch(url, opts).then(function(r) {
    if (tid) clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid) clearTimeout(tid);
    throw e;
  });
}

function getMediaTitles(tmdbId, mediaType) {
  return __async(this, null, function* () {
    try {
      var type = mediaType === "movie" ? "movie" : "tv";
      var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ar-SA";
      console.log("[Krmzy] TMDB URL: " + url);
      var response = yield safeFetch(url, {}, 8000);
      if (!response.ok) {
        console.log("[Krmzy] TMDB returned " + response.status);
        return [];
      }
      var data = yield response.json();
      var titles = [];
      // Arabic name (priority)
      var arName = data.name || data.title || null;
      if (arName) {
        titles.push(arName);
        console.log("[Krmzy] TMDB Arabic: " + arName);
      }
      // Original Turkish name
      var trName = data.original_name || data.original_title || null;
      if (trName && trName !== arName) {
        titles.push(trName);
        console.log("[Krmzy] TMDB Turkish: " + trName);
      }
      // English name (fetch without language param)
      var enUrl = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
      var enResponse = yield safeFetch(enUrl, {}, 8000);
      if (enResponse.ok) {
        var enData = yield enResponse.json();
        var enName = enData.name || enData.title || null;
        if (enName && enName !== arName && enName !== trName) {
          titles.push(enName);
          console.log("[Krmzy] TMDB English: " + enName);
        }
      }
      console.log("[Krmzy] Total names to try: " + titles.length);
      return titles;
    } catch (e) {
      console.log("[Krmzy] TMDB error: " + e.message);
      return [];
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
      console.log("[Krmzy] Search URL: " + searchUrl);
      var response = yield safeFetch(searchUrl);
      if (!response.ok) {
        console.log("[Krmzy] Search returned " + response.status);
        return null;
      }
      var html = yield response.text();
      console.log("[Krmzy] Search HTML length: " + html.length);

      // Check if site is in "updating library" mode
      if (html.indexOf("تحديث مكتبتنا") !== -1 || html.indexOf("updating our library") !== -1) {
        console.log("[Krmzy] WARNING: Site is in library update mode. Search disabled.");
      }

      // Try multiple patterns to find result link
      var patterns = [
        /href=["'](https?:\/\/[^"']*(?:post|movie|watch|video|series|episode|film)[^"']*)["']/i,
        /href=["'](\/[^"']*(?:post|movie|watch|video|series|episode|film)[^"']*)["']/i,
        /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*(?:title|result|entry)["']/i,
        /<article[^>]*>.*?<a[^>]+href=["']([^"']+)["']/is,
        /<h[1-6][^>]*>.*?<a[^>]+href=["']([^"']+)["']/is,
        /href=["']([^"']+)["'][^>]*>.*?\b(?:مشاهدة|حلقة|فيلم|مسلسل)/is
      ];

      for (var i = 0; i < patterns.length; i++) {
        var match = html.match(patterns[i]);
        if (match) {
          var link = match[1];
          if (link.startsWith("/")) link = BASE_URL + link;
          console.log("[Krmzy] Found link (pattern " + i + "): " + link);
          return link;
        }
      }

      console.log("[Krmzy] No result link found in search HTML");
      console.log("[Krmzy] HTML snippet: " + html.substring(0, 800).replace(/\s+/g, " "));
      return null;
    } catch (e) {
      console.log("[Krmzy] Search error: " + e.message);
      return null;
    }
  });
}

function extractStreams(pageUrl) {
  return __async(this, null, function* () {
    try {
      console.log("[Krmzy] Fetching page: " + pageUrl);
      var response = yield safeFetch(pageUrl);
      if (!response.ok) {
        console.log("[Krmzy] Page returned " + response.status);
        return [];
      }
      var html = yield response.text();
      console.log("[Krmzy] Page HTML length: " + html.length);

      var streams = [];
      var index = 1;
      var match;

      // Pattern 1: iframe src
      var iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
      while ((match = iframeRegex.exec(html)) !== null) {
        var src = match[1];
        if (src.startsWith("//")) src = "https:" + src;
        if (src.startsWith("/")) src = BASE_URL + src;
        console.log("[Krmzy] Found iframe: " + src);
        streams.push({
          name: "Krmzy",
          title: "سيرفر " + index + " (1080p)",
          url: src
        });
        index++;
      }

      // Pattern 2: video src
      var videoRegex = /<video[^>]+src=["']([^"']+)["']/gi;
      while ((match = videoRegex.exec(html)) !== null) {
        var src = match[1];
        if (src.startsWith("//")) src = "https:" + src;
        if (src.startsWith("/")) src = BASE_URL + src;
        console.log("[Krmzy] Found video: " + src);
        streams.push({
          name: "Krmzy",
          title: "سيرفر " + index + " (1080p)",
          url: src
        });
        index++;
      }

      // Pattern 3: source src inside video
      var sourceRegex = /<source[^>]+src=["']([^"']+)["']/gi;
      while ((match = sourceRegex.exec(html)) !== null) {
        var src = match[1];
        if (src.startsWith("//")) src = "https:" + src;
        if (src.startsWith("/")) src = BASE_URL + src;
        console.log("[Krmzy] Found source: " + src);
        streams.push({
          name: "Krmzy",
          title: "سيرفر " + index + " (1080p)",
          url: src
        });
        index++;
      }

      // Pattern 4: embed src
      var embedRegex = /<embed[^>]+src=["']([^"']+)["']/gi;
      while ((match = embedRegex.exec(html)) !== null) {
        var src = match[1];
        if (src.startsWith("//")) src = "https:" + src;
        if (src.startsWith("/")) src = BASE_URL + src;
        console.log("[Krmzy] Found embed: " + src);
        streams.push({
          name: "Krmzy",
          title: "سيرفر " + index + " (1080p)",
          url: src
        });
        index++;
      }

      // Pattern 5: data-src (lazy loading)
      var dataSrcRegex = /data-src=["'](https?:\/\/[^"']+)["']/gi;
      while ((match = dataSrcRegex.exec(html)) !== null) {
        var src = match[1];
        console.log("[Krmzy] Found data-src: " + src);
        streams.push({
          name: "Krmzy",
          title: "سيرفر " + index + " (1080p)",
          url: src
        });
        index++;
      }

      // Pattern 6: any m3u8 or mp4 link in the page
      var directRegex = /(https?:\/\/[^"'\s]+\.(?:m3u8|mp4|mkv|avi)[^"'\s]*)/gi;
      while ((match = directRegex.exec(html)) !== null) {
        var src = match[1];
        console.log("[Krmzy] Found direct link: " + src);
        streams.push({
          name: "Krmzy",
          title: "سيرفر " + index + " (1080p)",
          url: src
        });
        index++;
      }

      // Pattern 7: JavaScript variables with stream URLs
      var jsRegex = /(?:var|let|const)\s+\w+\s*=\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4|mkv))["']/gi;
      while ((match = jsRegex.exec(html)) !== null) {
        var src = match[1];
        console.log("[Krmzy] Found JS stream: " + src);
        streams.push({
          name: "Krmzy",
          title: "سيرفر " + index + " (1080p)",
          url: src
        });
        index++;
      }

      // Pattern 8: data-url or data-link attributes
      var dataUrlRegex = /data-(?:url|link|source)=["'](https?:\/\/[^"']+)["']/gi;
      while ((match = dataUrlRegex.exec(html)) !== null) {
        var src = match[1];
        console.log("[Krmzy] Found data-url: " + src);
        streams.push({
          name: "Krmzy",
          title: "سيرفر " + index + " (1080p)",
          url: src
        });
        index++;
      }

      // Pattern 9: anchor tags pointing to video files
      var anchorRegex = /<a[^>]+href=["'](https?:\/\/[^"']+\.(?:m3u8|mp4|mkv|avi))["']/gi;
      while ((match = anchorRegex.exec(html)) !== null) {
        var src = match[1];
        console.log("[Krmzy] Found anchor video: " + src);
        streams.push({
          name: "Krmzy",
          title: "سيرفر " + index + " (1080p)",
          url: src
        });
        index++;
      }

      // Deduplicate by URL
      var seen = {};
      var unique = [];
      for (var j = 0; j < streams.length; j++) {
        if (!seen[streams[j].url]) {
          seen[streams[j].url] = true;
          unique.push(streams[j]);
        }
      }
      streams = unique;
      // Renumber
      for (var k = 0; k < streams.length; k++) {
        streams[k].title = "سيرفر " + (k + 1) + " (1080p)";
      }
      console.log("[Krmzy] Total streams found: " + streams.length);
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
    console.log("[Krmzy] === START " + type + "/" + idStr + " ===");
    try {
      // Get Arabic title only
      var title = yield getMediaTitle(tmdbId, mediaType, "ar-SA");
      if (!title) {
        console.log("[Krmzy] ABORT: Arabic title not found on TMDB");
        return [];
      }
      if (!title) {
        console.log("[Krmzy] ABORT: Could not resolve title from TMDB");
        return [];
      }
      console.log("[Krmzy] Resolved title: " + title);

      var pageUrl = yield searchKrmzy(title, mediaType, season, episode);
      if (!pageUrl) {
        console.log("[Krmzy] ABORT: No page found on Krmzy");
        return [];
      }
      console.log("[Krmzy] Resolved page: " + pageUrl);

      var streams = yield extractStreams(pageUrl);
      console.log("[Krmzy] === DONE: " + streams.length + " streams in " + (Date.now() - t0) + "ms ===");
      return streams;
    } catch (error) {
      console.log("[Krmzy] FATAL ERROR: " + error.message);
      console.log("[Krmzy] Stack: " + (error.stack || "N/A"));
      return [];
    }
  });
}

module.exports = { getStreams };
