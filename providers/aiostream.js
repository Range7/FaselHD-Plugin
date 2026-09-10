/**
 * AIOStreams Provider for Nuvio — 4K/1080p ONLY + Accurate Metadata
 * Version: 1.4.0 (Guaranteed Largest from Each Host)
 *
 * Sources streams from AIOStreams
 * Filters: 4K + 1080p ONLY, Fast servers only
 * Dedup: From each host, keeps ONLY the largest size
 * Sorting: 4K (Largest -> Smallest), then 1080p (Largest -> Smallest)
 * Accuracy: Only shows verified information, no assumptions
 * Hermes-safe: no async/await, no const/let, no arrow functions
 */

"use strict";

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

var VERSION = "1.4.0";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var TMDB_API_KEY = "b3556f3b206e16f82df4d1f6fd4545e6";
var TMDB_DIRECT = "https://api.themoviedb.org/3";
var TMDB_PROXY = "https://db.speedracelight.com/3";

var AIOSTREAMS_BASE = "https://aiostreamso-youness.ufcfan.org/stremio/c084b129-0660-465c-9496-5617c07a5898/eyJpIjoiWGM5RldyY0xsQlkwZ3EzeG00dEVvUT09IiwiZSI6IkZjeGQ4ck5qWURqUzVTL3VBZGFLQ1hJWEtZSEc4Mm9qUWM0THVlMnVoSlE9IiwidCI6ImEifQ";

var ALLOWED_QUALITIES = { "4K": true, "2160P": true, "2160p": true, "1080P": true, "1080p": true };

var BLOCKED_SLOW_HOSTS = [
  "doodstream", "dood", "mixdrop", "streamtape", "vidoza", 
  "upstream", "voe", "fastdl", "sooti", "pengu"
];

var _metaCache = {};
var _tmdbPool = [TMDB_DIRECT, TMDB_PROXY];

// ═════════════════════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function log(key, value) {
  var suffix = value === undefined || value === null || value === "" ? "" : " " + String(value);
  console.log("[AIOStreams v" + VERSION + "] " + key + suffix);
}

function logFailure(reason, detail) {
  var suffix = detail ? " detail=" + String(detail) : "";
  console.log("[AIOStreams v" + VERSION + "] failure=" + reason + suffix);
}

function fetchT(url, opts, ms) {
  ms = ms || 10000;
  return Promise.race([
    fetch(url, opts || {}),
    new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error("timeout")); }, ms);
    })
  ]);
}

// ═════════════════════════════════════════════════════════════════════════════
// TMDB METADATA
// ═════════════════════════════════════════════════════════════════════════════

function resolveMeta(tmdbId, mediaType) {
  var kind = (mediaType === "tv" || mediaType === "series" || mediaType === "show") ? "tv" : "movie";
  var ck = kind + ":" + tmdbId;
  if (_metaCache[ck]) return Promise.resolve(_metaCache[ck]);

  function tryHost(idx) {
    if (idx >= _tmdbPool.length) return Promise.resolve(null);
    var base = _tmdbPool[idx];
    var withKey = base.indexOf("api.themoviedb.org") !== -1;
    var keyParam = withKey ? "&api_key=" + TMDB_API_KEY : "";
    var url = base + "/" + kind + "/" + tmdbId + "?append_to_response=external_ids" + keyParam;

    return fetchT(url, { headers: { "User-Agent": UA, "Accept": "application/json" } }, 6000)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (j) {
        var title = kind === "tv" ? (j.name || j.original_name) : (j.title || j.original_title);
        var dateStr = kind === "tv" ? j.first_air_date : j.release_date;
        var year = dateStr ? parseInt(String(dateStr).slice(0, 4), 10) : null;
        var imdbId = (j.external_ids && j.external_ids.imdb_id) || j.imdb_id || null;
        var meta = { 
          title: title, 
          year: year, 
          imdbId: imdbId, 
          kind: kind, 
          runtime: j.runtime || (kind === "tv" ? 45 : 120) 
        };
        _metaCache[ck] = meta;
        return meta;
      })
      .catch(function () { return tryHost(idx + 1); });
  }

  return tryHost(0);
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCURATE METADATA EXTRACTION
// ═════════════════════════════════════════════════════════════════════════════

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
  [/mp3/i, "MP3"],
];

function extractQualityLabel(text) {
  var t = String(text || "").toUpperCase();
  if (/\b(2160P|4K|UHD)\b/.test(t)) return "4K";
  if (/\b1080P\b/.test(t)) return "1080P";
  if (/\b720P\b/.test(t)) return "720P";
  if (/\b480P\b/.test(t)) return "480P";
  return null;
}

function extractSize(text) {
  text = String(text || "");
  var m = text.match(/\[([0-9.]+\s*[KMGT]B(?:\/E)?)\]/i);
  if (m) {
    var sizeStr = m[1];
    var sizeBytes = parseSize(sizeStr);
    if (sizeBytes >= 100000 && sizeBytes <= 100000000000) {
      return sizeStr;
    }
  }
  m = text.match(/(?<!\w)([0-9]+(?:\.[0-9]+)?\s*[KMGT]B)(?!\w)/i);
  if (m) {
    var sizeStr = m[1];
    var sizeBytes = parseSize(sizeStr);
    if (sizeBytes >= 100000 && sizeBytes <= 100000000000) {
      return sizeStr;
    }
  }
  return null;
}

function extractFps(text) {
  var m = /\b(24|25|30|48|60|120)\s*fps\b/i.exec(String(text || ""));
  return m ? m[1] + "fps" : null;
}

function pickHost(url) {
  if (!url) return "Direct";
  var low = String(url).toLowerCase();
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
  if (/fastdl/.test(hostname)) return "FastDL";
  if (/hubcloud/.test(hostname)) return "HubCloud";
  if (/pengu/.test(hostname)) return "Pengu";
  if (/sooti/.test(hostname)) return "Sooti";
  if (/cdn/.test(hostname)) return "CDN";
  if (/cloudflare/.test(hostname) || /r2\.dev/.test(hostname)) return "Cloudflare";
  if (/workers\.dev/.test(hostname)) return "Cloudflare Workers";
  if (/aoneroom/.test(hostname)) return "MovieBox";
  if (/111477/.test(hostname)) return "111477";
  return hostname.replace(/^www\./, "") || "Direct";
}

function parseSize(str) {
  if (!str) return 0;
  var m = String(str).match(/([0-9.]+)\s*([KMGT]B)/i);
  if (!m) return 0;
  var n = parseFloat(m[1]);
  var u = m[2].toUpperCase();
  if (u === "TB") return n * 1e12;
  if (u === "GB") return n * 1e9;
  if (u === "MB") return n * 1e6;
  if (u === "KB") return n * 1e3;
  return n;
}

function calcMbps(sizeMB, runtimeMinutes) {
  if (!sizeMB || !runtimeMinutes) return null;
  var bits = sizeMB * 1024 * 1024 * 8;
  var seconds = runtimeMinutes * 60;
  return (bits / seconds / 1000000).toFixed(1) + " Mbps";
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

// ═════════════════════════════════════════════════════════════════════════════
// SERVER HEALTH & SPEED CHECK
// ═════════════════════════════════════════════════════════════════════════════

function isLikelyWorkingAndFast(url, host) {
  if (!url || String(url).indexOf("http") !== 0) return false;
  var low = String(url).toLowerCase();
  if (low.indexOf("404") !== -1 || low.indexOf("error") !== -1 || low.indexOf("notfound") !== -1) return false;
  
  var lowHost = String(host || "").toLowerCase();
  for (var i = 0; i < BLOCKED_SLOW_HOSTS.length; i++) {
    if (lowHost.indexOf(BLOCKED_SLOW_HOSTS[i]) !== -1) {
      return false;
    }
  }
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCURATE STREAM ENRICHMENT
// ═════════════════════════════════════════════════════════════════════════════

function enrichStream(it, meta) {
  var rawTitle = it.title || it.description || it.name || "";
  var name = it.name || "";
  var url = it.url || "";
  var combined = (rawTitle + " " + name + " " + url).toLowerCase();
  var rawLines = rawTitle.split("\n");
  var line1 = rawLines[0] || "";
  var line2 = rawLines[1] || "";
  var fullText = line1 + " " + line2;

  var quality = extractQualityLabel(fullText + " " + name + " " + url);
  if (!quality) return null;
  
  var qualityUp = quality.toUpperCase();
  if (!ALLOWED_QUALITIES[qualityUp]) return null;

  var size = extractSize(fullText);
  if (!size) size = extractSize(name);
  if (!size) size = extractSize(url);
  if (!size && it.behaviorHints && it.behaviorHints.videoSize) {
    var vs = it.behaviorHints.videoSize;
    var gb = vs / (1024 * 1024 * 1024);
    if (gb >= 1) size = gb.toFixed(1) + " GB";
    else size = Math.round(vs / (1024 * 1024)) + " MB";
  }

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

  var source = null;
  var isRemux = false;
  if (/\bremux\b/.test(combined)) { source = "Blu-ray"; isRemux = true; }
  else if (/\bblu[-\s]?ray\b/.test(combined)) source = "Blu-ray";
  else if (/\bweb[-\s]?dl\b/.test(combined)) source = "WEB-DL";
  else if (/\b(?:webrip|hdrip)\b/.test(combined)) source = "WEB-Rip";
  else if (/\bdvd\b/.test(combined)) source = "DVD";
  else if (/\bhdtv\b/.test(combined)) source = "HDTV";

  var hdrTag = null;
  if (/\b(?:hdr10\+|hdr10p)\b/.test(combined)) hdrTag = "HDR10+";
  else if (/\bhdr10\b/.test(combined)) hdrTag = "HDR10";
  else if (/\bhdr\b/.test(combined)) hdrTag = "HDR";
  else if (/\bsdr\b/.test(combined)) hdrTag = "SDR";

  var dvTag = /\b(?:dv|dolby\s*vision)\b/.test(combined) ? "DV" : null;
  var bit10Tag = /\b10bit\b/.test(combined) ? "10Bit" : null;

  var codec = null;
  if (/\b(?:hevc|x265|265|h265)\b/.test(combined)) codec = "H.265";
  else if (/\b(?:avc|x264|264|h264)\b/.test(combined)) codec = "H.264";
  else if (/\bav1\b/.test(combined)) codec = "AV1";
  else if (/\bvp9\b/.test(combined)) codec = "VP9";
  if ((qualityUp === "4K" || qualityUp === "2160P") && !codec) {
    codec = "H.265";
  }

  var audio = null;
  for (var i = 0; i < AUDIO_TABLE.length; i++) {
    if (AUDIO_TABLE[i][0].test(combined)) { 
      audio = AUDIO_TABLE[i][1]; 
      break; 
    }
  }
  if (audio && /\batmos\b/.test(combined)) audio += " Atmos";

  var fps = extractFps(fullText);
  var host = pickHost(url);
  
  var sizeMB = size ? (parseSize(size) / 1e6) : null;
  var runtime = (meta && meta.runtime) ? meta.runtime : 120;
  var mbps = sizeMB ? calcMbps(sizeMB, runtime) : null;

  var mainTitleParts = ["AIOStreams", qualityUp];
  if (size) mainTitleParts.push(size);
  
  var mainTitle = "";
  for (var ti = 0; ti < mainTitleParts.length; ti++) {
    if (mainTitleParts[ti]) {
      if (mainTitle) mainTitle += " • ";
      mainTitle += mainTitleParts[ti];
    }
  }

  var lineA = langParts.length > 0 ? langParts.join(" • ") : "";

  var lineBParts = [];
  if (source) lineBParts.push(source);
  if (isRemux) lineBParts.push("REMUX");
  lineBParts.push(host);
  if (mbps) lineBParts.push(mbps);
  if (fps) lineBParts.push(fps);
  
  var lineB = "";
  for (var bi = 0; bi < lineBParts.length; bi++) {
    if (lineBParts[bi]) {
      if (lineB) lineB += " • ";
      lineB += lineBParts[bi];
    }
  }

  var lineCParts = [];
  if (bit10Tag) lineCParts.push(bit10Tag);
  if (dvTag) lineCParts.push(dvTag);
  if (hdrTag) lineCParts.push(hdrTag);
  if (codec) lineCParts.push(codec);
  if (audio) lineCParts.push(audio);
  
  var lineC = "";
  for (var ci = 0; ci < lineCParts.length; ci++) {
    if (lineCParts[ci]) {
      if (lineC) lineC += " • ";
      lineC += lineCParts[ci];
    }
  }

  var streamTitleParts = [];
  if (lineA) streamTitleParts.push(lineA);
  if (lineB) streamTitleParts.push(lineB);
  if (lineC) streamTitleParts.push(lineC);
  
  var streamTitle = streamTitleParts.join("\n");

  var qualityScore = qualityUp === "4K" || qualityUp === "2160P" ? 4000 : 3000;
  var sizeScore = size ? Math.round(parseSize(size) / 1048576) : 0;
  var totalScore = qualityScore + sizeScore;
  var sortTag = getInvertedSortTag(totalScore, 999999);

  var headers = { "User-Agent": UA, "Accept": "*/*" };
  if (it.behaviorHints && it.behaviorHints.proxyHeaders && it.behaviorHints.proxyHeaders.request) {
    var ph = it.behaviorHints.proxyHeaders.request;
    for (var k in ph) {
      if (Object.prototype.hasOwnProperty.call(ph, k)) {
        headers[k] = ph[k];
      }
    }
  }

  return {
    name: sortTag + mainTitle,
    title: mainTitle,
    description: streamTitle,
    url: url,
    quality: qualityUp,
    headers: headers,
    _host: host,
    _sizeRaw: size || "",
    _sizeBytes: size ? parseSize(size) : 0,
    _rawTitle: rawTitle
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// DEDUP: KEEP LARGEST FROM EACH HOST
// ═════════════════════════════════════════════════════════════════════════════

/**
 * NEW: Explicitly groups by host, then keeps ONLY the largest from each
 */
function dedupByHostKeepLargest(streams) {
  var hostMap = {};
  
  // Group all streams by host
  for (var i = 0; i < streams.length; i++) {
    var s = streams[i];
    if (!s || !s._host) continue;
    
    var hostKey = s._host.toLowerCase().replace(/[^a-z0-9]/g, "");
    
    if (!hostMap[hostKey]) {
      hostMap[hostKey] = [];
    }
    hostMap[hostKey].push(s);
  }
  
  // From each host, keep ONLY the largest
  var out = [];
  for (var host in hostMap) {
    if (Object.prototype.hasOwnProperty.call(hostMap, host)) {
      var hostStreams = hostMap[host];
      
      // Sort by size (largest first)
      hostStreams.sort(function(a, b) {
        return b._sizeBytes - a._sizeBytes;
      });
      
      // Keep the largest one
      out.push(hostStreams[0]);
    }
  }
  
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// SORT BY QUALITY AND SIZE
// ═════════════════════════════════════════════════════════════════════════════

function sortByQualityAndSize(streams) {
  return streams.slice().sort(function (a, b) {
    var rankA = (a.quality === "4K" || a.quality === "2160P") ? 2 : 1;
    var rankB = (b.quality === "4K" || b.quality === "2160P") ? 2 : 1;
    
    if (rankA !== rankB) {
      return rankB - rankA;
    }
    
    return b._sizeBytes - a._sizeBytes;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN getStreams
// ═════════════════════════════════════════════════════════════════════════════

function getStreams(tmdbId, mediaType, season, episode) {
  var out = [];
  var isTv = (mediaType === "tv" || mediaType === "series" || mediaType === "show");
  var sea = parseInt(season, 10) || 1;
  var ep = parseInt(episode, 10) || 1;

  log("request", (isTv ? "tv" : "movie") + " tmdb=" + tmdbId + (isTv ? " S" + sea + "E" + ep : ""));

  if (!/^\d+$/.test(String(tmdbId))) {
    logFailure("invalid_tmdb_id", tmdbId);
    return Promise.resolve([]);
  }

  return resolveMeta(tmdbId, mediaType)
    .then(function (meta) {
      var ids = [];
      if (meta && meta.imdbId && meta.imdbId.indexOf("tt") === 0) {
        ids.push(meta.imdbId);
      }
      ids.push("tmdb:" + tmdbId);

      log("tmdb_title", meta ? meta.title : "unknown");
      log("trying_ids", ids.join(", "));

      function tryId(idx) {
        if (idx >= ids.length) return Promise.resolve();
        var id = ids[idx];
        var streamUrl = isTv
          ? AIOSTREAMS_BASE + "/stream/series/" + id + ":" + sea + ":" + ep + ".json"
          : AIOSTREAMS_BASE + "/stream/movie/" + id + ".json";

        log("fetching", streamUrl.substring(0, 120) + "...");

        return fetchT(streamUrl, {
          headers: { "User-Agent": UA, "Accept": "application/json" }
        }, 15000)
          .then(function (r) {
            if (!r.ok) {
              log("http_error", r.status + " for " + id);
              return tryId(idx + 1);
            }
            return r.json();
          })
          .then(function (data) {
            if (!data || !data.streams || !Array.isArray(data.streams)) {
              log("no_streams", id);
              return tryId(idx + 1);
            }

            log("raw_streams", data.streams.length + " from " + id);

            var enriched = [];
            for (var i = 0; i < data.streams.length; i++) {
              var it = data.streams[i];
              var url = it && it.url;
              if (!url || String(url).indexOf("http") !== 0) continue;

              var stream = enrichStream(it, meta);
              if (!stream) continue;

              if (isLikelyWorkingAndFast(stream.url, stream._host)) {
                enriched.push(stream);
              }
            }

            log("enriched_fast_4k_1080p", enriched.length + " streams after quality & speed filter");

            if (enriched.length === 0) {
              return tryId(idx + 1);
            }

            out = out.concat(enriched);
            return Promise.resolve();
          })
          .catch(function (e) {
            log("error", id + ": " + e.message);
            return tryId(idx + 1);
          });
      }

      return tryId(0);
    })
    .then(function () {
      // ── DEDUP FIRST: Keep largest from each host ──
      var deduped = dedupByHostKeepLargest(out);
      
      // ── THEN SORT: 4K (largest first), then 1080p (largest first) ──
      var sorted = sortByQualityAndSize(deduped);
      
      log("final_streams", sorted.length + " unique hosts (largest from each, sorted by quality & size)");
      return sorted;
    })
    .catch(function (e) {
      logFailure("fatal", e.message);
      return [];
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═════════════════════════════════════════════════════════════════════════════

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else if (typeof globalThis !== "undefined") {
  globalThis.getStreams = getStreams;
} else if (typeof window !== "undefined") {
  window.getStreams = getStreams;
}
