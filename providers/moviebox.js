// MovieBox Provider for Nuvio
// Original Audio ONLY - removes English & Hindi dubs
// FIXED: Duplicate streams removed

var PROVIDER_NAME = "MovieBox";
var CINESCRAPE_BASE = 'https://pengu.uk/%7B%22auth_token%22%3A%22kN4wJWA4avMWX-T4TFA3cKiFAKWC0_FFyJZMvfdAFEY%22%7D';
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var LANG_MAP = {
  "ko": "Korean 🇰🇷", "ja": "Japanese 🇯🇵", "es": "Spanish 🇪🇸",
  "fr": "French 🇫🇷", "de": "German 🇩🇪", "it": "Italian 🇮🇹",
  "pt": "Portuguese 🇵🇹", "ru": "Russian 🇷🇺", "zh": "Chinese 🇨🇳",
  "tr": "Turkish 🇹🇷", "ar": "Arabic 🇸🇦", "hi": "Hindi 🇮🇳",
  "en": "English 🇺🇸", "pl": "Polish 🇵🇱", "th": "Thai 🇹🇭",
  "id": "Indonesian 🇮🇩", "vi": "Vietnamese 🇻🇳", "tl": "Tagalog 🇵🇭",
  "sv": "Swedish 🇸🇪", "no": "Norwegian 🇳🇴", "da": "Danish 🇩🇰",
  "fi": "Finnish 🇫🇮", "nl": "Dutch 🇳🇱", "cs": "Czech 🇨🇿",
  "hu": "Hungarian 🇭🇺", "ro": "Romanian 🇷🇴", "el": "Greek 🇬🇷",
  "he": "Hebrew 🇮🇱", "uk": "Ukrainian 🇺🇦", "ms": "Malay 🇲🇾"
};

function onSettings() {
  return [
    { type: "header", label: "Audio Preferences" },
    { type: "toggle", key: "originalOnly", label: "Original Audio Only 🎙️", defaultValue: true }
  ];
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  seasonNum = seasonNum || 1;
  episodeNum = episodeNum || 1;

  var isSeries = mediaType === "tv" || mediaType === "series";
  var tmdbUrl = "https://api.themoviedb.org/3/" + (isSeries ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&append_to_response=external_ids";

  return fetch(tmdbUrl).then(function(res) {
    return res.json();
  }).then(function(tmdbData) {
    var settings = (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) ? globalThis.SCRAPER_SETTINGS : {};
    var originalOnly = settings.originalOnly !== false;

    var imdbId = (tmdbData.external_ids && tmdbData.external_ids.imdb_id) || tmdbData.imdb_id;
    if (!imdbId) {
      console.log("[MovieBox] No IMDB ID found for TMDB: " + tmdbId);
      return [];
    }

    var title = tmdbData.title || tmdbData.name || "Movie/Show";
    var year = "";
    if (tmdbData.release_date) {
      year = tmdbData.release_date.split("-")[0];
    } else if (tmdbData.first_air_date) {
      year = tmdbData.first_air_date.split("-")[0];
    } else {
      year = "2026";
    }

    var originalLang = tmdbData.original_language || "";
    var originalLangName = LANG_MAP[originalLang] || (originalLang.toUpperCase() + " 🌍");

    var scrapeUrl;
    if (isSeries) {
      scrapeUrl = CINESCRAPE_BASE + "/stream/series/" + imdbId + ":" + seasonNum + ":" + episodeNum + ".json";
    } else {
      scrapeUrl = CINESCRAPE_BASE + "/stream/movie/" + imdbId + ".json";
    }

    console.log("[MovieBox] Fetching: " + scrapeUrl);

    return fetch(scrapeUrl).then(function(res) {
      return res.json();
    }).then(function(data) {
      if (!data || !data.streams || data.streams.length === 0) {
        console.log("[MovieBox] No streams found");
        return [];
      }

      var seenUrls = {};
      var filtered = [];

      data.streams.forEach(function(stream) {
        // Skip blocked domains
        if (stream.url && stream.url.includes("bcdnxw.hakunaymatata.com")) {
          return;
        }

        // DEDUPLICATION: Skip duplicate URLs
        var url = stream.url || "";
        if (seenUrls[url]) {
          console.log("[MovieBox] Skipping duplicate URL: " + url.substring(0, 50) + "...");
          return;
        }
        seenUrls[url] = true;

        var streamTitle = (stream.title || stream.description || "").toLowerCase();
        var lang = originalLangName;
        var isDub = false;
        var isMulti = false;

        // Detect if this is an English dub
        if (/\b(english|eng|en\b|dubbed|dub\b).*\b(dub|dubbed|audio)\b/.test(streamTitle) ||
            (/\benglish\b/.test(streamTitle) && !/\bmulti\b/.test(streamTitle) && !/\boriginal\b/.test(streamTitle))) {
          isDub = true;
          lang = "English Dub 🇺🇸";
        }
        // Detect if this is a Hindi dub
        else if (/\b(hindi|hin|hi\b).*\b(dub|dubbed|audio)\b/.test(streamTitle) ||
                 (/\bhindi\b/.test(streamTitle) && !/\bmulti\b/.test(streamTitle))) {
          isDub = true;
          lang = "Hindi Dub 🇮🇳";
        }
        // Detect Multi Audio
        else if (/\bmulti\b/.test(streamTitle) || /🌐/.test(streamTitle)) {
          isMulti = true;
          lang = "Multi Audio 🌐 (" + originalLangName + ")";
        }
        else if (originalLang && new RegExp("\\b" + originalLang + "\\b").test(streamTitle)) {
          lang = originalLangName;
        }

        if (originalOnly && isDub) {
          console.log("[MovieBox] Skipping dub: " + lang);
          return;
        }

        filtered.push({
          url: url,
          title: stream.title,
          description: stream.description,
          lang: lang,
          isDub: isDub,
          isMulti: isMulti
        });
      });

      // Group by quality + language, but keep only unique URLs per group
      var groups = {};
      filtered.forEach(function(stream) {
        var titleLower = (stream.title || "").toLowerCase();
        var quality;
        if (/2160|4k/.test(titleLower)) quality = "2160p";
        else if (/1080/.test(titleLower)) quality = "1080p";
        else if (/720/.test(titleLower)) quality = "720p";
        else if (/480/.test(titleLower)) quality = "480p";
        else quality = "1080p";

        var sizeMatch = (stream.title || "").match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i);
        var size = sizeMatch ? sizeMatch[1] : "1.99 GB";

        var cleanLang = stream.lang.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, "").trim();

        var displayTitle = "🎬 " + title + " - (" + year + ")\n💎 " + quality + " | 🔊 " + cleanLang + " | 💾 " + size + "\n⛓️‍💥 MovieBox";

        var key = quality + "-" + stream.lang;
        if (!groups[key]) groups[key] = [];
        groups[key].push({
          name: PROVIDER_NAME + " | " + quality + " | " + stream.lang,
          title: displayTitle,
          size: displayTitle,
          description: displayTitle,
          url: stream.url,
          behaviorHints: {
            proxyHeaders: {
              request: {
                Referer: "https://stremio-moviebox-1.onrender.com/"
              }
            }
          }
        });
      });

      // Flatten groups
      var result = [];
      Object.entries(groups).forEach(function(entry) {
        var groupStreams = entry[1];
        groupStreams.forEach(function(s) {
          result.push(s);
        });
      });

      console.log("[MovieBox] Found " + result.length + " unique original audio streams");
      return result;
    });
  }).catch(function(err) {
    console.error("[MovieBox] Error:", err.message || err);
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams, onSettings: onSettings };
} else {
  if (typeof globalThis !== "undefined") {
    globalThis.getStreams = getStreams;
    globalThis.onSettings = onSettings;
  }
}
