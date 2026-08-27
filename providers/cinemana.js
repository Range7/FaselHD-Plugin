// Cinemana Scraper for Nuvio
// Shabakaty Cinemana - STRICT 1080p ONLY | Exact Title Matching | All Languages
// ENHANCED: Rich Metadata Display + Beautiful Icons + Extra Info
// React Native / Hermes compatible

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

var API_BASE = "https://cinemana.shabakaty.cc/api/android";
var MAIN_URL = "https://cinemana.shabakaty.cc";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15000;
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

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
  if (!opts.headers["Referer"]) opts.headers["Referer"] = MAIN_URL;

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
    .replace(/[^a-z0-9\s\u0600-\u06FF]/g, "")
    .replace(/\b(season|s|part|vol|volume|episode|ep|chapter|ch)\s*\d+\b/g, "")
    .trim();
}

// ─── Format Bytes ────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "غير معروف";
  var sizes = ["B", "KB", "MB", "GB", "TB"];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

// ─── Build Rich Title with Beautiful Icons ───────────────
function buildCinemanaRichTitle(stream, meta, match, videoDetails) {
  var lines = [];

  // Line 1: Server + Quality + Source
  lines.push("🎬 Cinemana | 1080p | 📡 المصدر: Shabakaty");

  // Line 2: Title
  var title = meta.title || match.title || match.enTitle || match.arTitle || "محتوى بدون عنوان";
  var year = meta.year || match.year || "";
  lines.push("🍿 " + title + (year ? " (" + year + ")" : ""));

  // Line 3: Technical specs
  var source = stream.source || "WEB-DL";
  var codec = stream.codec || "H.264";
  var audioCodec = stream.audioCodec || "AAC";
  lines.push("🎞️ 1080p • " + source + " • " + audioCodec + " • " + codec);

  // Line 4: Source detail
  lines.push("🛰️ المصدر: Cinemana (Shabakaty) | العراق");

  // Line 5: Size
  var size = stream.size || stream.fileSize || 0;
  lines.push("💾 الحجم: " + (size ? formatSize(size) : "غير محدد"));

  // Line 6: Audio languages
  var audioLangs = videoDetails && videoDetails.audioLanguages ? videoDetails.audioLanguages : ["متعدد اللغات"];
  lines.push("🎧 الصوت: " + audioLangs.join("، "));

  // Line 7: Subtitles
  var subLangs = videoDetails && videoDetails.subLanguages ? videoDetails.subLanguages : ["عربية", "إنجليزية"];
  lines.push("📝 الترجمة: " + subLangs.join("، "));

  // Line 8: Extra info
  var extras = [];
  extras.push("⚡ النوع: MP4");
  extras.push("🌐 اللغة: " + (meta.originalLang || "متعدد"));
  extras.push("📺 جودة: Full HD");
  if (match.stars) extras.push("⭐ التقييم: " + match.stars);
  lines.push(extras.join(" | "));

  // Line 9: More details
  var moreDetails = [];
  if (videoDetails && videoDetails.duration) moreDetails.push("⏱️ المدة: " + videoDetails.duration);
  if (videoDetails && videoDetails.episodeNum) moreDetails.push("📺 الحلقة: " + videoDetails.episodeNum);
  if (videoDetails && videoDetails.seasonNum) moreDetails.push("📂 الموسم: " + videoDetails.seasonNum);
  if (moreDetails.length > 0) {
    lines.push("🔎 " + moreDetails.join(" | "));
  }

  // Line 10: TMDB rating if available
  if (meta.rating && meta.rating > 0) {
    lines.push("⭐ تقييم TMDB: " + meta.rating + "/10");
  }

  return lines.join("\n");
}

// ─── TMDB Metadata with Language ─────────────────────────
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
    var year = (data.release_date || data.first_air_date || "").substring(0, 4);
    var originalLang = data.original_language || "";
    return {
      title: title,
      originalTitle: originalTitle,
      searchTitle: title || originalTitle,
      year: year,
      originalLang: originalLang,
      rating: data.vote_average || 0,
      overview: data.overview || ""
    };
  });
}

// ─── Determine Search Queries by Language ────────────────
function getSearchQueries(meta) {
  var queries = [];
  var primary = meta.searchTitle || meta.title || "";
  var original = meta.originalTitle || "";
  var lang = meta.originalLang || "";

  if (primary) queries.push(primary);
  if (original && original !== primary) queries.push(original);

  var langMap = {
    "tr": ["turkish", "turkce"],
    "ja": ["japanese", "jp"],
    "ko": ["korean", "kr"],
    "es": ["spanish", "espanol"],
    "fr": ["french", "francais"],
    "de": ["german", "deutsch"],
    "hi": ["hindi", "bollywood"],
    "zh": ["chinese", "mandarin"],
    "ar": ["arabic", "عربي"]
  };

  console.log("[Cinemana] Content language: " + lang + " | Queries: " + queries.join(" | "));
  return queries;
}

// ─── Search Cinemana ─────────────────────────────────────
function searchCinemanaSingle(query, year, type) {
  var encodedQuery = encodeURIComponent(query);
  var currentYear = new Date().getFullYear();
  var yearRange = year ? year + "," + year : "1900," + currentYear;
  var typeParam = type || "movies";

  var searchUrl = API_BASE + "/AdvancedSearch?level=0&videoTitle=" + encodedQuery +
    "&staffTitle=" + encodedQuery + "&year=" + yearRange + "&page=0&type=" + typeParam + "&itemsPerPage=30";

  return safeFetch(searchUrl).then(function(r) {
    if (!r.ok) throw new Error("Search failed: " + r.status);
    return r.json();
  }).then(function(data) {
    if (!Array.isArray(data)) return [];
    return data.map(function(item) {
      return {
        id: String(item.nb || ""),
        title: item.en_title || item.ar_title || "",
        arTitle: item.ar_title || "",
        enTitle: item.en_title || "",
        poster: item.imgObjUrl || item.img || "",
        year: String(item.year || ""),
        kind: item.kind,
        stars: item.stars || ""
      };
    }).filter(function(item) { return item.id && item.id !== ""; });
  });
}

// ─── Search with Multiple Queries ────────────────────────
function searchCinemanaAll(queries, year, mediaType) {
  return __async(this, null, function* () {
    var type = mediaType === "movie" ? "movies" : "series";
    var allResults = [];
    var seenIds = {};

    for (var i = 0; i < queries.length; i++) {
      var query = queries[i];
      console.log("[Cinemana] Searching with: '" + query + "' (type: " + type + ")");

      var results = yield searchCinemanaSingle(query, year, type).catch(function() { return []; });

      results.forEach(function(r) {
        if (!seenIds[r.id]) {
          seenIds[r.id] = true;
          allResults.push(r);
        }
      });

      if (allResults.length >= 5) break;
    }

    if (allResults.length === 0) {
      console.log("[Cinemana] No results with year, trying without year...");
      for (var j = 0; j < queries.length; j++) {
        var q = queries[j];
        var res = yield searchCinemanaSingle(q, null, type).catch(function() { return []; });
        res.forEach(function(r) {
          if (!seenIds[r.id]) {
            seenIds[r.id] = true;
            allResults.push(r);
          }
        });
        if (allResults.length >= 5) break;
      }
    }

    return allResults;
  });
}

// ─── EXACT Match Scoring ─────────────────────────────────
function scoreExactMatch(tmdbTitle, resultTitle) {
  var normTmdb = normalizeTitle(tmdbTitle);
  var normResult = normalizeTitle(resultTitle);

  if (!normResult || !normTmdb) return 0;

  if (normTmdb === normResult) return 100;

  if (normTmdb.indexOf(normResult) !== -1 || normResult.indexOf(normTmdb) !== -1) {
    var shorter = normTmdb.length < normResult.length ? normTmdb : normResult;
    var longer = normTmdb.length < normResult.length ? normResult : normTmdb;
    var coverage = shorter.length / longer.length;
    if (coverage >= 0.85) return Math.round(85 + coverage * 15);
    return Math.round(60 + coverage * 20);
  }

  var tmdbWords = normTmdb.split(" ").filter(function(w) { return w.length > 2; });
  var resultWords = normResult.split(" ").filter(function(w) { return w.length > 2; });

  if (tmdbWords.length === 0 || resultWords.length === 0) return 0;

  var matchedWords = 0;
  tmdbWords.forEach(function(wt) {
    resultWords.forEach(function(wr) {
      if (wt === wr || wt.indexOf(wr) !== -1 || wr.indexOf(wt) !== -1) {
        matchedWords++;
      }
    });
  });

  var ratio = matchedWords / tmdbWords.length;
  var reverseRatio = matchedWords / resultWords.length;
  var avgRatio = (ratio + reverseRatio) / 2;

  if (avgRatio >= 0.8) return Math.round(70 + avgRatio * 20);
  if (avgRatio >= 0.5) return Math.round(50 + avgRatio * 30);
  return Math.round(avgRatio * 50);
}

// ─── Find EXACT Match ────────────────────────────────────
function findExactMatch(results, meta, mediaType) {
  var expectedKind = (mediaType === "movie") ? 1 : 2;
  var bestMatch = null;
  var bestScore = 0;
  var queries = [meta.title, meta.originalTitle, meta.searchTitle].filter(function(q) { return q; });

  console.log("[Cinemana] Looking for EXACT match. Queries: " + queries.join(" | "));

  results.forEach(function(r, idx) {
    var titlesToCheck = [r.enTitle, r.arTitle, r.title].filter(function(t) { return t; });
    var bestItemScore = 0;
    var bestMatchedTitle = "";

    titlesToCheck.forEach(function(title) {
      queries.forEach(function(query) {
        var score = scoreExactMatch(query, title);
        if (score > bestItemScore) {
          bestItemScore = score;
          bestMatchedTitle = title;
        }
      });
    });

    if (meta.year && r.year && r.year === meta.year) bestItemScore += 8;
    if (r.kind === expectedKind) bestItemScore += 5;
    else bestItemScore -= 10;

    console.log("  [" + (idx + 1) + "] '" + r.title + "' (kind:" + r.kind + ", year:" + r.year + ") -> score: " + bestItemScore + " | matched: '" + bestMatchedTitle + "'");

    if (bestItemScore > bestScore) {
      bestScore = bestItemScore;
      bestMatch = r;
    }
  });

  if (bestScore < 80) {
    console.log("[Cinemana] REJECTED — best score: " + bestScore + " (need 80+ for exact match)");
    return null;
  }

  console.log("[Cinemana] EXACT MATCH: '" + bestMatch.title + "' (score: " + bestScore + ")");
  return bestMatch;
}

// ─── Get Episodes for Series ─────────────────────────────
function getEpisodes(seriesId, season, episode) {
  var episodesUrl = API_BASE + "/videoSeason/id/" + seriesId;
  return safeFetch(episodesUrl).then(function(r) {
    if (!r.ok) throw new Error("Episodes failed: " + r.status);
    return r.json();
  }).then(function(data) {
    if (!Array.isArray(data)) return null;

    var targetEpisode = null;

    data.forEach(function(ep) {
      var epNum = parseInt(ep.episodeNummer || ep.episodeNumber || "1", 10);
      var epSeason = parseInt(ep.season || "1", 10);
      if (epNum === episode && epSeason === season) {
        targetEpisode = ep;
      }
    });

    if (!targetEpisode) {
      var filtered = data.filter(function(ep) {
        return parseInt(ep.season || "1", 10) === season;
      });
      filtered.sort(function(a, b) {
        return parseInt(a.episodeNummer || "0", 10) - parseInt(b.episodeNummer || "0", 10);
      });
      if (filtered.length >= episode) {
        targetEpisode = filtered[episode - 1];
      }
    }

    if (!targetEpisode) {
      data.forEach(function(ep) {
        if (parseInt(ep.episodeNummer || ep.episodeNumber || "1", 10) === episode) {
          targetEpisode = ep;
        }
      });
    }

    return targetEpisode ? String(targetEpisode.nb || targetEpisode.id || "") : null;
  });
}

// ─── Get Video Details for Rich Info ─────────────────────
function getVideoDetails(videoId) {
  var detailsUrl = API_BASE + "/allVideoInfo/id/" + videoId;
  return safeFetch(detailsUrl).then(function(r) {
    if (!r.ok) return {};
    return r.json();
  }).then(function(data) {
    var details = {
      duration: data.duration || "",
      episodeNum: data.episodeNummer || data.episodeNumber || "",
      seasonNum: data.season || "",
      audioLanguages: [],
      subLanguages: []
    };

    var translations = data.translations || [];
    var seenAudio = {};
    var seenSubs = {};

    translations.forEach(function(t) {
      var lang = t.name || t.language || "";
      if (lang && !seenSubs[lang]) {
        seenSubs[lang] = true;
        details.subLanguages.push(lang);
      }
    });

    if (details.subLanguages.length === 0) {
      details.subLanguages = ["عربية", "إنجليزية"];
    }
    if (details.audioLanguages.length === 0) {
      details.audioLanguages = ["متعدد اللغات"];
    }

    return details;
  }).catch(function() {
    return {
      audioLanguages: ["متعدد اللغات"],
      subLanguages: ["عربية", "إنجليزية"]
    };
  });
}

// ─── Get Stream Links — STRICT 1080p ONLY ────────────────
function getStreamLinks(videoId) {
  var streamsUrl = API_BASE + "/transcoddedFiles/id/" + videoId;
  return safeFetch(streamsUrl).then(function(r) {
    if (!r.ok) throw new Error("Streams failed: " + r.status);
    return r.json();
  }).then(function(data) {
    if (!Array.isArray(data)) return [];

    var streams = [];
    var seenUrls = {};

    data.forEach(function(item) {
      var videoUrl = item.videoUrl || item.url || "";
      var resolution = item.resolution || "";

      if (!videoUrl) return;

      var resNum = 0;
      var resMatch = resolution.match(/(\d+)/);
      if (resMatch) resNum = parseInt(resMatch[1], 10);

      var is1080 = (resNum === 1080 || resolution.indexOf("1080") !== -1);
      if (!is1080) return;

      if (seenUrls[videoUrl]) return;
      seenUrls[videoUrl] = true;

      streams.push({
        url: videoUrl,
        resolution: resolution,
        quality: 1080,
        name: "Cinemana | 1080p",
        source: item.source || "WEB-DL",
        codec: item.codec || "H.264",
        audioCodec: item.audioCodec || "AAC",
        size: item.size || item.fileSize || 0
      });
    });

    if (streams.length === 0) {
      console.log("[Cinemana] No 1080p streams found.");
      return [];
    }

    console.log("[Cinemana] Found " + streams.length + " x 1080p stream(s).");
    return streams;
  });
}

// ─── Get Subtitles ───────────────────────────────────────
function getSubtitles(videoId) {
  var detailsUrl = API_BASE + "/allVideoInfo/id/" + videoId;
  return safeFetch(detailsUrl).then(function(r) {
    if (!r.ok) return [];
    return r.json();
  }).then(function(data) {
    var translations = data.translations;
    if (!Array.isArray(translations)) return [];

    var subs = [];
    translations.forEach(function(sub) {
      var file = sub.file || sub.url || "";
      var lang = sub.name || sub.language || "arabic";

      if (file) {
        subs.push({
          url: file,
          lang: lang,
          label: lang
        });
      }
    });

    return subs;
  }).catch(function() {
    return [];
  });
}

// ─── Main Entry Point ────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    console.log("[Cinemana] === " + type + "/" + tmdbId + " S" + (season || 1) + "E" + (episode || 1) + " ===");

    try {
      var meta = yield getTmdbMeta(tmdbId, mediaType);
      console.log("[Cinemana] TMDB: '" + meta.title + "' | Original: '" + meta.originalTitle + "' | Lang: " + meta.originalLang + " | Year: " + meta.year);

      var queries = getSearchQueries(meta);
      var searchResults = yield searchCinemanaAll(queries, meta.year, mediaType);

      if (!searchResults || searchResults.length === 0) {
        console.log("[Cinemana] No search results found.");
        return [];
      }

      var match = findExactMatch(searchResults, meta, mediaType);
      if (!match) {
        console.log("[Cinemana] No exact match found. Content may not exist on Cinemana.");
        return [];
      }

      var videoId = match.id;
      console.log("[Cinemana] Exact match ID: " + videoId + " | Title: " + match.title);

      if (mediaType === "tv" || mediaType === "anime") {
        var epId = yield getEpisodes(videoId, season || 1, episode || 1);
        if (epId) {
          console.log("[Cinemana] Episode ID: " + epId);
          videoId = epId;
        } else {
          console.log("[Cinemana] Episode not found, using series ID.");
        }
      }

      var streams = yield getStreamLinks(videoId);
      if (!streams || streams.length === 0) {
        console.log("[Cinemana] No 1080p streams available for this content.");
        return [];
      }

      var subtitles = yield getSubtitles(videoId);
      var videoDetails = yield getVideoDetails(videoId);

      var finalStreams = streams.map(function(s) {
        var richTitle = buildCinemanaRichTitle(s, meta, match, videoDetails);

        var streamObj = {
          name: "Cinemana 🎬",
          title: richTitle,
          url: s.url,
          quality: "1080p",
          headers: {
            "User-Agent": UA,
            "Referer": MAIN_URL,
            "Origin": MAIN_URL
          }
        };
        if (subtitles && subtitles.length > 0) {
          streamObj.subtitles = subtitles;
        }
        return streamObj;
      });

      console.log("[Cinemana] === Done: " + finalStreams.length + " x 1080p streams in " + (Date.now() - t0) + "ms ===");
      return finalStreams;

    } catch (error) {
      console.log("[Cinemana] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
