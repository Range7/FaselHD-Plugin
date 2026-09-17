// ============================================================
// 4KHDHub Provider for Nuvio
// id: 4khdhub | version: 1.0.0
// Source: https://4khdhub.one
// Format: mp4, mkv | Types: movie, tv
// Quality order: 4K/2160p (largest→smallest), then 1080p (largest→smallest)
// Server info style: matches a111477
// ============================================================

const BASE_URL = "https://4khdhub.one";

// ── Helpers ─────────────────────────────────────────────────

function parseSize(sizeStr) {
  if (!sizeStr) return 0;
  const s = sizeStr.trim().toUpperCase();
  const num = parseFloat(s);
  if (s.includes("GB")) return num * 1024;
  if (s.includes("MB")) return num;
  return 0;
}

function decodeGreenmotorsToken(token) {
  try {
    // double base64 decode
    const first = atob(token);
    const second = atob(first);
    return second;
  } catch (e) {
    try {
      return atob(token);
    } catch (e2) {
      return null;
    }
  }
}

async function resolveGreenmotors(redirectUrl) {
  try {
    const url = new URL(redirectUrl);
    const id = url.searchParams.get("id");
    if (!id) return null;
    const decoded = decodeGreenmotorsToken(id);
    if (decoded && decoded.startsWith("http")) return decoded;

    // Try following the redirect
    const resp = await fetch(redirectUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": BASE_URL,
      },
    });
    if (resp.url && resp.url !== redirectUrl) return resp.url;
    return null;
  } catch (e) {
    return null;
  }
}

function buildSlug(title, year, type) {
  const clean = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return clean;
}

function qualityRank(qualityStr) {
  const q = qualityStr.toUpperCase();
  if (q.includes("2160") || q.includes("4K") || q.includes("UHD")) return 4;
  if (q.includes("1080")) return 3;
  if (q.includes("720")) return 2;
  return 1;
}

function sizeRank(sizeStr) {
  return parseSize(sizeStr);
}

// ── Search ──────────────────────────────────────────────────

async function search(query) {
  const url = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const html = await resp.text();
  const results = [];

  // Extract post links and titles from search results
  const linkRe = /href="(https:\/\/4khdhub\.one\/[a-z0-9-]+-(?:movie|series)-\d+\/)"[^>]*>[\s\S]*?<[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/[^>]+>/gi;
  // Fallback: grab all slugged links
  const slugRe = /href="(https:\/\/4khdhub\.one\/([a-z0-9-]+)-(?:movie|series)-(\d+)\/?)"/g;
  const titleRe = /<h3[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/h3>/gi;

  const links = [];
  let m;
  while ((m = slugRe.exec(html)) !== null) {
    const href = m[1];
    const type = href.includes("-series-") ? "tv" : "movie";
    if (!links.find((l) => l.url === href)) {
      links.push({ url: href, type });
    }
  }

  const titles = [];
  while ((m = titleRe.exec(html)) !== null) {
    titles.push(m[1].replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < Math.min(links.length, 20); i++) {
    results.push({
      id: links[i].url,
      title: titles[i] || links[i].url.split("/").slice(-2, -1)[0],
      type: links[i].type,
    });
  }
  return results;
}

// ── Find content URL from TMDB metadata ─────────────────────

async function findContentUrl(title, year, type) {
  // Try direct search on site
  const searchResults = await search(title);
  if (!searchResults.length) return null;

  // Best match: prefer exact title + year match
  const clean = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const r of searchResults) {
    const rClean = r.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (rClean.includes(clean) || clean.includes(rClean)) {
      return r.url;
    }
  }
  return searchResults[0].url;
}

// ── Scrape streams from content page ────────────────────────

async function scrapeStreams(pageUrl, season, episode) {
  const resp = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": BASE_URL,
    },
  });
  const html = await resp.text();

  // Detect if it's a series and if we need to navigate to episode
  let targetHtml = html;
  if (season !== undefined && episode !== undefined) {
    // Look for episode links matching S{season}E{episode}
    const epRe = new RegExp(
      `href="(https://4khdhub\\.one/[^"]*-series-\\d+[^"]*)"[^>]*>[^<]*S0?${season}[\\s]?E0?${episode}`,
      "i"
    );
    let epMatch = epRe.exec(html);
    if (!epMatch) {
      // Fallback: look for episode link pattern
      const epRe2 = new RegExp(
        `href="(https://4khdhub\\.one/[^"]*s0?${season}e0?${episode}[^"]*)"`,
        "i"
      );
      epMatch = epRe2.exec(html);
    }
    if (epMatch) {
      const epResp = await fetch(epMatch[1], {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      targetHtml = await epResp.text();
    }
  }

  return parseStreams(targetHtml, pageUrl);
}

function parseStreams(html, sourceUrl) {
  const streams = [];

  // ── Extract download sections ──
  // Pattern: filename, size, quality info, then greenmotors links
  // Sections are grouped by quality type (AVC/HEVC/DoVi/AV1/2160p etc.)

  // Extract all section headers and their associated links
  const sectionRe = /S\d+\s*([\w\s\d.+-]+?)\s*(?:Episodes?\s*\d+[^<]*)?<\/h3>/gi;
  
  // Get all filename-size-link blocks
  // filename pattern: Something.S01E01.Title.Quality.NF.WEB-DL...mkv
  const blockRe = /<[^>]*>([\w.\-]+\.(?:mkv|mp4|zip))<\/[^>]*>[\s\S]*?(\d+(?:\.\d+)?\s*(?:GB|MB))[\s\S]*?(?:WEB-DL|BluRay|REMUX)[^<]*<\/[^>]*>[\s\S]*?(?:Hindi|English|Arabic|Multi)[^<]*(?:[\s\S]*?<a[^>]*href="(https:\/\/greenmotors\.cc[^"]*)"[^>]*>([^<]*)<\/a>)[\s\S]*?(?:<a[^>]*href="(https:\/\/greenmotors\.cc[^"]*)"[^>]*>([^<]*)<\/a>)?/gi;

  // Simpler: grab all greenmotors links with their surrounding context
  const linkBlocks = [];
  const rawLinkRe = /<[^>]*class="[^"]*download[^"]*"[^>]*>[\s\S]*?<\/[^>]*>|<a[^>]*href="(https:\/\/greenmotors\.cc\?id=[^"]+)"[^>]*>(.*?)<\/a>/gi;

  // Most reliable: scan for filename groups then links
  // Find all .mkv/.zip file references with size
  const fileRe = /([\w.\-]+\.(?:mkv|zip))\s*(?:<[^>]+>)*\s*(?:Episode[- ]\d+\s+)?(\d+(?:\.\d+)?\s*(?:GB|MB))/gi;
  const files = [];
  let fm;
  while ((fm = fileRe.exec(html)) !== null) {
    files.push({ filename: fm[1], size: fm[2], pos: fm.index });
  }

  // Find all greenmotors links
  const gmRe = /href="(https:\/\/greenmotors\.cc\?id=[^"]+)"[^>]*>([^<]+)<\/a>/gi;
  const gmLinks = [];
  let gm;
  while ((gm = gmRe.exec(html)) !== null) {
    gmLinks.push({ url: gm[1], label: gm[2].trim(), pos: gm.index });
  }

  // Find quality sections
  const qualSectionRe = /(?:S\d+\s+)?([\w\s]+?(?:2160p|1080p|720p|4K|UHD|DoVi|HDR|HEVC|AVC|AV1|H264|H265)[^\n<]*)/gi;
  const qualSections = [];
  let qs;
  while ((qs = qualSectionRe.exec(html)) !== null) {
    qualSections.push({ text: qs[1].trim(), pos: qs.index });
  }

  // Find audio info
  const audioRe = /(?:Hindi|Tamil|Telugu|English|Arabic|Multi|Dual)(?:[,|]?\s*(?:Hindi|Tamil|Telugu|English|Arabic|Multi|Dual))*/gi;
  const audioMatches = [];
  let am;
  while ((am = audioRe.exec(html)) !== null) {
    audioMatches.push({ text: am[0].trim(), pos: am.index });
  }

  // Parse page title info
  const printMatch = html.match(/Print:\s*([^<\n]+)/i);
  const printInfo = printMatch ? printMatch[1].trim() : "";

  // Build streams from files + nearest greenmotors links
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fname = file.filename;
    const sizeMB = parseSize(file.size);

    // Determine quality from filename
    let quality = "1080p";
    let qualityRankVal = 3;
    if (/2160p/i.test(fname) || /4K/i.test(fname) || /UHD/i.test(fname)) {
      quality = "2160p";
      qualityRankVal = 4;
    } else if (/1080p/i.test(fname)) {
      quality = "1080p";
      qualityRankVal = 3;
    } else if (/720p/i.test(fname)) {
      quality = "720p";
      qualityRankVal = 2;
    }

    // Skip non-4K and non-1080p
    if (qualityRankVal < 3) continue;

    // Determine codec
    let codec = "";
    if (/H\.265|H265|HEVC/i.test(fname)) codec = "H.265";
    else if (/H\.264|H264|AVC/i.test(fname)) codec = "H.264";
    else if (/AV1/i.test(fname)) codec = "AV1";
    else if (/REMUX/i.test(fname)) codec = "REMUX";

    // HDR type
    let hdr = "";
    if (/DoVi|DV/i.test(fname)) hdr = "DV";
    else if (/HDR/i.test(fname)) hdr = "HDR";
    else if (/HDR10/i.test(fname)) hdr = "HDR10";

    // Source
    let source = "WEB-DL";
    if (/BluRay|BDRip/i.test(fname)) source = "BluRay";
    if (/REMUX/i.test(fname)) source = "REMUX";

    // Audio from filename
    const audioFromFile = [];
    if (/Hindi/i.test(fname)) audioFromFile.push("Hindi");
    if (/Tamil/i.test(fname)) audioFromFile.push("Tamil");
    if (/Telugu/i.test(fname)) audioFromFile.push("Telugu");
    if (/English/i.test(fname)) audioFromFile.push("English");
    if (/Arabic/i.test(fname)) audioFromFile.push("Arabic");
    if (/Multi/i.test(fname)) audioFromFile.push("Multi");
    const audio = audioFromFile.length ? audioFromFile.join(", ") : "English";

    // Find closest greenmotors links after this file's position
    const nearLinks = gmLinks
      .filter((l) => l.pos > file.pos && l.pos < file.pos + 2000)
      .slice(0, 2);

    if (!nearLinks.length) continue;

    // Build server info label (like a111477)
    const sizeLabel = file.size.trim();
    let qualLabel = quality;
    if (hdr) qualLabel += ` ${hdr}`;
    if (codec) qualLabel += ` ${codec}`;

    const serverInfo = `4KHDHub | ${qualLabel} | ${source} | ${sizeLabel} | ${audio}`;
    const shortTitle = fname.replace(/\.[a-z0-9]+$/i, "").replace(/\./g, " ");

    for (const link of nearLinks) {
      streams.push({
        url: link.url,          // will resolve via greenmotors
        redirectUrl: link.url,
        filename: fname,
        quality,
        qualityRank: qualityRankVal,
        sizeMB,
        sizeLabel,
        codec,
        hdr,
        source,
        audio,
        serverInfo,
        label: `${link.label} — ${qualLabel} ${sizeLabel}`,
        serverName: "4KHDHub",
      });
    }
  }

  // ── Sort: 4K largest→smallest, then 1080p largest→smallest ──
  streams.sort((a, b) => {
    if (b.qualityRank !== a.qualityRank) return b.qualityRank - a.qualityRank;
    return b.sizeMB - a.sizeMB;
  });

  // Deduplicate by filename+label
  const seen = new Set();
  return streams.filter((s) => {
    const key = s.filename + s.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main provider export ─────────────────────────────────────

const provider = {
  id: "4khdhub",
  name: "4KHDHub",
  version: "1.0.0",
  description: "4KHDHub — 4K & 1080p Movies & Series. 4K first (largest→smallest), then 1080p (largest→smallest).",

  async getStreams({ title, year, type, season, episode, tmdbId, imdbId }) {
    try {
      // Step 1: find the page URL
      const pageUrl = await findContentUrl(title, year, type);
      if (!pageUrl) return [];

      // Step 2: scrape streams from the page
      const rawStreams = await scrapeStreams(pageUrl, season, episode);
      if (!rawStreams.length) return [];

      // Step 3: resolve greenmotors redirect → real URL
      const resolved = [];
      for (const s of rawStreams) {
        const realUrl = await resolveGreenmotors(s.redirectUrl);
        if (!realUrl) continue;

        resolved.push({
          url: realUrl,
          quality: s.quality === "2160p" ? "4K" : s.quality,
          title: s.serverInfo,
          description: s.filename,
          server: "4KHDHub",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://greenmotors.cc/",
          },
        });
      }

      return resolved;
    } catch (err) {
      console.error("[4KHDHub] error:", err);
      return [];
    }
  },
};

// Nuvio provider export
if (typeof module !== "undefined") module.exports = provider;
if (typeof globalThis !== "undefined") globalThis["4khdhub"] = provider;
