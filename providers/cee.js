// Cee (Cinemana) Provider for Nuvio
// Based on Cloudstream plugin by Abodabodd
// Site: https://cee.buzz
// Arabic movies & series with direct video links

var BASE_URL = "https://cee.buzz";
var API_V2 = BASE_URL + "/api/android";
var TMDB_API_KEY = "15d2850027b7744312013263e12089b3";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 2e4;

function safeFetch(url, options, timeout) {
  var ms = timeout || FETCH_TIMEOUT;
  var controller;
  var tid;
  try {
    controller = new AbortController();
    tid = setTimeout(function() { controller.abort(); }, ms);
  } catch (e) { controller = null; }
  var opts = options || {};
  if (controller) opts.signal = controller.signal;
  if (!opts.headers) opts.headers = {};
  opts.headers["User-Agent"] = UA;
  opts.headers["Referer"] = BASE_URL + "/";
  opts.headers["Accept"] = "application/json";
  return fetch(url, opts).then(function(r) {
    if (tid) clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid) clearTimeout(tid);
    throw e;
  });
}

function getMediaInfo(tmdbId, type) {
  return new Promise(function(resolve) {
    var mediaType = type === "series" ? "tv" : "movie";
    safeFetch("https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ar-SA")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var titles = [];
        if (data.title) titles.push(data.title);
        if (data.name) titles.push(data.name);
        if (data.original_title && data.original_title !== data.title) titles.push(data.original_title);
        if (data.original_name && data.original_name !== data.name) titles.push(data.original_name);
        resolve({
          titles: titles,
          year: (data.release_date || data.first_air_date || "").substring(0, 4),
          originalLang: data.original_language || ""
        });
      })
      .catch(function() { resolve({ titles: [], year: "", originalLang: "" }); });
  });
}

function searchCee(query, type) {
  return new Promise(function(resolve) {
    var encoded = encodeURIComponent(query);
    var currentYear = new Date().getFullYear();
    var yearRange = "1900," + currentYear;
    var page = 0;
    var itemsPerPage = 30;

    var typeParam = type === "series" ? "series" : "movies";
    var url = API_V2 + "/AdvancedSearch?level=0&videoTitle=" + encoded + "&staffTitle=" + encoded + "&year=" + yearRange + "&page=" + page + "&type=" + typeParam + "&itemsPerPage=" + itemsPerPage;

    console.log("[Cee] Searching: " + url);
    safeFetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!Array.isArray(data) || data.length === 0) {
          console.log("[Cee] No results");
          resolve([]);
          return;
        }
        console.log("[Cee] Found " + data.length + " results");
        resolve(data);
      })
      .catch(function(e) {
        console.log("[Cee] Search error: " + e.message);
        resolve([]);
      });
  });
}

function findBestMatch(items, query, year) {
  var q = query.toLowerCase().trim();
  var best = null;
  var bestScore = 0;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var enTitle = (item.en_title || "").toLowerCase().trim();
    var arTitle = (item.ar_title || "").toLowerCase().trim();
    var itemYear = String(item.year || "");

    var score = 0;
    if (enTitle === q || arTitle === q) score += 100;
    else if (enTitle.startsWith(q) || arTitle.startsWith(q)) score += 80;
    else if (enTitle.indexOf(q) !== -1 || arTitle.indexOf(q) !== -1) score += 60;

    if (year && itemYear === year) score += 30;

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (bestScore >= 50) return best;
  return null;
}

function getVideoLinks(nb) {
  return new Promise(function(resolve) {
    var url = API_V2 + "/transcoddedFiles/id/" + nb;
    console.log("[Cee] Getting streams: " + url);
    safeFetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!Array.isArray(data)) {
          resolve([]);
          return;
        }
        // Reverse to show highest quality first
        var links = data.slice().reverse().map(function(v) {
          return {
            url: v.videoUrl || "",
            resolution: v.resolution || "Auto",
            name: v.resolution || "Auto"
          };
        }).filter(function(v) { return v.url; });
        console.log("[Cee] Found " + links.length + " video links");
        resolve(links);
      })
      .catch(function(e) {
        console.log("[Cee] Video links error: " + e.message);
        resolve([]);
      });
  });
}

function getSubtitles(nb) {
  return new Promise(function(resolve) {
    var url = API_V2 + "/allVideoInfo/id/" + nb;
    safeFetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var subs = [];
        var translations = data.translations;
        if (Array.isArray(translations)) {
          translations.forEach(function(sub) {
            if (sub.file && sub.name) {
              subs.push({
                url: sub.file,
                language: sub.name,
                name: sub.name
              });
            }
          });
        }
        resolve(subs);
      })
      .catch(function() { resolve([]); });
  });
}

function getEpisodes(nb) {
  return new Promise(function(resolve) {
    var url = API_V2 + "/videoSeason/id/" + nb;
    console.log("[Cee] Getting episodes: " + url);
    safeFetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!Array.isArray(data)) {
          resolve([]);
          return;
        }
        var episodes = data.map(function(ep) {
          return {
            nb: ep.nb || "",
            episodeNum: parseInt(ep.episodeNummer || "1", 10) || 1,
            seasonNum: parseInt(ep.season || "1", 10) || 1,
            title: ep.en_title || "Episode"
          };
        }).filter(function(ep) { return ep.nb; });
        console.log("[Cee] Found " + episodes.length + " episodes");
        resolve(episodes);
      })
      .catch(function(e) {
        console.log("[Cee] Episodes error: " + e.message);
        resolve([]);
      });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return new Promise(function(resolve) {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    console.log("[Cee] ====== START " + type + "/" + tmdbId + " ======");

    getMediaInfo(tmdbId, type)
      .then(function(info) {
        if (!info.titles || info.titles.length === 0) {
          console.log("[Cee] No title from TMDB");
          resolve([]);
          return;
        }

        // Try each title
        var tryTitle = function(index) {
          if (index >= info.titles.length) {
            console.log("[Cee] No match found after trying all titles");
            resolve([]);
            return;
          }

          var title = info.titles[index];
          console.log("[Cee] Trying title [" + (index + 1) + "/" + info.titles.length + "]: " + title);

          searchCee(title, type).then(function(items) {
            var match = findBestMatch(items, title, info.year);
            if (match) {
              console.log("[Cee] Match found: " + match.en_title + " (nb=" + match.nb + ")");
              handleMatch(match, type, season, episode, info.titles[0] || title, resolve, t0);
            } else {
              tryTitle(index + 1);
            }
          });
        };

        tryTitle(0);
      })
      .catch(function(err) {
        console.log("[Cee] ====== ERROR: " + (err.message || err) + " ======");
        resolve([]);
      });
  });
}

function handleMatch(match, type, season, episode, displayTitle, resolve, t0) {
  var nb = match.nb;

  if (type === "series") {
    getEpisodes(nb).then(function(episodes) {
      var targetEp = null;
      var targetSeason = season || 1;
      var targetEpisode = episode || 1;

      for (var i = 0; i < episodes.length; i++) {
        if (episodes[i].seasonNum === targetSeason && episodes[i].episodeNum === targetEpisode) {
          targetEp = episodes[i];
          break;
        }
      }

      if (!targetEp && episodes.length > 0) {
        // Fallback: match by episode number only
        for (var i = 0; i < episodes.length; i++) {
          if (episodes[i].episodeNum === targetEpisode) {
            targetEp = episodes[i];
            break;
          }
        }
      }

      if (!targetEp && episodes.length > 0) {
        targetEp = episodes[0];
      }

      if (!targetEp) {
        console.log("[Cee] No episode found");
        resolve([]);
        return;
      }

      console.log("[Cee] Selected episode: S" + targetEp.seasonNum + "E" + targetEp.episodeNum + " (nb=" + targetEp.nb + ")");
      fetchStreamsAndSubs(targetEp.nb, displayTitle, "S" + targetEp.seasonNum + "E" + targetEp.episodeNum, resolve, t0);
    });
  } else {
    fetchStreamsAndSubs(nb, displayTitle, "", resolve, t0);
  }
}

function fetchStreamsAndSubs(nb, title, epLabel, resolve, t0) {
  Promise.all([
    getVideoLinks(nb),
    getSubtitles(nb)
  ]).then(function(results) {
    var links = results[0];
    var subtitles = results[1];

    if (links.length === 0) {
      console.log("[Cee] No video links");
      resolve([]);
      return;
    }

    var streams = links.map(function(link, index) {
      var quality = link.resolution;
      var qualityNum = 0;
      var qMatch = quality.match(/(\d{3,4})/);
      if (qMatch) qualityNum = parseInt(qMatch[1], 10);

      var streamObj = {
        name: "Cee",
        title: title + (epLabel ? " " + epLabel : "") + " - " + quality + " [MP4]",
        url: link.url,
        quality: quality,
        headers: {
          "User-Agent": UA,
          "Referer": BASE_URL + "/"
        }
      };

      if (subtitles.length > 0) {
        streamObj.subtitles = subtitles;
      }

      return streamObj;
    });

    console.log("[Cee] ====== DONE: " + streams.length + " streams in " + (Date.now() - t0) + "ms ======");
    resolve(streams);
  }).catch(function(err) {
    console.log("[Cee] ====== ERROR: " + (err.message || err) + " ======");
    resolve([]);
  });
}

module.exports = { getStreams };
