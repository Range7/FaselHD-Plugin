"use strict";

var cheerio = require("cheerio-without-node-native");

var VERSION = "1.2.0";
var TMDB_BASE = "https://www.themoviedb.org";
var TMDB_API = "https://api.themoviedb.org/3";
var SITE_BASES = ["https://www.qrmzi.tv", "https://krmizi.onl", "https://v2.qrmzi.website"];
var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var MAX_SERIES_PROBES = 6;
var MAX_SERVERS = 8;
var EPISODES_PER_SEASON_DEFAULT = 18;
var _cumulativeEpisodeOffset = 0;

function log(k, v) { var s = v === undefined || v === null || v === "" ? "" : " " + String(v); console.log("[Krmizi v" + VERSION + "] " + k + s); }
function logFailure(r, d) { console.log("[Krmizi v" + VERSION + "] failure=" + r + (d ? " detail=" + String(d) : "")); }
function errorMessage(e) { return e && e.message ? e.message : String(e || "unknown_error"); }
function originOf(u) { var m = String(u || "").match(/^(https?:\/\/[^\/]+)/i); return m ? m[1] : ""; }

function decodeHtml(v) {
  return String(v || "")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0*39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#([0-9]+);/g, function (_, d) { return String.fromCharCode(parseInt(d, 10)); });
}

function cleanUrlValue(v) {
  return decodeHtml(v).replace(/\\u0026/gi, "&").replace(/\\u003d/gi, "=").replace(/\\\//g, "/").trim();
}

function absUrl(v, base) {
  var url = cleanUrlValue(v);
  if (!url || /^javascript:/i.test(url) || url.charAt(0) === "#") return "";
  if (url.indexOf("//") === 0) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url;
  var origin = originOf(base || SITE_BASES[0]);
  if (url.charAt(0) === "/") return origin + url;
  var cb = String(base || SITE_BASES[0]).split("#")[0].split("?")[0];
  if (cb.charAt(cb.length - 1) !== "/") cb = cb.substring(0, cb.lastIndexOf("/") + 1);
  return cb + url;
}

function urlKey(u) {
  var v = String(u || "").split("#")[0].split("?")[0].replace(/\/+$/, "");
  try { v = decodeURIComponent(v); } catch (_) {}
  return v.toLowerCase();
}

function pathKey(u) { var m = urlKey(u).match(/^https?:\/\/[^\/]+(\/.*)$/i); return m ? m[1] : ""; }

function requestHeaders(referer, origin, accept) {
  var h = { "User-Agent": UA, "Accept": accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "ar,en-US;q=0.8,en;q=0.7,tr;q=0.6" };
  if (referer) h.Referer = referer;
  if (origin) h.Origin = origin;
  return h;
}

function isChallenge(html) {
  var t = String(html || "").toLowerCase();
  return t.indexOf("cf-chl-") >= 0 || t.indexOf("challenge-platform") >= 0 || t.indexOf("just a moment") >= 0 || t.indexOf("checking your browser") >= 0 || t.indexOf("cloudflare ray id") >= 0;
}

function fetchTextInfo(url, referer, origin, accept) {
  return fetch(url, { headers: requestHeaders(referer, origin, accept), skipSizeCheck: true }).then(function (r) {
    if (!r) throw new Error("http_no_response " + url);
    return r.text().then(function (body) {
      if (isChallenge(body)) throw new Error("cloudflare_challenge " + url);
      if (!r.ok) throw new Error("http_" + r.status + " " + url);
      return { html: String(body || ""), url: r.url || url, status: r.status };
    });
  });
}

function fetchJson(url, referer, origin) {
  return fetchTextInfo(url, referer, origin, "application/json,text/plain,*/*").then(function (r) {
    try { return JSON.parse(r.html); } catch (_) { throw new Error("invalid_json " + url); }
  });
}

function wrap($, el) { if (el && typeof el.attr === "function") return el; return $(el); }

function normalize(v) {
  return decodeHtml(v).toLowerCase()
    .replace(/[إأآٱا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[ؤئ]/g, "ء")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[ـ\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ıİ]/g, "i").replace(/[şŞ]/g, "s").replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u").replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9\u0600-\u06FF]+/gi, " ").replace(/\s+/g, " ").trim();
}

function compactTitle(v) {
  return normalize(v).replace(/(^|\s)(مسلسل|المسلسل|series|tv|show|مترجم|مترجمه|كامل|كامله|قرمزي|qrmzi|krmizi)(?=\s|$)/g, " ").replace(/\s+\d{4}\s*$/, "").replace(/\s+/g, " ").trim();
}

function cleanTmdbTitle(v) {
  return decodeHtml(v).replace(/\s*\(TV Series\s+\d{4}[^)]*\).*$/i, "").replace(/\s*\(\d{4}\)\s*$/, "").replace(/\s*[-—]\s*The Movie Database.*$/i, "").replace(/\s*\|\s*TMDB.*$/i, "").replace(/\s+/g, " ").trim();
}

function addTitle(list, seen, v) {
  var clean = cleanTmdbTitle(v);
  if (!clean || compactTitle(clean).length < 2) return;
  var key = normalize(clean);
  if (!seen[key]) { seen[key] = true; list.push(clean); }
  var wc = clean.replace(/^(?:[A-Z]{1,3}\s+){1,4}/, "").trim();
  var wk = normalize(wc);
  if (wc && wk.length >= 2 && !seen[wk]) { seen[wk] = true; list.push(wc); }
}

function phraseContains(h, n) { if (!h || !n || n.length < 3) return false; return (" " + h + " ").indexOf(" " + n + " ") >= 0; }

function fieldMatchScore(field, titles) {
  var nf = normalize(field);
  var cf = compactTitle(field);
  if (!nf) return 0;
  var best = 0;
  for (var i = 0; i < titles.length; i++) {
    var t = compactTitle(titles[i]);
    if (!t || t.length < 2) continue;
    if (cf === t) best = Math.max(best, 120);
    else if (nf === normalize(titles[i])) best = Math.max(best, 115);
    else if (phraseContains(nf, t)) best = Math.max(best, 80);
  }
  return best;
}

function episodeNumber(v) {
  var t = decodeHtml(v);
  var m = t.match(/(?:الحلقة|الحلقه|حلقة|حلقه)\s*[:\-]?\s*(\d{1,4})/i);
  if (!m) m = t.match(/\bS\d{1,2}E(\d{1,4})\b/i);
  if (!m) m = t.match(/\bep(?:isode)?[\s._-]*(\d{1,4})\b/i);
  if (!m) m = t.match(/[-_\/]e(\d{1,4})(?:[\/?._-]|$)/i);
  if (!m && /\/episode\//i.test(t)) m = t.match(/\/episode\/[^\/?#\s]*-?(\d{1,4})(?:[\/?#._-]|$)/i);
  if (!m && /\/episode\//i.test(t)) m = t.match(/[-_\/](\d{1,4})(?:[\/?#._-]|$)/);
  return m ? parseInt(m[1], 10) : NaN;
}

function siteEpisodeNumber(s, e) {
  if (s <= 1) return e;
  var off = _cumulativeEpisodeOffset > 0 ? _cumulativeEpisodeOffset : (s - 1) * EPISODES_PER_SEASON_DEFAULT;
  return off + e;
}

function deriveEpisodeUrlFromSample(sample, ep) {
  var m = sample.match(/^(.*\/episode\/[^\/?#]*?)(\d{1,4})([\/?#].*)?$/);
  if (m) return m[1] + ep + (m[3] || "");
  m = sample.match(/^(.*\/episode\/)(\d{1,4})([\/?#].*)?$/);
  if (m) return m[1] + ep + (m[3] || "");
  return "";
}

function explicitSeasonEpisode(v) {
  var m = String(v || "").match(/\bS(\d{1,2})E(\d{1,4})\b/i);
  if (!m) m = String(v || "").match(/(?:season|الموسم)[\s._-]*(\d{1,2})[\s._-]*(?:episode|الحلقة)[\s._-]*(\d{1,4})/i);
  return m ? { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) } : null;
}

function seasonFromText(t) {
  var v = String(t || "");
  var m = v.match(/الموسم\s+(الأول|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)/i);
  if (m) {
    var ar = { "الأول": 1, "الاول": 1, "الثاني": 2, "الثالث": 3, "الرابع": 4, "الخامس": 5, "السادس": 6, "السابع": 7, "الثامن": 8, "التاسع": 9, "العاشر": 10 };
    var no = m[1].replace(/أ/g, "ا");
    if (ar[no]) return ar[no];
    if (ar[m[1]]) return ar[m[1]];
  }
  m = v.match(/(?:الموسم|season|موسم)[\s._-]*(\d{1,2})/i);
  if (m) return parseInt(m[1], 10);
  m = v.match(/\bS(\d{1,2})\b/i);
  if (m) return parseInt(m[1], 10);
  return NaN;
}

function parseTmdbPage(html) {
  var $ = cheerio.load(html);
  var pt = $("title").first().text() || "";
  var title = cleanTmdbTitle($('meta[property="og:title"]').attr("content") || $("section.inner_content h2 a").first().text() || $("h2 a").first().text() || pt);
  var ym = pt.match(/(?:TV Series\s+|\()(\d{4})/i);
  return { title: title, year: ym ? parseInt(ym[1], 10) : 0 };
}

function parseTmdbAlternativeTitles(html) {
  var $ = cheerio.load(html);
  var titles = [];
  $("table.titles tbody tr").each(function (_, el) {
    var row = wrap($, el);
    var val = row.find("td").first().text();
    if (val) titles.push(val.replace(/\s+/g, " ").trim());
  });
  return titles;
}

function getTmdbMetadata(tmdbId) {
  var langs = ["tr-TR", "en-US", "ar-SA"];
  var jobs = [];
  for (var i = 0; i < langs.length; i++) {
    jobs.push(fetchTextInfo(TMDB_BASE + "/tv/" + encodeURIComponent(tmdbId) + "?language=" + langs[i], "", "").then(function (r) { return parseTmdbPage(r.html); }).catch(function () { return { title: "", year: 0 }; }));
  }
  var aliases = fetchTextInfo(TMDB_BASE + "/tv/" + encodeURIComponent(tmdbId) + "/titles?language=en-US", "", "").then(function (r) { return parseTmdbAlternativeTitles(r.html); }).catch(function () { return []; });
  return Promise.all([Promise.all(jobs), aliases]).then(function (parts) {
    var pages = parts[0] || [];
    var al = parts[1] || [];
    var titles = [];
    var seen = {};
    var year = 0;
    for (var p = 0; p < pages.length; p++) { addTitle(titles, seen, pages[p].title); if (!year && pages[p].year) year = pages[p].year; }
    for (var a = 0; a < al.length && titles.length < 50; a++) addTitle(titles, seen, al[a]);
    return { titles: titles, year: year };
  });
}

function getTmdbKey() {
  var k = "";
  try { if (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) k = TMDB_API_KEY; } catch (e) {}
  if (!k) { try { if (typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY) k = globalThis.TMDB_API_KEY; } catch (e) {} }
  if (!k) { try { if (typeof global !== "undefined" && global.TMDB_API_KEY) k = global.TMDB_API_KEY; } catch (e) {} }
  return String(k || "");
}

function fetchSeasonEpisodeCount(tmdbId, sn) {
  var key = getTmdbKey();
  if (!key) return Promise.resolve(NaN);
  var url = TMDB_API + "/tv/" + encodeURIComponent(tmdbId) + "/season/" + sn + "?api_key=" + key;
  return fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } }).then(function (r) {
    if (!r || !r.ok) return NaN;
    return r.json().then(function (d) { return (d && typeof d.episode_count === "number" && d.episode_count > 0) ? d.episode_count : NaN; });
  }).catch(function () { return NaN; });
}

function computeCumulativeEpisodes(tmdbId, wantedSeason) {
  if (wantedSeason <= 1) return Promise.resolve(0);
  var jobs = [];
  for (var s = 1; s < wantedSeason; s++) jobs.push(fetchSeasonEpisodeCount(tmdbId, s));
  return Promise.all(jobs).then(function (counts) {
    var total = 0;
    for (var i = 0; i < counts.length; i++) {
      if (isNaN(counts[i])) { var fb = (wantedSeason - 1) * EPISODES_PER_SEASON_DEFAULT; log("cumulative_episodes", "fallback=" + fb); return fb; }
      total += counts[i];
    }
    return total;
  });
}

function parseSeriesCards(html, pageUrl, titles) {
  var $ = cheerio.load(html);
  var cards = [];
  var seen = {};
  $('article.postEp a[href*="/series/"]').each(function (_, el) {
    var a = wrap($, el);
    var url = absUrl(a.attr("href"), pageUrl);
    if (!url || seen[urlKey(url)]) return;
    var img = a.find("img").first();
    var hf = [a.attr("title") || "", a.find(".title").first().text() || "", img.attr("alt") || ""];
    var heading = hf.join(" ");
    var poster = img.attr("data-src") || img.attr("src") || "";
    var hs = 0;
    for (var h = 0; h < hf.length; h++) hs = Math.max(hs, fieldMatchScore(hf[h], titles));
    var ps = Math.max(fieldMatchScore(poster, titles), fieldMatchScore(url, titles));
    var score = hs;
    if (ps >= 80) score = Math.max(score, 105);
    if (score >= 100) {
      seen[urlKey(url)] = true;
      cards.push({ url: url, heading: heading.replace(/\s+/g, " ").trim(), poster: poster, score: score });
    }
  });
  cards.sort(function (l, r) { return r.score - l.score; });
  return cards;
}

function seriesSelfIdentity($) {
  return {
    headings: [$(".singleSeries h1").first().text() || "", $("h1").first().text() || "", $("title").first().text() || ""],
    details: [$('meta[name="description"]').attr("content") || "", $('meta[property="og:description"]').attr("content") || "", $(".singleSeries .story").first().text() || "", $(".singleSeries img").first().attr("data-src") || "", $(".singleSeries img").first().attr("src") || ""]
  };
}

function verifySeriesCard(card, titles, indexUrl) {
  return fetchTextInfo(card.url, indexUrl, "").then(function (r) {
    var $ = cheerio.load(r.html);
    var id = seriesSelfIdentity($);
    var hs = 0;
    var ds = fieldMatchScore(r.url, titles);
    var i;
    for (i = 0; i < id.headings.length; i++) hs = Math.max(hs, fieldMatchScore(id.headings[i], titles));
    for (i = 0; i < id.details.length; i++) ds = Math.max(ds, fieldMatchScore(id.details[i], titles));
    if (!(hs >= 110 || (card.score >= 105 && ds >= 80))) return null;
    return { url: r.url, html: r.html, heading: $(".singleSeries h1").first().text() || $("h1").first().text() || card.heading, score: Math.max(card.score, hs, ds) };
  }).catch(function (e) {
    if (errorMessage(e).indexOf("cloudflare_challenge") === 0) logFailure("cloudflare_challenge", originOf(card.url));
    return null;
  });
}

function verifyRankedCards(cards, titles, indexUrl) {
  var idx = 0;
  function next() {
    if (idx >= cards.length || idx >= MAX_SERIES_PROBES) return Promise.resolve(null);
    var c = cards[idx++];
    return verifySeriesCard(c, titles, indexUrl).then(function (s) { if (s) return s; return next(); });
  }
  return next();
}

function resolveSeries(metadata) {
  var bi = 0;
  function nextBase() {
    if (bi >= SITE_BASES.length) return Promise.resolve(null);
    var base = SITE_BASES[bi++];
    var indexUrl = base + "/all-turkish-series/";
    return fetchTextInfo(indexUrl, base + "/", "").then(function (r) {
      var cards = parseSeriesCards(r.html, r.url, metadata.titles);
      if (!cards.length) return nextBase();
      return verifyRankedCards(cards, metadata.titles, r.url).then(function (s) { if (s) return s; return nextBase(); });
    }).catch(function (e) {
      if (errorMessage(e).indexOf("cloudflare_challenge") === 0) logFailure("cloudflare_challenge", originOf(indexUrl));
      return nextBase();
    });
  }
  return nextBase();
}

function findExactEpisode(series, wantedSeason, wantedEpisode) {
  var $ = cheerio.load(series.html);
  var matches = [];
  var seen = {};
  var siteEp = siteEpisodeNumber(wantedSeason, wantedEpisode);
  var candidates = [];
  if (siteEp !== wantedEpisode) candidates.push(siteEp);
  candidates.push(wantedEpisode);
  if (siteEp !== wantedEpisode) {
    if (candidates.indexOf(siteEp + 1) === -1) candidates.push(siteEp + 1);
    if (siteEp > 1 && candidates.indexOf(siteEp - 1) === -1) candidates.push(siteEp - 1);
  }

  log("episode_candidates", "candidates=" + candidates.join(",") + " (wanted=S" + wantedSeason + "E" + wantedEpisode + ", siteEp=" + siteEp + ")");

  $('a[href*="/episode/"]').each(function (_, el) {
    var a = wrap($, el);
    var url = absUrl(a.attr("href"), series.url);
    if (!url || seen[urlKey(url)]) return;
    var id = [a.attr("title") || "", a.find(".episodeNum").first().text() || "", a.find(".title").first().text() || "", a.find("img").first().attr("alt") || "", url].join(" ");
    var epNum = episodeNumber(id);
    if (candidates.indexOf(epNum) === -1) return;
    var explicit = explicitSeasonEpisode(id);
    if (explicit && explicit.season !== wantedSeason) return;
    seen[urlKey(url)] = true;
    matches.push({ url: url, identity: id, explicit: explicit, epNum: epNum });
  });

  log("episode_matches", "count=" + matches.length);

  if (matches.length) {
    var sm = [];
    for (var i = 0; i < matches.length; i++) if (matches[i].epNum === siteEp) sm.push(matches[i]);
    if (sm.length === 1) { log("episode_match", "site_ep=" + siteEp); return sm[0]; }
    var rm = [];
    for (var j = 0; j < matches.length; j++) if (matches[j].epNum === wantedEpisode) rm.push(matches[j]);
    if (rm.length === 1) { log("episode_match", "raw_ep=" + wantedEpisode); return rm[0]; }
    if (matches.length > 1) {
      var em = [];
      for (var k = 0; k < matches.length; k++) if (matches[k].explicit && matches[k].explicit.season === wantedSeason && matches[k].explicit.episode === wantedEpisode) em.push(matches[k]);
      if (em.length === 1) return em[0];
    }
    if (matches.length === 1) {
      var s = matches[0];
      if (!s.explicit && wantedSeason > 1) {
        var ss = seasonFromText(series.heading + " " + series.url);
        if (!isNaN(ss) && ss !== wantedSeason) logFailure("season_mismatch_single", "seriesSeason=" + ss);
        else return s;
      } else return s;
    }
  }

  var sample = "";
  $('a[href*="/episode/"]').each(function (_, el) {
    if (sample) return false;
    var u = absUrl($(el).attr("href") || "", series.url);
    if (u && /\/episode\//i.test(u)) sample = u;
  });
  if (sample) {
    var derived = deriveEpisodeUrlFromSample(sample, siteEp);
    if (derived && derived !== sample) {
      log("derived_url", "sample=" + sample + " -> " + derived);
      return { url: derived, identity: "derived " + derived, explicit: null, epNum: siteEp };
    }
  }

  logFailure("episode_not_found", "S" + wantedSeason + "E" + wantedEpisode + " (site candidates: " + candidates.join(",") + ")");
  return null;
}

function anaPlayerAllowed(u) { return /^https?:\/\/[^\/]*anaplayer\.online\//i.test(String(u || "")); }
function directMedia(u) { return /\.(?:m3u8|mp4)(?:[?#]|$)/i.test(String(u || "")); }

function verifyEpisodePage(series, epCand, wantedSeason, wantedEpisode) {
  var siteEp = siteEpisodeNumber(wantedSeason, wantedEpisode);
  return fetchTextInfo(epCand.url, series.url, "").then(function (r) {
    var $ = cheerio.load(r.html);
    var heading = [$(".singleInfo h1").first().text() || "", $("h1").first().text() || "", $("title").first().text() || ""].join(" ");
    var headingEp = episodeNumber(heading);
    if (headingEp !== wantedEpisode && headingEp !== siteEp) {
      logFailure("episode_identity_mismatch", "number: heading=" + headingEp + " wanted=" + wantedEpisode + " site=" + siteEp);
      return null;
    }
    var seriesLink = $("h2 a[href*=\"/series/\"]").first();
    var linkedSeries = absUrl(seriesLink.attr("href"), r.url);
    if (!linkedSeries || urlKey(linkedSeries) !== urlKey(series.url)) { logFailure("episode_identity_mismatch", "series"); return null; }
    var pn = $(".getEmbed .watch iframe[src]").first();
    var playerUrl = absUrl(pn.attr("src"), r.url);
    if (!playerUrl) {
      var dn = $(".getEmbed .watch video[src], .getEmbed .watch source[src]").first();
      playerUrl = absUrl(dn.attr("src"), r.url);
    }
    if (!playerUrl || (!anaPlayerAllowed(playerUrl) && !directMedia(playerUrl))) { logFailure("player_not_found", "page_container"); return null; }
    var explicit = explicitSeasonEpisode(playerUrl + " " + heading);
    if (explicit) {
      if (explicit.season !== wantedSeason) { logFailure("player_identity_mismatch", "S" + explicit.season + "E" + explicit.episode); return null; }
      if (explicit.episode !== wantedEpisode && explicit.episode !== siteEp) { logFailure("player_identity_mismatch", "episode: explicit=" + explicit.episode + " wanted=" + wantedEpisode + " site=" + siteEp); return null; }
    } else if (wantedSeason > 1) {
      var hs = seasonFromText(heading);
      var ss = seasonFromText(seriesLink.text() || "");
      var ps = seasonFromText(series.heading + " " + series.url);
      if (!isNaN(hs) && hs !== wantedSeason) { logFailure("player_identity_mismatch", "heading_season=" + hs); return null; }
      if (!isNaN(ss) && ss !== wantedSeason) { logFailure("player_identity_mismatch", "seriesLink_season=" + ss); return null; }
      if (!isNaN(ps) && ps !== wantedSeason) { logFailure("player_identity_mismatch", "seriesPage_season=" + ps); return null; }
    }
    return { episodeUrl: r.url, playerUrl: playerUrl, season: wantedSeason, episode: wantedEpisode };
  }).catch(function (e) {
    if (errorMessage(e).indexOf("cloudflare_challenge") === 0) logFailure("cloudflare_challenge", originOf(epCand.url));
    return null;
  });
}

function qualityFromText(v) {
  var t = String(v || "").toLowerCase();
  function h(n) { return new RegExp("(^|[^a-z0-9])" + n + "p?(?=$|[^a-z0-9])", "i").test(t); }
  if (h("2160") || /(^|[^a-z0-9])4k(?=$|[^a-z0-9])|\buhd\b/.test(t)) return "4K";
  if (h("1080") || /full\s*hd|\bfhd\b/.test(t)) return "1080p";
  if (h("720")) return "720p";
  if (h("576")) return "576p";
  if (h("480") || /\bsd\b/.test(t)) return "480p";
  if (h("360") || /\bmobile\b/.test(t)) return "360p";
  if (h("320")) return "320p";
  return "";
}

function qualityFromResolution(w, h) {
  var W = parseInt(w, 10) || 0;
  var H = parseInt(h, 10) || 0;
  if (H >= 2000 || W >= 3800) return "4K";
  if (H >= 1000 || W >= 1900) return "1080p";
  if (H >= 700 || W >= 1200) return "720p";
  if (H >= 560) return "576p";
  if (H >= 460) return "480p";
  if (H >= 340) return "360p";
  return H ? H + "p" : "";
}

function qualityRank(q) {
  var r = { "4K": 7000, "2160p": 7000, "1080p": 6000, "720p": 5000, "576p": 4000, "480p": 3000, "360p": 2000, "320p": 1000 };
  return r[q] || 0;
}

function mediaTypeFromUrl(u) {
  if (/\.m3u8(?:[?#]|$)/i.test(u)) return "m3u8";
  if (/\.mp4(?:[?#]|$)/i.test(u)) return "mp4";
  return "";
}

function streamObject(url, referer, quality, serverName) {
  var q = quality || qualityFromText(url);
  var label = String(serverName || "Server").replace(/\s+/g, " ").trim();
  var headers = { "User-Agent": UA };
  if (referer) { headers.Referer = referer; var o = originOf(referer); if (o) headers.Origin = o; }
  var stream = { name: "Krmizi", title: "Krmizi • " + label + (q ? " • " + q : ""), url: url, provider: "Krmizi", language: "ar", headers: headers };
  if (q) stream.quality = q;
  var t = mediaTypeFromUrl(url);
  if (t) stream.type = t;
  return stream;
}

function parseHlsMaster(text, masterUrl) {
  var lines = String(text || "").replace(/\r/g, "").split("\n");
  var variants = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("#EXT-X-STREAM-INF:") !== 0) continue;
    var info = lines[i];
    var res = info.match(/RESOLUTION=(\d+)x(\d+)/i);
    var q = res ? qualityFromResolution(res[1], res[2]) : qualityFromText(info);
    var n = i + 1;
    while (n < lines.length && (!lines[n].trim() || lines[n].charAt(0) === "#")) n++;
    if (n >= lines.length) continue;
    var url = absUrl(lines[n].trim(), masterUrl);
    if (url) variants.push({ url: url, quality: q || qualityFromText(url) });
  }
  return variants;
}

function variantsFromEncodedMaster(masterUrl) {
  var v = String(masterUrl || "");
  var m = v.match(/^(https?:\/\/[^?#]+\/)([^\/?#]+)_((?:,[a-z0-9]+)+),?\.urlset\/master\.m3u8(\?[^#]*)?$/i);
  if (!m) return [];
  var qs = { l: "360p", n: "480p", h: "720p", x: "1080p" };
  var codes = m[3].split(",");
  var out = [];
  var seen = {};
  for (var i = 0; i < codes.length; i++) {
    var c = String(codes[i] || "").toLowerCase();
    if (c !== "x") continue;
    if (!qs[c] || seen[c]) continue;
    seen[c] = true;
    out.push({ url: m[1] + m[2] + "_" + c + "/index-v1-a1.m3u8" + (m[4] || ""), quality: qs[c] });
  }
  return out;
}

function isMasterPlaylistUrl(u) { return /(?:master\.m3u8|\.urlset\/)/i.test(String(u || "")); }
function isHlsPlaylistText(t) { return /^\s*#EXTM3U(?:\s|$)/i.test(String(t || "").replace(/^\uFEFF/, "")); }
function reliableHlsSource(u, r, s) { var id = String(u || "") + " " + String(r || "") + " " + String(s || ""); return /cdnplus(?:\.space)?|dailymotion|dai\.ly|dmcdn/i.test(id); }

function unescapePackedString(v) {
  return String(v || "").replace(/\\'/g, "'").replace(/\\\\/g, "\\").replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
}

function unpackDeanEdwards(src) {
  var text = String(src || "");
  var pat = /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('((?:\\.|[^'])*)',(\d+),(\d+),'((?:\\.|[^'])*)'\.split\('\|'\)\)\)/g;
  var out = "";
  var m;
  var count = 0;
  while ((m = pat.exec(text)) !== null && count < 4) {
    var payload = unescapePackedString(m[1]);
    var radix = parseInt(m[2], 10);
    var c = parseInt(m[3], 10);
    var keys = unescapePackedString(m[4]).split("|");
    if (radix < 2 || radix > 36 || c > 2000 || payload.length > 250000) continue;
    while (c--) {
      if (!keys[c]) continue;
      payload = payload.replace(new RegExp("\\b" + c.toString(radix) + "\\b", "g"), keys[c]);
    }
    out += "\n" + payload;
    count++;
  }
  return out;
}

function mediaEntriesFromHtml(html) {
  var norm = cleanUrlValue(html);
  var up = unpackDeanEdwards(html);
  if (up) norm += "\n" + cleanUrlValue(up);
  var entries = [];
  var seen = {};
  function add(u, l) {
    var url = cleanUrlValue(u).replace(/[),;]+$/, "");
    if (!directMedia(url) || seen[url]) return;
    seen[url] = true;
    entries.push({ url: url, quality: qualityFromText(l) || qualityFromText(url) });
  }
  var pats = [
    /(?:file|src|source|hls|playlist|url)\s*:\s*["'](https?:[^"']+?\.(?:m3u8|mp4)(?:\?[^"']*)?)["']\s*(?:,\s*label\s*:\s*["']([^"']+)["'])?/gi,
    /["'](?:file|src|source|hls|playlist|url)["']\s*:\s*["'](https?:[^"']+?\.(?:m3u8|mp4)(?:\?[^"']*)?)["']\s*(?:,\s*["']label["']\s*:\s*["']([^"']+)["'])?/gi
  ];
  for (var p = 0; p < pats.length; p++) {
    var pat = pats[p];
    var m;
    while ((m = pat.exec(norm)) !== null) add(m[1], m[2] || "");
  }
  var gen = /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mp4)(?:\?[^"'\\\s<>]*)?/gi;
  var gm;
  while ((gm = gen.exec(norm)) !== null) add(gm[0], "");
  return entries;
}

function supportedDirectEmbed(u) { return /^https?:\/\/[^\/]*(?:cdnplus\.space|mp4plus\.cyou|anafast\.cyou|vidoba\.cyou|vidspeed\.space|larhu\.website)\//i.test(String(u || "")); }

function dailymotionId(u) {
  var v = String(u || "");
  var m = v.match(/dailymotion\.com\/(?:embed\/)?video\/([A-Za-z0-9]+)/i);
  if (!m) m = v.match(/dai\.ly\/([A-Za-z0-9]+)/i);
  return m ? m[1] : "";
}

function primaryServerEmbed(html, serverUrl) {
  var $ = cheerio.load(html);
  var n = $(".aplr-player-content iframe#iframe[src], .video-con iframe#iframe[src], iframe#iframe[src]").first();
  var url = absUrl(n.attr("src"), serverUrl);
  if (!url || urlKey(url) === urlKey(serverUrl)) return "";
  return url;
}

function collectAnaServers(html, playerUrl) {
  var $ = cheerio.load(html);
  var servers = [];
  var seen = {};
  var po = originOf(playerUrl);
  var pp = pathKey(playerUrl);
  $('a.aplr-link[href*="?serv="], a[href*="?serv="]').each(function (_, el) {
    var a = wrap($, el);
    var url = absUrl(a.attr("href"), playerUrl);
    if (!url || originOf(url) !== po || pathKey(url) !== pp || seen[url]) return;
    if (!url.match(/[?&]serv=(\d+)/i)) return;
    seen[url] = true;
    servers.push({ url: url, label: (a.text() || "Server").replace(/\s+/g, " ").trim() });
  });
  return servers.slice(0, MAX_SERVERS);
}

function addMediaEntry(entry, referer, serverName, streams, seenStreams) {
  var url = entry && entry.url ? entry.url : "";
  if (!url || seenStreams[url]) return Promise.resolve();
  var dq = entry.quality || qualityFromText(serverName) || qualityFromText(url);
  if (dq && dq !== "1080p") return Promise.resolve();
  if (!/\.m3u8(?:[?#]|$)/i.test(url)) {
    if (!dq) return Promise.resolve();
    seenStreams[url] = true;
    streams.push(streamObject(url, referer, dq, serverName));
    return Promise.resolve();
  }
  var ev = variantsFromEncodedMaster(url);
  if (ev.length) {
    seenStreams[url] = true;
    if (!reliableHlsSource(url, referer, serverName)) return Promise.resolve();
    for (var i = 0; i < ev.length; i++) {
      if (seenStreams[ev[i].url]) continue;
      seenStreams[ev[i].url] = true;
      streams.push(streamObject(ev[i].url, referer, ev[i].quality, serverName));
    }
    return Promise.resolve();
  }
  if (!reliableHlsSource(url, referer, serverName)) { seenStreams[url] = true; return Promise.resolve(); }
  return fetchTextInfo(url, referer, originOf(referer), "application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*").then(function (r) {
    var vs = parseHlsMaster(r.html, url);
    if (!vs.length) {
      if (dq && !isMasterPlaylistUrl(url) && isHlsPlaylistText(r.html) && !seenStreams[url]) {
        seenStreams[url] = true;
        streams.push(streamObject(url, referer, dq, serverName));
      }
      return;
    }
    for (var i = 0; i < vs.length; i++) {
      if (vs[i].quality !== "1080p" || seenStreams[vs[i].url]) continue;
      seenStreams[vs[i].url] = true;
      streams.push(streamObject(vs[i].url, referer, vs[i].quality, serverName));
    }
  }).catch(function () {});
}

function resolveDailymotion(url, referer, serverName, streams, seenStreams) {
  var id = dailymotionId(url);
  if (!id) return Promise.resolve();
  return fetchJson("https://www.dailymotion.com/player/metadata/video/" + id, referer, originOf(referer)).then(function (data) {
    var jobs = [];
    var qs = data && data.qualities ? data.qualities : {};
    var keys = Object.keys(qs);
    for (var i = 0; i < keys.length; i++) {
      var list = qs[keys[i]] || [];
      for (var j = 0; j < list.length; j++) {
        if (!list[j] || !list[j].url) continue;
        var q = qualityFromText(keys[i]);
        if (q !== "1080p") continue;
        jobs.push(addMediaEntry({ url: list[j].url, quality: q }, url, serverName, streams, seenStreams));
      }
    }
    if (!jobs.length && data && data.stream_hls_url) jobs.push(addMediaEntry({ url: data.stream_hls_url, quality: "" }, url, serverName, streams, seenStreams));
    return Promise.all(jobs);
  }).catch(function () {});
}

function resolveEmbedTarget(target, expected, streams, seenStreams) {
  if (!target || !target.url) return Promise.resolve();
  var url = target.url;
  if (directMedia(url)) return addMediaEntry({ url: url, quality: qualityFromText(url) }, target.referer, target.label, streams, seenStreams);
  if (dailymotionId(url)) return resolveDailymotion(url, target.referer, target.label, streams, seenStreams);
  if (!supportedDirectEmbed(url)) return Promise.resolve();
  return fetchTextInfo(url, target.referer, originOf(target.referer)).then(function (r) {
    var explicit = explicitSeasonEpisode(r.html + " " + r.url);
    var siteEp = siteEpisodeNumber(expected.season, expected.episode);
    if (explicit) {
      if (explicit.season !== expected.season) { logFailure("player_identity_mismatch", target.label + " S" + explicit.season); return; }
      if (explicit.episode !== expected.episode && explicit.episode !== siteEp) { logFailure("player_identity_mismatch", target.label + " E" + explicit.episode); return; }
    }
    var es = mediaEntriesFromHtml(r.html);
    var jobs = [];
    for (var i = 0; i < es.length; i++) jobs.push(addMediaEntry(es[i], r.url, target.label, streams, seenStreams));
    return Promise.all(jobs);
  }).catch(function () {});
}

function resolveAnaPlayer(playerUrl, episodeUrl, wantedSeason, wantedEpisode) {
  var streams = [];
  var seenStreams = {};
  var siteEp = siteEpisodeNumber(wantedSeason, wantedEpisode);
  return fetchTextInfo(playerUrl, episodeUrl, originOf(episodeUrl)).then(function (player) {
    var explicit = explicitSeasonEpisode(player.url + " " + player.html);
    if (explicit) {
      if (explicit.season !== wantedSeason) { logFailure("player_identity_mismatch", "AnaPlayer S" + explicit.season); return []; }
      if (explicit.episode !== wantedEpisode && explicit.episode !== siteEp) { logFailure("player_identity_mismatch", "AnaPlayer E" + explicit.episode); return []; }
    }
    var servers = collectAnaServers(player.html, player.url);
    if (!servers.length) {
      var fb = primaryServerEmbed(player.html, player.url);
      if (fb) servers.push({ url: player.url, label: "Main", inlineEmbed: fb });
    }
    var sJobs = [];
    for (var i = 0; i < servers.length; i++) {
      (function (s) {
        if (s.inlineEmbed) { sJobs.push(Promise.resolve({ url: s.inlineEmbed, label: s.label, referer: s.url })); return; }
        sJobs.push(fetchTextInfo(s.url, player.url, originOf(player.url)).then(function (sp) {
          var e = primaryServerEmbed(sp.html, sp.url);
          if (!e) return null;
          return { url: e, label: s.label, referer: sp.url };
        }).catch(function () { return null; }));
      })(servers[i]);
    }
    return Promise.all(sJobs).then(function (rt) {
      var targets = [];
      var st = {};
      for (var t = 0; t < rt.length; t++) {
        if (!rt[t] || !rt[t].url || st[rt[t].url]) continue;
        st[rt[t].url] = true;
        targets.push(rt[t]);
        log("server", rt[t].label);
      }
      var jobs = [];
      var expected = { season: wantedSeason, episode: wantedEpisode };
      for (var j = 0; j < targets.length; j++) jobs.push(resolveEmbedTarget(targets[j], expected, streams, seenStreams));
      return Promise.all(jobs).then(function () { return streams; });
    });
  }).catch(function (e) {
    if (errorMessage(e).indexOf("cloudflare_challenge") === 0) logFailure("cloudflare_challenge", originOf(playerUrl));
    return [];
  });
}

function resolvePlayer(verified) {
  if (directMedia(verified.playerUrl)) {
    var streams = [];
    var seen = {};
    return addMediaEntry({ url: verified.playerUrl, quality: qualityFromText(verified.playerUrl) }, verified.episodeUrl, "Main", streams, seen).then(function () { return streams; });
  }
  if (anaPlayerAllowed(verified.playerUrl)) return resolveAnaPlayer(verified.playerUrl, verified.episodeUrl, verified.season, verified.episode);
  return Promise.resolve([]);
}

function sortStreams(streams) {
  return (streams || []).sort(function (l, r) {
    var d = qualityRank(r.quality || "") - qualityRank(l.quality || "");
    if (d) return d;
    return String(l.title || "").localeCompare(String(r.title || ""));
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var type = String(mediaType || "").toLowerCase();
  var ws = parseInt(season, 10);
  var we = parseInt(episode, 10);
  var id = String(tmdbId || "").trim();
  if (type !== "tv" && type !== "series" && type !== "show") return Promise.resolve([]);
  if (!/^\d+$/.test(id) || !ws || !we || ws < 1 || we < 1) { logFailure("invalid_request", "tmdb_or_episode"); return Promise.resolve([]); }
  log("tmdb_id", id);
  log("request", "S" + ws + "E" + we);

  return computeCumulativeEpisodes(id, ws).then(function (offset) {
    _cumulativeEpisodeOffset = offset;
    log("site_episode", siteEpisodeNumber(ws, we) + " (offset=" + offset + ")");
    return getTmdbMetadata(id).then(function (metadata) {
      log("titles", metadata.titles.join(" | "));
      if (!metadata.titles.length) { logFailure("tmdb_metadata_not_found"); return null; }
      return resolveSeries(metadata);
    }).then(function (series) {
      if (!series) { logFailure("series_not_found"); return null; }
      log("matched_series", series.url);
      var cand = findExactEpisode(series, ws, we);
      if (!cand) { logFailure("episode_not_found", "S" + ws + "E" + we); return null; }
      return verifyEpisodePage(series, cand, ws, we);
    }).then(function (ve) {
      if (!ve) return [];
      log("episode_url", ve.episodeUrl);
      log("player_url", ve.playerUrl);
      return resolvePlayer(ve);
    }).then(function (streams) {
      var filtered = (streams || []).filter(function (s) { return (s.quality || "") === "1080p"; });
      var sorted = sortStreams(filtered);
      if (!sorted.length) logFailure("no_1080p_sources");
      for (var i = 0; i < sorted.length; i++) log("quality", sorted[i].quality || "unannounced");
      log("streams_found", sorted.length);
      return sorted;
    }).catch(function (e) {
      var m = errorMessage(e);
      if (m.indexOf("cloudflare_challenge") === 0) logFailure("cloudflare_challenge");
      else logFailure("fatal", m);
      return [];
    });
  });
}

module.exports = { getStreams: getStreams };
