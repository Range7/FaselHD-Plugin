// a111477 — 111477 provider for Nuvio (self-contained, Promise-based)
// Tries IMDb id first, then TMDB id. Returns 1080p streams.

var SERVICE_ORIGIN = 'https://st.111477.xyz';
var DEFAULT_HOST = 'https://a.111477.xyz/';
var TMDB_API_KEY = 'b3556f3b206e16f82df4d1f6fd4545e6';
var TMDB_DIRECT = 'https://api.themoviedb.org/3';
var TMDB_PROXY = 'https://db.speedracelight.com/3';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
var HEADERS = { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*' };

function b64url(str) {
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) bytes.push(192 | (c >> 6), 128 | (c & 63));
    else bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
  }
  var out = '';
  for (var j = 0; j < bytes.length; j += 3) {
    var b0 = bytes[j];
    var b1 = j + 1 < bytes.length ? bytes[j + 1] : 0;
    var b2 = j + 2 < bytes.length ? bytes[j + 2] : 0;
    out += B64.charAt(b0 >> 2);
    out += B64.charAt(((b0 & 3) << 4) | (b1 >> 4));
    out += j + 1 < bytes.length ? B64.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '=';
    out += j + 2 < bytes.length ? B64.charAt(b2 & 63) : '=';
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fetchT(url, ms) {
  return new Promise(function (resolve, reject) {
    var finished = false;
    var timer = setTimeout(function () { if (!finished) { finished = true; reject(new Error('timeout')); } }, ms || 10000);
    fetch(url, { headers: HEADERS })
      .then(function (res) {
        if (!finished) { finished = true; clearTimeout(timer); resolve(res); }
      })
      .catch(function (e) { if (!finished) { finished = true; clearTimeout(timer); reject(e); } });
  });
}

function resolveImdb(tmdbId, mediaType) {
  var kind = mediaType === 'tv' ? 'tv' : 'movie';
  var urls = [
    TMDB_DIRECT + '/' + kind + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids',
    TMDB_PROXY + '/' + kind + '/' + tmdbId + '?append_to_response=external_ids'
  ];
  function tryNext(i) {
    if (i >= urls.length) return Promise.resolve(null);
    return fetchT(urls[i], 8000)
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (data) {
        var imdbId = (data && data.external_ids && data.external_ids.imdb_id) || (data && data.imdb_id) || null;
        return imdbId ? imdbId : tryNext(i + 1);
      })
      .catch(function () { return tryNext(i + 1); });
  }
  return tryNext(0);
}

function manifestBaseUrl() {
  var host = DEFAULT_HOST;
  var sort = 'file-desc';
  var limit = 3;
  var config = host.trim();
  if (!config.endsWith('/')) config += '/';
  if (sort && sort !== 'none') config += '::sort=' + sort;
  if (limit > 0 && limit !== 5) config += '::limit=' + limit;
  return SERVICE_ORIGIN + '/config/' + b64url(config);
}

function parseQuality(label) {
  var l = String(label || '').toUpperCase();
  if (l.indexOf('2160') !== -1 || l.indexOf('4K') !== -1 || l.indexOf('UHD') !== -1) return '4K';
  if (l.indexOf('1080') !== -1 || l.indexOf('FHD') !== -1 || l.indexOf('FULL HD') !== -1) return '1080p';
  if (l.indexOf('720') !== -1) return '720p';
  if (l.indexOf('480') !== -1) return '480p';
  return 'Auto';
}

function getStreams(tmdbId, mediaType, season, episode) {
  return resolveImdb(tmdbId, mediaType).then(function (imdbId) {
    var ids = [];
    if (imdbId && imdbId.indexOf('tt') === 0) ids.push(imdbId);
    ids.push('tmdb:' + tmdbId);

    var addonBase = manifestBaseUrl();
    var promises = [];

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var ep = mediaType === 'tv'
        ? addonBase + '/stream/series/' + id + ':' + (season || 1) + ':' + (episode || 1) + '.json'
        : addonBase + '/stream/movie/' + id + '.json';

      var p = fetchT(ep, 15000)
        .then(function (res) { if (!res.ok) return []; return res.json(); })
        .then(function (data) { return (data && data.streams) || []; })
        .catch(function () { return []; });
      promises.push(p);
    }

    return Promise.all(promises).then(function (groups) {
      var out = [];
      var seen = {};
      for (var g = 0; g < groups.length; g++) {
        var streams = groups[g];
        for (var j = 0; j < streams.length; j++) {
          var it = streams[j];
          var url = it && it.url;
          if (!url || String(url).indexOf('http') !== 0 || seen[url]) continue;
          var label = it.title || it.name || '111477';
          var quality = parseQuality(label);
          if (quality === 'Auto') quality = '1080p';
          if (quality !== '1080p') continue;
          seen[url] = true;
          out.push({
            name: it.name || '111477',
            title: label,
            url: url,
            quality: quality,
            headers: HEADERS
          });
        }
      }
      return out;
    });
  }).catch(function () { return []; });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = getStreams;
} else if (typeof window !== 'undefined') {
  window.getStreams = getStreams;
}
