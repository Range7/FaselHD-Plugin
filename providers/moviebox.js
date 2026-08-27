// MovieBox Scraper for Nuvio
// Strict 1080p ONLY | Dual Audio (Arabic Dub + Original) | Ultra-strict matching
// React Native / Hermes compatible — Promise chains only

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

// ─── STRICT Title Normalization ──────────────────────────
function normalizeTitle(title) {
  if (!title) return "";
  return title.toLowerCase()
    .replace(/[:\-–—().,!?'"]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(season|s)\s*\d+\b/g, "")
    .replace(/\b(part|vol|volume)\s*\d+\b/g, "")
    .trim();
}

// ─── ULTRA-STRICT Matching ───────────────────────────────
// Returns: { match: object|null, score: number, reason: string }
function findStrictMatch(results, tmdbTitle, tmdbYear) {
  var normTmdb = normalizeTitle(tmdbTitle);
  var bestMatch = null;
  var bestScore = 0;
  var reason = "";

  results.forEach(function(r) {
    if (!r.title || !r.slug) return;
    var normResult = normalizeTitle(r.title);
    var score = 0;
    var rReason = "";

    // EXACT match (after normalization)
    if (normTmdb === normResult) {
      score = 100;
      rReason = "exact";
    }
    // One contains the other fully
    else if (normTmdb.indexOf(normResult) !== -1 || normResult.indexOf(normTmdb) !== -1) {
      // Calculate how much of the shorter one is contained
      var shorter = normTmdb.length < normResult.length ? normTmdb : normResult;
      var longer = normTmdb.length < normResult.length ? normResult : normTmdb;
      var coverage = shorter.length / longer.length;
      score = Math.round(85 + (coverage * 10));
      rReason = "contains";
    }
    // Word-by-word matching (all major words must match)
    else {
      var wordsTmdb = normTmdb.split(" ").filter(function(w) { return w.length > 2; });
      var wordsResult = normResult.split(" ").filter(function(w) { return w.length > 2; });
      var matchedWords = 0;
      wordsTmdb.forEach(function(wt) {
        wordsResult.forEach(function(wr) {
          if (wt === wr || wt.indexOf(wr) !== -1 || wr.indexOf(wt) !== -1) {
            matchedWords++;
          }
        });
      });
      var totalWords = Math.max(wordsTmdb.length, wordsResult.length);
      if (totalWords > 0) {
        var wordRatio = matchedWords / totalWords;
        if (wordRatio >= 0.8) {
          score = Math.round(70 + (wordRatio * 20));
          rReason = "words";
        }
      }
    }

    // Year bonus (only if year is present in both and matches)
    if (tmdbYear && r.year && r.year === tmdbYear) {
      score += 5;
    }

    // hasResource bonus
    if (r.hasResource) {
      score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = r;
      reason = rReason;
    }
  });

  // ULTRA STRICT: reject anything below 85
  if (bestScore < 85) {
    return { match: null, score: bestScore, reason: "too_low" };
  }

  return { match: bestMatch, score: bestScore, reason: reason };
}

// ─── TMDB Metadata ───────────────────────────────────────
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
    return {
      title: title,
      originalTitle: originalTitle,
      searchTitle: title,
      originalLang: originalLang,
      year: year
    };
  });
}

// ─── Bearer Token ────────────────────────────────────────
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

// ─── Search ──────────────────────────────────────────────
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

// ─── Detail (with dubs info) ─────────────────────────────
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
    var originalAudio = null;

    dubs.forEach(function(d) {
      if (d.lanCode === "ar") {
        if (d.type === 0 && !arDub) arDub = d;
        if (d.type === 1 && !arSub) arSub = d;
      }
      if (d.original === true && !originalAudio) {
        originalAudio = d;
      }
    });

    // Fallback: if no originalAudio found, use the first dub entry
    if (!originalAudio && dubs.length > 0) {
      originalAudio = dubs[0];
    }

    return {
      hasArabicDub: !!arDub,
      hasArabicSub: !!arSub,
      arabicDubSubjectId: arDub ? String(arDub.subjectId) : "",
      arabicDubPath: arDub ? arDub.detailPath : "",
      originalSubjectId: originalAudio ? String(originalAudio.subjectId) : "",
      originalPath: originalAudio ? originalAudio.detailPath : "",
      dubs: dubs
    };
  });
}

// ─── Player Domain ───────────────────────────────────────
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

// ─── Streams (strict 1080p) ──────────────────────────────
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
      console.log("[MovieBox] No exact 1080p streams.");
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

// ─── Main Entry ──────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    console.log("[MovieBox] === " + type + "/" + tmdbId + " S" + (season || 1) + "E" + (episode || 1) + " ===");

    try {
      var token = yield getBearerToken();
      var meta = yield getTmdbMeta(tmdbId, mediaType);
      var searchTitle = meta.searchTitle || meta.title;
      console.log("[MovieBox] TMDB: " + meta.title + " (" + meta.year + ")");

      var results = yield searchMovieBox(searchTitle, token);
      if (!results || results.length === 0) {
        console.log("[MovieBox] No search results.");
        return [];
      }

      // ULTRA-STRICT matching
      var matchResult = findStrictMatch(results, searchTitle, meta.year);
      if (!matchResult.match) {
        console.log("[MovieBox] REJECTED — best score: " + matchResult.score + "/100 (need 85+). Reason: " + matchResult.reason);
        return [];
      }

      var match = matchResult.match;
      console.log("[MovieBox] ACCEPTED: " + match.title + " (score: " + matchResult.score + "/100, reason: " + matchResult.reason + ")");

      // Get detail for dubs
      var detail = yield getMovieBoxDetail(match.slug, token);
      var finalStreams = [];

      // Option 1: Arabic Dub (if exists)
      if (detail.hasArabicDub && detail.arabicDubSubjectId && detail.arabicDubPath) {
        console.log("[MovieBox] Fetching Arabic Dub version...");
        var arStreams = yield getMovieBoxStreams(detail.arabicDubSubjectId, detail.arabicDubPath, season, episode, token);
        arStreams.forEach(function(s) {
          s.name = "MovieBox | مدبلج عربي";
          finalStreams.push(s);
        });
      }

      // Option 2: Original Audio (always try, fallback to main match)
      var origSubjectId = detail.originalSubjectId || match.subjectId;
      var origPath = detail.originalPath || match.slug;
      if (origSubjectId && origPath) {
        console.log("[MovieBox] Fetching Original Audio version...");
        var origStreams = yield getMovieBoxStreams(origSubjectId, origPath, season, episode, token);
        var origLabel = detail.hasArabicSub ? "الصوت الأصلي + ترجمة عربية" : "الصوت الأصلي";
        origStreams.forEach(function(s) {
          s.name = "MovieBox | " + origLabel;
          finalStreams.push(s);
        });
      }

      console.log("[MovieBox] === Done: " + finalStreams.length + " stream options in " + (Date.now() - t0) + "ms ===");
      return finalStreams;

    } catch (error) {
      console.log("[MovieBox] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
