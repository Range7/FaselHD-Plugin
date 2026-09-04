// a111477 — 111477 provider for Nuvio (self-contained, no TMDB lookup)
// Direct fetch from 111477 service, filters 1080p only, extracts rich metadata.
// Info displayed below server name (multi-line name like 4KHDHub).

var SERVICE_ORIGIN = 'https://st.111477.xyz';
var DEFAULT_HOST = 'https://a.111477.xyz/';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
var HEADERS = { 'User-Agent': UA, 'Accept': 'application/json' };

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

function parseQuality(title) {
  var t = String(title || '').toUpperCase();
  if (t.indexOf('2160') !== -1 || t.indexOf('4K') !== -1 || t.indexOf('UHD') !== -1) return '4K';
  if (t.indexOf('1080') !== -1 || t.indexOf('FHD') !== -1) return '1080p';
  if (t.indexOf('720') !== -1) return '720p';
  if (t.indexOf('480') !== -1) return '480p';
  return 'Auto';
}

function parseSize(title) {
  var m = String(title || '').match(/\[a11\s+([\d.]+)\s*(GB|MB)\]/i);
  if (!m) m = String(title || '').match(/([\d.]+)\s*(GB|MB)/i);
  return m ? m[1] + ' ' + m[2].toUpperCase() : '';
}

function parseCodec(title) {
  var t = String(title || '').toUpperCase();
  if (t.indexOf('HEVC') !== -1 || t.indexOf('X265') !== -1 || t.indexOf('H.265') !== -1) return 'HEVC';
  if (t.indexOf('H264') !== -1 || t.indexOf('X264') !== -1 || t.indexOf('H.264') !== -1) return 'H.264';
  if (t.indexOf('AV1') !== -1) return 'AV1';
  return '';
}

function parseAudio(title) {
  var t = String(title || '').toUpperCase();
  if (t.indexOf('TRUEHD') !== -1 && t.indexOf('ATMOS') !== -1) return 'TrueHD Atmos 7.1';
  if (t.indexOf('ATMOS') !== -1) return 'Atmos';
  if (t.indexOf('DDP') !== -1 || t.indexOf('DD+') !== -1) return 'DDP 5.1';
  if (t.indexOf('AAC') !== -1) {
    var m = t.match(/AAC\s*([\d.]+)/i);
    return m ? 'AAC ' + m[1] : 'AAC';
  }
  if (t.indexOf('AC3') !== -1) return 'AC3';
  return '';
}

function parseSource(title) {
  var t = String(title || '').toUpperCase();
  if (t.indexOf('REMUX') !== -1) return 'BluRay REMUX';
  if (t.indexOf('BLURAY') !== -1 || t.indexOf('BLU-RAY') !== -1) return 'BluRay';
  if (t.indexOf('WEBDL') !== -1 || t.indexOf('WEB-DL') !== -1) return 'WEB-DL';
  if (t.indexOf('WEBRIP') !== -1) return 'WEBRip';
  if (t.indexOf('HDRIP') !== -1) return 'HDRip';
  return '';
}

function parseLangs(title) {
  var t = String(title || '').toUpperCase();
  var langs = [];
  if (/\bEN\b/.test(t) || t.indexOf('ENGLISH') !== -1) langs.push('English');
  if (/\bJA\b/.test(t) || t.indexOf('JAPANESE') !== -1) langs.push('Japanese');
  if (/\bHI\b/.test(t) || t.indexOf('HINDI') !== -1) langs.push('Hindi');
  if (/\bAR\b/.test(t) || t.indexOf('ARABIC') !== -1) langs.push('Arabic');
  if (/\bFR\b/.test(t) || t.indexOf('FRENCH') !== -1) langs.push('French');
  if (/\bES\b/.test(t) || t.indexOf('SPANISH') !== -1) langs.push('Spanish');
  return langs.length ? langs.join(' + ') : '';
}

function makeStream(it) {
  var title = it.title || it.name || '111477';
  var url = it.url;
  if (!url || String(url).indexOf('http') !== 0) return null;

  var quality = parseQuality(title);
  if (quality === 'Auto') quality = '1080p';
  if (quality !== '1080p') return null;

  var size = parseSize(title);
  var codec = parseCodec(title);
  var audio = parseAudio(title);
  var source = parseSource(title);
  var langs = parseLangs(title);

  var mainLine = ['111477', quality, size].filter(Boolean).join(' • ');

  var details = [];
  if (source) details.push(source);
  if (codec) details.push(codec);
  if (audio) details.push(audio);
  if (langs) details.push(langs);
  var detailsLine = details.join(' • ');

  var nameLines = [mainLine];
  if (detailsLine) nameLines.push(detailsLine);
  var fullName = nameLines.join('\n');

  return {
    name: fullName,
    title: mainLine,
    url: url,
    quality: quality,
    headers: HEADERS,
    _sizeRaw: size,
    _host: '111477'
  };
}

function getStreams(tmdbId, mediaType, season, episode) {
  var addonBase = manifestBaseUrl();
  var isTv = mediaType === 'tv';
  var rawId = String(tmdbId || '').replace(/^tt/, '');

  var ids = [];
  if (String(tmdbId || '').indexOf('tt') === 0) ids.push(String(tmdbId));
  ids.push('tmdb:' + rawId);

  var promises = [];

  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var ep = isTv
      ? addonBase + '/stream/series/' + id + ':' + (season || 1) + ':' + (episode || 1) + '.json'
      : addonBase + '/stream/movie/' + id + '.json';

    var p = fetch(ep, { headers: HEADERS })
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
        var s = makeStream(streams[j]);
        if (s && !seen[s.url]) {
          seen[s.url] = true;
          out.push(s);
        }
      }
    }

    out.sort(function (a, b) {
      return parseFloat(b._sizeRaw) - parseFloat(a._sizeRaw);
    });

    return out;
  }).catch(function () { return []; });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = getStreams;
} else if (typeof window !== 'undefined') {
  window.getStreams = getStreams;
}
