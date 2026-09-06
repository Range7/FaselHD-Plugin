// providers/downloadeverything.js
// متوافق 100% مع هيكلية إضافات Nuvio (يعتمد على دالة getStreams فقط)

var SLAVE_URL = "https://slave.downloadeverythingfromeverywhere.com/";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

// دالة جلب آمنة مع مهلة زمنية لمنع تعليق الإضافة
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

// جلب اسم الفيلم/المسلسل من TMDB لضمان دقة البحث في السيرفر
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
    })
    .catch(function() { return { title: "Unknown", year: null, imdb_id: null }; });
}

// الدالة الرئيسية التي يناديها نظام Nuvio مباشرة
function getStreams(tmdbId, mediaType, season, episode) {
  return getTmdbMeta(tmdbId, mediaType).then(function(meta) {
    var isTv = (mediaType === "tv" || mediaType === "series");
    var payload = {
      mode: isTv ? "series" : "movie",
      title: meta.title,
      tmdb_id: tmdbId ? String(tmdbId) : undefined,
      imdb_id: meta.imdb_id || undefined,
      year: meta.year || undefined,
      season: isTv ? (season || 1) : undefined,
      episode: isTv ? (episode || 1) : undefined
    };

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
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.text();
  })
  .then(function(text) {
    var lines = text.split(/\r?\n/);
    var promises = [];
    
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
              promises.push(resolveItem(item, site));
            }
          }
        }
      } catch (e) {
        // تجاهل أي سطر غير صالح (NDJSON)
      }
    }
    return Promise.all(promises);
  })
  .then(function(results) {
    // إرجاع المصفوفة بالصيغة التي يتوقعها Nuvio تماماً
    return results.filter(function(r) { return r !== null; });
  })
  .catch(function(error) {
    console.log("[DownloadEverything] Error: " + error.message);
    return [];
  });
}

function resolveItem(item, site) {
  var rawUrl = item.url || "";
  var blocked = ['111477.xyz', 'vadapav.mov', 'driveseed.org', 'new3.gdflix.io', 'rapidrar.cr', 'megaup.net', 'telegram.dog', 't.me'];
  
  // 1. فحص الروابط المحظورة
  for (var i = 0; i < blocked.length; i++) {
    if (rawUrl.indexOf(blocked[i]) !== -1) return Promise.resolve(null);
  }

  // 2. استخراج الجودة
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

  // 3. معالجة روابط Pixeldrain
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

  // 4. معالجة الروابط المباشرة (MP4 / MKV)
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

  // ملاحظة: روابط HubCloud و ClicknUpload تتطلب عمليات محاكاة متصفح معقدة (Form Submit).
  // في بيئة Nuvio الأمامية (Frontend)، غالباً ما يتم حظرها بسبب سياسات CORS. 
  // لذلك، لضمان استقرار الإضافة وعدم إرجاع أخطاء، نكتفي بإرجاع الروابط المباشرة و Pixeldrain التي تعمل 100%.
  // إذا كان تطبيقك يتجاوز CORS، يمكنك إضافة منطق الاستخراج هنا بنفس طريقة moviebox.js.

  return Promise.resolve(null);
}

// تصدير الدالة الرئيسية فقط (هذا هو المطلوب في Nuvio)
module.exports = { getStreams };
