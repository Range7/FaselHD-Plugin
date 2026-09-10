/**
 * AIOStreams Provider for Nuvio — 4K/1080p ONLY + Verified + Host-Deduped
 * Version: 1.2.0
 *
 * - Only WORKING servers (real HTTP Range probe)
 * - Only FAST servers (response within FAST_THRESHOLD_MS)
 * - No duplicate host+quality
 * - Sort: 4K (largest→smallest) then 1080p (largest→smallest)
 * - Hermes-safe: no async/await, no const/let, no arrow functions
 */

"use strict";

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

var VERSION = "1.2.0";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var TMDB_API_KEY = "b3556f3b206e16f82df4d1f6fd4545e6";
var TMDB_DIRECT = "https://api.themoviedb.org/3";
var TMDB_PROXY = "https://db.speedracelight.com/3";

var AIOSTREAMS_BASE = "https://aiostreamso-youness.ufcfan.org/stremio/c084b129-0660-465c-9496-5617c07a5898/eyJpIjoiWGM5RldyY0xsQlkwZ3EzeG00dEVvUT09IiwiZSI6IkZjeGQ4ck5qWURqUzVTL3VBZGFLQ1hJWEtZSEc4Mm9qUWM0THVlMnVoSlE9IiwidCI6ImEifQ";

var ALLOWED_QUALITIES = { "4K": true, "2160P": true, "1080P": true };

/* Server health check knobs */
var MAX_SERVER_CHECKS = 12;       // parallel probes
var SERVER_CHECK_TIMEOUT = 6000;  // hard per-server timeout
var FAST_THRESHOLD_MS = 4500;     // servers slower than this are dropped

var _metaCache = {};
var _tmdbPool = [TMDB_DIRECT, TMDB_PROXY];

// ═════════════════════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function log(key, value) {
  var suffix = value === undefined || value === null || value === "" ? "" : " " + String(value);
  console.log("[AIOStreams v" + VERSION + "] " + key + suffix);
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

function copyHeaders(src) {
  var out = {};
  if (src) {
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
    }
  }
  return out;
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
        var runtime = 0;
        if (kind === "movie") {
          runtime = j.runtime || 0;
        } else {
          var runs = j.episode_run_time;
          if (runs && runs.length > 0) runtime = runs[0];
        }
        var meta = { title: title, year: year, imdbId: imdbId, kind: kind, runtime: runtime };
        _metaCache[ck] = meta;
        return meta;
      })
      .catch(function () { return tryHost(idx + 1); });
  }

  return tryHost(0);
}

// ═════════════════════════════════════════════════════════════════════════════
// METADATA EXTRACTION
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
  [/mp3/i, "MP3"]
];

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
  var s = String(text || "");
  var m = s.match(/\[([0-9.]+\s*[KMGT]B(?:\/E)?)\]/i) ||
          s.match(/([0-9]+(?:\.[0-9]+)?\s*[KMGT]B)/i) ||
          s.match(/\b([0-9.]+\s*GB)\b/i) ||
          s.match(/\b([0-9.]+\s*MB)\b/i);
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
  if (/mega\.(nz|io)/.test(hostname)) return "Mega";
  if (/drive\.google|googleapis/.test(hostname)) return "GoogleDrive";
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
  if (/r2\.dev/.test(hostname)) return "CloudflareR2";
  if (/workers\.dev/.test(hostname)) return "CFWorkers";
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

// ═════════════════════════════════════════════════════════════════════════════
// STREAM ENRICHMENT
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
  if (!ALLOWED_QUALITIES[qualityUp]) return null;

  /* ── Size ── */
  var size = extractSize(fullText);
  if (!size) size = extractSize(name);
  if (!size) size = extractSize(url);
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

  /* ── Codec (do not clobber AV1/VP9) ── */
  var codec = "";
  if (/\b(?:hevc|x265|h265)\b/.test(combined)) codec = "H.265";
  else if (/\bav1\b/.test(combined)) codec = "AV1";
  else if (/\bvp9\b/.test(combined)) codec = "VP9";
  else if (/\b(?:avc|x264|h264)\b/.test(combined)) codec = "H.264";
  if (!codec) codec = (qualityUp === "4K" || qualityUp === "2160P") ? "H.265" : "H.264";

  /* ── Audio ── */
  var audio = "";
  for (var i = 0; i < AUDIO_TABLE.length; i++) {
    if (AUDIO_TABLE[i][0].test(combined)) { audio = AUDIO_TABLE[i][1]; break; }
  }
  if (!audio) audio = "AAC 5.1";
  if (/\batmos\b/.test(combined)) audio += " Atmos";

  /* ── FPS ── */
  var fps = extractFps(fullText);

  /* ── Host ── */
  var host = pickHost(url);

  /* ── Bitrate (use real runtime) ── */
  var runtime = (meta && meta.runtime) ? meta.runtime : (meta && meta.kind === "tv" ? 45 : 120);
  var sizeMB = parseSize(size) / (1024 * 1024);
  var mbps = calcMbps(sizeMB, runtime);

  /* ── Visible quality badge ── */
  var badge = (qualityUp === "4K" || qualityUp === "2160P") ? "[4K]" : "[1080p]";

  /* ── Headers ── */
  var headers = { "User-Agent": UA, "Accept": "*/*" };
  if (it.behaviorHints && it.behaviorHints.proxyHeaders && it.behaviorHints.proxyHeaders.request) {
    var ph = it.behaviorHints.proxyHeaders.request;
    for (var k in ph) {
      if (Object.prototype.hasOwnProperty.call(ph, k)) headers[k] = ph[k];
    }
  }

  /* ── Compose display ── */
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

  var streamTitle = lineA;
  if (lineB) streamTitle += "\n" + lineB;
  if (lineC) streamTitle += "\n" + lineC;

  /* ── Top line: badge + quality + size ── */
  var topLine = badge + " " + qualityUp;
  if (size) topLine += " • " + size;

  return {
    name: topLine,
    title: streamTitle,
    url: url,
    quality: qualityUp,
    headers: headers,
    _host: host,
    _sizeRaw: size || "",
    _sizeVal: parseSize(size),
    _qualityUp: qualityUp,
    _is4K: (qualityUp === "4K" || qualityUp === "2160P")
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK — real probe of each URL
// ═════════════════════════════════════════════════════════════════════════════

function probeServer(url, headers) {
  return new Promise(function (resolve) {
    var start = Date.now();
    var settled = false;

    var opts = { method: "GET", headers: copyHeaders(headers) };
    opts.headers["Range"] = "bytes=0-1";

    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      resolve({ ok: false, ms: Date.now() - start, reason: "timeout" });
    }, SERVER_CHECK_TIMEOUT);

    fetch(url, opts)
      .then(function (r) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        var ms = Date.now() - start;
        var code = r.status;
        /* 2xx/3xx = alive; 405/416 mean server responded, treat as alive */
        if ((code >= 200 && code < 400) || code === 405 || code === 416) {
          resolve({ ok: true, ms: ms, status: code });
        } else {
          resolve({ ok: false, ms: ms, status: code });
        }
      })
      .catch(function (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, ms: Date.now() - start, reason: e.message });
      });
  });
}

function probeAll(streams) {
  return new Promise(function (resolve) {
    var n = streams.length;
    if (n === 0) return resolve([]);

    var results = new Array(n);
    var remaining = n;
    var nextIdx = 0;
    var running = 0;
    var finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      resolve(results);
    }

    function launch() {
      while (running < MAX_SERVER_CHECKS && nextIdx < n) {
        (function (idx) {
          running++;
          probeServer(streams[idx].url, streams[idx].headers).then(function (res) {
            results[idx] = res;
            running--;
            remaining--;
            if (remaining === 0) finish();
            else launch();
          });
        })(nextIdx);
        nextIdx++;
      }
      if (running === 0 && nextIdx >= n && remaining > 0) {
        /* safety net — should not happen */
        finish();
      }
    }

    launch();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// DEDUP + SORT
// ═════════════════════════════════════════════════════════════════════════════

/* Dedup by URL first */
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

/* Keep ONLY ONE stream per (host + quality). Prefer the largest size. */
function dedupByHostQuality(streams) {
  var best = {};
  for (var i = 0; i < streams.length; i++) {
    var s = streams[i];
    var key = (s._host || "?") + "|" + s._qualityUp;
    var cur = best[key];
    if (!cur || s._sizeVal > cur._sizeVal) best[key] = s;
  }
  var out = [];
  for (var k in best) {
    if (Object.prototype.hasOwnProperty.call(best, k)) out.push(best[k]);
  }
  return out;
}

/* Sort: 4K first (by size desc), then 1080p (by size desc) */
function sortByQualityThenSize(streams) {
  return streams.slice().sort(function (a, b) {
    if (a._is4K !== b._is4K) return a._is4K ? -1 : 1;
    return b._sizeVal - a._sizeVal;
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
    log("[error] invalid_tmdb_id " + tmdbId);
    return Promise.resolve([]);
  }

  return resolveMeta(tmdbId, mediaType)
    .then(function (meta) {
      var ids = [];
      if (meta && meta.imdbId && meta.imdbId.indexOf("tt") === 0) ids.push(meta.imdbId);
      ids.push("tmdb:" + tmdbId);

      log("tmdb", meta ? (meta.title + " (" + (meta.year || "?") + ")") : "unknown");

      function tryId(idx) {
        if (idx >= ids.length) return Promise.resolve();
        var id = ids[idx];
        var streamUrl = isTv
          ? AIOSTREAMS_BASE + "/stream/series/" + id + ":" + sea + ":" + ep + ".json"
          : AIOSTREAMS_BASE + "/stream/movie/" + id + ".json";

        log("fetch", "id=" + id);

        return fetchT(streamUrl, {
          headers: { "User-Agent": UA, "Accept": "application/json" }
        }, 15000)
          .then(function (r) {
            if (!r.ok) { log("http_error", r.status + " for " + id); return tryId(idx + 1); }
            return r.json();
          })
          .then(function (data) {
            if (!data || !data.streams || !Array.isArray(data.streams)) {
              log("no_streams", id);
              return tryId(idx + 1);
            }

            log("raw", data.streams.length + " from " + id);

            /* Enrich + filter 4K/1080p */
            var enriched = [];
            for (var i = 0; i < data.streams.length; i++) {
              var it = data.streams[i];
              var url = it && it.url;
              if (!url || String(url).indexOf("http") !== 0 || seen[url]) continue;

              var stream = enrichStream(it, meta);
              if (!stream) continue;

              seen[url] = true;
              enriched.push(stream);
            }

            log("enriched", enriched.length + " after quality filter");

            if (enriched.length === 0) return tryId(idx + 1);

            /* Dedup by URL + host+quality */
            var d1 = dedupByUrl(enriched);
            var d2 = dedupByHostQuality(d1);
            log("dedup", d2.length + " after host+quality dedup");

            if (d2.length === 0) return tryId(idx + 1);

            /* Probe every candidate — keep only WORKING + FAST */
            log("probing", d2.length + " servers...");
            return probeAll(d2).then(function (results) {
              var alive = [];
              for (var r = 0; r < d2.length; r++) {
                var res = results[r];
                if (!res || !res.ok) continue;
                if (res.ms > FAST_THRESHOLD_MS) continue;
                var s = d2[r];
                s._probeMs = res.ms;
                alive.push(s);
              }
              log("alive_fast", alive.length + " of " + d2.length);

              if (alive.length === 0) return tryId(idx + 1);

              out = out.concat(alive);
            });
          })
          .catch(function (e) {
            log("error", id + ": " + e.message);
            return tryId(idx + 1);
          });
      }

      return tryId(0);
    })
    .then(function () {
      var d1 = dedupByUrl(out);
      var d2 = dedupByHostQuality(d1);
      var sorted = sortByQualityThenSize(d2);
      log("final", sorted.length + " streams (4K desc size, then 1080p desc size)");
      return sorted;
    })
    .catch(function (e) {
      log("fatal", e.message);
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
