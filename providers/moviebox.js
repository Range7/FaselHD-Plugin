// MovieBox Scraper for Nuvio
// Compatible with movieboxhd.net / moviebox.ph backend (aoneroom API)
// React Native / Hermes compatible — Promise chains only
// Tested & Verified

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

// ─── Config ──────────────────────────────────────────────
var API_BASE      = "https://h5-api.aoneroom.com/wefeed-h5api-bff";
var PLAYER_DOMAIN = "https://netfilm.world";
var TMDB_API_KEY  = "1865f43a0549ca50d341dd9ab8b29f49";
var UA            = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15000;

// ─── Helpers ─────────────────────────────────────────────
function safeFetch(url, options, timeout) {
  var ms = timeout || FETCH_TIMEOUT;
  var controller, tid;
  try {
    controller = new AbortController();
    tid = setTimeout(function() { controller.abort(); }, ms);
  } catch (e) { controller = null; }

  var opts = options || {};
  if (controller) opts.signal = controller.signal;
  if (!opts.headers) opts.headers = {};
  if (!opts.headers["User-Agent"]) opts.headers["User-Agent"] = UA;
  if (!opts.headers["Accept"]) opts.headers["Accept"] = "application/json";

  return fetch(url, opts).then(function(r) {
    if (tid) clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid) clearTimeout(tid);
    throw e;
  });
}

// Get title from TMDB API using the provided key
function getTmdbTitle(tmdbId, mediaType) {
  var tmdbPath = mediaType === "movie" ? "movie" : "tv";
  var tmdbUrl = "https://api.themoviedb.org/3/" + tmdbPath + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  return safeFetch(tmdbUrl, {
    headers: { "User-Agent": UA, "Accept": "application/json" }
  }).then(function(r) {
    if (!r.ok) throw new Error("TMDB API error: " + r.status);
    return r.json();
  }).then(function(data) {
    var title = data.title || data.name || data.original_title || data.original_name || "";
    if (!title) throw new Error("No title found in TMDB response");
    return title;
  });
}

// Get guest bearer token from MovieBox
function getBearerToken() {
  return safeFetch(API_BASE + "/home?host=moviebox.ph", {
    headers: {
      "User-Agent": UA,
      "X-Client-Info": '{"timezone":"UTC"}',
      "X-Request-Lang": "en",
      "Referer": "https://moviebox.ph/",
      "Origin": "https://moviebox.ph"
    }
  }).then(function(r) {
    var xUser = r.headers.get("x-user");
    if (xUser) {
      try {
        var parsed = JSON.parse(xUser);
        if (parsed.token) return parsed.token;
      } catch (e) {}
    }
    // Fallback: read from set-cookie
    var cookie = r.headers.get("set-cookie") || "";
    var m = cookie.match(/token=([^;]+)/);
    if (m) return m[1];
    return "";
  });
}

// Search MovieBox by title
function searchMovieBox(keyword, token) {
  var headers = {
    "User-Agent": UA,
    "Content-Type": "application/json",
    "X-Client-Info": '{"timezone":"UTC"}',
    "X-Request-Lang": "en",
    "Referer": "https://moviebox.ph/",
    "Origin": "https://moviebox.ph"
  };
  if (token) headers["Authorization"] = "Bearer " + token;

  return safeFetch(API_BASE + "/subject/search", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({ keyword: keyword, page: 1, perPage: 20 })
  }).then(function(r) {
    if (!r.ok) throw new Error("Search failed: " + r.status);
    return r.json();
  }).then(function(data) {
    var inner = data.data || {};
    var items = inner.items || inner.list || [];
    return items.map(function(item) {
      return {
        title: item.title || "",
        slug: item.detailPath || "",
        subjectId: String(item.subjectId || ""),
        poster: ((item.cover || {}).url) || "",
        year: (item.releaseDate || "").substring(0, 4) || "",
        hasResource: item.hasResource || false
      };
    });
  });
}

// Get player domain
function getPlayerDomain(token) {
  var headers = {
    "User-Agent": UA,
    "X-Client-Info": '{"timezone":"UTC"}',
    "X-Request-Lang": "en",
    "Referer": "https://moviebox.ph/",
    "Origin": "https://moviebox.ph"
  };
  if (token) headers["Authorization"] = "Bearer " + token;

  return safeFetch(API_BASE + "/media-player/get-domain", {
    headers: headers
  }).then(function(r) {
    if (!r.ok) return PLAYER_DOMAIN;
    return r.json().then(function(data) {
      return (data.data || PLAYER_DOMAIN).replace(/\/$/, "");
    });
  }).catch(function() {
    return PLAYER_DOMAIN;
  });
}

// Get stream sources from MovieBox
function getMovieBoxStreams(subjectId, detailPath, season, episode, token) {
  return getPlayerDomain(token).then(function(domain) {
    var se = season || 1;
    var ep = episode || 1;
    var playerReferer = domain + "/spa/videoPlayPage/movies/" + detailPath +
      "?id=" + subjectId + "&type=/movie/detail&detailSe=" + se + "&detailEp=" + ep + "&lang=en";

    var playUrl = domain + "/wefeed-h5api-bff/subject/play?subjectId=" + subjectId +
      "&se=" + se + "&ep=" + ep + "&detailPath=" + detailPath;

    var headers = {
      "User-Agent": UA,
      "Accept": "application/json",
      "X-Client-Info": '{"timezone":"UTC"}',
      "X-Source": "",
      "Referer": playerReferer,
      "Origin": domain
    };
    if (token) headers["Authorization"] = "Bearer " + token;

    return safeFetch(playUrl, { headers: headers });
  }).then(function(r) {
    if (!r.ok) {
      // Handle geo-block gracefully
      if (r.status === 403) {
        console.log("[MovieBox] Geo-blocked (403). Streams unavailable in this region.");
        return [];
      }
      throw new Error("Stream fetch failed: " + r.status);
    }
    return r.json();
  }).then(function(data) {
    if (!data || !data.data) return [];
    var inner = data.data;
    var hasResource = inner.hasResource;
    if (!hasResource) return [];

    var streams = inner.streams || [];
    var hls = inner.hls || [];
    var dash = inner.dash || [];
    var results = [];

    // MP4 streams
    streams.forEach(function(s) {
      if (s.url) {
        results.push({
          name: "MovieBox",
          title: (s.resolutions || "Unknown") + "p " + (s.format || "MP4"),
          url: s.url,
          quality: (s.resolutions || "720") + "p",
          headers: {
            "User-Agent": UA,
            "Referer": "https://moviebox.ph/",
            "Origin": "https://moviebox.ph"
          }
        });
      }
    });

    // HLS streams
    hls.forEach(function(s) {
      if (s.url) {
        results.push({
          name: "MovieBox",
          title: (s.resolutions || "Unknown") + "p HLS",
          url: s.url,
          quality: (s.resolutions || "720") + "p",
          headers: {
            "User-Agent": UA,
            "Referer": "https://moviebox.ph/",
            "Origin": "https://moviebox.ph"
          }
        });
      }
    });

    // DASH streams
    dash.forEach(function(s) {
      if (s.url) {
        results.push({
          name: "MovieBox",
          title: (s.resolutions || "Unknown") + "p DASH",
          url: s.url,
          quality: (s.resolutions || "720") + "p",
          headers: {
            "User-Agent": UA,
            "Referer": "https://moviebox.ph/",
            "Origin": "https://moviebox.ph"
          }
        });
      }
    });

    return results;
  });
}

// ─── Main Entry ──────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    console.log("[MovieBox] === " + type + "/" + tmdbId + " S" + (season || 1) + "E" + (episode || 1) + " ===");

    try {
      // Step 1: Get bearer token
      var token = yield getBearerToken();
      if (!token) console.log("[MovieBox] Warning: no bearer token obtained");

      // Step 2: Get title from TMDB API
      var title = yield getTmdbTitle(tmdbId, mediaType);
      console.log("[MovieBox] TMDB title: " + title);

      // Step 3: Search MovieBox
      var results = yield searchMovieBox(title, token);
      if (!results || results.length === 0) {
        console.log("[MovieBox] No search results for: " + title);
        return [];
      }

      // Step 4: Find best match
      var lowerTitle = title.toLowerCase();
      var match = null;

      // Priority 1: Exact match
      match = results.find(function(r) {
        return r.title && r.title.toLowerCase() === lowerTitle;
      });

      // Priority 2: Contains match
      if (!match) {
        match = results.find(function(r) {
          return r.title && r.title.toLowerCase().indexOf(lowerTitle) !== -1;
        });
      }

      // Priority 3: Reverse contains (TMDB title contains MovieBox title)
      if (!match) {
        match = results.find(function(r) {
          return r.title && lowerTitle.indexOf(r.title.toLowerCase()) !== -1;
        });
      }

      // Priority 4: First result with hasResource
      if (!match) {
        match = results.find(function(r) {
          return r.hasResource;
        });
      }

      // Priority 5: Fallback to first result
      if (!match) match = results[0];

      if (!match || !match.slug) {
        console.log("[MovieBox] No valid match found");
        return [];
      }

      console.log("[MovieBox] Matched: " + match.title + " (" + match.subjectId + ")");

      // Step 5: Get streams
      var streams = yield getMovieBoxStreams(match.subjectId, match.slug, season, episode, token);
      console.log("[MovieBox] === Done: " + streams.length + " streams in " + (Date.now() - t0) + "ms ===");
      return streams;

    } catch (error) {
      console.log("[MovieBox] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
