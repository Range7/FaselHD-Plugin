// MovieBox Provider for Nuvio
// Deobfuscated and cleaned for Hermes compatibility
// Uses CineScrape API via pengu.uk

var PROVIDER_NAME = "MovieBox";
var CINESCRAPE_BASE = 'https://pengu.uk/%7B%22auth_token%22%3A%22kN4wJWA4avMWX-T4TFA3cKiFAKWC0_FFyJZMvfdAFEY%22%7D';
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

function onSettings() {
  return [
    { type: "header", label: "Audio Preferences" },
    { type: "toggle", key: "langEnglish", label: "Enable English 🇺🇸", defaultValue: true },
    { type: "toggle", key: "langHindi", label: "Enable Hindi 🇮🇳", defaultValue: true }
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
    var langEnglish = settings.langEnglish !== false;
    var langHindi = settings.langHindi !== false;

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

      var filtered = [];
      data.streams.forEach(function(stream) {
        // Skip blocked domains
        if (stream.url && stream.url.includes("bcdnxw.hakunaymatata.com")) {
          return;
        }

        var streamTitle = (stream.title || stream.description || "").toLowerCase();
        var lang = "English 🇺🇸";
        var isHindi = false;

        if (/hindi|hin|dual/.test(streamTitle)) {
          lang = "Hindi 🇮🇳";
          isHindi = true;
        } else if (/multi|🌐/.test(streamTitle)) {
          lang = "Multi 🌐";
        }

        if (isHindi && !langHindi) return;
        if (!isHindi && !langEnglish) return;

        filtered.push({
          url: stream.url,
          title: stream.title,
          description: stream.description,
          lang: lang
        });
      });

      // Group by quality + language
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

        var format = /\b(mp4|avi|m4v)\b/.test(titleLower) ? "MP4" : "MKV";

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

      console.log("[MovieBox] Found " + result.length + " streams");
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
