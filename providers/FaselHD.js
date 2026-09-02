// FaselHD 1080p-Only FULL SCRAPER for Nuvio
// NO backend, NO /resolve/ endpoint - scrapes FaselHD directly
// Version: 1.0.0 | Author: He

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try { step(generator.next(value)); } catch (e) { reject(e); }
    };
    var rejected = (value) => {
      try { step(generator.throw(value)); } catch (e) { reject(e); }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var BASE_URL = "https://web920x.faselhdx.life";
var TMDB_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15000;

function safeFetch(url, options, timeout) {
  var ms = timeout || FETCH_TIMEOUT;
  var controller;
  var tid;
  try {
    controller = new AbortController();
    tid = setTimeout(function() { controller.abort(); }, ms);
  } catch (e) { controller = null; }
  var opts = options || {};
  if (controller) opts.signal = controller.signal;
  if (!opts.headers) opts.headers = {};
  if (!opts.headers["User-Agent"]) opts.headers["User-Agent"] = UA;
  return fetch(url, opts).then(function(r) {
    if (tid) clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid) clearTimeout(tid);
    throw e;
  });
}

// Decryptor for FaselHD's enc: URLs
var Decryptor = {
  key1: "V2@%YSU2B]G~",
  key2: "bv0fim4qf17",
  ie: function(c) {
    var x = c.charCodeAt(0);
    if (x >= 97 && x <= 122) return x - 97;
    if (x >= 65 && x <= 90) return x - 65 + 26;
    if (x >= 48 && x <= 57) return x - 48 + 52;
    if (x === 43) return 62;
    if (x === 47) return 63;
    return 0;
  },
  bn: function(x) {
    if (x <= 25) return String.fromCharCode(x + 97);
    if (x <= 51) return String.fromCharCode(x - 26 + 65);
    if (x <= 61) return String.fromCharCode(x - 52 + 48);
    if (x === 62) return '+';
    if (x === 63) return '/';
    return ' ';
  },
  dec: function(e, k) {
    var r = '';
    for (var i = 0; i < e.length; i++) {
      var kc = k[i % (k.length - 1)];
      var M = this.ie(e[i]) - this.ie(kc);
      r += this.bn(M < 0 ? M + 64 : M);
    }
    return r;
  },
  parse: function(url) {
    if (!url || url.indexOf('enc:') !== 0) return url;
    try {
      return this.dec(this.dec(url.substring(4), this.key2), this.key1);
    } catch (e) { return url; }
  }
};

function filter1080p(urls) {
  return urls.filter(function(url) {
    var lower = url.toLowerCase();
    if (lower.indexOf('.m3u8') === -1) return false;
    var is1080 = lower.indexOf('hd1080') !== -1 || lower.indexOf('1080') !== -1 || 
                 lower.indexOf('playlist') !== -1 || lower.indexOf('master') !== -1 || 
                 lower.indexOf('index') !== -1;
    var notLower = lower.indexOf('hd720') === -1 && lower.indexOf('720') === -1 && 
                   lower.indexOf('hd480') === -1 && lower.indexOf('480') === -1 &&
                   lower.indexOf('hd360') === -1 && lower.indexOf('360') === -1 &&
                   lower.indexOf('hd240') === -1 && lower.indexOf('240') === -1;
    return is1080 && notLower;
  });
}

function extractM3u8FromHtml(html) {
  var results = [];

  // 1. Direct m3u8 URLs
  var m3u8Regex = /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi;
  var match;
  while ((match = m3u8Regex.exec(html)) !== null) {
    results.push(match[1]);
  }

  // 2. jwplayer sources with file:
  var fileRegex = /["']?file["']?\s*:\s*["']([^"']+)["']/gi;
  while ((match = fileRegex.exec(html)) !== null) {
    var decrypted = Decryptor.parse(match[1]);
    if (decrypted.indexOf('.m3u8') !== -1) {
      results.push(decrypted);
    }
  }

  // 3. sources array
  var sourcesRegex = /sources\s*:\s*\[([^\]]+)\]/gi;
  var sourcesMatch;
  while ((sourcesMatch = sourcesRegex.exec(html)) !== null) {
    var srcRegex = /["']?file["']?\s*:\s*["']([^"']+)["']/gi;
    while ((match = srcRegex.exec(sourcesMatch[1])) !== null) {
      var dec = Decryptor.parse(match[1]);
      if (dec.indexOf('.m3u8') !== -1) {
        results.push(dec);
      }
    }
  }

  // 4. enc: URLs
  var encRegex = /enc:[A-Za-z0-9+/=]+/g;
  while ((match = encRegex.exec(html)) !== null) {
    var dec = Decryptor.parse(match[0]);
    if (dec.indexOf('.m3u8') !== -1) {
      results.push(dec);
    }
  }

  // 5. eval/packed scripts
  if (html.indexOf('eval(function(p,a,c,k,e,d)') !== -1) {
    var packedRegex = /eval\(function\(p,a,c,k,e,d\)[^\n]+/gi;
    while ((match = packedRegex.exec(html)) !== null) {
      var packedM3u8 = match[0].match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi);
      if (packedM3u8) {
        packedM3u8.forEach(function(u) { results.push(u); });
      }
    }
  }

  return results;
}

function extractIframes(html) {
  var iframes = [];
  var blocked = ['google.com', 'recaptcha', 'googlesyndication', 'googletagmanager', 'ads'];

  var iframeRegex = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi;
  var match;
  while ((match = iframeRegex.exec(html)) !== null) {
    var url = match[1];
    if (blocked.some(function(b) { return url.indexOf(b) !== -1; })) continue;
    if (url.indexOf('http') !== 0) url = BASE_URL + url;
    iframes.push(url);
  }

  var onclickRegex = /player_iframe\.location\.href\s*=\s*["']([^"']+)["']/gi;
  while ((match = onclickRegex.exec(html)) !== null) {
    var url = match[1];
    if (url.indexOf('http') !== 0) url = BASE_URL + url;
    iframes.push(url);
  }

  return iframes;
}

function getTMDBTitle(tmdbId, mediaType) {
  return __async(this, null, function* () {
    try {
      var type = mediaType === "movie" ? "movie" : "tv";
      var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US";
      console.log("[FaselHD] TMDB: " + url);

      var response = yield safeFetch(url, {
        headers: { "User-Agent": UA }
      }, 10000);

      if (!response.ok) {
        console.log("[FaselHD] TMDB HTTP " + response.status);
        return null;
      }

      var data = yield response.json();
      var title = data.title || data.name || null;
      console.log("[FaselHD] TMDB title: " + title);
      return title;
    } catch (e) {
      console.log("[FaselHD] TMDB error: " + e.message);
      return null;
    }
  });
}

function searchFaselHD(query) {
  return __async(this, null, function* () {
    try {
      var encoded = encodeURIComponent(query);
      var url = BASE_URL + "/?s=" + encoded;
      console.log("[FaselHD] Search: " + url);

      var response = yield safeFetch(url, {
        headers: {
          "User-Agent": UA,
          "Referer": BASE_URL + "/",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      }, FETCH_TIMEOUT);

      if (!response.ok) {
        console.log("[FaselHD] Search HTTP " + response.status);
        return [];
      }

      var html = yield response.text();
      var results = [];

      // postDiv pattern
      var postDivRegex = /<div[^>]*class=["'][^"']*postDiv[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
      var match;
      while ((match = postDivRegex.exec(html)) !== null) {
        var block = match[0];
        var hrefMatch = block.match(/<a[^>]*href=["']([^"']+)["'][^>]*>/i);
        var titleMatch = block.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i) || 
                         block.match(/class=["'][^"']*title[^"']*["'][^>]*>([^<]+)/i);

        if (hrefMatch && titleMatch) {
          var href = hrefMatch[1];
          if (href.indexOf('http') !== 0) href = BASE_URL + href;
          results.push({
            url: href,
            title: titleMatch[1].trim()
          });
        }
      }

      console.log("[FaselHD] Search results: " + results.length);
      return results;
    } catch (e) {
      console.log("[FaselHD] Search error: " + e.message);
      return [];
    }
  });
}

function getEpisodeUrl(seriesUrl, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    try {
      console.log("[FaselHD] Loading series page: " + seriesUrl);
      var response = yield safeFetch(seriesUrl, {
        headers: {
          "User-Agent": UA,
          "Referer": BASE_URL + "/"
        }
      }, FETCH_TIMEOUT);

      if (!response.ok) return null;
      var html = yield response.text();

      // Try epAll div
      var epAllRegex = /<div[^>]*id=["']epAll["'][^>]*>[\s\S]*?<\/div>/i;
      var epAllMatch = html.match(epAllRegex);
      if (epAllMatch) {
        var epLinkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
        var epMatch;
        while ((epMatch = epLinkRegex.exec(epAllMatch[0])) !== null) {
          var epTitle = epMatch[2];
          var epHref = epMatch[1];
          var epNumStr = String(episodeNum);
          var paddedEp = String(episodeNum).padStart(2, '0');
          if (epTitle.indexOf(epNumStr) !== -1 || epTitle.indexOf(paddedEp) !== -1 ||
              epTitle.indexOf("الحلقة " + epNumStr) !== -1 || epTitle.indexOf("الحلقة " + paddedEp) !== -1) {
            if (epHref.indexOf('http') !== 0) epHref = BASE_URL + epHref;
            console.log("[FaselHD] Found episode URL: " + epHref);
            return epHref;
          }
        }
      }

      // Fallback: direct regex
      var directRegex = new RegExp('<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*(?:الحلقة|Episode)\\s*0?' + episodeNum + '[^<]*<', 'i');
      var directMatch = html.match(directRegex);
      if (directMatch) {
        var href = directMatch[1];
        if (href.indexOf('http') !== 0) href = BASE_URL + href;
        return href;
      }

      return null;
    } catch (e) {
      console.log("[FaselHD] Episode error: " + e.message);
      return null;
    }
  });
}

function resolveIframe(iframeUrl, referer) {
  return __async(this, null, function* () {
    try {
      console.log("[FaselHD] Resolving iframe: " + iframeUrl.substring(0, 80));
      var response = yield safeFetch(iframeUrl, {
        headers: {
          "User-Agent": UA,
          "Referer": referer || BASE_URL + "/",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      }, FETCH_TIMEOUT);

      if (!response.ok) {
        console.log("[FaselHD] Iframe HTTP " + response.status);
        return [];
      }

      var html = yield response.text();
      var m3u8s = extractM3u8FromHtml(html);
      console.log("[FaselHD] Iframe m3u8s: " + m3u8s.length);
      return m3u8s;
    } catch (e) {
      console.log("[FaselHD] Iframe error: " + e.message);
      return [];
    }
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";

    console.log("[FaselHD] === " + type + " tmdbId=" + tmdbId + " s=" + season + " e=" + episode + " ===");

    try {
      // Step 1: Get title from TMDB
      var title = yield getTMDBTitle(tmdbId, mediaType);
      if (!title) {
        console.log("[FaselHD] FAILED: No TMDB title");
        return [];
      }

      // Step 2: Search FaselHD
      var searchResults = yield searchFaselHD(title);
      if (searchResults.length === 0) {
        console.log("[FaselHD] FAILED: No search results");
        return [];
      }

      // Step 3: Get page URL
      var pageUrl = searchResults[0].url;
      console.log("[FaselHD] Page URL: " + pageUrl);

      // For series, get episode URL
      if (type === "series" && season && episode) {
        var epUrl = yield getEpisodeUrl(pageUrl, season, episode);
        if (epUrl) pageUrl = epUrl;
      }

      // Step 4: Load page and extract iframes
      var pageResponse = yield safeFetch(pageUrl, {
        headers: {
          "User-Agent": UA,
          "Referer": BASE_URL + "/"
        }
      }, FETCH_TIMEOUT);

      if (!pageResponse.ok) {
        console.log("[FaselHD] Page HTTP " + pageResponse.status);
        return [];
      }

      var pageHtml = yield pageResponse.text();
      var iframes = extractIframes(pageHtml);
      console.log("[FaselHD] Iframes found: " + iframes.length);

      // Step 5: Resolve iframes
      var allM3u8s = [];
      for (var i = 0; i < iframes.length; i++) {
        var m3u8s = yield resolveIframe(iframes[i], pageUrl);
        allM3u8s = allM3u8s.concat(m3u8s);
      }

      // Also check page itself for direct m3u8
      var directM3u8s = extractM3u8FromHtml(pageHtml);
      allM3u8s = allM3u8s.concat(directM3u8s);

      // Step 6: Filter 1080p
      var uniqueM3u8s = [];
      var seen = {};
      for (var j = 0; j < allM3u8s.length; j++) {
        if (!seen[allM3u8s[j]]) {
          seen[allM3u8s[j]] = true;
          uniqueM3u8s.push(allM3u8s[j]);
        }
      }

      var filtered = filter1080p(uniqueM3u8s);
      console.log("[FaselHD] 1080p streams: " + filtered.length);

      // Step 7: Format for Nuvio
      var result = filtered.map(function(url, idx) {
        return {
          name: "FaselHD 1080p",
          title: "1080p",
          url: url,
          quality: "1080p",
          headers: {
            "User-Agent": UA,
            "Referer": pageUrl,
            "Origin": BASE_URL
          }
        };
      });

      console.log("[FaselHD] === Done: " + result.length + " streams in " + (Date.now() - t0) + "ms ===");
      return result;

    } catch (error) {
      console.log("[FaselHD] CRITICAL ERROR: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
