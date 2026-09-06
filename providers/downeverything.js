// providers/downloadeverything.js
// Nuvio Compatible Scraper - Fixed Season/Episode -1 bug & Enhanced Logging

var SLAVE_URL = "https://slave.downloadeverythingfromeverywhere.com/";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

function safeFetch(url, options, timeoutMs) {
  var controller = new AbortController();
  var id = setTimeout(function() { controller.abort(); }, timeoutMs || 15000);
  var opts = Object.assign({}, options, { signal: controller.signal });
  return fetch(url, opts).then(function(response) {
    clearTimeout(id);
    return response;
  }).catch(function(err) {
    clearTimeout(id);
    throw err;
  });
}

function getTmdbMeta(tmdbId, mediaType) {
  var tmdbPath = mediaType === "movie" ? "movie" : "tv";
  var tmdbUrl = "https://api.themoviedb.org/3/" + tmdbPath + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  return safeFetch(tmdbUrl, { headers: { "Accept": "application/json" } }, 10000)
    .then(function(r) {
      if (!r.ok) throw new Error("TMDB " + r.status);
      return r.json();
    })
    .then(function(data) {
      return {
        title: data.title || data.name || "Unknown",
        year: (data.release_date || data.first_air_date || "").substring(0, 4) || null,
        imdb_id: data.imdb_id || null
      };
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[DownloadEverything] START: tmdbId=" + tmdbId + ", type=" + mediaType + ", S=" + season + ", E=" + episode);
  
  return getTmdbMeta(tmdbId, mediaType).then(function(meta) {
    console.log("[DownloadEverything] TMDB Meta Loaded:", meta.title, meta.year);
    
    var isTv = (mediaType === "tv" || mediaType === "series");
    
    // تصحيح مشكلة أن Nuvio يمرر -1 للموسم والحلقة
    var safeSeason = (season > 0) ? season : 1;
    var safeEpisode = (episode > 0) ? episode : 1;

    var payload = {
      mode: isTv ? "series" : "movie",
      title: meta.title
    };
    
    if (meta.year) payload.year = meta.year;
    if (tmdbId) payload.tmdb_id = String(tmdbId);
    if (meta.imdb_id) payload.imdb_id = meta.imdb_id;
    if (isTv) {
      payload.season = safeSeason;
      payload.episode = safeEpisode;
    }

    console.log("[DownloadEverything] Sending Payload:", JSON.stringify(payload));

    return safeFetch(SLAVE_URL, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Origin": "https://downloadeverythingfromeverywhere.com",
        "Referer": "https://downloadeverythingfromeverywhere.com/",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }, 15000);
  })
  .then(function(response) {
    console.log("[DownloadEverything] Response Status:", response.status);
    if (!response.ok) {
      return response.text().then(function(text) {
        throw new Error("HTTP " + response.status + " - " + text.substring(0, 150));
      });
    }
    return response.text();
  })
  .then(function(text) {
    console.log("[DownloadEverything] Raw Response Length:", text.length);
    if (!text || text.length < 5) {
      console.log("[DownloadEverything] Empty response from server");
      return [];
    }

    var lines = text.split(/\r?\n/);
    var promises = [];
    var hitsCount = 0;
    
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      try {
        var parsed = JSON.parse(line);
        if (parsed && parsed.t === "hit" && Array.isArray(parsed.links)) {
          hitsCount += parsed.links.length;
          var site = parsed.site || "DownloadEverything";
          for (var j = 0; j < parsed.links.length; j++) {
            var item = parsed.links[j];
            if (item && item.url) {
              promises.push(resolveItem(item, site));
            }
          }
        }
      } catch (e) {
        // تجاهل الأسطر غير الصالحة
      }
    }
    
    console.log("[DownloadEverything] Found " + hitsCount + " total candidate links. Resolving...");
    return Promise.all(promises);
  })
  .then(function(results) {
    var valid = results.filter(function(r) { return r !== null; });
    console.log("[DownloadEverything] SUCCESS: Returning " + valid.length + " valid streams");
    return valid;
  })
  .catch(function(error) {
    console.log("[DownloadEverything] CRITICAL ERROR: " + error.message);
    return [];
  });
}

function resolveItem(item, site) {
  var rawUrl = item.url || "";
  var blocked = ['111477.xyz', 'vadapav.mov', 'driveseed.org', 'new3.gdflix.io', 'rapidrar.cr', 'megaup.net', 'telegram.dog', 't.me'];
  
  for (var i = 0; i < blocked.length; i++) {
    if (rawUrl.indexOf(blocked[i]) !== -1) return Promise.resolve(null);
  }

  var quality = "1080p";
  if (Array.isArray(item.tags)) {
    for (var i = 0; i < item.tags.length; i++) {
      if (/2160p|4k|1080p|720p|480p/i.test(item.tags[i])) {
        quality = item.tags[i];
        break;
      }
    }
  }

  var name = item.name || item.release || "Stream";
  var headers = { "User-Agent": UA };

  // 1. Pixeldrain
  if (rawUrl.indexOf("pixeldrain") !== -1) {
    var match = rawUrl.match(/pixeldrain\.(?:dev|com)\/(?:u|l)\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return Promise.resolve({
        name: "DownloadEverything",
        title: "[Pixeldrain] " + name,
        url: "https://pixeldrain.com/api/file/" + match[1],
        quality: quality,
        headers: headers,
        format: "mp4"
      });
    }
  }

  // 2. Direct MP4/MKV
  if (/\.(mp4|mkv)(?:\?|$)/i.test(rawUrl)) {
    return Promise.resolve({
      name: "DownloadEverything",
      title: "[" + site + "] " + name,
      url: rawUrl,
      quality: quality,
      headers: headers,
      format: rawUrl.indexOf("mkv") !== -1 ? "mkv" : "mp4"
    });
  }

  return Promise.resolve(null);
}

module.exports = { getStreams };
