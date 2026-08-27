// Cinemana Scraper for Nuvio Local Scrapers
// Multi-language exact search based on content origin language
// React Native compatible version (Hermes-safe, no async/await)

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

// ============================================================
// Configuration
// ============================================================
var CINEMANA_BASE = "https://cinemana.shabakaty.com";
var TMDB_BASE = "https://api.themoviedb.org/3";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15e3;

// TMDB API key - user should replace this with their own
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

// ============================================================
// Language map: original_language -> search languages
// ============================================================
var LANG_SEARCH_MAP = {
  "en": ["en", "ar"],
  "ar": ["ar", "en"],
  "tr": ["tr", "ar", "en"],
  "ja": ["ja", "ar", "en"],
  "ko": ["ko", "ar", "en"],
  "zh": ["zh", "ar", "en"],
  "hi": ["hi", "ar", "en"],
  "es": ["es", "ar", "en"],
  "fr": ["fr", "ar", "en"],
  "de": ["de", "ar", "en"],
  "it": ["it", "ar", "en"],
  "ru": ["ru", "ar", "en"],
  "pt": ["pt", "ar", "en"],
  "pl": ["pl", "ar", "en"],
  "nl": ["nl", "ar", "en"],
  "sv": ["sv", "ar", "en"],
  "da": ["da", "ar", "en"],
  "no": ["no", "ar", "en"],
  "fi": ["fi", "ar", "en"],
  "th": ["th", "ar", "en"],
  "id": ["id", "ar", "en"],
  "tl": ["tl", "ar", "en"],
  "vi": ["vi", "ar", "en"],
  "ms": ["ms", "ar", "en"],
  "fa": ["fa", "ar", "en"],
  "he": ["he", "ar", "en"],
  "ur": ["ur", "ar", "en"],
  "bn": ["bn", "ar", "en"],
  "ta": ["ta", "ar", "en"],
  "te": ["te", "ar", "en"],
  "mr": ["mr", "ar", "en"],
  "pa": ["pa", "ar", "en"],
  "gu": ["gu", "ar", "en"],
  "kn": ["kn", "ar", "en"],
  "ml": ["ml", "ar", "en"],
  "uk": ["uk", "ar", "en"],
  "cs": ["cs", "ar", "en"],
  "sk": ["sk", "ar", "en"],
  "hu": ["hu", "ar", "en"],
  "ro": ["ro", "ar", "en"],
  "bg": ["bg", "ar", "en"],
  "hr": ["hr", "ar", "en"],
  "sr": ["sr", "ar", "en"],
  "sl": ["sl", "ar", "en"],
  "lt": ["lt", "ar", "en"],
  "lv": ["lv", "ar", "en"],
  "et": ["et", "ar", "en"],
  "is": ["is", "ar", "en"],
  "el": ["el", "ar", "en"],
  "la": ["la", "ar", "en"],
  "sw": ["sw", "ar", "en"],
  "af": ["af", "ar", "en"],
  "sq": ["sq", "ar", "en"],
  "mk": ["mk", "ar", "en"],
  "ka": ["ka", "ar", "en"],
  "hy": ["hy", "ar", "en"],
  "az": ["az", "ar", "en"],
  "kk": ["kk", "ar", "en"],
  "uz": ["uz", "ar", "en"],
  "ky": ["ky", "ar", "en"],
  "mn": ["mn", "ar", "en"],
  "ne": ["ne", "ar", "en"],
  "si": ["si", "ar", "en"],
  "my": ["my", "ar", "en"],
  "km": ["km", "ar", "en"],
  "lo": ["lo", "ar", "en"],
  "am": ["am", "ar", "en"],
  "so": ["so", "ar", "en"],
  "ha": ["ha", "ar", "en"],
  "yo": ["yo", "ar", "en"],
  "zu": ["zu", "ar", "en"],
  "xh": ["xh", "ar", "en"],
  "cy": ["cy", "ar", "en"],
  "ga": ["ga", "ar", "en"],
  "eu": ["eu", "ar", "en"],
  "ca": ["ca", "ar", "en"],
  "gl": ["gl", "ar", "en"],
  "ast": ["ast", "ar", "en"],
  "wa": ["wa", "ar", "en"],
  "br": ["br", "ar", "en"],
  "co": ["co", "ar", "en"],
  "oc": ["oc", "ar", "en"],
  "rm": ["rm", "ar", "en"],
  "lb": ["lb", "ar", "en"],
  "gd": ["gd", "ar", "en"],
  "kw": ["kw", "ar", "en"],
  "gv": ["gv", "ar", "en"],
  "mi": ["mi", "ar", "en"],
  "sm": ["sm", "ar", "en"],
  "to": ["to", "ar", "en"],
  "fj": ["fj", "ar", "en"],
  "bi": ["bi", "ar", "en"],
  "ho": ["ho", "ar", "en"],
  "mg": ["mg", "ar", "en"],
  "ny": ["ny", "ar", "en"],
  "sn": ["sn", "ar", "en"],
  "st": ["st", "ar", "en"],
  "ts": ["ts", "ar", "en"],
  "tn": ["tn", "ar", "en"],
  "ss": ["ss", "ar", "en"],
  "ve": ["ve", "ar", "en"],
  "nr": ["nr", "ar", "en"],
  "pi": ["pi", "ar", "en"],
  "sa": ["sa", "ar", "en"],
  "bo": ["bo", "ar", "en"],
  "dz": ["dz", "ar", "en"],
  "jv": ["jv", "ar", "en"],
  "su": ["su", "ar", "en"],
  "ceb": ["ceb", "ar", "en"],
  "ilo": ["ilo", "ar", "en"],
  "war": ["war", "ar", "en"],
  "pam": ["pam", "ar", "en"],
  "pag": ["pag", "ar", "en"],
  "bik": ["bik", "ar", "en"],
  "hil": ["hil", "ar", "en"],
  "krj": ["krj", "ar", "en"],
  "mdh": ["mdh", "ar", "en"],
  "min": ["min", "ar", "en"],
  "bug": ["bug", "ar", "en"],
  "mak": ["mak", "ar", "en"],
  "gor": ["gor", "ar", "en"],
  "tet": ["tet", "ar", "en"],
  "ch": ["ch", "ar", "en"],
  "ps": ["ps", "ar", "en"],
  "ku": ["ku", "ar", "en"],
  "sd": ["sd", "ar", "en"],
  "ks": ["ks", "ar", "en"],
  "doi": ["doi", "ar", "en"],
  "kok": ["kok", "ar", "en"],
  "mni": ["mni", "ar", "en"],
  "sat": ["sat", "ar", "en"],
  "lus": ["lus", "ar", "en"],
  "kha": ["kha", "ar", "en"],
  "tcy": ["tcy", "ar", "en"],
  "brx": ["brx", "ar", "en"],
  "mai": ["mai", "ar", "en"],
  "bho": ["bho", "ar", "en"],
  "mag": ["mag", "ar", "en"],
  "awa": ["awa", "ar", "en"],
  "raj": ["raj", "ar", "en"],
  "hoc": ["hoc", "ar", "en"],
  "kfr": ["kfr", "ar", "en"],
  "gbm": ["gbm", "ar", "en"],
  "njo": ["njo", "ar", "en"],
  "sck": ["sck", "ar", "en"],
  "xnr": ["xnr", "ar", "en"],
  "wbr": ["wbr", "ar", "en"],
  "kru": ["kru", "ar", "en"],
  "bhb": ["bhb", "ar", "en"],
  "mwr": ["mwr", "ar", "en"],
  "hne": ["hne", "ar", "en"],
  "bjj": ["bjj", "ar", "en"],
  "noe": ["noe", "ar", "en"],
  "bns": ["bns", "ar", "en"],
  "khn": ["khn", "ar", "en"],
  "bfq": ["bfq", "ar", "en"],
  "tcz": ["tcz", "ar", "en"],
  "as": ["as", "ar", "en"],
  "or": ["or", "ar", "en"],
  "krc": ["krc", "ar", "en"],
  "ady": ["ady", "ar", "en"],
  "kbd": ["kbd", "ar", "en"],
  "av": ["av", "ar", "en"],
  "ce": ["ce", "ar", "en"],
  "inh": ["inh", "ar", "en"],
  "lbe": ["lbe", "ar", "en"],
  "tab": ["tab", "ar", "en"],
  "lez": ["lez", "ar", "en"],
  "tt": ["tt", "ar", "en"],
  "ba": ["ba", "ar", "en"],
  "cv": ["cv", "ar", "en"],
  "chm": ["chm", "ar", "en"],
  "udm": ["udm", "ar", "en"],
  "mhr": ["mhr", "ar", "en"],
  "sah": ["sah", "ar", "en"],
  "xal": ["xal", "ar", "en"],
  "tyv": ["tyv", "ar", "en"],
  "alt": ["alt", "ar", "en"],
  "kjh": ["kjh", "ar", "en"],
  "sel": ["sel", "ar", "en"],
  "ykg": ["ykg", "ar", "en"],
  "enm": ["enm", "ar", "en"],
  "ang": ["ang", "ar", "en"],
  "frr": ["frr", "ar", "en"],
  "stq": ["stq", "ar", "en"],
  "nds": ["nds", "ar", "en"],
  "pfl": ["pfl", "ar", "en"],
  "bar": ["bar", "ar", "en"],
  "cim": ["cim", "ar", "en"],
  "vec": ["vec", "ar", "en"],
  "fur": ["fur", "ar", "en"],
  "lij": ["lij", "ar", "en"],
  "nap": ["nap", "ar", "en"],
  "scn": ["scn", "ar", "en"],
  "sc": ["sc", "ar", "en"],
  "srd": ["srd", "ar", "en"],
  "lmo": ["lmo", "ar", "en"],
  "eml": ["eml", "ar", "en"],
  "rgn": ["rgn", "ar", "en"],
  "nrm": ["nrm", "ar", "en"],
  "pms": ["pms", "ar", "en"],
  "lld": ["lld", "ar", "en"],
  "mhn": ["mhn", "ar", "en"],
  "frp": ["frp", "ar", "en"],
  "pcd": ["pcd", "ar", "en"],
  "wa": ["wa", "ar", "en"],
  "gsw": ["gsw", "ar", "en"],
  "wae": ["wae", "ar", "en"],
  "goh": ["goh", "ar", "en"],
  "gmh": ["gmh", "ar", "en"],
  "osx": ["osx", "ar", "en"],
  "non": ["non", "ar", "en"],
  "fro": ["fro", "ar", "en"],
  "cym": ["cym", "ar", "en"],
  "gla": ["gla", "ar", "en"],
  "gle": ["gle", "ar", "en"],
  "kw": ["kw", "ar", "en"],
  "cor": ["cor", "ar", "en"],
  "bre": ["bre", "ar", "en"],
  "cy": ["cy", "ar", "en"],
  "ga": ["ga", "ar", "en"],
  "gv": ["gv", "ar", "en"],
  "sco": ["sco", "ar", "en"],
  "fry": ["fry", "ar", "en"],
  "stq": ["stq", "ar", "en"],
  "li": ["li", "ar", "en"],
  "zea": ["zea", "ar", "en"],
  "vls": ["vls", "ar", "en"],
  "lim": ["lim", "ar", "en"],
  "zea": ["zea", "ar", "en"],
  "vls": ["vls", "ar", "en"],
  "lim": ["lim", "ar", "en"],
  "nds-nl": ["nds-nl", "ar", "en"],
  "afh": ["afh", "ar", "en"],
  "mul": ["mul", "ar", "en"]
};

// Fallback for unknown languages
function getSearchLanguages(originalLang) {
  var langs = LANG_SEARCH_MAP[originalLang];
  if (langs && langs.length > 0) return langs;
  return [originalLang, "ar", "en"];
}

// ============================================================
// Helpers
// ============================================================
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

function normalizeText(str) {
  if (!str) return "";
  return str.toString().toLowerCase().trim().replace(/\s+/g, " ").replace(/[^\w\s]/g, "");
}

function similarityScore(a, b) {
  var na = normalizeText(a);
  var nb = normalizeText(b);
  if (na === nb) return 100;
  if (na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1) return 90;
  // Simple word overlap
  var wa = na.split(" ");
  var wb = nb.split(" ");
  var common = 0;
  for (var i = 0; i < wa.length; i++) {
    if (wa[i].length > 2 && wb.indexOf(wa[i]) !== -1) common++;
  }
  if (wa.length > 0) {
    return Math.floor((common / wa.length) * 80);
  }
  return 0;
}

// ============================================================
// TMDB: Get title + original language
// ============================================================
function getTMDBInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var type = mediaType === "movie" ? "movie" : "tv";
    var url = TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=en-US";
    try {
      var response = yield safeFetch(url);
      if (!response.ok) {
        console.log("[Cinemana] TMDB returned " + response.status);
        return null;
      }
      var data = yield response.json();
      var title = data.title || data.name || "";
      var originalTitle = data.original_title || data.original_name || title;
      var originalLang = data.original_language || "en";
      var year = "";
      if (data.release_date) year = data.release_date.substring(0, 4);
      if (data.first_air_date) year = data.first_air_date.substring(0, 4);
      return {
        title: title,
        originalTitle: originalTitle,
        originalLanguage: originalLang,
        year: year,
        tmdbData: data
      };
    } catch (e) {
      console.log("[Cinemana] TMDB error: " + e.message);
      return null;
    }
  });
}

// ============================================================
// Cinemana: Search by title in a specific language
// ============================================================
function searchCinemana(query, lang) {
  return __async(this, null, function* () {
    var encoded = encodeURIComponent(query);
    var endpoints = [
      CINEMANA_BASE + "/android/searchVideo/videoTitle/" + encoded,
      CINEMANA_BASE + "/android/searchVideo/en_title/" + encoded,
      CINEMANA_BASE + "/android/searchVideo/ar_title/" + encoded,
      CINEMANA_BASE + "/android/search/" + encoded,
      CINEMANA_BASE + "/android/videoGroups/lang/" + lang + "/level/0"
    ];

    for (var i = 0; i < endpoints.length; i++) {
      try {
        var url = endpoints[i];
        var response = yield safeFetch(url);
        if (!response.ok) continue;
        var data = yield response.json();
        var results = [];
        if (Array.isArray(data)) {
          results = data;
        } else if (data && Array.isArray(data.results)) {
          results = data.results;
        } else if (data && Array.isArray(data.content)) {
          results = data.content;
        } else if (data && Array.isArray(data.groups)) {
          for (var g = 0; g < data.groups.length; g++) {
            if (data.groups[g].content) results = results.concat(data.groups[g].content);
          }
        }
        if (results.length > 0) {
          console.log("[Cinemana] Search hit on " + url + " -> " + results.length + " results");
          return results;
        }
      } catch (e) {
        console.log("[Cinemana] Search failed on " + endpoints[i] + ": " + e.message);
      }
    }
    return [];
  });
}

// ============================================================
// Cinemana: Get video details
// ============================================================
function getVideoInfo(cinemanaId) {
  return __async(this, null, function* () {
    var url = CINEMANA_BASE + "/android/allVideoInfo/id/" + cinemanaId;
    try {
      var response = yield safeFetch(url);
      if (!response.ok) return null;
      return yield response.json();
    } catch (e) {
      console.log("[Cinemana] Video info error: " + e.message);
      return null;
    }
  });
}

// ============================================================
// Cinemana: Get stream files
// ============================================================
function getTranscodedFiles(cinemanaId) {
  return __async(this, null, function* () {
    var url = CINEMANA_BASE + "/android/transcoddedFiles/id/" + cinemanaId;
    try {
      var response = yield safeFetch(url);
      if (!response.ok) return [];
      var data = yield response.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.log("[Cinemana] Transcoded files error: " + e.message);
      return [];
    }
  });
}

// ============================================================
// Cinemana: Get series episodes
// ============================================================
function getSeriesEpisodes(seriesId) {
  return __async(this, null, function* () {
    var url = CINEMANA_BASE + "/android/videoSeason/id/" + seriesId;
    try {
      var response = yield safeFetch(url);
      if (!response.ok) return [];
      var data = yield response.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.log("[Cinemana] Series episodes error: " + e.message);
      return [];
    }
  });
}

// ============================================================
// Cinemana: Get subtitles
// ============================================================
function getSubtitles(cinemanaId) {
  return __async(this, null, function* () {
    var url = CINEMANA_BASE + "/android/translationFiles/id/" + cinemanaId;
    try {
      var response = yield safeFetch(url);
      if (!response.ok) return [];
      var data = yield response.json();
      var tracks = Array.isArray(data.translations) ? data.translations : [];
      var out = [];
      for (var i = 0; i < tracks.length; i++) {
        var t = tracks[i];
        if (t && t.file && !/defaultImages\/loading\.gif/i.test(t.file)) {
          out.push({
            url: t.file,
            lang: (t.type || t.name || "sub").toLowerCase(),
            label: t.name || t.type || "Subtitle"
          });
        }
      }
      return out;
    } catch (e) {
      console.log("[Cinemana] Subtitles error: " + e.message);
      return [];
    }
  });
}

// ============================================================
// Main: Find the best matching Cinemana entry
// ============================================================
function findBestMatch(tmdbInfo, mediaType, season, episode) {
  return __async(this, null, function* () {
    var searchLangs = getSearchLanguages(tmdbInfo.originalLanguage);
    var allResults = [];
    var queries = [];

    // Build search queries
    if (tmdbInfo.originalTitle && tmdbInfo.originalTitle !== tmdbInfo.title) {
      queries.push(tmdbInfo.originalTitle);
    }
    queries.push(tmdbInfo.title);

    // Also try without special chars
    var cleanTitle = tmdbInfo.title.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
    if (cleanTitle && cleanTitle !== tmdbInfo.title) {
      queries.push(cleanTitle);
    }

    // Search in all languages
    for (var q = 0; q < queries.length; q++) {
      for (var l = 0; l < searchLangs.length; l++) {
        try {
          var results = yield searchCinemana(queries[q], searchLangs[l]);
          for (var r = 0; r < results.length; r++) {
            allResults.push(results[r]);
          }
        } catch (e) {
          console.log("[Cinemana] Search error: " + e.message);
        }
      }
    }

    if (allResults.length === 0) {
      console.log("[Cinemana] No search results found");
      return null;
    }

    console.log("[Cinemana] Total raw results: " + allResults.length);

    // Score and filter results
    var scored = [];
    var isSeries = mediaType !== "movie";

    for (var i = 0; i < allResults.length; i++) {
      var item = allResults[i];
      var itemTitle = item.en_title || item.ar_title || item.videoTitle || item.title || item.name || "";
      var itemOriginal = item.other_title || item.original_title || itemTitle;
      var itemKind = String(item.kind || "");
      var itemYear = "";
      if (item.year) itemYear = String(item.year);
      else if (item.createdate) itemYear = String(item.createdate).substring(0, 4);
      else if (item.published) itemYear = String(item.published).substring(0, 4);

      // Skip wrong type
      var isItemSeries = itemKind === "2";
      if (isSeries !== isItemSeries) continue;

      // Score title match
      var score = 0;
      score = Math.max(score, similarityScore(itemTitle, tmdbInfo.title));
      score = Math.max(score, similarityScore(itemOriginal, tmdbInfo.title));
      score = Math.max(score, similarityScore(itemTitle, tmdbInfo.originalTitle));
      score = Math.max(score, similarityScore(itemOriginal, tmdbInfo.originalTitle));

      // Year bonus
      if (tmdbInfo.year && itemYear && itemYear === tmdbInfo.year) {
        score += 10;
      }

      if (score >= 60) {
        scored.push({
          item: item,
          score: score,
          id: String(item.nb || item.id || "").trim()
        });
      }
    }

    if (scored.length === 0) {
      console.log("[Cinemana] No results passed scoring threshold");
      return null;
    }

    // Sort by score descending
    scored.sort(function(a, b) {
      return b.score - a.score;
    });

    console.log("[Cinemana] Best match score: " + scored[0].score + " -> ID " + scored[0].id);
    return scored[0];
  });
}

// ============================================================
// Main: Get streams for Nuvio
// ============================================================
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    console.log("[Cinemana] === " + mediaType + "/" + tmdbId + " S" + (season || "?") + "E" + (episode || "?") + " ===");

    if (TMDB_API_KEY === "YOUR_TMDB_API_KEY_HERE") {
      console.log("[Cinemana] ERROR: Please set your TMDB API key in TMDB_API_KEY");
      return [];
    }

    // Step 1: Get TMDB info
    var tmdbInfo = yield getTMDBInfo(tmdbId, mediaType);
    if (!tmdbInfo) {
      console.log("[Cinemana] Failed to get TMDB info");
      return [];
    }
    console.log("[Cinemana] TMDB: " + tmdbInfo.title + " (" + tmdbInfo.originalLanguage + ") [" + tmdbInfo.year + "]");

    // Step 2: Find best Cinemana match
    var match = yield findBestMatch(tmdbInfo, mediaType, season, episode);
    if (!match || !match.id) {
      console.log("[Cinemana] No match found on Cinemana");
      return [];
    }

    var cinemanaId = match.id;
    console.log("[Cinemana] Matched ID: " + cinemanaId + " (score: " + match.score + ")");

    var streams = [];

    // Step 3: Movie -> direct streams
    if (mediaType === "movie") {
      var qualities = yield getTranscodedFiles(cinemanaId);
      var subs = yield getSubtitles(cinemanaId);
      console.log("[Cinemana] Movie qualities: " + qualities.length);

      for (var i = 0; i < qualities.length; i++) {
        var q = qualities[i];
        if (!q.videoUrl) continue;
        var stream = {
          url: q.videoUrl,
          quality: q.name || q.resolution || "Unknown",
          title: "Cinemana - " + (q.name || q.resolution || "Video")
        };
        if (subs.length > 0) {
          stream.subtitles = subs;
        }
        streams.push(stream);
      }
    }
    // Step 4: Series -> find episode
    else {
      var episodes = yield getSeriesEpisodes(cinemanaId);
      console.log("[Cinemana] Series episodes found: " + episodes.length);

      var targetSeason = Number(season || 1);
      var targetEpisode = Number(episode || 1);
      var episodeItem = null;

      for (var e = 0; e < episodes.length; e++) {
        var ep = episodes[e];
        var epSeason = Number(ep.season || 0);
        var epNum = Number(ep.episodeNummer || 0);
        if (epSeason === targetSeason && epNum === targetEpisode) {
          episodeItem = ep;
          break;
        }
      }

      if (!episodeItem) {
        console.log("[Cinemana] Episode S" + targetSeason + "E" + targetEpisode + " not found");
        return [];
      }

      var epId = String(episodeItem.nb || episodeItem.id || "").trim();
      if (!epId) {
        console.log("[Cinemana] Episode has no ID");
        return [];
      }

      console.log("[Cinemana] Episode ID: " + epId);
      var qualities = yield getTranscodedFiles(epId);
      var subs = yield getSubtitles(epId);
      console.log("[Cinemana] Episode qualities: " + qualities.length);

      for (var i = 0; i < qualities.length; i++) {
        var q = qualities[i];
        if (!q.videoUrl) continue;
        var stream = {
          url: q.videoUrl,
          quality: q.name || q.resolution || "Unknown",
          title: "Cinemana - " + (q.name || q.resolution || "Video")
        };
        if (subs.length > 0) {
          stream.subtitles = subs;
        }
        streams.push(stream);
      }
    }

    console.log("[Cinemana] === Done: " + streams.length + " streams in " + (Date.now() - t0) + "ms ===");
    return streams;
  });
}

module.exports = { getStreams };
