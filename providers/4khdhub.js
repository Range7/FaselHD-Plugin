/**
 * 4khdhub - Built from src/4khdhub/
 * Modified:
 *  - Only 4K and 1080p, largest per tier
 *  - Numbered name: "01 • 4KHDHub • 4K • 4.6GB", "02 • 4KHDHub • 1080p • 2.1GB"
 *  - Anime (Animation + Japanese origin) skipped
 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));
var BASE_URL = "https://4khdhub.one";
var TMDB_URL = "https://api.themoviedb.org/3";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";
var HEADERS = { "User-Agent": USER_AGENT, Referer: `${BASE_URL}/` };

function fetchText(_0) {
  return __async(this, arguments, function* (url, referer = BASE_URL) {
    const response = yield fetch(url, {
      headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: `${referer}/` })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.text();
  });
}

function absoluteUrl(value, base = BASE_URL) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  try { return new URL(value, base).toString(); } catch (e) { return ""; }
}

function decodeBase64(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  const input = String(value || "").replace(/=+$/, "");
  let output = "";
  let count = 0;
  let bits;
  let buffer;
  let index = 0;
  while (buffer = input.charAt(index++)) {
    buffer = alphabet.indexOf(buffer);
    if (buffer < 0) continue;
    bits = count % 4 ? bits * 64 + buffer : buffer;
    if (count++ % 4) {
      output += String.fromCharCode(bits >> (-2 * count & 6) & 255);
    }
  }
  return output;
}

function rot13(value) {
  return String(value || "").replace(/[a-zA-Z]/g, (character) => {
    const code = character.charCodeAt(0) + 13;
    const limit = character <= "Z" ? 90 : 122;
    return String.fromCharCode(code <= limit ? code : code - 26);
  });
}

function normalizeTitle(value) {
  return String(value || "").toLowerCase().replace(/\[[^\]]*]/g, " ").replace(/\b(the|a|an|directors?|cut)\b/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleScore(expected, candidate) {
  const expectedWords = normalizeTitle(expected).split(" ").filter(Boolean);
  const candidateWords = new Set(normalizeTitle(candidate).split(" ").filter(Boolean));
  if (!expectedWords.length) return 0;
  const matches = expectedWords.filter((word) => candidateWords.has(word)).length;
  return matches / expectedWords.length;
}

function parseQuality(value) {
  if (/\b(?:2160p|4k)\b/i.test(value)) return "2160p";
  const match = String(value || "").match(/\b(1080|720|480)p\b/i);
  return match ? `${match[1]}p` : "Unknown";
}

function parseSize(value) {
  const match = String(value || "").match(/([\d.]+)\s*(GB|MB|KB)/i);
  return match ? `${match[1]} ${match[2].toUpperCase()}` : "Unknown";
}

function sizeToBytes(sizeStr) {
  var m = String(sizeStr || "").match(/([\d.]+)\s*(TB|GB|MB|KB)/i);
  if (!m) return 0;
  var n = parseFloat(m[1]);
  var u = m[2].toUpperCase();
  if (u === "TB") return n * 1024 * 1024 * 1024 * 1024;
  if (u === "GB") return n * 1024 * 1024 * 1024;
  if (u === "MB") return n * 1024 * 1024;
  if (u === "KB") return n * 1024;
  return n;
}

function parseReleaseDetails(value, fallbackQuality = "Unknown") {
  var _a, _b, _c, _d, _e, _f;
  const text = String(value || "").replace(/_+/g, " ");
  const quality = parseQuality(text) !== "Unknown" ? parseQuality(text) : fallbackQuality;
  const details = [];
  const service = (_a = text.match(/\b(?:AMZN|NF|DSNP|MAX|ATVP|HULU)\b/i)) == null ? void 0 : _a[0];
  if (service) details.push(service.toUpperCase());
  const release = (_b = text.match(/\b(?:BluRay|WEB[. -]?DL|WEB[. -]?Rip|BRRip|HDRip|DVDRip)\b/i)) == null ? void 0 : _b[0];
  if (/\bUHD\b/i.test(text) && /BluRay/i.test(release || "")) details.push("UHD BluRay");
  else if (release) details.push(release.replace(/WEB[. -]?DL/i, "WEB-DL").replace(/WEB[. -]?Rip/i, "WEBRip"));
  if (/\bREMUX\b/i.test(text)) details.push("REMUX");
  if (/\bREPACK\b/i.test(text)) details.push("REPACK");
  if (/\bHDR10\+?|\bHDR\b/i.test(text)) details.push("HDR");
  if (/\b(?:Dolby[ -]?Vision|DoVi|DV)\b/i.test(text)) details.push("DV");
  if (/\b10[ -]?bit\b/i.test(text)) details.push("10-bit");
  const codec = (_c = text.match(/\b(?:HEVC|AVC|AV1|x265|x264|H[.]?265|H[.]?264)\b/i)) == null ? void 0 : _c[0];
  if (codec) details.push(codec.toUpperCase().replace(/^H265$/, "H.265").replace(/^H264$/, "H.264"));
  if (/\bMulti(?:[. -]?Audio)?\b/i.test(text)) details.push("Multi Audio");
  const audioDetails = [];
  for (const language of ["Hindi", "English", "Romanian", "Tamil", "Telugu", "Malayalam", "Bengali"]) {
    const section = ((_d = text.match(new RegExp(`\\b${language}\\b([^+\\]]*)`, "i"))) == null ? void 0 : _d[1]) || "";
    const audio = (_e = section.match(/(?:DDP?\s*\d\.\d|DTS-HD\s*MA\s*\d\.\d|DTS\s*\d\.\d|TrueHD\s*\d\.\d|AAC\s*\d\.\d|Atmos)/i)) == null ? void 0 : _e[0];
    if (audio) audioDetails.push(`${language} ${audio.replace(/DDP?\s*/i, (match) => match.trim().toUpperCase()).replace(/\s+/g, " ")}`);
    else if (new RegExp(`\\b${language}\\b`, "i").test(text)) audioDetails.push(language);
  }
  if (!audioDetails.some((detail) => /(?:DDP?|DTS|TrueHD|AAC|Atmos)/i.test(detail))) {
    const audio = (_f = text.match(/\b(?:DDP?\s*\d[.]\d|DTS-HD\s*MA\s*\d[.]\d|DTS\s*\d[.]\d|TrueHD(?:[.]?Atmos)?[. ]*\d[.]\d|AAC\s*\d[.]\d|Atmos[. ]*\d[.]\d)\b/i)) == null ? void 0 : _f[0];
    if (audio) details.push(audio.replace(/DDP?\s*/i, (match) => match.trim().toUpperCase()).replace(/\s+/g, " "));
  }
  details.push(...audioDetails);
  if (/\bE-?Sub\b/i.test(text)) details.push("ESub");
  return [quality, ...details].filter(Boolean).join(" \xB7 ");
}

function isDirectVideo(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".workers.dev") || host.endsWith(".r2.cloudflarestorage.com");
  } catch (e) { return false; }
}

function qualityRank(quality) {
  var q = String(quality || "").toLowerCase();
  if (q.indexOf("2160") !== -1 || q.indexOf("4k") !== -1) return 3;
  if (q.indexOf("1080") !== -1) return 2;
  if (q.indexOf("720") !== -1) return 1;
  return 0;
}

function shortQualityLabel(rank) {
  if (rank === 3) return "4K";
  if (rank === 2) return "1080p";
  return "";
}

function getMetadata(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const endpoint = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
    const response = yield fetch(
      `${TMDB_URL}/${endpoint}/${encodeURIComponent(tmdbId)}?api_key=${TMDB_KEY}`,
      { headers: { Accept: "application/json", "User-Agent": USER_AGENT } }
    );
    if (!response.ok) throw new Error(`TMDB HTTP ${response.status}`);
    const data = yield response.json();
    const date = endpoint === "tv" ? data.first_air_date : data.release_date;

    var genres = data.genres || [];
    var hasAnimation = genres.some(function (g) {
      return g && g.name && g.name.toLowerCase() === "animation";
    });
    var originalLang = data.original_language || "";
    var originCountry = data.origin_country || [];

    var isAnime = hasAnimation && (originalLang === "ja" || originCountry.indexOf("JP") !== -1);

    return {
      title: endpoint === "tv" ? data.name : data.title,
      year: date ? Number(date.slice(0, 4)) : null,
      isAnime: isAnime,
      originalLang: originalLang,
      originCountry: originCountry
    };
  });
}

function findPage(metadata, isSeries, season) {
  return __async(this, null, function* () {
    const query = isSeries && season ? `${metadata.title} Season ${season}` : `${metadata.title} ${metadata.year || ""}`.trim();
    const html = yield fetchText(`${BASE_URL}/?s=${encodeURIComponent(query)}`);
    const $ = import_cheerio_without_node_native.default.load(html);
    let best = null;
    $(".movie-card").each((_, element) => {
      const card = $(element);
      const title = card.find(".movie-card-title").text().trim();
      const format = card.find(".movie-card-format").text().trim();
      const meta = card.find(".movie-card-meta").text();
      const href = card.attr("href") || card.find("a[href]").first().attr("href");
      if (!title || !href) return;
      if (isSeries && !/series/i.test(format)) return;
      if (!isSeries && !/movies?/i.test(format)) return;
      const yearMatch = meta.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? Number(yearMatch[0]) : null;
      let score = titleScore(metadata.title, title);
      if (metadata.year && year === metadata.year) score += 0.35;
      else if (metadata.year && year && Math.abs(year - metadata.year) > 1) score -= 0.5;
      if (isSeries && season) {
        const foundSeason = title.match(/(?:season\s*|s)(\d+)/i);
        if (foundSeason && Number(foundSeason[1]) === Number(season)) score += 0.4;
        else if (foundSeason) score -= 0.6;
      }
      if (!best || score > best.score) best = { url: absoluteUrl(href), score, title };
    });
    return best && best.score >= 0.7 ? best.url : "";
  });
}

function decodeRedirect(url) {
  return __async(this, null, function* () {
    var _a, _b;
    if (/hubcloud|hubdrive/i.test(url)) return url;
    try {
      const html = yield fetchText(url);
      const encoded = ((_a = html.match(/['"]o['"]\s*,\s*['"]([^'"]+)['"]/)) == null ? void 0 : _a[1]) || ((_b = html.match(/'o','([^']+)'/)) == null ? void 0 : _b[1]);
      if (!encoded) return url;
      const decoded = decodeBase64(rot13(decodeBase64(decodeBase64(encoded))));
      const payload = JSON.parse(decoded);
      return payload.o ? decodeBase64(payload.o).trim() : url;
    } catch (e) { return url; }
  });
}

function findHubCloud(item, pageUrl, $) {
  return __async(this, null, function* () {
    const links = item.find("a[href]").get();
    for (const element of links) {
      const link = $(element);
      const href = link.attr("href");
      const text = link.text();
      if (!href) continue;
      if (/hubcloud/i.test(text) || /hubcloud/i.test(href)) {
        return decodeRedirect(absoluteUrl(href, pageUrl));
      }
      if (/hubdrive/i.test(text) || /hubdrive/i.test(href)) {
        const driveUrl = yield decodeRedirect(absoluteUrl(href, pageUrl));
        try {
          const driveHtml = yield fetchText(driveUrl, pageUrl);
          const $drive = import_cheerio_without_node_native.default.load(driveHtml);
          const cloud = $drive("a[href]").filter((_, anchor) => {
            const candidate = $drive(anchor);
            return /hubcloud/i.test(`${candidate.text()} ${candidate.attr("href") || ""}`);
          }).first().attr("href");
          if (cloud) return absoluteUrl(cloud, driveUrl);
        } catch (e) {}
      }
    }
    return "";
  });
}

function extractHubCloud(url, fallback) {
  return __async(this, null, function* () {
    var _a;
    try {
      let html = yield fetchText(url, url);
      let pageUrl = url;
      const redirect = ((_a = html.match(/var url\s*=\s*['"]([^'"]+)['"]/)) == null ? void 0 : _a[1]) || import_cheerio_without_node_native.default.load(html)("#download").attr("href");
      if (redirect) {
        pageUrl = absoluteUrl(redirect, url);
        html = yield fetchText(pageUrl, url);
      }
      const $ = import_cheerio_without_node_native.default.load(html);
      const header = $("div.card-header").text().replace(/\s+/g, " ").trim() || $("title").text().trim() || fallback.title;
      const parsedSize = parseSize($("i#size, #size").first().text());
      const size = parsedSize !== "Unknown" ? parsedSize : fallback.size;
      const quality = parseQuality(header) !== "Unknown" ? parseQuality(header) : fallback.quality;
      const displayQuality = parseReleaseDetails(header, quality);
      const results = [];
      $("a[href]").each((_, element) => {
        const href = $(element).attr("href");
        if (!href || !isDirectVideo(href)) return;
        results.push({ url: href, title: header, quality: displayQuality, size });
      });
      return results;
    } catch (e) { return []; }
  });
}

function extractStreams(pageUrl, isSeries, season, episode) {
  return __async(this, null, function* () {
    const html = yield fetchText(pageUrl);
    const $ = import_cheerio_without_node_native.default.load(html);
    const items = [];
    if (isSeries && season && episode) {
      const seasonCode = `S${String(season).padStart(2, "0")}`;
      const episodeCode = `Episode-${String(episode).padStart(2, "0")}`;
      $(".episode-item").each((_, element) => {
        const section = $(element);
        if (!section.find(".episode-title").text().includes(seasonCode)) return;
        section.find(".episode-download-item").each((__, download) => {
          if ($(download).text().includes(episodeCode)) items.push($(download));
        });
      });
    } else {
      $(".download-item").each((_, element) => items.push($(element)));
    }
    const resolved = yield Promise.all(
      items.map((item) => __async(this, null, function* () {
        const context = item.text().replace(/\s+/g, " ").trim();
        const fallback = {
          title: item.find(".file-title, .episode-file-title").text().trim() || context,
          quality: parseQuality(context),
          size: parseSize(context)
        };
        const cloud = yield findHubCloud(item, pageUrl, $);
        return cloud ? extractHubCloud(cloud, fallback) : [];
      }))
    );
    return resolved.flat();
  });
}

function getStreams(tmdbId, mediaType, season = null, episode = null) {
  return __async(this, null, function* () {
    const isSeries = mediaType === "tv" || mediaType === "series";
    if (!tmdbId || !isSeries && mediaType !== "movie") return [];
    try {
      console.log(`[4KHDHub] Looking up ${mediaType} ${tmdbId}`);
      const metadata = yield getMetadata(tmdbId, mediaType);

      if (metadata.isAnime) {
        console.log(`[4KHDHub] Anime detected, skipping: ${metadata.title}`);
        return [];
      }

      const pageUrl = yield findPage(metadata, isSeries, season);
      if (!pageUrl) return [];
      const extracted = yield extractStreams(pageUrl, isSeries, season, episode);
      const seen = {};
      const allStreams = extracted
        .filter((stream) => isDirectVideo(stream.url))
        .filter((stream) => {
          if (seen[stream.url]) return false;
          seen[stream.url] = true;
          return true;
        })
        .map((stream) => ({
          name: "4KHDHub",
          title: stream.title,
          url: stream.url,
          quality: stream.quality,
          language: "hi \u2022 en",
          size: stream.size,
          provider: "4khdhub"
        }))
        .filter(function (s) {
          var r = qualityRank(s.quality);
          return r === 3 || r === 2;
        });

      var best4K = null, best4KBytes = -1;
      var best1080 = null, best1080Bytes = -1;
      for (var i = 0; i < allStreams.length; i++) {
        var s = allStreams[i];
        var rank = qualityRank(s.quality);
        var bytes = sizeToBytes(s.size);
        if (rank === 3 && bytes > best4KBytes) { best4K = s; best4KBytes = bytes; }
        else if (rank === 2 && bytes > best1080Bytes) { best1080 = s; best1080Bytes = bytes; }
      }

      var streams = [];
      if (best4K) streams.push(best4K);
      if (best1080) streams.push(best1080);

      for (var j = 0; j < streams.length; j++) {
        var st = streams[j];
        var rank2 = qualityRank(st.quality);
        var qLabel = shortQualityLabel(rank2);
        var sizeLabel = (st.size && st.size !== "Unknown") ? st.size : "";
        var num = (j + 1);
        var numStr = num < 10 ? "0" + num : "" + num;
        var nameParts = [numStr, "4KHDHub"];
        if (qLabel) nameParts.push(qLabel);
        if (sizeLabel) nameParts.push(sizeLabel);
        st.name = nameParts.join(" \u2022 ");
      }

      streams.sort(function (a, b) {
        return qualityRank(b.quality) - qualityRank(a.quality);
      });

      console.log(`[4KHDHub] Returning ${streams.length} stream(s) — 4K kept: ${best4K ? "yes" : "no"}, 1080p kept: ${best1080 ? "yes" : "no"}`);
      return streams;
    } catch (error) {
      console.error(`[4KHDHub] Error: ${error.message}`);
      return [];
    }
  });
}

module.exports = { getStreams };
