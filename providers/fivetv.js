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

var BASE_URL = "https://new61.5tv.lol";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15e3;

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
  if (!opts.headers["Referer"])
    opts.headers["Referer"] = BASE_URL;
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

function getTmdbTitle(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var type = mediaType === "movie" ? "movie" : "tv";
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US";
    var response = yield safeFetch(url);
    if (!response.ok) {
      console.log("[FiveTV] TMDB returned " + response.status);
      return null;
    }
    var data = yield response.json();
    return data.title || data.name || null;
  });
}

function searchFiveTv(title) {
  return __async(this, null, function* () {
    if (!title) {
      return [];
    }
    var url = BASE_URL + "/search/" + encodeURIComponent(title).replace(/%20/g, "+") + "/feed/rss2/";
    var response = yield safeFetch(url);
    if (!response.ok) {
      console.log("[FiveTV] RSS search failed: " + response.status);
      return [];
    }
    var xml = yield response.text();
    var items = [];
    var regex = /<item>\s*<title>(.*?)<\/title>\s*<link>(.*?)<\/link>/g;
    var match;
    while ((match = regex.exec(xml)) !== null) {
      items.push({
        title: match[1],
        link: match[2]
      });
    }
    return items;
  });
}

function getPageServers(pageUrl) {
  return __async(this, null, function* () {
    var response = yield safeFetch(pageUrl);
    if (!response.ok) {
      return [];
    }
    var html = yield response.text();
    var servers = [];
    var regex = /data-server-url="([^"]+)"/g;
    var match;
    while ((match = regex.exec(html)) !== null) {
      servers.push(match[1]);
    }
    return servers;
  });
}

function unpackJS(script) {
  var matches = [];
  var regex = /,(\d+),(\d+),'/g;
  var m;
  while ((m = regex.exec(script)) !== null) {
    matches.push({
      base: parseInt(m[1]),
      count: parseInt(m[2]),
      pos: m.index,
      matchStr: m[0]
    });
  }
  if (!matches.length) {
    return null;
  }
  var last = matches[matches.length - 1];
  var base = last.base;
  var count = last.count;
  var packedEnd = last.pos;

  var evalOpen = script.indexOf("eval(function(p,a,c,k,e,d)");
  var funcEnd = script.indexOf("}", evalOpen);
  var openParen = script.indexOf("('", funcEnd);

  if (openParen === -1 || openParen >= packedEnd) {
    return null;
  }
  var packed = script.substring(openParen + 2, packedEnd);

  var dictStart = last.pos + last.matchStr.length;
  var splitMarker = "'.split('|'))";
  var dictEnd = script.indexOf(splitMarker, dictStart);

  if (dictEnd === -1) {
    return null;
  }
  var dictStr = script.substring(dictStart, dictEnd);
  var dictItems = dictStr.split("|");

  var unpacked = packed;
  for (var i = count - 1; i >= 0; i--) {
    if (i < dictItems.length && dictItems[i]) {
      var numStr;
      if (base === 36) {
        var n = i;
        if (n === 0) {
          numStr = "0";
        } else {
          numStr = "";
          while (n > 0) {
            var rem = n % base;
            n = Math.floor(n / base);
            numStr = (rem < 10 ? String(rem) : String.fromCharCode(97 + rem - 10)) + numStr;
          }
        }
      } else {
        numStr = String(i);
      }
      var pattern = new RegExp("\\b" + numStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
      unpacked = unpacked.replace(pattern, dictItems[i]);
    }
  }
  return unpacked;
}

function extractVideoUrl(embedUrl) {
  return __async(this, null, function* () {
    var response = yield safeFetch(embedUrl, {
      headers: {
        "Referer": embedUrl,
        "User-Agent": UA
      }
    });
    if (!response.ok) {
      console.log("[FiveTV] Embed failed: " + response.status);
      return null;
    }
    var html = yield response.text();
    var scripts = [];
    var scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
    var sm;
    while ((sm = scriptRegex.exec(html)) !== null) {
      if (sm[1].indexOf("eval(function(p,a,c,k,e,d)") !== -1) {
        scripts.push(sm[1]);
      }
    }
    for (var i = 0; i < scripts.length; i++) {
      var unpacked = unpackJS(scripts[i]);
      if (unpacked) {
        // Only hls2 works - hls3 returns 404
        var keys = ["hls2"];
        for (var k = 0; k < keys.length; k++) {
          var km = unpacked.match(new RegExp('"' + keys[k] + '":\\s*"([^"]+)"'));
          if (km) {
            return km[1];
          }
        }
        var urlMatch = unpacked.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/);
        if (urlMatch) {
          return urlMatch[1];
        }
      }
    }
    console.log("[FiveTV] No video URL found in embed");
    return null;
  });
}

function getM3u8Resolution(m3u8Url) {
  return __async(this, null, function* () {
    try {
      var response = yield safeFetch(m3u8Url, {
        headers: {
          "User-Agent": UA
        }
      });
      if (!response.ok) {
        return "1080p";
      }
      var text = yield response.text();
      var match = text.match(/RESOLUTION=(\d+x\d+)/);
      if (match) {
        var res = match[1];
        if (res === "1920x1080") return "1080p";
        if (res === "1280x720") return "720p";
        if (res === "854x480") return "480p";
        if (res === "640x360") return "360p";
        return res;
      }
      return "1080p";
    } catch (e) {
      return "1080p";
    }
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    console.log("[FiveTV] === " + mediaType + "/" + tmdbId + " ===");
    try {
      var title = yield getTmdbTitle(tmdbId, mediaType);
      if (!title) {
        console.log("[FiveTV] Failed to get title from TMDB");
        return [];
      }
      console.log("[FiveTV] Title: " + title);
      var results = yield searchFiveTv(title);
      if (!results.length) {
        console.log("[FiveTV] No search results");
        return [];
      }
      var targetUrl = null;
      var searchTitleLower = title.toLowerCase().replace(/[^a-z0-9\s]/g, "");
      for (var i = 0; i < results.length; i++) {
        var item = results[i];
        var itemTitleLower = item.title.toLowerCase().replace(/[^a-z0-9\s\u0600-\u06FF]/g, "");
        if (mediaType === "movie") {
          if (itemTitleLower.indexOf(searchTitleLower) !== -1 && item.link.indexOf("/movie/") !== -1) {
            targetUrl = item.link;
            break;
          }
        } else {
          var epPattern = new RegExp("[-\\s]" + season + "[-\\s]" + episode + "[-\\s]");
          var epPattern2 = new RegExp("[-\\s]" + season + "[-\\s]" + episode + "$");
          var epPattern3 = new RegExp("الحلقة\\s+" + episode);
          if (itemTitleLower.indexOf(searchTitleLower) !== -1 && item.link.indexOf("/episode/") !== -1) {
            if (epPattern.test(item.link) || epPattern2.test(item.link) || epPattern3.test(item.title)) {
              targetUrl = item.link;
              break;
            }
          }
        }
      }
      if (!targetUrl) {
        for (var i = 0; i < results.length; i++) {
          if (mediaType === "movie" && results[i].link.indexOf("/movie/") !== -1) {
            targetUrl = results[i].link;
            break;
          } else if (mediaType !== "movie" && results[i].link.indexOf("/episode/") !== -1) {
            targetUrl = results[i].link;
            break;
          }
        }
      }
      if (!targetUrl) {
        console.log("[FiveTV] No matching result found");
        return [];
      }
      console.log("[FiveTV] Target: " + targetUrl);
      var servers = yield getPageServers(targetUrl);
      if (!servers.length) {
        console.log("[FiveTV] No servers found");
        return [];
      }
      console.log("[FiveTV] Found " + servers.length + " servers");
      var streams = [];
      for (var i = 0; i < servers.length; i++) {
        var serverUrl = servers[i];
        if (serverUrl.indexOf("71stream.one") !== -1 || serverUrl.indexOf("ult4vid.one") !== -1 || serverUrl.indexOf("vidmoly.net") !== -1 || serverUrl.indexOf("hgcloud.to") !== -1 || serverUrl.indexOf("streamwish.com") !== -1) {
          continue;
        }
        var videoUrl = yield extractVideoUrl(serverUrl);
        if (videoUrl) {
          console.log("[FiveTV] Video URL: " + videoUrl.substring(0, 80) + "...");
          
          // Parse actual resolution from m3u8
          var resolution = yield getM3u8Resolution(videoUrl);
          console.log("[FiveTV] Detected resolution: " + resolution);
          
          streams.push({
            url: videoUrl,
            name: "FiveTV",
            quality: resolution,
            label: resolution,
            resolution: resolution,
            headers: {
              "User-Agent": UA
            }
          });
        }
      }
      console.log("[FiveTV] === Done: " + streams.length + " streams in " + (Date.now() - t0) + "ms ===");
      return streams;
    } catch (error) {
      console.log("[FiveTV] Error: " + error.message);
      return [];
    }
  });
}

module.exports = {
  getStreams
};
