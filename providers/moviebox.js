
# Build all three files

# ─── 1. MOVIEBOX.JS (strict 1080p + Arabic dub) ─────────────────────────

moviebox_js = r'''// MovieBox Scraper for Nuvio
// Strict 1080p ONLY | Arabic Dub Detection | React Native / Hermes compatible

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

var API_BASE      = "https://h5-api.aoneroom.com/wefeed-h5api-bff";
var PLAYER_DOMAIN = "https://netfilm.world";
var TMDB_API_KEY  = "1865f43a0549ca50d341dd9ab8b29f49";
var UA            = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15000;

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

function normalizeTitle(title) {
  if (!title) return "";
  return title.toLowerCase()
    .replace(/[:\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function similarityScore(a, b) {
  var na = normalizeTitle(a);
  var nb = normalizeTitle(b);
  if (na === nb) return 100;
  if (na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1) return 90;
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

function getMovieBoxDetail(detailPath, token) {
  var headers = {
    "User-Agent": UA,
    "X-Client-Info": '{"timezone":"UTC"}',
    "X-Request-Lang": "en",
    "Referer": "https://moviebox.ph/",
    "Origin": "https://moviebox.ph"
  };
  if (token) headers["Authorization"] = "Bearer " + token;

  return safeFetch(API_BASE + "/detail?detailPath=" + detailPath, {
    headers: headers
  }).then(function(r) {
    if (!r.ok) throw new Error("Detail failed: " + r.status);
    return r.json();
  }).then(function(data) {
    var subject = (data.data || {}).subject || data.data || {};
    var dubs = subject.dubs || [];
    var arDub = null;
    var arSub = null;

    dubs.forEach(function(d) {
      if (d.lanCode === "ar") {
        if (d.type === 0 && !arDub) arDub = d;
        if (d.type === 1 && !arSub) arSub = d;
      }
    });

    return {
      hasArabicDub: !!arDub,
      hasArabicSub: !!arSub,
      arabicDubSubjectId: arDub ? String(arDub.subjectId) : "",
      arabicDubPath: arDub ? arDub.detailPath : "",
      dubs: dubs
    };
  });
}

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
        console.log("[MovieBox] Geo-blocked (403).");
        return [];
      }
      throw new Error("Stream fetch failed: " + r.status);
    }
    return r.json();
  }).then(function(data) {
    if (!data || !data.data) return [];
    var inner = data.data;
    if (!inner.hasResource) return [];

    var allStreams = [];
    var targetRes = 1080;

    (inner.streams || []).forEach(function(s) {
      if (s.url && parseInt(s.resolutions || "0", 10) === targetRes) {
        allStreams.push({
          type: "MP4",
          title: s.resolutions + "p MP4",
          url: s.url,
          resolution: parseInt(s.resolutions, 10),
          headers: {
            "User-Agent": UA,
            "Referer": "https://moviebox.ph/",
            "Origin": "https://moviebox.ph"
          }
        });
      }
    });

    (inner.hls || []).forEach(function(s) {
      if (s.url && parseInt(s.resolutions || "0", 10) === targetRes) {
        allStreams.push({
          type: "HLS",
          title: s.resolutions + "p HLS",
          url: s.url,
          resolution: parseInt(s.resolutions, 10),
          headers: {
            "User-Agent": UA,
            "Referer": "https://moviebox.ph/",
            "Origin": "https://moviebox.ph"
          }
        });
      }
    });

    (inner.dash || []).forEach(function(s) {
      if (s.url && parseInt(s.resolutions || "0", 10) === targetRes) {
        allStreams.push({
          type: "DASH",
          title: s.resolutions + "p DASH",
          url: s.url,
          resolution: parseInt(s.resolutions, 10),
          headers: {
            "User-Agent": UA,
            "Referer": "https://moviebox.ph/",
            "Origin": "https://moviebox.ph"
          }
        });
      }
    });

    if (allStreams.length === 0) {
      console.log("[MovieBox] No exact 1080p streams found. Returning empty.");
      return [];
    }

    allStreams.sort(function(a, b) {
      var typeOrder = { "HLS": 1, "MP4": 2, "DASH": 3 };
      return (typeOrder[a.type] || 4) - (typeOrder[b.type] || 4);
    });

    return allStreams.map(function(s) {
      return {
        name: "MovieBox",
        title: s.title,
        url: s.url,
        quality: s.resolution + "p",
        headers: s.headers
      };
    });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    console.log("[MovieBox] === " + type + "/" + tmdbId + " S" + (season || 1) + "E" + (episode || 1) + " ===");

    try {
      var token = yield getBearerToken();
      var meta = yield getTmdbMeta(tmdbId, mediaType);
      var searchTitle = meta.searchTitle || meta.title;
      console.log("[MovieBox] TMDB: " + meta.title + " | search: " + searchTitle);

      var results = yield searchMovieBox(searchTitle, token);
      if (!results || results.length === 0) {
        console.log("[MovieBox] No search results.");
        return [];
      }

      var match = null;
      var bestScore = 0;
      var MIN_SCORE = 75;

      results.forEach(function(r) {
        var score = similarityScore(searchTitle, r.title);
        if (meta.year && r.year && r.year === meta.year) score += 10;
        if (r.hasResource) score += 5;
        if (score > bestScore) {
          bestScore = score;
          match = r;
        }
      });

      if (!match || bestScore < MIN_SCORE) {
        console.log("[MovieBox] No confident match. Best score: " + bestScore + "/100.");
        return [];
      }

      console.log("[MovieBox] Matched: " + match.title + " (score: " + bestScore + ")");

      // Check Arabic dub
      var detail = yield getMovieBoxDetail(match.slug, token);
      var useSubjectId = match.subjectId;
      var useDetailPath = match.slug;
      var arDubLabel = "";

      if (detail.hasArabicDub) {
        console.log("[MovieBox] Arabic DUB detected — using dubbed version.");
        useSubjectId = detail.arabicDubSubjectId;
        useDetailPath = detail.arabicDubPath;
        arDubLabel = " [مدبلج عربي]";
      } else if (detail.hasArabicSub) {
        console.log("[MovieBox] Arabic SUB available — using original with subs.");
        arDubLabel = " [ترجمة عربية]";
      } else {
        console.log("[MovieBox] No Arabic dub/sub available.");
        arDubLabel = " [بدون دبلجة]";
      }

      var streams = yield getMovieBoxStreams(useSubjectId, useDetailPath, season, episode, token);

      // Append Arabic status to stream titles
      streams.forEach(function(s) {
        s.title = s.title + arDubLabel;
      });

      console.log("[MovieBox] === Done: " + streams.length + " streams in " + (Date.now() - t0) + "ms ===");
      return streams;

    } catch (error) {
      console.log("[MovieBox] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
'''

print("moviebox.js built: " + str(len(moviebox_js)) + " bytes")
