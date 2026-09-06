// providers/downloadeverything.js
// مبسط ومتوافق 100% مع بيئة Nuvio (بدون AbortController أو ميزات قد تسبب تعارض)

var SLAVE_URL = "https://slave.downloadeverythingfromeverywhere.com/";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

function getStreams(tmdbId, mediaType, season, episode) {
  return new Promise(function(resolve, reject) {
    var type = (mediaType === "tv" || mediaType === "series") ? "tv" : "movie";
    var tmdbPath = type === "movie" ? "movie" : "tv";
    var tmdbUrl = "https://api.themoviedb.org/3/" + tmdbPath + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

    // 1. جلب بيانات TMDB الأساسية
    fetch(tmdbUrl, {
      headers: { "Accept": "application/json", "User-Agent": UA }
    })
    .then(function(res) { 
      if (!res.ok) throw new Error("TMDB " + res.status);
      return res.json(); 
    })
    .then(function(data) {
      var title = data.title || data.name || "Unknown";
      var year = (data.release_date || data.first_air_date || "").substring(0, 4) || null;
      var imdb_id = data.imdb_id || null;

      // 2. تجهيز البيانات المرسلة للسيرفر
      var isTv = (type === "tv");
      var payload = {
        mode: isTv ? "series" : "movie",
        title: title
      };
      
      if (year) payload.year = year;
      if (tmdbId) payload.tmdb_id = String(tmdbId);
      if (imdb_id) payload.imdb_id = imdb_id;
      
      // تصحيح مشكلة الموسم والحلقة -1
      if (isTv) {
        payload.season = (season > 0) ? season : 1;
        payload.episode = (episode > 0) ? episode : 1;
      }

      // 3. الاتصال بسيرفر DownloadEverything
      return fetch(SLAVE_URL, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Origin": "https://downloadeverythingfromeverywhere.com",
          "Referer": "https://downloadeverythingfromeverywhere.com/",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    })
    .then(function(res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    })
    .then(function(text) {
      var lines = text.split(/\r?\n/);
      var results = [];
      
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        
        try {
          var parsed = JSON.parse(line);
          if (parsed && parsed.t === "hit" && Array.isArray(parsed.links)) {
            var site = parsed.site || "DownloadEverything";
            for (var j = 0; j < parsed.links.length; j++) {
              var item = parsed.links[j];
              if (item && item.url) {
                var stream = processItem(item, site);
                if (stream) results.push(stream);
              }
            }
          }
        } catch (e) {
          // تجاهل أي سطر غير صالح
        }
      }
      
      console.log("[DownloadEverything] Found " + results.length + " valid streams");
      resolve(results);
    })
    .catch(function(error) {
      console.log("[DownloadEverything] Error: " + error.message);
      resolve([]); // إرجاع مصفوفة فارغة بأمان لمنع انهيار الإضافة
    });
  });
}

function processItem(item, site) {
  var rawUrl = item.url || "";
  var blocked = ['111477.xyz', 'vadapav.mov', 'driveseed.org', 'new3.gdflix.io', 'rapidrar.cr', 'megaup.net', 'telegram.dog', 't.me'];
  
  // فحص الروابط المحظورة
  for (var i = 0; i < blocked.length; i++) {
    if (rawUrl.indexOf(blocked[i]) !== -1) return null;
  }

  // استخراج الجودة
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

  // 1. معالجة روابط Pixeldrain
  if (rawUrl.indexOf("pixeldrain") !== -1) {
    var match = rawUrl.match(/pixeldrain\.(?:dev|com)\/(?:u|l)\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return {
        name: "DownloadEverything",
        title: "[Pixeldrain] " + name,
        url: "https://pixeldrain.com/api/file/" + match[1],
        quality: quality,
        headers: headers,
        format: "mp4"
      };
    }
  }

  // 2. معالجة الروابط المباشرة
  if (/\.(mp4|mkv)(?:\?|$)/i.test(rawUrl)) {
    return {
      name: "DownloadEverything",
      title: "[" + site + "] " + name,
      url: rawUrl,
      quality: quality,
      headers: headers,
      format: rawUrl.indexOf("mkv") !== -1 ? "mkv" : "mp4"
    };
  }

  return null;
}

module.exports = { getStreams };
