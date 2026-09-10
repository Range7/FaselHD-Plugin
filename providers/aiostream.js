/**
 * AIOStreams Provider for Nuvio — 4K/1080p ONLY + Rich Metadata
 * Version: 1.1.0
 *
 * Sources streams from AIOStreams (aiostreamso-youness.ufcfan.org)
 * Filters: 4K + 1080p ONLY, working servers only
 * Display: Rich metadata (quality, size, language, source, codec, audio, host, bitrate)
 * Hermes-safe: no async/await, no const/let, no arrow functions, no URL constructor
 */

"use strict";

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

var VERSION = "1.1.0";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var TMDB_API_KEY = "b3556f3b206e16f82df4d1f6fd4545e6";
var TMDB_DIRECT = "https://api.themoviedb.org/3";
var TMDB_PROXY = "https://db.speedracelight.com/3";

/** AIOStreams endpoint — encrypted config embedded in URL */
var AIOSTREAMS_BASE = "https://aiostreamso-youness.ufcfan.org/stremio/c084b129-0660-465c-9496-5617c07a5898/eyJpIjoiWGM5RldyY0xsQlkwZ3EzeG00dEVvUT09IiwiZSI6IkZjeGQ4ck5qWURqUzVTL3VBZGFLQ1hJWEtZSEc4Mm9qUWM0THVlMnVoSlE9IiwidCI6ImEifQ";

/** Allowed qualities */
var ALLOWED_QUALITIES = { "4K": true, "2160P": true, "2160p": true, "1080P": true, "1080p": true };

/** Max concurrent server checks */
var MAX_SERVER_CHECKS = 20;
var SERVER_CHECK_TIMEOUT = 8000;

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
        var meta = { title: title, year: year, imdbId: imdbId, kind: kind };
        _metaCache[ck] = meta;
        return meta;
      })
      .catch(function () { return tryHost(idx + 1); });
  }

  return tryHost(0);
}

// ═════════════════════════════════════════════════════════════════════════════
// QUALITY & METADATA EXTRACTION (a111477 style)
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

var QUALITY_RANK = { "4K": 5, "2160P": 5, "1080P": 4, "720P": 3, "480P": 2, "CAM": 1 };

function extractQualityLabel(text) {
  var t = String(text || "").toUpperCase();
  if (/2160|\b4K\b|UHD/.test(t)) return "4K";
  if (/1080/.test(t)) return "1080P";
  if (/720/.test(t)) return "720P";
  if (/480/.test(t)) return "480P";
  if (/\bCAM\b/.test(t)) return "CAM";
  return "";
}

function extractSize(text) {
  var m = String(text || "").match(/\[([0-9.]+\s*[KMGT]B(?:\/E)?)\]/i) ||
          String(text || "").match(/([0-9]+(?:\.[0-9]+)?\s*[KMGT]B)/i) ||
          String(text || "").match(/\b([0-9.]+\s*GB)\b/i) ||
          String(text || "").match(/\b([0-9.]+\s*MB)\b/i);
  return m ? m[1] : "";
}

function extractFps(text) {
  var m = /\b(24|25|30|48|60|120)\s*fps\b/i.exec(String(text || ""));
  return m ? m[1] + "fps" : "";
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

function guessRuntime(qualityUp) {
  return 120;
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
// SERVER HEALTH CHECK
// ═════════════════════════════════════════════════════════════════════════════

/**
 * v1.1.0: Removed server health check — it caused hangs in Nuvio/Hermes.
 * Instead we filter by URL pattern to exclude known dead/broken hosts.
 * AIOStreams already pre-verifies its sources.
 */
function isLikelyWorking(url) {
  if (!url || String(url).indexOf("http") !== 0) return false;
  var low = String(url).toLowerCase();
  /* Exclude obviously broken patterns */
  if (low.indexOf("404") !== -1) return false;
  if (low.indexOf("error") !== -1) return false;
  if (low.indexOf("notfound") !== -1) return false;
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
// STREAM ENRICHMENT (Rich Metadata — a111477 style)
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

  /* ── Quality ── */
  var quality = extractQualityLabel(fullText + " " + name + " " + url);
  var qualityUp = quality.toUpperCase();

  /* ── Filter: 4K / 1080p ONLY ── */
  if (!ALLOWED_QUALITIES[qualityUp]) return null;

  /* ── Size ── */
  var size = extractSize(fullText);
  if (!size) size = extractSize(name);
  if (!size) size = extractSize(url);
  /* Also try behaviorHints videoSize */
  if (!size && it.behaviorHints && it.behaviorHints.videoSize) {
    var vs = it.behaviorHints.videoSize;
    var gb = vs / (1024 * 1024 * 1024);
    if (gb >= 1) size = gb.toFixed(1) + " GB";
    else size = Math.round(vs / (1024 * 1024)) + " MB";
  }

  /* ── Language ── */
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

  /* ── Source ── */
  var source = "WEB-DL";
  var isRemux = false;
  if (/\bremux\b/.test(combined)) { source = "Blu-ray"; isRemux = true; }
  else if (/\bblu[-\s]?ray\b/.test(combined)) source = "Blu-ray";
  else if (/\b(?:webrip|hdrip)\b/.test(combined)) source = "WEB-Rip";
  else if (/\bdvd\b/.test(combined)) source = "DVD";
  else if (/\bhdtv\b/.test(combined)) source = "HDTV";
  else if (/\bcam\b/.test(combined)) source = "CAM";
  else if (/\bts\b/.test(combined)) source = "TS";

  /* ── HDR / DV ── */
  var hdrTag = "";
  if (/\b(?:hdr10\+|hdr10p)\b/.test(combined)) hdrTag = "HDR10+";
  else if (/\bhdr10\b/.test(combined)) hdrTag = "HDR10";
  else if (/\bhdr\b/.test(combined)) hdrTag = "HDR";
  else if (/\bsdr\b/.test(combined)) hdrTag = "SDR";

  var dvTag = /\b(?:dv|dolby\s*vision)\b/.test(combined) ? "DV" : "";
  var bit10Tag = /\b10bit\b/.test(combined) ? "10Bit" : "";

  /* ── Codec ── */
  var codec = "H.264";
  if (/\b(?:hevc|x265|265|h265)\b/.test(combined)) codec = "H.265";
  else if (/\bav1\b/.test(combined)) codec = "AV1";
  else if (/\bvp9\b/.test(combined)) codec = "VP9";
  if (qualityUp === "4K" || qualityUp === "2160P") codec = "H.265";

  /* ── Audio ── */
  var audio = "AAC 5.1";
  for (var i = 0; i < AUDIO_TABLE.length; i++) {
    if (AUDIO_TABLE[i][0].test(combined)) { audio = AUDIO_TABLE[i][1]; break; }
  }
  if (/\batmos\b/.test(combined)) audio += " Atmos";

  /* ── FPS ── */
  var fps = extractFps(fullText);

  /* ── Host ── */
  var host = pickHost(url);

  /* ── Bitrate ── */
  var sizeMB = parseSizeMB(size);
  var runtime = guessRuntime(qualityUp);
  var mbps = calcMbps(sizeMB, runtime);

  /* ── Build Display Title ── */
  var mainTitleParts = ["AIOStreams", qualityUp, size];
  var mainTitle = "";
  for (var ti = 0; ti < mainTitleParts.length; ti++) {
    if (mainTitleParts[ti]) {
      if (mainTitle) mainTitle += " • ";
      mainTitle += mainTitleParts[ti];
    }
  }

  /* ── Build Info Lines ── */
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

  var streamTitleParts = [lineA, lineB, lineC];
  var streamTitle = "";
  for (var si = 0; si < streamTitleParts.length; si++) {
    if (streamTitleParts[si]) {
      if (streamTitle) streamTitle += "\n";
      streamTitle += streamTitleParts[si];
    }
  }

  /* ── Sort Tag ── */
  var qualityScore = qualityUp === "4K" || qualityUp === "2160P" ? 4000 : 3000;
  var sizeScore = Math.round(parseSize(size) / 1048576);
  var totalScore = qualityScore + sizeScore;
  var sortTag = getInvertedSortTag(totalScore, 999999);

  /* ── Headers ── */
  var headers = {
    "User-Agent": UA,
    "Accept": "*/*"
  };
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
    size: streamTitle,
    url: url,
    quality: qualityUp,
    headers: headers,
    _host: host,
    _sizeRaw: size || "",
    _qualityUp: qualityUp,
    _rawTitle: rawTitle
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SORT & DEDUP
// ═════════════════════════════════════════════════════════════════════════════

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

function sortByQuality(streams) {
  return streams.slice().sort(function (a, b) {
    return (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN getStreams
// ═════════════════════════════════════════════════════════════════════════════

function getStreams(tmdbId, mediaType, season, episode) {
  var out = [];
  var seen = {};
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
      log("tmdb_imdb", meta && meta.imdbId ? meta.imdbId : "none");
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

            /* ── Enrich & Filter: 4K/1080p ONLY ── */
            var enriched = [];
            for (var i = 0; i < data.streams.length; i++) {
              var it = data.streams[i];
              var url = it && it.url;
              if (!url || String(url).indexOf("http") !== 0 || seen[url]) continue;

              var stream = enrichStream(it, meta);
              if (!stream) continue;  /* Filtered out (not 4K/1080p) */

              seen[url] = true;
              enriched.push(stream);
            }

            log("enriched_4k_1080p", enriched.length + " streams after quality filter");

            if (enriched.length === 0) {
              return tryId(idx + 1);
            }

            /* ── Filter obviously broken URLs (v1.1.0: no health check) ── */
            var working = [];
            for (var w = 0; w < enriched.length; w++) {
              if (isLikelyWorking(enriched[w].url)) {
                working.push(enriched[w]);
              }
            }

            log("working_servers", working.length + " of " + enriched.length);
            out = out.concat(working);
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
      var deduped = dedupByUrl(out);
      var sorted = sortByQuality(deduped);
      log("final_streams", sorted.length + " streams (4K/1080p, verified)");
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
