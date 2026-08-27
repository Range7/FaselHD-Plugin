// MovieBox Scraper for Nuvio
// Compatible with movieboxhd.net / moviebox.ph backend (aoneroom API)
// React Native / Hermes compatible — Promise chains only
// Features: Strict matching, 1080p only, Turkish content support

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

// Normalize title for comparison (remove special chars, lowercase)
function normalizeTitle(title) {
  if (!title) return "";
  return title.toLowerCase()
    .replace(/[:\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// Calculate similarity score between two titles (0-100)
function similarityScore(a, b) {
  var na = normalizeTitle(a);
  var nb = normalizeTitle(b);
  if (na === nb) return 100;
  if (na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1) return 90;

  // Word-level matching
  var wordsA = na.split(" ").filter(function(w) { return w.length > 2; });
  var wordsB = nb.split(" ").filter(function(w) { return w.length > 2; });
  var matches = 0;
  wordsA.forEach(function(wa) {
    wordsB.forEach(function(wb) {
      if (wa === wb || (wa.indexOf(wb) !== -1 || wb.indexOf(wa) !== -1)) matches++;
    });
  });
  var total = Math.max(wordsA.length, wordsB.length);
  return total > 0 ? Math.round((matches / total) * 80) : 0;
}

// Get full metadata from TMDB API
function getTmdbMeta(tmdbId, mediaType) {
  var tmdbPath = mediaType === "movie" ? "movie" : "tv";
  var tmdbUrl = "https://api.themoviedb.org/3/" + tmdbPath + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  return safeFetch(tmdbUrl, {
    headers: { "User-Agent": UA, "Accept": "application/json" }
  }).then(function(r) {
    if (!r.ok) throw new Error("TMDB API error: " + r.status);
    return r.json();
  }).then(function(data) {
    var title = data.title || data.name || "";
    var originalTitle = data.original_title || data.original_name || "";
    var originalLang = data.original_language || "";
    var year = (data.release_date || data.first_air_date || "").substring(0, 4);

    // For Turkish content, use English title for search (MovieBox uses English names)
    var searchTitle = title;
    if (originalLang === "tr" && originalTitle && originalTitle !== title) {
      searchTitle = title;
    }

    return {
      title: title,
      originalTitle: originalTitle,
      searchTitle: searchTitle,
      originalLang: originalLang,
      year: year
    };
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

// Get stream sources from MovieBox — 1080p ONLY
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
    var allStreams = [];

    // Collect all streams with resolution info
    streams.forEach(function(s) {
      if (s.url) {
        allStreams.push({
          type: "MP4",
          title: (s.resolutions || "Unknown") + "p MP4",
          url: s.url,
          resolution: parseInt(s.resolutions || "0", 10),
          headers: {
            "User-Agent": UA,
            "Referer": "https://moviebox.ph/",
            "Origin": "https://moviebox.ph"
          }
        });
      }
    });

    hls.forEach(function(s) {
      if (s.url) {
        allStreams.push({
          type: "HLS",
          title: (s.resolutions || "Unknown") + "p HLS",
          url: s.url,
          resolution: parseInt(s.resolutions || "0", 10),
          headers: {
            "User-Agent": UA,
            "Referer": "https://moviebox.ph/",
            "Origin": "https://moviebox.ph"
          }
        });
      }
    });

    dash.forEach(function(s) {
      if (s.url) {
        allStreams.push({
          type: "DASH",
          title: (s.resolutions || "Unknown") + "p DASH",
          url: s.url,
          resolution: parseInt(s.resolutions || "0", 10),
          headers: {
            "User-Agent": UA,
            "Referer": "https://moviebox.ph/",
            "Origin": "https://moviebox.ph"
          }
        });
      }
    });

    // Filter: 1080p ONLY (or closest available)
    var targetRes = 1080;
    var exact1080 = allStreams.filter(function(s) { return s.resolution === targetRes; });

    if (exact1080.length > 0) {
      // Return only exact 1080p streams, sorted by type preference: HLS > MP4 > DASH
      exact1080.sort(function(a, b) {
        var typeOrder = { "HLS": 1, "MP4": 2, "DASH": 3 };
        return (typeOrder[a.type] || 4) - (typeOrder[b.type] || 4);
      });
      return exact1080.map(function(s) {
        return {
          name: "MovieBox",
          title: s.title,
          url: s.url,
          quality: s.resolution + "p",
          headers: s.headers
        };
      });
    }

    // If no exact 1080p, find closest resolution >= 1080
    var above1080 = allStreams.filter(function(s) { return s.resolution >= targetRes; });
    if (above1080.length > 0) {
      above1080.sort(function(a, b) { return a.resolution - b.resolution; });
      var closest = above1080[0];
      return [{
        name: "MovieBox",
        title: closest.title,
        url: closest.url,
        quality: closest.resolution + "p",
        headers: closest.headers
      }];
    }

    // If nothing >= 1080, return the highest available (but log warning)
    if (allStreams.length > 0) {
      allStreams.sort(function(a, b) { return b.resolution - a.resolution; });
      var highest = allStreams[0];
      console.log("[MovieBox] Warning: No 1080p found. Using highest: " + highest.resolution + "p");
      return [{
        name: "MovieBox",
        title: highest.title,
        url: highest.url,
        quality: highest.resolution + "p",
        headers: highest.headers
      }];
    }

    return [];
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

      // Step 2: Get full metadata from TMDB
      var meta = yield getTmdbMeta(tmdbId, mediaType);
      var searchTitle = meta.searchTitle || meta.title;
      console.log("[MovieBox] TMDB title: " + meta.title + " | search: " + searchTitle + " | lang: " + meta.originalLang);

      // Step 3: Search MovieBox
      var results = yield searchMovieBox(searchTitle, token);
      if (!results || results.length === 0) {
        console.log("[MovieBox] No search results for: " + searchTitle);
        return [];
      }

      // Step 4: STRICT matching — find best match with high confidence
      var match = null;
      var bestScore = 0;
      var MIN_SCORE = 75; // Minimum similarity score to accept a match

      results.forEach(function(r) {
        var score = similarityScore(searchTitle, r.title);
        // Boost score if year matches
        if (meta.year && r.year && r.year === meta.year) score += 10;
        // Boost if hasResource
        if (r.hasResource) score += 5;

        if (score > bestScore) {
          bestScore = score;
          match = r;
        }
      });

      // STRICT: Reject if confidence is too low
      if (!match || bestScore < MIN_SCORE) {
        console.log("[MovieBox] No confident match found. Best score: " + bestScore + "/100. Rejecting.");
        return [];
      }

      console.log("[MovieBox] Matched: " + match.title + " (score: " + bestScore + "/100, id: " + match.subjectId + ")");

      // Step 5: Get streams (1080p only)
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
