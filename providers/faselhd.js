var BACKEND_URL = "https://YOUR_SERVER_URL.vercel.app/api/resolve";

function getStreams(tmdbId, mediaType, season, episode) {
  return new Promise(function(resolve, reject) {
    var type = mediaType === "tv" ? "tv" : "movie";
    var url = BACKEND_URL + "?tmdbId=" + encodeURIComponent(String(tmdbId)) + "&mediaType=" + encodeURIComponent(type);

    if (type === "tv") {
      url += "&season=" + encodeURIComponent(String(season || 1)) + "&episode=" + encodeURIComponent(String(episode || 1));
    }

    console.log("[FaselHD] Requesting: " + url);

    fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    })
    .then(function(response) {
      if (!response.ok) throw new Error("Backend " + response.status);
      return response.json();
    })
    .then(function(data) {
      var streams = data.streams || [];
      // فلتر: 1080p بس
      var result = streams.filter(function(s) {
        return s.quality === "1080p";
      });
      console.log("[FaselHD] Found " + result.length + " stream(s)");
      resolve(result);
    })
    .catch(function(error) {
      console.log("[FaselHD] Error: " + error.message);
      resolve([]);
    });
  });
}

module.exports = { getStreams };
