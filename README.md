# Pirate Search

A small cross-platform-style desktop app (Electron) that searches **The Pirate Bay** via the
[apibay.org](https://apibay.org) JSON endpoint and sends torrents straight to **qBittorrent**.

No backend to host, no scraping — it talks to apibay directly and only ever handles magnet links.

## Features

- Live torrent search with category filter (Video / Audio / Apps / Games / Other)
- Sortable results: name, type, size, seeders, leechers, date
- **Three ways to grab a torrent:**
  1. **Open in qBittorrent** — launches your installed qBittorrent client with the magnet (no setup)
  2. **Send to qB (Web)** — pushes the magnet to a running qBittorrent **Web UI** (even headless), with
     configurable host / port / username / password
  3. **Copy magnet** — copies the magnet link to your clipboard
- Hardened Electron: `contextIsolation`, no `nodeIntegration`, preload bridge, strict CSP

## Run from source

```bash
npm install
npm start
```

## Build the Windows installer

```bash
npm run dist
```

The installer is written to `installer/Pirate Search Setup 1.0.0.exe` (NSIS, assisted mode:
pick the install folder, creates Start-menu + desktop shortcuts). It is **unsigned**, so Windows
SmartScreen may show a "Windows protected your PC" prompt the first time — click **More info →
Run anyway**.

## qBittorrent Web UI setup (only needed for the "Send to qB (Web)" button)

In qBittorrent: **Tools → Options → Web UI** → enable it, set a username/password and port
(default `8080`). Then enter the same details in the app's ⚙ settings panel and click Save.
The "Open in qBittorrent" button does **not** need this.

## Notes / legality

This app is a search front-end over a public API. It hosts no content and stores no files — it only
produces magnet links, which you choose to open. Respect the copyright laws in your jurisdiction and
only download content you are legally entitled to.

The Pirate Bay API used here is unofficial; if results stop loading, apibay.org or its mirrors may be
temporarily down.
