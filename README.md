# FaselHD + Krmzy Nuvio Plugin

Merged Nuvio scraper plugin containing both **FaselHD** and **Krmzy** Arabic stream providers.

## Structure

```
.
├── manifest.json          # Plugin manifest with both scrapers registered
├── providers/
│   ├── faselhd.js        # FaselHD scraper (original)
│   └── krmzy.js          # Krmzy scraper (newly added)
└── update-user-agent.js   # Utility to update User-Agent across all providers
```

## Providers

| Provider | Source | Types | Description |
|----------|--------|-------|-------------|
| FaselHD | Backend API | movie, tv | Arabic Hard Sub movies, TV shows, and anime |
| Krmzy | krmzi.net | movie, tv | Arabic streams via TMDB title search + iframe extraction |

## How Krmzy Works

1. Receives `tmdbId` + `mediaType` (+ season/episode for series)
2. Queries TMDB API to resolve the title
3. Searches `krmzi.net` using the Arabic title
4. Extracts iframe embed sources from the result page
5. Returns streams in Nuvio format

## Installation

1. Copy this folder to your Nuvio plugins directory
2. The plugin will auto-load both providers from `manifest.json`

## Update User-Agent

```bash
node update-user-agent.js "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ..."
```

This updates the User-Agent string in all provider files at once.

## Credits

- FaselHD scraper: Nuvio Team
- Krmzy scraper: maje7d (adapted for Nuvio plugin architecture)
