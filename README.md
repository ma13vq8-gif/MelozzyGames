# 🎮 Melozzy Hub

A cozy, self-hosted hub for downloading and enjoying **apps** and **games** — built with Node.js + Express on the backend and a lightweight custom SPA on the frontend.

---

## ✨ Features

### Core
- 🏠 **Homepage** with stats, category cards, trending carousel, and recent additions
- 🔧 **Apps & Tools** section with sorting (Newest / Trending / Popular)
- 🎮 **Games** section with the same sorting and pagination
- 🎬 **Movies discontinued** page — redirects users to an external source with a safety warning
- 🔍 **Global search** with live autocomplete across apps and games
- 📄 **Detail pages** with screenshots, description, tags, stats, and download/cart buttons
- 🛒 **Cart system** with promo codes and free download tokens
- ⭐ **Rating system** with per-IP protection
- 📝 **Request system** with 12‑hour cooldown per IP
- 📜 **Devlog** page for updates
- 🛡️ **Security popup** recommending a browser ad blocker (shows once per page load)
- 🎨 **Cozy Cabin theme** — warm wood tones, subtle animations, glassmorphism panels
- 📱 **Fully responsive** — works on desktop, tablet, and mobile

## Games, movies and node_modules
- please note that all games and shit are stored in the developers machine

### Behind the scenes
- 📊 Click and download tracking per item
- 🌍 Geo-IP flag logging for downloads
- 💾 Persistent storage via JSON files (no database required)
- 🚀 Lightweight SPA with client-side routing and history API
- 🔒 Rate-limited requests, token-based free downloads
- 🖼️ Fallback SVG images when a screenshot is missing
