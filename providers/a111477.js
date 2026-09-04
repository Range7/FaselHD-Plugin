function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const out = [];
    const seen = new Set();
    try {
      const isTv = mediaType === "tv";
      const meta = yield resolveMeta(tmdbId, mediaType);
      const ids = [];
      if (meta && meta.imdbId && meta.imdbId.startsWith("tt")) ids.push(meta.imdbId);
      ids.push(`tmdb:${tmdbId}`);
      const addonBase = manifestBaseUrl();
      for (const id of ids) {
        const ep = isTv ? `${addonBase}/stream/series/${id}:${season || 1}:${episode || 1}.json` : `${addonBase}/stream/movie/${id}.json`;
        try {
          const res = yield fetchT(ep, { headers: HEADERS }, 1e4);
          if (!res.ok) continue;
          const data = yield res.json();
          const streams = data && data.streams;
          if (!Array.isArray(streams)) continue;
          for (const it of streams) {
            const url = it && it.url;
            if (!url || !String(url).startsWith("http") || seen.has(url)) continue;
            const label = it.title || it.name || "111477";
            const quality = parseQuality(label);
            if (quality !== "1080p") continue;
            seen.add(url);
            out.push({
              ...it,
              name: it.name || "111477",
              title: label,
              url,
              quality,
              headers: HEADERS
            });
          }
        } catch (e) {
        }
      }
    } catch (e) {
    }
    return sortByQuality(dedupByUrl(out));
  });
}
