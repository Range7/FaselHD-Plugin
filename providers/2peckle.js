// language: JavaScript, file: 2peckle_enhanced.js, runtime: Node.js / React Native (Hermes-safe)
// *الاختيار النهائي: أكبر ستريم 4K وأكبر ستريم 1080P فقط — العنوان يعرض الحجم بوضوح*

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

// ── Token مشفر (نفس الأصلي) ───────────────────────────────────────────────
function _dT() {
  var obf = "f15480b24f83d67c04211389c46a87dcde5692f409317c31fff16abe844f" +
    "80c21cde05490786fd459cbf4aaeca7d056b259adec27bbe855792dd7f30" +
    "404af1";
  var bytes = [];
  var pairIdx = 0;
  for (var i = 0; i < obf.length; i += 2) {
    var b = parseInt(obf.substring(i, i + 2), 16);
    pairIdx++;
    if (pairIdx % 17 === 0) continue;
    bytes.push(b);
  }
  var key = [0xa7, 0x3f, 0xd2, 0xe8, 0x1b, 0xc5, 0x90, 0x4e, 0x66, 0x11, 0x77, 0xcc];
  var xored = "";
  for (var i = 0; i < bytes.length; i++) {
    xored += String.fromCharCode(bytes[i] ^ key[i % key.length]);
  }
  try {
    if (typeof atob !== "undefined") return atob(xored);
    else if (typeof Buffer !== "undefined") return Buffer.from(xored, "base64").toString("utf8");
    else {
      var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      var out = "";
      var j = 0;
      while (j < xored.length) {
        var e1 = chars.indexOf(xored.charAt(j++));
        var e2 = chars.indexOf(xored.charAt(j++));
        var e3 = chars.indexOf(xored.charAt(j++));
        var e4 = chars.indexOf(xored.charAt(j++));
        var c1 = (e1 << 2) | (e2 >> 4);
        var c2 = ((e2 & 15) << 4) | (e3 >> 2);
        var c3 = ((e3 & 3) << 6) | e4;
        out += String.fromCharCode(c1);
        if (e3 !== 64) out += String.fromCharCode(c2);
        if (e4 !== 64) out += String.fromCharCode(c3);
      }
      return out;
    }
  } catch (e) {
    console.log("[2Peckle] Token decode error: " + e.message);
    return "";
  }
}

// ── HTTP مع Timeout ────────────────────────────────────────────────────────
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

// ── TMDB: جلب IMDB ID ─────────────────────────────────────────────────────
function getIMDBId(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var tmdbType = mediaType === "movie" ? "movie" : "tv";
    var url = TMDB_BASE + "/" + tmdbType + "/" + tmdbId + "/external_ids?api_key=" + TMDB_API_KEY;
    try {
      var r = yield safeFetch(url, null, 8e3);
      if (!r.ok) { console.log("[2Peckle] TMDB HTTP " + r.status); return null; }
      var d = yield r.json();
      return d.imdb_id || null;
    } catch (e) {
      console.log("[2Peckle] TMDB error: " + (e.message || e));
      return null;
    }
  });
}

// ── Config: تفعيل 4K و 1080p ─────────────────────────────────────────────
function buildConfig() {
  return {
    auth_token: _dT(),
    source_2peckle: true,
    res_4k: true,
    res_1080: true
  };
}

function encodeConfig(config) {
  return encodeURIComponent(JSON.stringify(config));
}

// ═════════════════════════════════════════════════════════════════════════
// أدوات استخراج المعلومات
// ═════════════════════════════════════════════════════════════════════════

var AUDIO_TABLE = [
  [/ddp.?51.*truehd.*71|truehd.*71.*ddp.?51/i, "DDP 5.1 + TrueHD 7.1"],
  [/ddp.?51.*ddp.?71|ddp.?71.*ddp.?51/i, "DDP 5.1 + DDP 7.1"],
  [/ddp.?51.*aac.?71|aac.?71.*ddp.?51/i, "DDP 5.1 + AAC 7.1"],
  [/ddp.?51/i, "DDP 5.1"],
  [/truehd/i, "TrueHD 7.1"],
  [/aac.*71|71.*aac/i, "AAC 7.1"],
  [/aac/i, "AAC 5.1"],
  [/ac3.*51|51.*ac3/i, "AC3 5.1"],
  [/eac3/i, "EAC3"],
  [/dts.*hd/i, "DTS-HD"],
  [/dts/i, "DTS"],
  [/mp3/i, "MP3"]
];

function extractQualityLabel(text) {
  var m = text.match(/\b(2160p|4K|1080p|720p|480p|360p)\b/i);
  if (!m) return "Unknown";
  var q = m[1].toLowerCase();
  if (q === "2160p" || q === "4k") return "4K";
  if (q === "1080p") return "1080P";
  if (q === "720p") return "720P";
  if (q === "480p") return "480P";
  return m[1];
}

function extractSizeMB(text) {
  if (!text) return 0;
  text = text.toLowerCase();
  var tbMatch = text.match(/(\d+\.?\d*)\s*tb/);
  if (tbMatch) return parseFloat(tbMatch[1]) * 1024 * 1024;
  var gbMatch = text.match(/(\d+\.?\d*)\s*gb/);
  if (gbMatch) return parseFloat(gbMatch[1]) * 1024;
  var mbMatch = text.match(/(\d+\.?\d*)\s*mb/);
  if (mbMatch) return parseFloat(mbMatch[1]);
  return 0;
}

function extractSizeString(text) {
  if (!text) return "";
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
  if (/upstream/.test(hostname)) return "UpStream";
  if (/vidoza/.test(hostname)) return "Vidoza";
  if (/cdn/.test(hostname)) return "CDN";
  if (/cloudflare/.test(hostname) || /r2\.dev/.test(hostname)) return "Cloudflare";
  if (/workers\.dev/.test(hostname)) return "Cloudflare Workers";
  if (/pengu/.test(hostname)) return "Pengu";
  return hostname.replace(/^www\./, "") || "Direct";
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

function calcMbps(sizeMB, runtimeMinutes) {
  if (!sizeMB || !runtimeMinutes) return null;
  var bits = sizeMB * 1024 * 1024 * 8;
  var seconds = runtimeMinutes * 60;
  return (bits / seconds / 1000000).toFixed(1) + " Mbps";
}

// ── تنسيق الحجم بشكل موحد ────────────────────────────────────────────────
function formatSize(sizeMB) {
  if (!sizeMB || sizeMB <= 0) return "";
  if (sizeMB >= 1024) return (sizeMB / 1024).toFixed(1) + " GB";
  return Math.round(sizeMB) + " MB";
}

// ── إثراء معلومات كل ستريم ──────────────────────────────────────────────
function enrichStream(s, meta) {
  var rawTitle = s.title || s.name || "";
  var url = s.url || "";
  var combined = (rawTitle + " " + (s.name || "") + " " + url).toLowerCase();
  var fullText = rawTitle + " " + (s.name || "");

  var quality = extractQualityLabel(fullText);
  var qualityUp = quality.toUpperCase();

  var sizeStr = extractSizeString(fullText);
  if (!sizeStr) sizeStr = extractSizeString(url);
  var sizeMB = extractSizeMB(sizeStr || fullText);
  var sizeDisplay = formatSize(sizeMB);

  var langParts = [];
  if (/\b(?:english|eng)\b/.test(combined)) langParts.push("English");
  if (/\bhindi\b/.test(combined)) langParts.push("Hindi");
  if (/\btamil\b/.test(combined)) langParts.push("Tamil");
  if (/\btelugu\b/.test(combined)) langParts.push("Telugu");
  if (/\barabic\b/.test(combined)) langParts.push("Arabic");
  if (/\bspanish\b/.test(combined)) langParts.push("Spanish");
  if (/\bfrench\b/.test(combined)) langParts.push("French");
  if (/\bgerman\b/.test(combined)) langParts.push("German");
  if (/\bjapanese\b/.test(combined)) langParts.push("Japanese");
  if (/\bkorean\b/.test(combined)) langParts.push("Korean");
  if (/\bchinese\b/.test(combined)) langParts.push("Chinese");
  if (/\bturkish\b/.test(combined)) langParts.push("Turkish");
  if (/\brussian\b/.test(combined)) langParts.push("Russian");
  if (/\bdual\b/.test(combined)) langParts.push("Dual Audio");
  if (/\bmulti\b/.test(combined)) langParts.push("Multi Audio");
  if (langParts.length === 0) langParts.push("English");

  var source = "WEB-DL";
  var isRemux = false;
  if (/\bremux\b/.test(combined)) { source = "Blu-ray"; isRemux = true; }
  else if (/\bblu[-\s]?ray\b/.test(combined)) source = "Blu-ray";
  else if (/\b(?:webrip|hdrip)\b/.test(combined)) source = "WEB-Rip";
  else if (/\bdvd\b/.test(combined)) source = "DVD";
  else if (/\bhdtv\b/.test(combined)) source = "HDTV";
  else if (/\bcam\b/.test(combined)) source = "CAM";

  var hdrTag = "";
  if (/\b(?:hdr10\+|hdr10p)\b/.test(combined)) hdrTag = "HDR10+";
  else if (/\bhdr10\b/.test(combined)) hdrTag = "HDR10";
  else if (/\bhdr\b/.test(combined)) hdrTag = "HDR";
  else if (/\bsdr\b/.test(combined)) hdrTag = "SDR";
  var dvTag = /\b(?:dv|dolby\s*vision)\b/.test(combined) ? "DV" : "";
  var bit10Tag = /\b10bit\b/.test(combined) ? "10Bit" : "";

  var codec = "H.264";
  if (/\b(?:hevc|x265|265|h265)\b/.test(combined)) codec = "H.265";
  else if (/\bav1\b/.test(combined)) codec = "AV1";
  else if (/\bvp9\b/.test(combined)) codec = "VP9";
  if (qualityUp === "4K" || qualityUp === "2160P") codec = "H.265";

  var audio = "AAC 5.1";
  for (var i = 0; i < AUDIO_TABLE.length; i++) {
    if (AUDIO_TABLE[i][0].test(combined)) { audio = AUDIO_TABLE[i][1]; break; }
  }
  if (/\batmos\b/.test(combined)) audio += " Atmos";

  var fps = extractFps(fullText);
  var host = pickHost(url);
  var runtime = 120;
  var mbps = calcMbps(sizeMB, runtime);

  // العنوان الرئيسي: الجودة + الحجم فقط
  var mainTitle = "2Peckle " + qualityUp + (sizeDisplay ? " " + sizeDisplay : "");

  var lineA = langParts.join(" • ");

  var lineBParts = [source, isRemux ? "REMUX" : "", host, mbps || "", fps];
  var lineB = "";
  for (var bi = 0; bi < lineBParts.length; bi++) {
    if (lineBParts[bi]) {
      if (lineB) lineB += " • ";
      lineB += lineBParts[bi];
    }
  }

  var lineCParts = [bit10Tag, dvTag, hdrTag, codec, audio];
  var lineC = "";
  for (var ci = 0; ci < lineCParts.length; ci++) {
    if (lineCParts[ci]) {
      if (lineC) lineC += " • ";
      lineC += lineCParts[ci];
    }
  }

  var streamTitle = "";
  var streamTitleParts = [lineA, lineB, lineC];
  for (var si = 0; si < streamTitleParts.length; si++) {
    if (streamTitleParts[si]) {
      if (streamTitle) streamTitle += "\n";
      streamTitle += streamTitleParts[si];
    }
  }

  var qualityScore = qualityUp === "4K" ? 4000 : qualityUp === "2160P" ? 4000 :
                     qualityUp === "1080P" ? 3000 : qualityUp === "720P" ? 2000 :
                     qualityUp === "480P" ? 1000 : 500;
  var sizeScore = Math.round((sizeMB || 0));
  var totalScore = qualityScore + sizeScore;
  var sortTag = getInvertedSortTag(totalScore, 999999);

  var headers = {
    "User-Agent": UA,
    "Referer": "https://pengu.uk/",
    "Origin": "https://pengu.uk"
  };
  var bh = s.behaviorHints || {};
  var proxyHeaders = bh.proxyHeaders || {};
  var reqHeaders = proxyHeaders.request || {};
  for (var k in reqHeaders) {
    if (Object.prototype.hasOwnProperty.call(reqHeaders, k)) {
      headers[k] = reqHeaders[k];
    }
  }

  return {
    name: sortTag + mainTitle,
    title: mainTitle,
    size: streamTitle,
    url: url,
    quality: qualityUp,
    _sizeMB: sizeMB,
    headers: headers,
    behaviorHints: {
      notWebReady: false,
      proxyHeaders: { request: headers }
    }
  };
}

// ── اختيار الأكبر حجماً لكل جودة ────────────────────────────────────────
function pickLargestPerQuality(streams) {
  var best4K = null;
  var best1080 = null;

  for (var i = 0; i < streams.length; i++) {
    var s = streams[i];
    if (s.quality === "4K") {
      if (!best4K || s._sizeMB > best4K._sizeMB) best4K = s;
    } else if (s.quality === "1080P") {
      if (!best1080 || s._sizeMB > best1080._sizeMB) best1080 = s;
    }
  }

  var result = [];
  if (best4K) result.push(best4K);
  if (best1080) result.push(best1080);
  return result;
}

// ── جلب الستريمات: 4K و 1080P فقط ──────────────────────────────────────
function getPenguStreams(imdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var config = buildConfig();
    var configEncoded = encodeConfig(config);
    var se = Number(season || 1);
    var ep = Number(episode || 1);

    var endpoint;
    if (mediaType === "movie") {
      endpoint = "/stream/movie/" + imdbId + ".json";
    } else {
      endpoint = "/stream/series/" + imdbId + ":" + se + ":" + ep + ".json";
    }

    var url = PENGU_BASE + "/" + configEncoded + endpoint;
    console.log("[2Peckle] URL: " + url.substring(0, 100) + "...");

    try {
      var r = yield safeFetch(url, {
        headers: {
          "Accept": "application/json",
          "Referer": "https://pengu.uk/",
          "Origin": "https://pengu.uk"
        }
      }, 12e3);

      if (!r.ok) {
        console.log("[2Peckle] PenguPlay HTTP " + r.status);
        return [];
      }

      var d = yield r.json();
      var allStreams = d.streams || [];
      console.log("[2Peckle] Total streams: " + allStreams.length);

      var peckle = [];
      for (var i = 0; i < allStreams.length; i++) {
        var n = (allStreams[i].name || "").toLowerCase();
        if (n.indexOf("2peckle") !== -1) {
          peckle.push(allStreams[i]);
        }
      }
      console.log("[2Peckle] 2Peckle streams: " + peckle.length);

      var enriched = [];
      for (var j = 0; j < peckle.length; j++) {
        var s = enrichStream(peckle[j], null);
        if (s && (s.quality === "4K" || s.quality === "1080P")) {
          enriched.push(s);
        }
      }

      console.log("[2Peckle] Filtered (4K/1080P): " + enriched.length);

      var largest = pickLargestPerQuality(enriched);
      console.log("[2Peckle] Final: " + largest.length + " streams (largest per quality)");

      return largest;

    } catch (e) {
      console.log("[2Peckle] PenguPlay error: " + (e.message || e));
      return [];
    }
  });
}

// ── ترتيب: 4K أولاً ─────────────────────────────────────────────────────
var QUALITY_RANK = { "4K": 5, "2160P": 5, "1080P": 4, "720P": 3, "480P": 2, "CAM": 1 };

function sortStreams(streams) {
  return streams.slice().sort(function(a, b) {
    var qa = QUALITY_RANK[a.quality] || 0;
    var qb = QUALITY_RANK[b.quality] || 0;
    if (qa !== qb) return qb - qa;
    return 0;
  });
}

// ── منع التكرار ──────────────────────────────────────────────────────────
function dedupByUrl(streams) {
  var seen = {};
  var out = [];
  for (var i = 0; i < streams.length; i++) {
    var s = streams[i];
    if (!s || !s.url || seen[s.url]) continue;
    seen[s.url] = true;
    out.push(s);
  }
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    var t0 = Date.now();
    console.log("[2Peckle] START: tmdbId=" + tmdbId + " type=" + mediaType);

    try {
      var tmdbMediaType = mediaType === "anime" ? "tv" : mediaType;
      var imdbId = yield getIMDBId(tmdbId, tmdbMediaType);

      if (!imdbId) {
        console.log("[2Peckle] No IMDB ID");
        return [];
      }

      var streams = yield getPenguStreams(imdbId, mediaType, season, episode);
      var sorted = sortStreams(dedupByUrl(streams));
      console.log("[2Peckle] END: " + sorted.length + " streams in " + (Date.now() - t0) + "ms");
      return sorted;
    } catch (err) {
      console.log("[2Peckle] FATAL: " + (err.message || err));
      return [];
    }
  });
}

module.exports = { getStreams: getStreams };
