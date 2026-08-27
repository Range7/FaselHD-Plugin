// MovieBox Scraper for Nuvio
// Strict 1080p ONLY | Dual Audio | Ultra-strict matching | Subtitle support
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

// ─── Title Normalization ─────────────────────────────────
function normalizeTitle(title) {
  if (!title) return "";
  return title.toLowerCase()
    .replace(/[:\-–—().,!?'"]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(season|s|part|vol|volume|episode|ep|chapter|ch)\s*\d+\b/g, "")
    .trim();
}

// ─── ULTRA-STRICT Matching ───────────────────────────────
function findStrictMatch(results, tmdbTitle, tmdbYear) {
  var normTmdb = normalizeTitle(tmdbTitle);
  var tmdbWords = normTmdb.split(" ").filter(function(w) { return w.length > 2; });
  var bestMatch = null;
  var bestScore = 0;
  var reason = "";

  console.log("[MovieBox] Matching against TMDB: '" + normTmdb + "' (words: " + tmdbWords.join(", ") + ")");

  results.forEach(function(r, idx) {
    if (!r.title || !r.slug) return;
    var normResult = normalizeTitle(r.title);
    var resultWords = normResult.split(" ").filter(function(w) { return w.length > 2; });
    var score = 0;
    var rReason = "";

    // EXACT match
    if (normTmdb === normResult) {
      score = 100;
      rReason = "exact";
    }
    // Contains: one must contain the other with high coverage
    else if (normTmdb.indexOf(normResult) !== -1 || normResult.indexOf(normTmdb) !== -1) {
      var shorter = normTmdb.length < normResult.length ? normTmdb : normResult;
      var longer = normTmdb.length < normResult.length ? normResult : normTmdb;
      var coverage = shorter.length / longer.length;
      if (coverage >= 0.85) {
        score = Math.round(88 + (coverage * 10));
        rReason = "contains";
      }
    }
    // Word-level: require 90%+ of TMDB words to exist in result
    else {
      var matchedWords = 0;
      tmdbWords.forEach(function(wt) {
        resultWords.forEach(function(wr) {
          if (wt === wr || wt.indexOf(wr) !== -1 || wr.indexOf(wt) !== -1) {
            matchedWords++;
          }
        });
      });
      var wordRatio = tmdbWords.length > 0 ? matchedWords / tmdbWords.length : 0;
      if (wordRatio >= 0.9) {
        score = Math.round(75 + (wordRatio * 15));
        rReason = "words";
      }
    }

    // Year bonus (only if both have year and match)
    if (tmdbYear && r.year && r.year === tmdbYear) {
      score += 5;
    }

    // hasResource bonus
    if (r.hasResource) {
      score += 2;
    }

    // Length penalty: if result is way longer/shorter, reduce score
    var lenRatio = Math.min(normTmdb.length, normResult.length) / Math.max(normTmdb.length, normResult.length);
    if (lenRatio < 0.5) {
      score = Math.round(score * 0.7);
    }

    console.log("  [" + (idx + 1) + "] '" + r.title + "' -> norm: '" + normResult + "' | score: " + score + " | reason: " + rReason);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = r;
      reason = rReason;
    }
  });

  // ULTRA STRICT: need 90+ to accept
  if (bestScore < 90) {
    console.log("[MovieBox] REJECTED — best score: " + bestScore + "/100 (need 90+).");
    return { match: null, score: bestScore, reason: "too_low" };
  }

  console.log("[MovieBox] ACCEPTED: '" + bestMatch.title + "' (score: " + bestScore + ", reason: " + reason + ")");
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

// ─── Detail (with dubs) ──────────────────────────────────
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
        return { streams: [], streamId: null, format: null };
      }
      throw new Error("Stream fetch failed: " + r.status);
    }
    return r.json();
  }).then(function(data) {
    if (!data || !data.data) return { streams: [], streamId: null, format: null };
    var inner = data.data;
    if (!inner.hasResource) return { streams: [], streamId: null, format: null };

    var allStreams = [];
    var targetRes = 1080;
    var firstStreamId = null;
    var firstFormat = null;

    (inner.streams || []).forEach(function(s) {
      if (!firstStreamId && s.id) { firstStreamId = s.id; firstFormat = s.format || "MP4"; }
      if (s.url && parseInt(s.resolutions || "0", 10) === targetRes) {
        allStreams.push({
          type: "MP4",
          title: s.resolutions + "p MP4",
          url: s.url,
          resolution: parseInt(s.resolutions, 10),
          streamId: s.id || null,
          format: s.format || "MP4",
          headers: {
            "User-Agent": UA,
            "Referer": "https://moviebox.ph/",
            "Origin": "https://moviebox.ph"
          }
        });
      }
    });

    (inner.hls || []).forEach(function(s) {
      if (!firstStreamId && s.id) { firstStreamId = s.id; firstFormat = s.format || "HLS"; }
      if (s.url && parseInt(s.resolutions || "0", 10) === targetRes) {
        allStreams.push({
          type: "HLS",
          title: s.resolutions + "p HLS",
          url: s.url,
          resolution: parseInt(s.resolutions, 10),
          streamId: s.id || null,
          format: s.format || "HLS",
          headers: {
            "User-Agent": UA,
            "Referer": "https://moviebox.ph/",
            "Origin": "https://moviebox.ph"
          }
        });
      }
    });

    (inner.dash || []).forEach(function(s) {
      if (!firstStreamId && s.id) { firstStreamId = s.id; firstFormat = s.format || "DASH"; }
      if (s.url && parseInt(s.resolutions || "0", 10) === targetRes) {
        allStreams.push({
          type: "DASH",
          title: s.resolutions + "p DASH",
          url: s.url,
          resolution: parseInt(s.resolutions, 10),
          streamId: s.id || null,
          format: s.format || "DASH",
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
      return { streams: [], streamId: firstStreamId, format: firstFormat };
    }

    allStreams.sort(function(a, b) {
      var typeOrder = { "HLS": 1, "MP4": 2, "DASH": 3 };
      return (typeOrder[a.type] || 4) - (typeOrder[b.type] || 4);
    });

    return {
      streams: allStreams.map(function(s) {
        return {
          name: "MovieBox",
          title: s.title,
          url: s.url,
          quality: s.resolution + "p",
          headers: s.headers,
          streamId: s.streamId,
          format: s.format
        };
      }),
      streamId: firstStreamId,
      format: firstFormat
    };
  });
}

// ─── Subtitles ───────────────────────────────────────────
function getMovieBoxSubtitles(subjectId, detailPath, season, episode, streamId, streamFormat, token) {
  if (!streamId || !streamFormat) {
    console.log("[MovieBox] No streamId for subtitles.");
    return Promise.resolve([]);
  }

  var se = season || 1;
  var ep = episode || 1;

  var capUrl = API_BASE + "/subject/caption?format=" + streamFormat + "&id=" + streamId +
    "&subjectId=" + subjectId + "&detailPath=" + detailPath;

  var headers = {
    "User-Agent": UA,
    "Accept": "application/json",
    "X-Client-Info": '{"timezone":"UTC"}',
    "X-Request-Lang": "en",
    "Referer": "https://moviebox.ph/",
    "Origin": "https://moviebox.ph"
  };
  if (token) headers["Authorization"] = "Bearer " + token;

  return safeFetch(capUrl, { headers: headers }).then(function(r) {
    if (!r.ok) {
      console.log("[MovieBox] Subtitle fetch failed: " + r.status);
      return [];
    }
    return r.json();
  }).then(function(data) {
    var inner = data.data || {};
    var captions = inner.captions || inner || [];
    if (!Array.isArray(captions)) captions = [];

    var subs = captions.map(function(c) {
      return {
        url: c.url || c.file || "",
        lang: c.lanCode || c.language || "unknown",
        label: c.lanName || c.label || (c.lanCode || "unknown")
      };
    }).filter(function(s) { return s.url; });

    console.log("[MovieBox] Found " + subs.length + " subtitle tracks.");
    return subs;
  }).catch(function(e) {
    console.log("[MovieBox] Subtitle error: " + e.message);
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
      var token = yield getBearerToken();
      var meta = yield getTmdbMeta(tmdbId, mediaType);
      var searchTitle = meta.searchTitle || meta.title;
      console.log("[MovieBox] TMDB: '" + meta.title + "' (year: " + meta.year + ")");

      var results = yield searchMovieBox(searchTitle, token);
      if (!results || results.length === 0) {
        console.log("[MovieBox] No search results.");
        return [];
      }

      // ULTRA-STRICT matching with debug logging
      var matchResult = findStrictMatch(results, searchTitle, meta.year);
      if (!matchResult.match) {
        console.log("[MovieBox] No match accepted. Returning empty.");
        return [];
      }

      var match = matchResult.match;
      var detail = yield getMovieBoxDetail(match.slug, token);
      var finalStreams = [];

      // Option 1: Arabic Dub
      if (detail.hasArabicDub && detail.arabicDubSubjectId && detail.arabicDubPath) {
        console.log("[MovieBox] Fetching Arabic Dub...");
        var arResult = yield getMovieBoxStreams(detail.arabicDubSubjectId, detail.arabicDubPath, season, episode, token);
        var arSubs = yield getMovieBoxSubtitles(detail.arabicDubSubjectId, detail.arabicDubPath, season, episode, arResult.streamId, arResult.format, token);
        arResult.streams.forEach(function(s) {
          s.name = "MovieBox | مدبلج عربي";
          if (arSubs.length > 0) s.subtitles = arSubs;
          finalStreams.push(s);
        });
      }

      // Option 2: Original Audio
      var origSubjectId = detail.originalSubjectId || match.subjectId;
      var origPath = detail.originalPath || match.slug;
      if (origSubjectId && origPath) {
        console.log("[MovieBox] Fetching Original Audio...");
        var origResult = yield getMovieBoxStreams(origSubjectId, origPath, season, episode, token);
        var origLabel = detail.hasArabicSub ? "الصوت الأصلي + ترجمة عربية" : "الصوت الأصلي";
        var origSubs = yield getMovieBoxSubtitles(origSubjectId, origPath, season, episode, origResult.streamId, origResult.format, token);
        origResult.streams.forEach(function(s) {
          s.name = "MovieBox | " + origLabel;
          if (origSubs.length > 0) s.subtitles = origSubs;
          finalStreams.push(s);
        });
      }

      console.log("[MovieBox] === Done: " + finalStreams.length + " options in " + (Date.now() - t0) + "ms ===");
      return finalStreams;

    } catch (error) {
      console.log("[MovieBox] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
