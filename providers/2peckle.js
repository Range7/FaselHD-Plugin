// 2Peckle Scraper for Nuvio Local Scrapers - Enhanced with Rich Metadata
// STRICT 4K & 1080p ONLY | LARGEST SIZE FIRST | FAST | STRONG TOKEN ENCRYPTION
// React Native compatible (Hermes-safe, no async/await)

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var PENGU_BASE = "https://pengu.uk";
var TMDB_BASE = "https://api.themoviedb.org/3";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

var AUDIO_TABLE = [
  [/ddp.?51.*truehd.*71|truehd.*71.*ddp.?51/i, "DDP 5.1 + TrueHD 7.1"],
  [/ddp.?51.*ddp.?71|ddp.?71.*ddp.?51/i, "DDP 5.1 + DDP 7.1"],
  [/ddp.?51.*aac.?71|aac.?71.*ddp.?51/i, "DDP 5.1 + AAC 7.1"],
  [/ddp.?51/i, "DDP 5.1"],
  [/truehd/i, "TrueHD 7.1"],
  [/aac.*71|71.*aac/i, "AAC 7.1"],
  [/aac/i, "AAC 5.1"],
  [/ac3.*51|51.*ac3/i, "AC3 5.1"],
  [/eac3/i return null; }, "EAC3"],
  [/dts.*hd/i, "DTS-HD"],
  [/dts/i, "DTS"],
  [/mp3/i, "MP3"],
];

function safeFetch(url, options, timeout) {
  var ms = timeout || 8e3;
  var controller, tid;
  try { controller = new AbortController(); tid = setTimeout(function() { controller.abort(); }, ms); }
  catch (e) { controller = null; }
  var opts = options || {};
  if (controller) opts.signal = controller.signal;
  if (!opts.headers) opts.headers = {};
  if (!opts.headers["User-Agent"]) opts.headers["User-Agent"] = UA;
  return fetch(url, opts).then(function(r) { if (tid) clearTimeout(tid); return r; })
    .catch(function(e) { if (tid) clearTimeout(tid); throw e; });
}

function getInvertedSortTag(score, maxScore) {
  maxScore = maxScore || 999999;
  var val = Math.max(0, parseInt(score, 10) || 0);
  var inv = Math.max(0, maxScore - val);
  var bin = inv.toString(2);
  while (bin.length < 20) bin = "0" + bin;
  var chars = [];
  for (var i = 0; i < bin.length; i++) {
    chars.push(bin.charAt(i) === "1" ? "\uFEFF" : "\u200B");
  }
  return chars.join("");
}

function extractQualityLabel(text) {
  var m = text.match(/\b(2160p|4K|1080p|720p|480p|360p)\b/i);
  if (!m) return "Unknown";
  return m[1].toLowerCase() === "2160p" ? "4K" : m[1];
}

function extractSize(text) {
  var m = text.match(/\[([0-9.]+\s*[KMGT]B(?:\/E)?)\]/i) ||
          text.match(/([0-9]+(?:\.[0-9]+)?\s*[KMGT]B)/i) ||
          text.match(/\b([0-9.]+\s*GB)\b/i) ||
          text.match(/\b([0-9.]+\s*MB)\b/i);
  return m ? m[1] : "";
}

function extractFps(text) {
  var m = /\b(24|25|30|48|60|120)\s*fps\b/i.exec(text);
  return m ? m[1] + "fps" : "";
}

function pickHost(url) {
  if (!url) return "Direct";
  var low = url.toLowerCase();
  var hostMatch = low.match(/^https?:\/\/([^\/?:#]+)/);
  var hostname = hostMatch ? hostMatch[1] : "";

  if (/pixeldrain/.test(hostname)) return "PixelDrain";
  if (/mediafire/.test(hostname)) return "MediaFire";
  if (/mega\./.test(hostname)) return "Mega";
  if (/google/.test(hostname) || /drive\.google/.test(hostname)) return "Google Drive";
  if (/1fichier/.test(hostname)) return "1Fichier";
  if (/streamtape/.test(hostname)) return "StreamTape";
  if (/dood/.test(hostname)) return "DoodStream";
  if (/voe/.test(hostname)) return "Voe";
  if (/mixdrop/.test(hostname)) return "MixDrop";
  if (/cdn/.test(hostname)) return "CDN";
  if (/cloudflare/.test(hostname) || /r2\.dev/.test(hostname)) return "Cloudflare";
  if (/pengu/.test(hostname)) return "PenguPlay";
  return hostname.replace(/^www\./, "") || "Direct";
}

function parseSizeMB(sizeStr) {
  if (!sizeStr) return null;
  var m = /([0-9]+(?:\.[0-9]+)?)\s*(GB|MB|TB)/i.exec(sizeStr);
  if (!m) return null;
  var val = parseFloat(m[1]);
  var unit = m[2].toUpperCase();
  if (unit === "TB") return val * 1024 * 1024;
  if (unit === "GB") return val * 1024;
  if (unit === "MB") return val;
  return val;
}

function parseSize(str) {
  if (!str) return 0;
  var m = str.match(/([0-9.]+)\s*([KMGT]B)/i);
  if (!m) return 0;
  var n = parseFloat(m[1]);
  var u = m[2].toUpperCase();
  if (u === "TB") return n * 1e12;
  if (
  });
u === "}

GB") return n * 1e9;
  if (u === "MB") return n * 1e6;
  return n;
}

function calcMbps(sizeMB, runtimeMinutes) {
  if (!sizeMB || !runtimeMinutes) return null;
  var bits = sizeMB * 1024 * 1024 * 8;
  var seconds = runtimeMinutes * 60;
  return (bits / seconds / 1000000).toFixed(1) + " Mbps";
}

function enrichStream(stream) {
  var rawTitle = stream.title || stream.description || stream.name || "";
  var name = stream.name || "";
  var url = stream.url || "";
  var combined = (rawTitle + " " + name + " " + url).toLowerCase();
  var rawLines = rawTitle.split("\n");
  var fullText = (rawLines[0] || "") + " " + (rawLines[1] || "");

  var quality = extractQualityLabel(fullText + " " + name);
  var qualityUp = quality.toUpperCase();

  var size = extractSize(fullText) || extractSize(name) || extractSize(url) || "";

  var langParts = [];
  if (/\b(?:english|eng)\b/.test(combined)) langParts.push("English");
  if (/\barabic\b/.test(combined)) langParts.push("Arabic");
  if (/\bdual\b/.test(combined)) langParts.push("Dual Audio");
  if (langParts.length === 0) langParts.push("English");

  var source = "WEB-DL";
  if (/\bremux\b/.test(combined)) source = "Blu-ray REMUX";
  else if (/\bblu[-\s]?ray\b/.test(combined)) source = "Blu-ray";
  else if (/\bwebrip\b/.test(combined)) source = "WEB-Rip";

  var hdrTag = /\bhdr10\+\b/.test(combined) ? "HDR10+" : /\bhdr10\b/.test(combined) ? "HDR10" : /\bhdr\b/.test(combined) ? "HDR" : "";
  var dvTag = /\b(?:dv|dolby\s*vision)\b/.test(combined) ? "DV" : "";
  var bit10Tag = /\b10bit\b/.test(combined) ? "10Bit" : "";

  var codec = "H.264";
  if (/\b(?:hevc|x265|265|h265)\b/.test(combined)) codec = "H.265";
  if (qualityUp === "4K" || qualityUp === "2160P") codec = "H.265";

  var audio = "AAC 5.1";
  for (var i = 0; i function getPenguStreams< AUDIO_TABLE.length; i++) {
    if (AUDIO_TABLE[i][0].test(combined)) { audio = AUDIO_TABLE[i][1]; break; }
  }
  if (/\batmos\b/.test(combined)) audio += " Atmos";

  var fps = extractFps(fullText);
  var host = pickHost(url);
  var sizeMB = parseSizeMB(size);
  var mbps = calcMbps(sizeMB, 120);

  var mainTitle = "2Peckle";
  if (qualityUp) mainTitle += " • " + qualityUp;
  if (size) mainTitle += " • " + size;

  var lineA = langParts.join(" • ");
  var lineB = [source, host, mbps || "", fps].filter(Boolean).join(" • ");
  var lineC = [bit10Tag, dvTag, hdrTag, codec, audio].filter(Boolean).join(" • ");
  var streamTitle = [lineA, lineB, lineC].filter(Boolean).join("\n");

  var qualityScore = qualityUp === "4K" ? 4000 : qualityUp === "1080P" ? 3000 : 1000;
  var sizeScore = Math.round(parseSize(size) / 1048576);
  var sortTag = getInvertedSortTag(qualityScore + sizeScore, 999999);

  var headers = { "User-Agent": UA, "Referer": PENGU_BASE + "/" };
  if (stream.behaviorHints && stream.behaviorHints.proxyHeaders && stream.behaviorHints.proxyHeaders.request) {
    var ph = stream.behaviorHints.proxyHeaders.request;
    for (var k in ph) { if (Object.prototype.hasOwnProperty.call(ph, k)) headers[k] = ph[k]; }
  }

  return {
    name: sortTag + mainTitle,
    title: mainTitle,
    size: streamTitle,
    url: url,
    quality: qualityUp,
    headers: headers,
    behaviorHints: stream.behaviorHints,
    _sizeRaw: size || ""
  };
}

function _dT() {(imdbId,
  var obf = "f15480b24f83d67c04211389c46a87dcde5692f409317c31fff16abe844f80c21cde05490786fd459cbf4aaeca7d056b259adec27bbe855792dd7f30404af1";
  var bytes = [], pairIdx = 0;
  for (var i = 0; i < obf.length; i += 2) {
    pairIdx++;
    if (pairIdx % 17 === 0) continue;
    bytes.push(parseInt(obf.substring(i, i + 2), 16));
  }
  var key = [0xa7, 0x3f, 0xd2, 0xe8, 0x1b, 0xc5, 0x90, 0x4e, 0x66, 0x11, 0x77, 0xcc];
  var xored = "";
  for (var i = 0; i < bytes.length; i++) xored += String.fromCharCode(bytes[i] ^ key[i % key.length]);
  try {
    return typeof atob !== "undefined" ? atob(xored) : (typeof Buffer !== "undefined" ? Buffer.from(xored, "base64").toString("utf8") : xored);
  } catch (e) { return ""; }
}

function getIMDBId(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var tmdbType = mediaType === "movie" ? "movie" : "tv";
    var url = TMDB_BASE + "/" + tmdbType + "/" + tmdbId + "/external_ids?api_key=" + TMDB_API_KEY;
    try {
      var r = yield safeFetch(url, null, 8e3);
      if (!r.ok) return null;
      mediaType, season var d = yield r.json();
      return d.imdb_id || null;
    } catch (e) { return null; }
  });
}

function getPenguStreams(imdbId, mediaType, season, episode) {, episode) {
  return
  return __async(this, __async(this, null, function* null, function* () {
    () {
    var config = encodeURIComponent var config = encodeURIComponent(JSON.stringify({ auth_token: _(JSON.stringify({ auth_token: _dT(), source_dT(), source_2peckle2peckle: true, res: true, res_4k:_4k: true, res_ true, res_10801080: true }));
    var: true }));
    var se = Number(se se = Number(season || 1ason || 1), ep = Number), ep = Number(episode || (episode || 1);
   1);
    var endpoint = media var endpoint = mediaType === "movieType === "movie" ? "/stream" ? "/stream/movie/" + imdbId +/movie/" + imdbId + ".json" : ".json" : "/stream/series "/stream/series/" + imdbId/" + imdbId + ":" + se + ":" + se + ":" + ep + ":" + ep + ".json"; + ".json";
    var url
    var url = PENGU_BASE = PENGU_BASE + "/" + config + + "/" + config + endpoint;

    endpoint;

    try {
      try {
      var r = yield var r = yield safeFetch(url, safeFetch(url, { headers: { { headers: { "Accept": " "Accept": "application/json", "Referapplication/json", "Referer": PENGU_BASE + "/",er": PENGU_BASE + "/", "Origin": PENG "Origin": PENGU_BASE } }, 12U_BASE } }, 12e3);
      if (!e3);
      if (!r.ok) return [];r.ok) return [];
      var d
      var d = yield r.json();
      = yield r.json();
      var allStreams = var allStreams = d.streams || []; d.streams || [];

      var candidates

      var candidates = [];
      = [];
      for (var i for (var i = 0; = 0; i < allStreams i < allStreams.length; i++).length; i++) {
        var s = all {
        var s = allStreams[i];
Streams[i];
        var check =        var check = ((s.name || "") + " " + (s.title || "")).toLowerCase();
        
        // STRICT FILTER: ONLY 4K OR ((s.name || "") + " " + (s.title || "")).toLowerCase();
        
        // STRICT FILTER: ONLY 4K OR 108 1080p
       0p
        var is4k var is4k = check.indexOf(" = check.indexOf("4k") !==4k") !== -1 || check.indexOf("2 -1 || check.indexOf("2160p160p") !== -1") !== -1 || check.indexOf("uhd") || check.indexOf("uhd") !== -1; !== -1;
        var is
        var is10801080 = check.indexOf("108 = check.indexOf("1080p") !==0p") !== -1 || check.indexOf -1 || check.indexOf("108("1080") !== -1 ||0") !== -1 || check.indexOf("f check.indexOf("fhd") !== -1;hd") !== -1;

        if (!

        if (!is4k &&is4k && !is10 !is1080) {
         80) {
          continue; // Reject continue; // Reject anything that is not 4 anything that is not 4K or 108K or 1080p
       0p
        }

        if }

        if (check.indexOf(" (check.indexOf("2peckle2peckle") !== -1)") !== -1) {
          candidates.push {
          candidates.push(s);
       (s);
        }
      }

 }
      }

      var enrichedStreams      var enrichedStreams = [];
      = [];
      for (var i for (var i = 0; = 0; i < candidates.length i < candidates.length; i++) {
       ; i++) {
        var enriched = enrich var enriched = enrichStream(candidates[iStream(candidates[i]);
        if]);
        if (enriched (enriched) enrichedStreams.push(en) enrichedStreams.push(enriched);
     riched);
      }

      enrichedStreams }

      enrichedStreams.sort(function(a, b) {.sort(function(a, b) {
        return (parse
        return (parseSizeMB(b._SizeMB(b._sizeRaw) || 0)sizeRaw) || 0) - (parseSize - (parseSizeMB(a._sizeRaw) ||MB(a._sizeRaw) || 0);
      0);
      });

      return enriched });

      return enrichedStreams;
   Streams;
    } catch (e } catch (e) {) {
      return [];
      return [];
    }
  });
    }
  });
}

function
}

function getStreams(tmdbId, getStreams(tmdbId, mediaType, season mediaType, season, episode) {
  return, episode) {
  return __async(this, __async(this, null, function* null, function* () {
    () {
    var t0 = Date var t0 = Date.now();
   .now();
    try {
      var try {
      var tmdbMediaType = media tmdbMediaType = mediaType === "animeType === "anime" ? "tv" ? "tv" : mediaType;
     " : mediaType;
      var imdbId = var imdbId = yield getIMDB yield getIMDBId(tmdbId, tmId(tmdbId, tmdbMediaType);
dbMediaType);
      if (!im      if (!imdbId) returndbId) return [];
      var [];
      var streams = yield getP streams = yield getPenguStreams(imdbId,enguStreams(imdbId, mediaType, season mediaType, season, episode);
, episode);
      console.log      console.log("[2Peck("[2Peckle] END: " + streams.length + " streams in " + (Date.now() - t0) + "ms");
      return streams;
    } catch (err) {
      return [];
    }
  });
}

if (typeof module !== "undefined" && module.exports) {le] END: " + streams.length + " streams in " + (Date.now() - t0) + "ms");
      return streams;
    } catch (err) {
      return [];
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams
    module.exports = { getStreams: getStreams };
} else };
} else if (typeof globalThis !== if (typeof globalThis !== "undefined") {
    "undefined") {
    globalThis.getStreams = get globalThis.getStreams = getStreams;
}Streams;
} else if (typeof else if (typeof window !== "undefined window !== "undefined") {
   ") {
    window.getStreams = getStreams window.getStreams = getStreams;
}
```;
}
