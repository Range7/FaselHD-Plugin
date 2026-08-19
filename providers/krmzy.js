// Krmzy Provider for Nuvio
// Adapted from maje7d/krmzy-addon server.js
// Minimal changes: adapted to Nuvio provider format + updated domain

var BASE_URL = "https://krmzy.com";
var TMDB_API_KEY = "15d2850027b7744312013263e12089b3";

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": BASE_URL + "/"
};

function getMediaTitle(tmdbId, type) {
  return new Promise(function(resolve, reject) {
    var mediaType = type === "series" ? "tv" : "movie";
    fetch("https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ar-SA", {
      headers: HEADERS
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
      var title = data.title || data.name || data.original_title || data.original_name;
      resolve(title || null);
    })
    .catch(function() { resolve(null); });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return new Promise(function(resolve, reject) {
    var type = mediaType === "movie" ? "movie" : "series";

    getMediaTitle(tmdbId, type).then(function(title) {
      if (!title) {
        console.log("[Krmzy] No title found for tmdbId: " + tmdbId);
        return resolve([]);
      }

      var searchQuery = title;
      if (type === "series" && season && episode) {
        searchQuery += " الموسم " + season + " الحلقة " + episode;
      }

      var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(searchQuery);
      console.log("[Krmzy] Searching: " + searchUrl);

      fetch(searchUrl, { headers: HEADERS })
      .then(function(searchRes) { return searchRes.text(); })
      .then(function(html) {
        var linkMatch = html.match(/href="(https?:\/\/[^"]*(?:post|movie|watch|video|series)[^"]*)"/i);
        if (!linkMatch) {
          console.log("[Krmzy] No result link found");
          return resolve([]);
        }

        console.log("[Krmzy] Found link: " + linkMatch[1]);

        fetch(linkMatch[1], { headers: HEADERS })
        .then(function(pageRes) { return pageRes.text(); })
        .then(function(pageHtml) {
          var streams = [];
          var iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
          var match;
          var index = 1;

          while ((match = iframeRegex.exec(pageHtml)) !== null) {
            var src = match[1];
            if (src.startsWith("//")) src = "https:" + src;

            streams.push({
              name: "Krmzy",
              title: "سيرفر " + index++ + " (1080p)",
              url: src
            });
          }

          console.log("[Krmzy] Found " + streams.length + " streams");
          resolve(streams);
        })
        .catch(function(err) {
          console.log("[Krmzy] Page fetch error: " + err.message);
          resolve([]);
        });
      })
      .catch(function(err) {
        console.log("[Krmzy] Search error: " + err.message);
        resolve([]);
      });
    });
  });
}

module.exports = { getStreams };
