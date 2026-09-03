// ═══════════════════════════════════════════════════════════════
//  بلجن فاصل إعلاني (FaselHD) لـ Nuvio — أفلام · مسلسلات · أنمي
//  مبني على فحص حي تم بتاريخ 2026-08-27:
//   البحث: fslhd.co/?s=كلمة  (كروت movie-card — href قبل class!)
//   الحلقة: أزرار server-btn data-src="رابط-المشغل"
//   الاستخراج: سيرفر updown.icu → سكريبت packed base-36 → MP4 مباشر
//  ملاحظات:
//   - DoodStream و LuluVdo مستبعدين (كابتشا Cloudflare Turnstile)
//   - روابط الفيديو مرتبطة بالجلسة وتنتهي — عادي، البلجن يولدها كل مرة
// ═══════════════════════════════════════════════════════════════

"use strict";

var BASE_URL = "https://fslhd.co";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c"; // مفتاح TMDB العام (نفسه المستخدم ببلجنات المجتمع)
var TIMEOUT = 15000;

// ── أدوات الاتصال ──────────────────────────────────────────────
function safeFetch(url, opts) {
  var controller = new AbortController();
  var tid = setTimeout(function () { controller.abort(); }, TIMEOUT);
  var o = { method: "GET", headers: { "User-Agent": UA }, signal: controller.signal };
  if (opts && opts.headers) Object.keys(opts.headers).forEach(function (k) { o.headers[k] = opts.headers[k]; });
  if (opts && opts.redirect === "manual") o.redirect = "manual";
  return fetch(url, o).then(function (r) { clearTimeout(tid); return r; });
}

async function fetchText(url, opts) {
  try {
    var r = await safeFetch(url, opts);
    return r.ok ? await r.text() : "";
  } catch (e) { return ""; }
}

async function fetchJson(url, opts) {
  try {
    var r = await safeFetch(url, opts);
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

// ── عناوين TMDB (عربي + إنجليزي) ───────────────────────────────
async function getTitles(tmdbId, mediaType) {
  var path = mediaType === "movie" ? "movie" : "tv";
  var res = await Promise.all([
    fetchJson("https://api.themoviedb.org/3/" + path + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=ar-SA"),
    fetchJson("https://api.themoviedb.org/3/" + path + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US")
  ]);
  var ar = res[0] || {}, en = res[1] || {};
  var titles = [];
  [ar.name || ar.title, en.name || en.title, en.original_name || en.original_title].forEach(function (t) {
    if (t && titles.indexOf(t) === -1) titles.push(t);
  });
  var year = ((en.first_air_date || en.release_date || "") + "").split("-")[0];
  return { titles: titles, year: year };
}

// ── البحث في فاصل إعلاني ───────────────────────────────────────
// ملاحظة مهمة: الموقع يحط href قبل class — الريجكس مرتب كذا
async function searchFaselhd(query) {
  var html = await fetchText(BASE_URL + "/?s=" + encodeURIComponent(query));
  if (!html) return [];
  var results = [];
  var re = /<a\s+href="([^"]+)"\s+class="movie-card">([\s\S]*?)<\/a>/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var url = m[1];
    var tm = m[2].match(/<div class="movie-title">\s*([\s\S]*?)\s*<\/div>/);
    var title = tm ? tm[1].replace(/\s+/g, " ").trim() : "";
    if (url && title) results.push({ url: url, title: title });
  }
  return results;
}

// ── مطابقة العناوين ────────────────────────────────────────────
function normalize(s) {
  return (s || "").toLowerCase()
    .replace(/مشاهدة|انمي|أنمي|مترجم|مترجمة|اون لاين|أون لاين|كامل|HD|1080p|720p/g, " ")
    .replace(/ى/g, "ي") // توحيد الألف المقصورة
    .replace(/[إأآ]/g, "ا")
    .replace(/[^\w\s\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function similarity(a, b) {
  var na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.indexOf(nb) > -1 || nb.indexOf(na) > -1) return 85;
  var wa = na.split(" "), hits = 0;
  wa.forEach(function (w) { if (nb.indexOf(w) > -1) hits++; });
  return Math.round((hits / Math.max(wa.length, 1)) * 100);
}

// ── فك تشفير updown (خوارزمية Dean Edwards العلنية، base-36) ───
function unpackPacked(html) {
  var m = html.match(/\}\('(.*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'(.*?)'\.split\('\|'\)\)/);
  if (!m) return "";
  var payload = m[1], base = parseInt(m[2]), count = parseInt(m[3]), keys = m[4].split("|");
  var alpha = "0123456789abcdefghijklmnopqrstuvwxyz";
  function enc(n) {
    if (n === 0) return "0";
    var s = "";
    while (n > 0) { s = alpha[n % base] + s; n = Math.floor(n / base); }
    return s;
  }
  var decoded = payload;
  for (var i = count - 1; i >= 0; i--) {
    if (i < keys.length && keys[i]) {
      decoded = decoded.replace(new RegExp("\\b" + enc(i).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"), keys[i]);
    }
  }
  return decoded;
}

// ── استخراج الروابط من صفحة الحلقة/الفيلم ──────────────────────
async function extractStreamsFromPage(pageUrl) {
  var html = await fetchText(pageUrl);
  if (!html) return [];

  // كل أزرار السيرفرات
  var btns = [];
  var bre = /<button[^>]*class="server-btn[^"]*"[^>]*data-src="([^"]+)"[\s\S]*?<span>\s*([^<]+?)\s*<\/span>/g;
  var bm;
  while ((bm = bre.exec(html)) !== null) btns.push({ url: bm[1], label: bm[2] });

  // أولوية updown.icu (المجرّب — فك حزمة ← MP4)، ثم أي مضيف آخر بدون كابتشا
  var ordered = btns.filter(function (b) { return /updown\.icu/i.test(b.url); })
    .concat(btns.filter(function (b) { return !/updown|dood|d0o0d|lulu/i.test(b.url); }))
    .slice(0, 4);

  var streams = [];
  for (var i = 0; i < ordered.length; i++) {
    var btn = ordered[i];
    try {
      if (/updown\.icu/i.test(btn.url)) {
        // الدقة مدموجة برابط الزر: embed-xxxx-WxH.html
        var qm = btn.url.match(/-(\d{3,4})x(\d{3,4})\.html/);
        var quality = qm ? heightToQuality(parseInt(qm[2])) : "";
        var page = await fetchText(btn.url, { headers: { Referer: BASE_URL } });
        var decoded = unpackPacked(page);
        var link = (decoded.match(/https?:\/\/[^"'\\\s]+\.mp4[^"'\\\s]*/) || decoded.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/) || [])[0];
        if (link) {
          streams.push({
            name: "فاصل إعلاني" + (quality ? " · " + quality : ""),
            link: link,
            headers: { Referer: "https://updown.icu/", "User-Agent": UA }
          });
        }
      } else if (/streamwish|earnvids|myvid|cybervynx/i.test(btn.url)) {
        // محاولات مستقبلية — بعضها يحتاج طبقات إضافية
        var page2 = await fetchText(btn.url, { headers: { Referer: BASE_URL } });
        var direct = (page2.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/) || [])[0];
        if (direct) {
          streams.push({ name: "فاصل إعلاني · " + btn.label, link: direct, headers: { Referer: btn.url } });
        }
      }
    } catch (e) { /* نكمل للسيرفر التالي */ }
    if (streams.length >= 2) break; // نسخة واحدة حقيقية تكفي + بديل
  }
  return streams;
}

function heightToQuality(h) {
  if (h >= 2000) return "4K";
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 400) return "480p";
  return h + "p";
}

// ── اختيار أفضل نتيجة ──────────────────────────────────────────
function pickBest(results, titles, year, type, season, episode) {
  // للمسلسلات: نفضل صفحات "الحلقة N" برقم صحيح
  if (type !== "movie" && episode) {
    var epRe = new RegExp("الحلق[ةه][\\s\\-]*(\\d+)");
    var exact = results.filter(function (r) {
      var m = r.title.match(epRe);
      return m && parseInt(m[1]) === parseInt(episode);
    });
    if (exact.length) return exact[0];
  }
  // للأفلام: نستبعد صفحات الحلقات ونفضّل تطابق العنوان + السنة
  var scored = results.map(function (r) {
    var s = 0;
    titles.forEach(function (t) { s = Math.max(s, similarity(r.title, t)); });
    if (year && r.title.indexOf(year) > -1) s += 10;
    var isEpisode = /الحلق[ةه]/.test(r.title);
    if (type === "movie" && isEpisode) s -= 30;
    return { r: r, s: s };
  }).sort(function (a, b) { return b.s - a.s; });
  return scored.length && scored[0].s >= 40 ? scored[0].r : null;
}

// ── نقطة الدخول ────────────────────────────────────────────────
async function getStreams(url, type, season, episode) {
  try {
    // استخراج TMDB ID من الرابط (أنماط: tmdb-123 / tmdb://123 / رقم مباشر)
    var idm = (url || "").match(/tmdb[^\d]*(\d+)/) || (url || "").match(/(\d{4,})/);
    var tmdbId = idm ? idm[1] : (url || "");
    if (!tmdbId) return [];

    var info = await getTitles(tmdbId, type);
    if (!info.titles.length) return [];

    // 1) للمسلسلات: بحث مباشر "العنوان الحلقة N"
    var candidates = [];
    if (type !== "movie" && episode) {
      candidates = await searchFaselhd(info.titles[0] + " الحلقة " + episode);
    }
    // 2) البحث العادي بكل العناوين (عربي أولاً — فهرسة الموقع عربية)
    for (var t = 0; t < info.titles.length && candidates.length < 3; t++) {
      var more = await searchFaselhd(info.titles[t]);
      candidates = candidates.concat(more);
    }
    if (!candidates.length) return [];

    var best = pickBest(candidates, info.titles, info.year, type, season, episode);
    if (!best) return [];

    return await extractStreamsFromPage(best.url);
  } catch (e) {
    console.log("[FaselHD] خطأ: " + (e && e.message));
    return [];
  }
}

module.exports = { getStreams: getStreams };
