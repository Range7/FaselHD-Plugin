// MovieBox Provider for Nuvio
// Clean Promise-chain version for Hermes compatibility
// Based on afanag's implementation

var CryptoJS = require("crypto-js");

var API_BASE = "https://api3.aoneroom.com";
var KEY_B64_DEFAULT = "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";
var KEY_B64_ALT = "WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";

var BRAND_MODELS = {
  "Samsung": ["SM-S918B", "SM-A528B", "SM-M336B"],
  "Xiaomi": ["2201117TI", "M2012K11AI", "Redmi Note 11"],
  "OnePlus": ["LE2111", "CPH2449", "IN2023"],
  "Google": ["Pixel 6", "Pixel 7", "Pixel 8"],
  "Realme": ["RMX3085", "RMX3360", "RMX3551"]
};

var PACKAGE_INFO = {
  package_name: "com.community.mbox.in",
  version_name: "3.0.03.0529.03",
  version_code: 50020042
};

var SECRET_KEY_DEFAULT = CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse(KEY_B64_DEFAULT).toString(CryptoJS.enc.Utf8)
);
var SECRET_KEY_ALT = CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse(KEY_B64_ALT).toString(CryptoJS.enc.Utf8)
);

var deviceId = "";
var selectedBrand = "";
var selectedModel = "";

function initializeSession() {
  if (!deviceId) {
    var chars = "0123456789abcdef";
    for (var i = 0; i < 32; i++) {
      deviceId += chars[Math.floor(Math.random() * 16)];
    }
    var brands = Object.keys(BRAND_MODELS);
    selectedBrand = brands[Math.floor(Math.random() * brands.length)];
    var models = BRAND_MODELS[selectedBrand];
    selectedModel = models[Math.floor(Math.random() * models.length)];
  }
}

function md5(input) {
  return CryptoJS.MD5(input).toString(CryptoJS.enc.Hex);
}

function hmacMd5(key, data) {
  return CryptoJS.HmacMD5(data, key).toString(CryptoJS.enc.Base64);
}

function generateXClientToken(timestamp) {
  var ts = (timestamp || Date.now()).toString();
  var reversed = ts.split("").reverse().join("");
  var hash = md5(reversed);
  return ts + "," + hash;
}

function buildCanonicalString(method, accept, contentType, url, body, timestamp) {
  var path = "";
  var query = "";
  try {
    var urlObj = new URL(url);
    path = urlObj.pathname;
    var params = Array.from(urlObj.searchParams.keys()).sort();
    if (params.length > 0) {
      query = params.map(function(key) {
        var values = urlObj.searchParams.getAll(key);
        return values.map(function(val) { return key + "=" + val; }).join("&");
      }).join("&");
    }
  } catch (e) {
    if (url.indexOf("?") !== -1) {
      var parts = url.split("?");
      path = parts[0].replace(/https?:\/\/[^\/]+/, "");
      var qParts = parts[1].split("&").sort();
      query = qParts.join("&");
    } else {
      path = url.replace(/https?:\/\/[^\/]+/, "");
    }
  }
  var canonicalUrl = query ? path + "?" + query : path;

  var bodyHash = "";
  var bodyLength = "";
  if (body) {
    var bodyWords = CryptoJS.enc.Utf8.parse(body);
    var totalBytes = bodyWords.sigBytes;
    bodyHash = md5(bodyWords);
    bodyLength = totalBytes.toString();
  }

  return method.toUpperCase() + "\n" + (accept || "") + "\n" + (contentType || "") + "\n" + bodyLength + "\n" + timestamp + "\n" + bodyHash + "\n" + canonicalUrl;
}

function generateXTrSignature(method, accept, contentType, url, body, useAltKey, customTimestamp) {
  useAltKey = useAltKey || false;
  var timestamp = customTimestamp || Date.now();
  var canonical = buildCanonicalString(method, accept, contentType, url, body, timestamp);
  var secret = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
  var signatureB64 = hmacMd5(secret, canonical);
  return timestamp + "|2|" + signatureB64;
}

function movieBoxRequest(method, url, body, customHeaders) {
  initializeSession();
  body = body || null;
  customHeaders = customHeaders || {};
  var timestamp = Date.now();
  var xClientToken = generateXClientToken(timestamp);
  var headerContentType = customHeaders["Content-Type"] || (body ? "application/json; charset=utf-8" : "application/json");
  var accept = customHeaders["Accept"] || "application/json";
  var xTrSignature = generateXTrSignature(method, accept, headerContentType, url, body, false, timestamp);

  var xClientInfo = JSON.stringify({
    package_name: PACKAGE_INFO.package_name,
    version_name: PACKAGE_INFO.version_name,
    version_code: PACKAGE_INFO.version_code,
    os: "android",
    os_version: "16",
    device_id: deviceId,
    install_store: "ps",
    gaid: "d7578036d13336cc",
    brand: selectedBrand.toLowerCase(),
    model: selectedModel,
    system_language: "en",
    net: "NETWORK_WIFI",
    region: "IN",
    timezone: "Asia/Calcutta",
    sp_code: ""
  });

  var headers = {
    "Accept": accept,
    "Content-Type": headerContentType,
    "x-client-token": xClientToken,
    "x-tr-signature": xTrSignature,
    "User-Agent": PACKAGE_INFO.package_name + "/" + PACKAGE_INFO.version_code + " (Linux; U; Android 16; en_IN; " + selectedModel + "; Build/BP22.250325.006; Cronet/133.0.6876.3)",
    "x-client-info": xClientInfo,
    "x-client-status": "0"
  };

  for (var key in customHeaders) {
    if (customHeaders.hasOwnProperty(key)) {
      headers[key] = customHeaders[key];
    }
  }

  var options = {
    method: method,
    headers: headers
  };

  if (body) {
    options.body = body;
  }

  return fetch(url, options).then(function(res) {
    if (!res.ok) {
      if (res.status === 403 || res.status === 429) {
        return new Promise(function(resolve) { setTimeout(resolve, 1000); }).then(function() {
          return fetch(url, options);
        }).then(function(res2) {
          if (!res2.ok) return null;
          return res2.text().then(function(text) {
            try { return { data: JSON.parse(text), headers: res2.headers }; } catch (e) { return { data: text, headers: res2.headers }; }
          });
        });
      }
      return null;
    }
    return res.text().then(function(text) {
      try { return { data: JSON.parse(text), headers: res.headers }; } catch (e) { return { data: text, headers: res.headers }; }
    });
  }).catch(function(err) {
    console.error("[MovieBox Request Error]", err.message);
    return null;
  });
}

function fetchTmdbDetails(tmdbId, mediaType) {
  var url = TMDB_BASE_URL + "/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&append_to_response=external_ids";
  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Connection": "keep-alive"
    }
  }).then(function(res) {
    return res.json();
  }).then(function(data) {
    return {
      title: mediaType === "movie" ? (data.title || data.original_title) : (data.name || data.original_name),
      year: (data.release_date || data.first_air_date || "").substring(0, 4),
      imdbId: data.external_ids ? data.external_ids.imdb_id : null,
      originalTitle: data.original_title || data.original_name
    };
  }).catch(function(e) {
    console.error("[MovieBox TMDB Error]", e.message);
    return null;
  });
}

function normalizeTitle(s) {
  if (!s) return "";
  return s.replace(/\[.*?\]/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi, " ")
    .trim()
    .toLowerCase()
    .replace(/:/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

function parseQualityNumber(value) {
  var match = String(value || "").match(/(\d{3,4})/);
  return match ? parseInt(match[1], 10) : 0;
}

function getFormatType(url) {
  var u = String(url || "").toLowerCase();
  if (u.indexOf(".mpd") !== -1) return "DASH";
  if (u.indexOf(".m3u8") !== -1) return "HLS";
  if (u.indexOf(".mp4") !== -1) return "MP4";
  if (u.indexOf(".mkv") !== -1) return "MKV";
  return "VIDEO";
}

function searchMovieBox(query) {
  var url = API_BASE + "/wefeed-mobile-bff/subject-api/search/v2";
  var body = JSON.stringify({ page: 1, perPage: 20, keyword: query });
  return movieBoxRequest("POST", url, body).then(function(response) {
    if (response && response.data && response.data.data && response.data.data.results) {
      var allSubjects = [];
      response.data.data.results.forEach(function(group) {
        if (group.subjects) {
          allSubjects = allSubjects.concat(group.subjects);
        }
      });
      return allSubjects;
    }
    return [];
  });
}

function findBestMatch(subjects, tmdbTitle, tmdbYear, mediaType) {
  var normTmdbTitle = normalizeTitle(tmdbTitle);
  var targetType = mediaType === "movie" ? 1 : 2;
  var bestMatch = null;
  var bestScore = 0;

  for (var i = 0; i < subjects.length; i++) {
    var subject = subjects[i];
    if (subject.subjectType !== targetType) continue;

    var title = subject.title;
    var normTitle = normalizeTitle(title);
    var year = subject.year || (subject.releaseDate ? subject.releaseDate.substring(0, 4) : null);

    var score = 0;
    if (normTitle === normTmdbTitle) score += 50;
    else if (normTitle.indexOf(normTmdbTitle) !== -1 || normTmdbTitle.indexOf(normTitle) !== -1) score += 15;

    if (tmdbYear && year && tmdbYear == year) score += 35;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = subject;
    }
  }

  if (bestScore >= 40) return bestMatch;
  return null;
}

function fetchSubtitles(subjectId, streamId, authHeaders, langLabel) {
  var subtitles = [];
  var streamCapUrl = API_BASE + "/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=" + subjectId + "&streamId=" + streamId;

  return movieBoxRequest("GET", streamCapUrl, null, authHeaders).then(function(capRes) {
    if (capRes && capRes.data && capRes.data.data && Array.isArray(capRes.data.data.extCaptions)) {
      capRes.data.data.extCaptions.forEach(function(cap) {
        if (cap.url) {
          subtitles.push({
            url: cap.url,
            language: cap.language || cap.lanName || cap.lan || "en",
            name: (cap.lanName || cap.language || "Subtitle") + " (" + langLabel + ")",
            headers: { "Referer": API_BASE }
          });
        }
      });
    }
    return subtitles;
  }).catch(function() {
    return subtitles;
  });
}

function getStreamLinks(subjectId, season, episode, mediaTitle, mediaType) {
  season = season || 0;
  episode = episode || 0;
  var subjectUrl = API_BASE + "/wefeed-mobile-bff/subject-api/get?subjectId=" + subjectId;

  return movieBoxRequest("GET", subjectUrl).then(function(detailRes) {
    if (!detailRes || !detailRes.data || !detailRes.data.data) return [];

    var xUserHeader = detailRes.headers ? detailRes.headers.get("x-user") : null;
    var token = null;
    if (xUserHeader) {
      try {
        var xUserJson = JSON.parse(xUserHeader);
        token = xUserJson.token;
      } catch (e) {}
    }

    var subjectIds = [];
    var originalLang = "Original";
    var dubs = detailRes.data.data.dubs;
    if (Array.isArray(dubs)) {
      dubs.forEach(function(dub) {
        if (dub.subjectId == subjectId) {
          originalLang = dub.lanName || "Original";
        } else {
          subjectIds.push({ id: dub.subjectId, lang: dub.lanName });
        }
      });
    }
    subjectIds.unshift({ id: subjectId, lang: originalLang });

    var authHeaders = token ? { "Authorization": "Bearer " + token } : {};
    var allStreams = [];
    var promises = [];

    subjectIds.forEach(function(item) {
      var playUrl = API_BASE + "/wefeed-mobile-bff/subject-api/play-info?subjectId=" + item.id + "&se=" + season + "&ep=" + episode;
      var p = movieBoxRequest("GET", playUrl, null, authHeaders).then(function(playRes) {
        if (!playRes || !playRes.data || !playRes.data.data) return;
        var playData = playRes.data.data;
        var streamsList = playData.streams;

        if (Array.isArray(streamsList) && streamsList.length > 0) {
          streamsList.forEach(function(stream) {
            if (!stream.url) return;
            var formatType = getFormatType(stream.url);
            var qualLabel = stream.resolutions || stream.quality || "Auto";
            var qualNum = parseQualityNumber(qualLabel);
            var quality = qualNum ? qualNum + "p" : "Auto";
            var streamId = stream.id || item.id + "|" + season + "|" + episode;

            var streamObj = {
              name: "MovieBox",
              title: mediaTitle + (season > 0 ? " S" + season + "E" + episode : "") + " (" + item.lang + ") - " + quality + " [" + formatType + "]",
              url: stream.url,
              quality: quality,
              headers: {
                "Referer": API_BASE,
                "User-Agent": "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; MovieBox; Build/BP22.250325.006; Cronet/133.0.6876.3)"
              },
              provider: "moviebox"
            };
            if (stream.signCookie) {
              streamObj.headers["Cookie"] = stream.signCookie;
            }
            allStreams.push(streamObj);
          });
        } else if (Array.isArray(playData.resourceDetectors)) {
          playData.resourceDetectors.forEach(function(detector) {
            if (Array.isArray(detector.resolutionList)) {
              detector.resolutionList.forEach(function(video) {
                if (!video.resourceLink) return;
                var quality = video.resolution ? video.resolution + "p" : "Auto";
                var se = video.se || season;
                var ep = video.ep || episode;
                allStreams.push({
                  name: "MovieBox",
                  title: mediaTitle + " S" + se + "E" + ep + " (" + item.lang + ") - " + quality + " [Fallback]",
                  url: video.resourceLink,
                  quality: quality,
                  headers: {
                    "Referer": API_BASE,
                    "User-Agent": "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; MovieBox; Build/BP22.250325.006; Cronet/133.0.6876.3)"
                  },
                  provider: "moviebox"
                });
              });
            }
          });
        }
      }).catch(function(err) {
        console.error("[MovieBox Stream Fetch Error] ID: " + item.id, err.message);
      });
      promises.push(p);
    });

    return Promise.all(promises).then(function() {
      return allStreams;
    });
  });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  seasonNum = seasonNum || 1;
  episodeNum = episodeNum || 1;
  console.log("[MovieBox] Querying streams for TMDB: " + tmdbId + ", Type: " + mediaType);

  return fetchTmdbDetails(tmdbId, mediaType).then(function(details) {
    if (!details) return [];

    return searchMovieBox(details.title).then(function(subjects) {
      var bestMatch = findBestMatch(subjects, details.title, details.year, mediaType);

      if (!bestMatch && details.originalTitle && details.originalTitle !== details.title) {
        return searchMovieBox(details.originalTitle).then(function(subjects2) {
          bestMatch = findBestMatch(subjects2, details.originalTitle, details.year, mediaType);
          if (bestMatch) {
            var s = mediaType === "tv" ? seasonNum : 0;
            var e = mediaType === "tv" ? episodeNum : 0;
            return getStreamLinks(bestMatch.subjectId, s, e, details.title, mediaType);
          }
          console.log("[MovieBox] No matching content found for: " + details.title);
          return [];
        });
      }

      if (bestMatch) {
        var s = mediaType === "tv" ? seasonNum : 0;
        var e = mediaType === "tv" ? episodeNum : 0;
        return getStreamLinks(bestMatch.subjectId, s, e, details.title, mediaType);
      }

      console.log("[MovieBox] No matching content found for: " + details.title);
      return [];
    });
  });
}

module.exports = { getStreams };
