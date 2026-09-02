import os
import re
import json
import time
from flask import Flask, jsonify
from flask_cors import CORS
import cloudscraper
import requests

app = Flask(__name__)
CORS(app)

BASE_URL = "https://web920x.faselhdx.life"
TMDB_KEY = "1865f43a0549ca50d341dd9ab8b29f49"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"

# cloudscraper bypasses Cloudflare automatically
scraper = cloudscraper.create_scraper(
    browser={
        'browser': 'chrome',
        'platform': 'windows',
        'desktop': True
    }
)

def decrypt_enc(enc_str):
    key1 = "V2@%YSU2B]G~"
    key2 = "bv0fim4qf17"

    def ie(c):
        x = ord(c)
        if 97 <= x <= 122: return x - 97
        if 65 <= x <= 90: return x - 65 + 26
        if 48 <= x <= 57: return x - 48 + 52
        if x == 43: return 62
        if x == 47: return 63
        return 0

    def bn(x):
        if x <= 25: return chr(x + 97)
        if x <= 51: return chr(x - 26 + 65)
        if x <= 61: return chr(x - 52 + 48)
        if x == 62: return '+'
        if x == 63: return '/'
        return ' '

    def dec(e, k):
        r = ''
        for i in range(len(e)):
            kc = k[i % (len(k) - 1)]
            M = ie(e[i]) - ie(kc)
            r += bn(M if M >= 0 else M + 64)
        return r

    if not enc_str or not enc_str.startswith('enc:'):
        return enc_str
    try:
        return dec(dec(enc_str[4:], key2), key1)
    except:
        return enc_str

def extract_m3u8(html):
    results = []
    seen = set()

    # Direct m3u8
    for m in re.finditer(r'https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*', html):
        if m.group(0) not in seen:
            seen.add(m.group(0))
            results.append(m.group(0))

    # file: "..."
    for m in re.finditer(r'file\s*:\s*["\']([^"\']+)["\']', html):
        dec = decrypt_enc(m.group(1))
        if '.m3u8' in dec and dec not in seen:
            seen.add(dec)
            results.append(dec)

    # enc:...
    for m in re.finditer(r'enc:[A-Za-z0-9+/=]+', html):
        dec = decrypt_enc(m.group(0))
        if '.m3u8' in dec and dec not in seen:
            seen.add(dec)
            results.append(dec)

    return results

def extract_iframes(html):
    results = []
    blocked = ['google.com', 'recaptcha', 'googlesyndication', 'googletagmanager']

    for m in re.finditer(r'<iframe[^>]+src=["\']([^"\']+)["\'][^>]*>', html):
        url = m.group(1)
        if any(b in url for b in blocked):
            continue
        if not url.startswith('http'):
            url = BASE_URL + url
        results.append(url)

    for m in re.finditer(r'player_iframe\.location\.href\s*=\s*["\']([^"\']+)["\']', html):
        url = m.group(1)
        if not url.startswith('http'):
            url = BASE_URL + url
        results.append(url)

    return results

def filter_1080p(urls):
    filtered = []
    for url in urls:
        lower = url.lower()
        if '.m3u8' not in lower:
            continue
        is_1080 = 'hd1080' in lower or '1080' in lower or 'playlist' in lower or 'master' in lower or 'index' in lower
        not_lower = not any(q in lower for q in ['hd720', '720', 'hd480', '480', 'hd360', '360', 'hd240', '240'])
        if is_1080 and not_lower:
            filtered.append(url)
    return filtered

def get_tmdb_title(tmdb_id, media_type):
    t = 'movie' if media_type == 'movie' else 'tv'
    url = f"https://api.themoviedb.org/3/{t}/{tmdb_id}?api_key={TMDB_KEY}"
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=10)
        if r.ok:
            data = r.json()
            return data.get('title') or data.get('name')
    except Exception as e:
        print(f"TMDB error: {e}")
    return None

def search_faselhd(query):
    url = f"{BASE_URL}/?s={requests.utils.quote(query)}"
    try:
        r = scraper.get(url, headers={"User-Agent": UA, "Referer": BASE_URL + "/"}, timeout=15)
        if not r.ok:
            return []

        results = []
        for m in re.finditer(r'<div[^>]*class=["\'][^"\']*postDiv[^"\']*["\'][^>]*>[\s\S]*?</div>', r.text):
            block = m.group(0)
            href = re.search(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>', block)
            title = re.search(r'<h[1-6][^>]*>([^<]+)</h[1-6]>', block) or re.search(r'class=["\'][^"\']*title[^"\']*["\'][^>]*>([^<]+)', block)
            if href and title:
                h = href.group(1)
                if not h.startswith('http'):
                    h = BASE_URL + h
                results.append({'url': h, 'title': title.group(1).strip()})
        return results
    except Exception as e:
        print(f"Search error: {e}")
        return []

def get_episode_url(series_url, ep_num):
    try:
        r = scraper.get(series_url, headers={"User-Agent": UA, "Referer": BASE_URL + "/"}, timeout=15)
        if not r.ok:
            return None

        ep_all = re.search(r'<div[^>]*id=["\']epAll["\'][^>]*>[\s\S]*?</div>', r.text)
        if ep_all:
            ep_str = str(ep_num)
            for m in re.finditer(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>([^<]+)</a>', ep_all.group(0)):
                if ep_str in m.group(2) or f"الحلقة {ep_str}" in m.group(2):
                    h = m.group(1)
                    if not h.startswith('http'):
                        h = BASE_URL + h
                    return h
        return None
    except Exception as e:
        print(f"Episode error: {e}")
        return None

def resolve_iframe(iframe_url, referer):
    try:
        r = scraper.get(iframe_url, headers={"User-Agent": UA, "Referer": referer or BASE_URL + "/"}, timeout=15)
        if not r.ok:
            return []
        return extract_m3u8(r.text)
    except Exception as e:
        print(f"Iframe error: {e}")
        return []

@app.route('/resolve/<media_type>/<path:id_str>')
def resolve(media_type, id_str):
    t0 = time.time()
    parts = id_str.split(':')
    tmdb_id = parts[0]
    season = int(parts[1]) if len(parts) > 1 else 1
    episode = int(parts[2]) if len(parts) > 2 else 1

    print(f"\n=== Resolve {media_type} tmdb={tmdb_id} s={season} e={episode} ===")

    # Get TMDB title
    title = get_tmdb_title(tmdb_id, media_type)
    if not title:
        return jsonify({"streams": [], "error": "No TMDB title found"})

    # Search FaselHD
    results = search_faselhd(title)
    if not results:
        return jsonify({"streams": [], "error": "No FaselHD results"})

    page_url = results[0]['url']

    # For series, get episode
    if media_type == 'series':
        ep_url = get_episode_url(page_url, episode)
        if ep_url:
            page_url = ep_url

    # Load page
    r = scraper.get(page_url, headers={"User-Agent": UA, "Referer": BASE_URL + "/"}, timeout=15)
    if not r.ok:
        return jsonify({"streams": [], "error": f"Page HTTP {r.status_code}"})

    # Extract iframes
    iframes = extract_iframes(r.text)
    all_m3u8 = []

    for iframe in iframes:
        m3u8s = resolve_iframe(iframe, page_url)
        all_m3u8.extend(m3u8s)

    # Also check page itself
    all_m3u8.extend(extract_m3u8(r.text))

    # Filter 1080p
    filtered = filter_1080p(list(set(all_m3u8)))

    streams = [{
        "url": url,
        "title": "1080p",
        "quality": "1080p",
        "headers": {
            "User-Agent": UA,
            "Referer": page_url,
            "Origin": BASE_URL
        }
    } for url in filtered]

    print(f"=== Done: {len(streams)} streams in {time.time()-t0:.1f}s ===\n")
    return jsonify({"streams": streams})

@app.route('/health')
def health():
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
