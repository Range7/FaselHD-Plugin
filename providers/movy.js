// Movy Scraper for Nuvio
// Ported from PlayTorrio movy.dart (FNV-1a PRNG cipher decryptor)
// LIVE-TESTED against api.wecollege.net
//
// Features:
//  - 14 city servers queried sequentially (API rejects concurrent same-seed requests)
//  - Real bitrate probing via Range requests -> real estimated sizes
//  - "Auto HLS" sources classified by probed bitrate (>=13 Mbps => 4K, >=4 => 1080P)
//  - Only 4K & 1080P shown, sorted: 4K largest->smallest, then 1080P largest->smallest
//  - a111477-style rich stream info (invisible sort tag + multi-line details)
//  - Subtitles included
// Hermes-safe (ES5, no async/await)

var API_BASE = "https://api.wecollege.net";
var REFERER = "https://www.movy.bz/";
var ORIGIN = "https://www.movy.bz";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 8e3;
var PROBE_TIMEOUT = 6e3;
var SERVER_STAGGER_MS = 150;
var RETRY_DELAY_MS = 250;

var HEADERS = {
  "User-Agent": UA,
  "Referer": REFERER,
  "Origin": ORIGIN
};

var MAGIC = [109, 118, 109, 49]; // "mvm1"

var SERVERS = [
  { endpoint: "miami",   name: "Miami",   note: "Original audio", lang: "English" },
  { endpoint: "seattle", name: "Seattle", note: "Original audio", lang: "English" },
  { endpoint: "denver",  name: "Denver",  note: "Original audio", lang: "English" },
  { endpoint: "chicago", name: "Chicago", note: "Original audio", lang: "English" },
  { endpoint: "dallas",  name: "Dallas",  note: "Original audio", lang: "English" },
  { endpoint: "atlanta", name: "Atlanta", note: "Original audio", lang: "English" },
  { endpoint: "houston", name: "Houston", note: "Original audio", lang: "English" },
  { endpoint: "austin",  name: "Austin",  note: "Original audio", lang: "English" },
  { endpoint: "boston",  name: "Boston",  note: "Original audio", lang: "English" },
  { endpoint: "munich",  name: "Munich",  note: "German audio",   lang: "German", extra: "language=german" },
  { endpoint: "berlin",  name: "Berlin",  note: "German audio",   lang: "German" },
  { endpoint: "paris",   name: "Paris",   note: "French audio",   lang: "French" },
  { endpoint: "delhi",   name: "Delhi",   note: "Hindi audio",    lang: "Hindi" },
  { endpoint: "cancun",  name: "Cancun",  note: "Spanish audio",  lang: "Spanish" }
];

// Default bitrates (Mbps) calibrated from live probes of peakstorm CDN
var DEFAULT_BITRATE = { "4K": 17, "1080P": 7.5 };
var AUTO_4K_MBPS = 13;
var AUTO_1080_MBPS = 4;

var TMDB_KEY = "b3556f3b206e16f82df4d1f6fd4545e6";
var TMDB_DIRECT = "https://api.themoviedb.org/3";
var TMDB_PROXY = "https://db.speedracelight.com/3";

var _seedCache = {};
var _runtimeCache = {};

// ─── Network helpers ────────────────────────────────────
function safeFetch(url, ms, headers) {
  return new Promise(function(resolve, reject) {
    var controller = null, tid = null;
    try {
      controller = new AbortController();
      tid = setTimeout(function() { controller.abort(); }, ms || FETCH_TIMEOUT);
    } catch (e) { controller = null; }
    var opts = { headers: headers || HEADERS };
    if (controller) opts.signal = controller.signal;
    fetch(url, opts).then(function(r) { if (tid) clearTimeout(tid); resolve(r); })
      .catch(function(e) { if (tid) clearTimeout(tid); reject(e); });
  });
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// ─── Seed (cached per tmdbId) ───────────────────────────
function fetchSeedNow(tmdbId) {
  return new Promise(function(resolve) {
    safeFetch(API_BASE + "/seed?mediaId=" + tmdbId)
      .then(function(r) {
        if (!r.ok) throw new Error("seed " + r.status);
        return r.json();
      })
      .then(function(data) {
        var seed = data.seed ? String(data.seed) : "";
        var ttlMs = (typeof data.ttlMs === "number") ? data.ttlMs : 30000;
        if (seed) {
          _seedCache[tmdbId] = { seed: seed, expiresAt: Date.now() + ttlMs };
          resolve(seed);
        } else resolve(null);
      })
      .catch(function(e) {
        console.log("[Movy] seed error for " + tmdbId + ": " + e.message);
        resolve(null);
      });
  });
}

function getSeed(tmdbId) {
  var now = Date.now();
  var cached = _seedCache[tmdbId];
  if (cached && cached.expiresAt > now + 5000) return Promise.resolve(cached.seed);
  return fetchSeedNow(tmdbId);
}

// Returns a seed guaranteed fresh (<= 20s old) — used before each server call
function getUsableSeed(tmdbId) {
  var cached = _seedCache[tmdbId];
  if (cached && cached.expiresAt - Date.now() > 10000) return Promise.resolve(cached.seed);
  return fetchSeedNow(tmdbId);
}

// ─── Runtime from TMDB (dual endpoint + safe defaults) ──
function resolveRuntime(tmdbId, mediaType) {
  var kind = mediaType === "tv" ? "tv" : "movie";
  var def = kind === "tv" ? 45 : 120;
  var ck = kind + ":" + tmdbId;
  if (_runtimeCache[ck]) return Promise.resolve(_runtimeCache[ck]);

  function tryHost(idx) {
    if (idx >= 2) { _runtimeCache[ck] = def; return Promise.resolve(def); }
    var base = idx === 0 ? TMDB_DIRECT : TMDB_PROXY;
    var url = base + "/" + kind + "/" + tmdbId + (idx === 0 ? "?api_key=" + TMDB_KEY : "");
    return safeFetch(url, 6000, { "User-Agent": UA, "Accept": "application/json" })
      .then(function(r) { if (!r.ok) throw new Error("tmdb " + r.status); return r.json(); })
      .then(function(j) {
        var mins = 0;
        if (kind === "movie" && j.runtime) mins = j.runtime;
        if (kind === "tv" && j.episode_run_time && j.episode_run_time.length) mins = j.episode_run_time[0];
        if (!mins || mins <= 0) mins = def;
        _runtimeCache[ck] = mins;
        return mins;
      })
      .catch(function() { return tryHost(idx + 1); });
  }
  return tryHost(0);
}

// ─── Decryption cipher (FNV-1a PRNG) — VERIFIED LIVE ────
function L(e) {
  var v = e >>> 0;
  v = (v ^ (v >>> 16)) >>> 0;
  v = Math.imul(v, 0x85ebca6b) >>> 0;
  v = (v ^ (v >>> 13)) >>> 0;
  v = Math.imul(v, 0xc2b2ae35) >>> 0;
  return (v ^ (v >>> 16)) >>> 0;
}

function U(e, t) {
  var shift = t & 31;
  if (shift === 0) return e >>> 0;
  return (((e << shift) >>> 0) | (e >>> (32 - shift))) >>> 0;
}

function fnv1a(str) {
  var t = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    t = Math.imul((t ^ str.charCodeAt(i)) >>> 0, 0x1000193) >>> 0;
  }
  return L(t);
}

function initKeyState(seed, tmdbId) {
  var s = new Array(61), isSet = new Array(61);
  for (var i = 0; i < 61; i++) { s[i] = 0; isSet[i] = false; }
  var r = L((fnv1a(seed) ^ L((tmdbId >>> 0) ^ 0x9e3779b9)) >>> 0);
  for (var e = 0; e < 8; e++) {
    var t = r % 61;
    r = U((r + 0x9e3779b9) >>> 0, 7 + (7 & e));
    s[t] = (r ^ L(r)) >>> 0;
    isSet[t] = true;
    r = L((r + t) >>> 0);
  }
  return { s: s, isSet: isSet, acc: L((0xa5a5a5a5 ^ r) >>> 0) };
}

function nextKeystreamWord(state, t) {
  var s = state.s;
  var nState = state.acc;
  var i = nState % 61;
  var oVal = state.isSet[i] ? -1 : 0;
  var d = state.isSet[i] ? s[i] : 0;
  var c = Math.imul((t + 1) >>> 0, 0x9e3779b9) >>> 0;
  var a = nState;
  var sVal = (d ^ c) >>> 0;
  var h = ((a ^ sVal) | (a & sVal & oVal)) >>> 0;
  var term1 = U((h + nState) >>> 0, 31 & i);
  var term2 = U(nState, 31 & (i * 7));
  nState = L((term1 ^ term2) + 0x9e3779b9);
  s[i] = nState;
  state.isSet[i] = true;
  state.acc = nState;
  return nState;
}

function generateKeyStream(seed, tmdbId, len) {
  var state = initKeyState(seed, tmdbId);
  var out = new Array(len);
  var wordIdx = 0, byteIdx = 0;
  while (byteIdx < len) {
    var word = nextKeystreamWord(state, wordIdx++);
    out[byteIdx++] = word & 0xFF;
    if (byteIdx < len) out[byteIdx++] = (word >>> 8) & 0xFF;
    if (byteIdx < len) out[byteIdx++] = (word >>> 16) & 0xFF;
    if (byteIdx < len) out[byteIdx++] = (word >>> 24) & 0xFF;
  }
  return out;
}

var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64ToBytes(b64) {
  var clean = b64.replace(/=+$/, "");
  var bytes = [];
  for (var i = 0; i < clean.length; i += 4) {
    var c0 = B64_CHARS.indexOf(clean[i]);
    var c1 = clean[i + 1] === undefined ? -1 : B64_CHARS.indexOf(clean[i + 1]);
    var c2 = clean[i + 2] === undefined ? -1 : B64_CHARS.indexOf(clean[i + 2]);
    var c3 = clean[i + 3] === undefined ? -1 : B64_CHARS.indexOf(clean[i + 3]);
    if (c0 < 0 || c1 < 0) break;
    var n = (c0 << 18) | (c1 << 12) | (c2 < 0 ? 0 : c2 << 6) | (c3 < 0 ? 0 : c3);
    bytes.push((n >>> 16) & 0xFF);
    if (c2 >= 0) bytes.push((n >>> 8) & 0xFF);
    if (c3 >= 0) bytes.push(n & 0xFF);
  }
  return bytes;
}

function utf8Decode(bytes) {
  var out = "";
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b < 0xE0) {
      out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F)); i += 1;
    } else if (b < 0xF0) {
      out += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F)); i += 2;
    } else {
      var cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F);
      i += 3;
      cp -= 0x10000;
      out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
    }
  }
  return out;
}

function decrypt(cipherB64, seed, tmdbId) {
  try {
    var normalized = cipherB64.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4 !== 0) normalized += "=";
    var cipherBytes = base64ToBytes(normalized);
    if (cipherBytes.length <= MAGIC.length) return null;
    var ks = generateKeyStream(seed, tmdbId, cipherBytes.length);
    for (var i = 0; i < cipherBytes.length; i++) cipherBytes[i] = cipherBytes[i] ^ ks[i];
    for (var k = 0; k < MAGIC.length; k++) {
      if (cipherBytes[k] !== MAGIC[k]) return null;
    }
    return utf8Decode(cipherBytes.slice(MAGIC.length));
  } catch (e) {
    return null;
  }
}

// ─── Quality helpers ────────────────────────────────────
function parseQualityLabel(raw) {
  var t = String(raw || "").toLowerCase();
  if (t.indexOf("2160") !== -1 || t.indexOf("4k") !== -1) return "4K";
  if (t.indexOf("1080") !== -1) return "1080P";
  if (t.indexOf("720") !== -1) return "720P";
  if (t.indexOf("480") !== -1) return "480P";
  if (t.indexOf("360") !== -1) return "360P";
  return "Auto";
}

// ─── Bitrate probe (Range request on first segment) ─────
function resolveUrl(base, path) {
  if (!path) return null;
  if (path.indexOf("http") === 0) return path;
  return base.replace(/[^/]+$/, "") + path;
}

function probeBitrate(streamUrl) {
  return new Promise(function(resolve) {
    // 1) fetch playlist/manifest
    safeFetch(streamUrl, PROBE_TIMEOUT)
      .then(function(r) {
        if (!r.ok) throw new Error("playlist " + r.status);
        return r.text();
      })
      .then(function(text) {
        // Master playlist: use best variant bandwidth directly
        if (text.indexOf("#EXT-X-STREAM-INF") !== -1) {
          var lines = text.split("\n");
          var bestBw = 0, bestRes = 0;
          for (var i = 0; i < lines.length; i++) {
            if (lines[i].indexOf("#EXT-X-STREAM-INF") !== -1) {
              var bw = /BANDWIDTH=(\d+)/.exec(lines[i]);
              var rs = /RESOLUTION=\d+x(\d+)/.exec(lines[i]);
              if (bw && parseInt(bw[1], 10) > bestBw) {
                bestBw = parseInt(bw[1], 10);
                bestRes = rs ? parseInt(rs[1], 10) : 0;
              }
            }
          }
          if (bestBw > 0) {
            var q = bestRes >= 2000 ? "4K" : bestRes >= 1000 ? "1080P" : "720P";
            resolve({ mbps: bestBw / 1e6, quality: q });
            return;
          }
          throw new Error("no variants");
        }
        // Media playlist: probe first segment size via Range request
        var segLines = text.split("\n");
        var seg = null, dur = 0;
        for (var j = 0; j < segLines.length; j++) {
          var ln = segLines[j];
          if (ln.indexOf("#EXTINF:") === 0 && dur === 0) {
            var dm = /#EXTINF:([0-9.]+)/.exec(ln);
            if (dm) dur = parseFloat(dm[1]);
          }
          if (ln && ln.charAt(0) !== "#" && !seg) seg = ln;
        }
        if (!seg) throw new Error("no segments");
        if (!dur || dur <= 0) dur = 6;
        var segUrl = resolveUrl(streamUrl, seg);
        return safeFetch(segUrl, PROBE_TIMEOUT, {
          "User-Agent": UA, "Referer": REFERER, "Range": "bytes=0-0"
        }).then(function(sr) {
          var cr = sr.headers.get("content-range") || "";
          var m = /\/(\d+)\s*$/.exec(cr);
          if (!m) throw new Error("no content-range");
          var totalBytes = parseInt(m[1], 10);
          resolve({ mbps: (totalBytes * 8) / dur / 1e6, quality: null });
        });
      })
      .catch(function(e) {
        console.log("[Movy] probe failed: " + e.message);
        resolve(null);
      });
  });
}

// ─── Host naming (a111477 style) ────────────────────────
function pickHost(url) {
  if (!url) return "Direct";
  var m = /^https?:\/\/([^\/?:#]+)/.exec(String(url).toLowerCase());
  var h = m ? m[1] : "";
  if (/peakstorm/.test(h)) return "PeakStorm";
  if (/playhq/.test(h)) return "PlayHQ";
  if (/wecollege/.test(h)) return "Movy";
  return h.replace(/^www\./, "") || "Direct";
}

// ─── Invisible sort tag (a111477 technique) ─────────────
function getInvertedSortTag(score, maxScore) {
  maxScore = maxScore || 999999;
  var val = Math.max(0, parseInt(score, 10) || 0);
  var inv = Math.max(0, maxScore - val);
  var bin = inv.toString(2);
  while (bin.length < 20) bin = "0" + bin;
  var chars = [];
  for (var i = 0; i < bin.length; i++) {
    chars.push(bin.charAt(i) === "1" ? "﻿" : "​");
  }
  return chars.join("");
}

// ─── Subtitle normalization ─────────────────────────────
function normalizeSubs(subs) {
  var out = [];
  if (!subs || !subs.length) return out;
  var seen = {};
  var map = { en: "eng", english: "eng", eng: "eng", arabic: "ara", ar: "ara",
              es: "spa", spanish: "spa", fr: "fre", french: "fre", de: "ger",
              german: "ger", hi: "hin", hindi: "hin", ja: "jpn", japanese: "jpn" };
  for (var i = 0; i < subs.length; i++) {
    var s = subs[i];
    if (!s || !s.url) continue;
    var lang = String(s.lang || s.language || "eng").toLowerCase();
    lang = map[lang] || lang;
    if (seen[lang]) continue;
    seen[lang] = true;
    out.push({ url: s.url, lang: lang });
  }
  return out;
}

// ─── Single server fetch (with one 5xx retry) ───────────
function fetchServer(server, query, seed, tmdbId) {
  function attempt(isRetry) {
    return new Promise(function(resolve) {
      var url = API_BASE + "/" + server.endpoint + "/sources?" + query;
      if (server.extra) url += "&" + server.extra;

      safeFetch(url)
        .then(function(r) {
          if (r.status === 404 || r.status === 401) { resolve({ candidates: [] }); return; }
          if (!r.ok) throw new Error(String(r.status));
          return r.text();
        })
        .then(function(encText) {
          if (!encText) { resolve({ candidates: [] }); return; }
          encText = encText.trim();
          if (!encText || encText.charAt(0) === "<") { resolve({ candidates: [] }); return; }

          var decJson = decrypt(encText, seed, tmdbId);
          if (!decJson) { resolve({ candidates: [] }); return; }

          var parsed = JSON.parse(decJson);
          var sources = parsed.sources || [];
          var subs = normalizeSubs(parsed.subtitles);
          var candidates = [];

          for (var i = 0; i < sources.length; i++) {
            var src = sources[i];
            if (!src || !src.url) continue;
            candidates.push({
              server: server,
              url: String(src.url),
              qualityLabel: parseQualityLabel(src.quality),
              subtitles: subs
            });
          }
          resolve({ candidates: candidates });
        })
        .catch(function(e) {
          if (!isRetry && (e.message === "500" || e.message === "502" || e.message === "503")) {
            sleep(RETRY_DELAY_MS).then(function() { resolve(attempt(true)); });
          } else {
            resolve({ candidates: [] });
          }
        });
    });
  }
  return attempt(false);
}

// ─── Enrich one candidate (a111477-style rich info) ─────
function enrichStream(cand, runtimeMin) {
  var server = cand.server;
  var q = cand.qualityLabel;
  var mbps = null;

  // Explicit low-quality labels: drop without probing (saves time/bandwidth)
  if (q !== "4K" && q !== "1080P" && q !== "Auto") return Promise.resolve(null);

  return probeBitrate(cand.url).then(function(probe) {
    if (probe) {
      mbps = probe.mbps;
      if (q === "Auto") {
        if (mbps >= AUTO_4K_MBPS) q = "4K";
        else if (mbps >= AUTO_1080_MBPS) q = "1080P";
        else q = "SKIP";
      }
      if (q !== "SKIP" && !cand.qualityLabel.indexOf("Auto") && probe.quality) {
        // master playlist gave a concrete resolution
        q = probe.quality;
      }
    } else {
      // probe failed: explicit label -> keep; Auto -> assume 1080P
      if (q === "Auto") q = "1080P";
    }

    if (q !== "4K" && q !== "1080P") return null; // 4K & 1080P only
    if (mbps === null) mbps = DEFAULT_BITRATE[q];

    // Estimated size: GB = Mbps * seconds / 8000
    var seconds = runtimeMin * 60;
    var sizeGB = (mbps * seconds) / 8000;
    var sizeStr = sizeGB >= 1
      ? sizeGB.toFixed(1) + "GB"
      : Math.round(sizeGB * 1000) + "MB";

    var host = pickHost(cand.url);
    var codec = q === "4K" ? "H.265" : "H.264";

    var mainTitle = "Movy • " + q + " • " + sizeStr;
    var lineA = server.lang + (server.lang !== "English" ? " • " + server.note : "");
    var lineB = "HLS • " + server.name + " • " + host + " • " + mbps.toFixed(1) + " Mbps";
    var lineC = codec + " • AAC";
    var detail = lineA + "\n" + lineB + "\n" + lineC;

    // Sort score: 4K group first, then by size desc
    var qualityScore = q === "4K" ? 100000 : 50000;
    var sizeMB = Math.round(sizeGB * 1000);
    var score = qualityScore + sizeMB;
    var sortTag = getInvertedSortTag(score, 999999);

    var stream = {
      name: sortTag + mainTitle,
      title: mainTitle,
      size: detail,
      url: cand.url,
      quality: q,
      description: detail,
      headers: { "User-Agent": UA, "Referer": REFERER },
      behaviorHints: {
        notWebReady: false,
        proxyHeaders: { request: { "User-Agent": UA, "Referer": REFERER } }
      }
    };
    if (cand.subtitles && cand.subtitles.length) stream.subtitles = cand.subtitles;
    return stream;
  });
}

// ─── Main ───────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  var t0 = Date.now();
  console.log("[Movy] === " + mediaType + "/" + tmdbId + " S" + (season || "?") + "E" + (episode || "?") + " ===");

  var isTv = (mediaType === "tv" || mediaType === "series");
  var type = isTv ? "tv" : "movie";
  tmdbId = parseInt(tmdbId, 10);
  if (!tmdbId || tmdbId <= 0) return Promise.resolve([]);

  return Promise.all([getSeed(tmdbId), resolveRuntime(tmdbId, mediaType)]).then(function(results) {
    var seed = results[0];
    var runtimeMin = results[1];
    if (!seed) { console.log("[Movy] no seed"); return []; }

    console.log("[Movy] runtime=" + runtimeMin + "min");

    // Title is NOT required by this API — tmdbId is the key (verified live)
    var q = "title=";
    q += "&mediaType=" + type;
    if (isTv) {
      if (season) q += "&seasonId=" + encodeURIComponent(String(season));
      if (episode) q += "&episodeId=" + encodeURIComponent(String(episode));
    }
    q += "&tmdbId=" + tmdbId;
    q += "&enc=2&seed=" + encodeURIComponent(seed);

    // Sequential + stagger: the API rejects concurrent requests sharing a seed.
    // Refresh the seed mid-pass if it's older than ~20s (slow networks).
    var candidates = [];
    var chain = Promise.resolve();
    for (var i = 0; i < SERVERS.length; i++) {
      (function(server) {
        chain = chain.then(function() {
          return getUsableSeed(tmdbId).then(function(freshSeed) {
            if (!freshSeed) return sleep(SERVER_STAGGER_MS);
            return fetchServer(server, q, freshSeed, tmdbId).then(function(res) {
              for (var j = 0; j < res.candidates.length; j++) candidates.push(res.candidates[j]);
              return sleep(SERVER_STAGGER_MS);
            });
          });
        });
      })(SERVERS[i]);
    }

    return chain.then(function() {
      console.log("[Movy] " + candidates.length + " raw candidates, probing...");

      // Probe + enrich all candidates in parallel
      return Promise.all(candidates.map(function(c) { return enrichStream(c, runtimeMin); }));
    }).then(function(streams) {
      // Dedup by url, drop nulls
      var seen = {};
      var out = [];
      for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        if (!s || !s.url || seen[s.url]) continue;
        seen[s.url] = true;
        out.push(s);
      }
      // name already carries the inverted sort tag; enforce order anyway
      out.sort(function(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      console.log("[Movy] === Done: " + out.length + " streams in " + (Date.now() - t0) + "ms ===");
      return out;
    });
  }).catch(function(err) {
    console.log("[Movy] FATAL: " + (err.message || err));
    return [];
  });
}

module.exports = { getStreams };
