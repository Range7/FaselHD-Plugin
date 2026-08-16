// Asia2TV 2 Provider for Nuvio
// Based on Cloudstream plugin by Abodabodd
// Site: https://ww1.asia2tv.pw
// Arabic Asian Drama (Korean, Japanese, Chinese)

var BASE_URL = "https://ww1.asia2tv.pw";
var TMDB_API_KEY = "15d2850027b7744312013263e12089b3";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
var FETCH_TIMEOUT = 15e3;

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
  return fetch(url, opts).then(function(r) {
    if (tid) clearTimeout(tid);
    return r;
  }).catch(function(e) {
    if (tid) clearTimeout(tid);
    throw e;
  });
}

function getMediaTitle(tmdbId, type) {
  return new Promise(function(resolve, reject) {
    var mediaType = type === "series" ? "tv" : "movie";
    safeFetch("https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ar-SA")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var title = data.title || data.name || data.original_title || data.original_name || null;
        resolve(title);
      })
      .catch(function() { resolve(null); });
  });
}

function searchAsia2tv(query) {
  return new Promise(function(resolve, reject) {
    var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);
    console.log("[Asia2TV] Searching: " + searchUrl);
    safeFetch(searchUrl)
      .then(function(r) { return r.text(); })
      .then(function(html) {
        if (!html || html.length < 100) {
          console.log("[Asia2TV] Empty search response");
          resolve(null);
          return;
        }

        // Extract first result: div.box-item -> div.postmovie-photo a
        var boxMatch = html.match(/<div[^>]*class=["'][^"']*box-item[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]+title=["']([^"']+)["']/i);
        if (boxMatch && boxMatch[1] && boxMatch[2]) {
          console.log("[Asia2TV] Found: " + boxMatch[2] + " -> " + boxMatch[1]);
          resolve({ title: boxMatch[2], url: boxMatch[1] });
          return;
        }

        // Fallback: any link with title
        var fallback = html.match(/<a[^>]+href=["'](https?:\/\/[^"']*asia2tv[^"']+)["'][^>]+title=["']([^"']+)["']/i);
        if (fallback && fallback[1] && fallback[2]) {
          console.log("[Asia2TV] Found (fallback): " + fallback[2] + " -> " + fallback[1]);
          resolve({ title: fallback[2], url: fallback[1] });
          return;
        }

        console.log("[Asia2TV] No results found");
        resolve(null);
      })
      .catch(function(e) {
        console.log("[Asia2TV] Search error: " + e.message);
        resolve(null);
      });
  });
}

function getEpisodeLink(seriesUrl, season, episode) {
  return new Promise(function(resolve, reject) {
    console.log("[Asia2TV] Fetching series page: " + seriesUrl);
    safeFetch(seriesUrl)
      .then(function(r) { return r.text(); })
      .then(function(html) {
        if (!html || html.length < 100) {
          resolve(null);
          return;
        }

        // Extract all episodes: div.loop-episode a
        var episodes = [];
        var epRegex = /<div[^>]*class=["'][^"']*loop-episode[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var match;
        while ((match = epRegex.exec(html)) !== null) {
          var href = match[1];
          var text = match[2].replace(/<[^>]+>/g, "").trim();
          var epNum = text.replace(/\D/g, "");
          episodes.push({ href: href, text: text, number: parseInt(epNum, 10) || 0 });
        }

        // If no episodes found, might be a movie
        if (episodes.length === 0) {
          // Check for movie watch link: a.watch_player
          var movieMatch = html.match(/<a[^>]+class=["'][^"']*watch_player[^"']*["'][^>]+href=["']([^"']+)["']/i);
          if (movieMatch && movieMatch[1]) {
            resolve(movieMatch[1]);
            return;
          }
          resolve(null);
          return;
        }

        // Find matching episode
        var targetEp = episodes.find(function(ep) { return ep.number === episode; });
        if (!targetEp) {
          // Fallback: use the episode at index (episode - 1) if available
          targetEp = episodes[episodes.length - episode] || episodes[0];
        }

        if (targetEp) {
          console.log("[Asia2TV] Episode link: " + targetEp.href);
          resolve(targetEp.href);
        } else {
          resolve(null);
        }
      })
      .catch(function(e) {
        console.log("[Asia2TV] Episode fetch error: " + e.message);
        resolve(null);
      });
  });
}

function getServerUrls(watchUrl) {
  return new Promise(function(resolve, reject) {
    console.log("[Asia2TV] Fetching watch page: " + watchUrl);
    safeFetch(watchUrl)
      .then(function(r) { return r.text(); })
      .then(function(html) {
        if (!html || html.length < 100) {
          resolve([]);
          return;
        }

        // Extract server URLs from data-server attributes
        var servers = [];
        var serverRegex = /<li[^>]+data-server=["']([^"']+)["'][^>]*>/gi;
        var match;
        while ((match = serverRegex.exec(html)) !== null) {
          var url = match[1];
          if (url.startsWith("//")) url = "https:" + url;
          if (url.startsWith("/")) url = BASE_URL + url;
          servers.push(url);
        }

        // Fallback: any iframe src
        if (servers.length === 0) {
          var iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
          while ((match = iframeRegex.exec(html)) !== null) {
            var url = match[1];
            if (url.startsWith("//")) url = "https:" + url;
            if (url.startsWith("/")) url = BASE_URL + url;
            servers.push(url);
          }
        }

        console.log("[Asia2TV] Found " + servers.length + " servers");
        resolve(servers);
      })
      .catch(function(e) {
        console.log("[Asia2TV] Server fetch error: " + e.message);
        resolve([]);
      });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return new Promise(function(resolve, reject) {
    var t0 = Date.now();
    var type = mediaType === "movie" ? "movie" : "series";
    console.log("[Asia2TV] === START " + type + "/" + tmdbId + " ===");

    getMediaTitle(tmdbId, type)
      .then(function(title) {
        if (!title) {
          console.log("[Asia2TV] No title from TMDB");
          resolve([]);
          return;
        }

        // Try Arabic title first, then original
        var queries = [title];
        return searchAsia2tv(title).then(function(result) {
          if (!result && queries.length > 1) {
            return searchAsia2tv(queries[1]);
          }
          return result;
        });
      })
      .then(function(result) {
        if (!result || !result.url) {
          console.log("[Asia2TV] No search result found");
          resolve([]);
          return;
        }

        var pageUrl = result.url;

        // For series, get specific episode
        if (type === "series") {
          return getEpisodeLink(pageUrl, season || 1, episode || 1).then(function(epLink) {
            if (!epLink) {
              console.log("[Asia2TV] No episode link found");
              resolve([]);
              return;
            }
            return getServerUrls(epLink).then(function(servers) {
              var streams = servers.map(function(url, index) {
                return {
                  name: "Asia2TV",
                  title: "سيرفر " + (index + 1) + " (Embed)",
                  url: url,
                  headers: {
                    "User-Agent": UA,
                    "Referer": BASE_URL + "/"
                  }
                };
              });
              console.log("[Asia2TV] === DONE: " + streams.length + " streams in " + (Date.now() - t0) + "ms ===");
              resolve(streams);
            });
          });
        }

        // For movies
        return getServerUrls(pageUrl).then(function(servers) {
          var streams = servers.map(function(url, index) {
            return {
              name: "Asia2TV",
              title: "سيرفر " + (index + 1) + " (Embed)",
              url: url,
              headers: {
                "User-Agent": UA,
                "Referer": BASE_URL + "/"
              }
            };
          });
          console.log("[Asia2TV] === DONE: " + streams.length + " streams in " + (Date.now() - t0) + "ms ===");
          resolve(streams);
        });
      })
      .catch(function(error) {
        console.log("[Asia2TV] === ERROR: " + error.message + " ===");
        resolve([]);
      });
  });
}

module.exports = { getStreams };
