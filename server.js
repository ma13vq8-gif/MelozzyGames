const express = require('express');
const fs = require('fs');
const path = require('path');
const geoip = require('geoip-lite');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/games', express.static('games'));
app.use('/movies', express.static('movies'));

// ===== LOAD DATA =====
let gamesData = { games: [] };
let moviesData = { movies: [] };

const GAMES_JSON_PATH = path.join(__dirname, 'games.json');
const MOVIES_JSON_PATH = path.join(__dirname, 'movies.json');
const DEVLOG_JSON_PATH = path.join(__dirname, 'devlog.json');
const CODES_JSON_PATH = path.join(__dirname, 'codes.json');

function loadGames() {
  try {
    const raw = fs.readFileSync(GAMES_JSON_PATH, 'utf8');
    gamesData = JSON.parse(raw);
  } catch (err) {
    console.error('❌ Failed to load games.json:', err.message);
    gamesData = { games: [] };
  }
}

function loadMovies() {
  try {
    const raw = fs.readFileSync(MOVIES_JSON_PATH, 'utf8');
    moviesData = JSON.parse(raw);
  } catch (err) {
    console.error('❌ Failed to load movies.json:', err.message);
    moviesData = { movies: [] };
  }
}

function saveGames() {
  fs.writeFileSync(GAMES_JSON_PATH, JSON.stringify(gamesData, null, 2), 'utf8');
}

function saveMovies() {
  fs.writeFileSync(MOVIES_JSON_PATH, JSON.stringify(moviesData, null, 2), 'utf8');
}

// ===== LOAD / SAVE REQUESTS =====
const REQUESTS_JSON_PATH = path.join(__dirname, 'requests.json');
function loadRequests() {
  try {
    const raw = fs.readFileSync(REQUESTS_JSON_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { requests: [] };
  }
}
function saveRequests(data) {
  fs.writeFileSync(REQUESTS_JSON_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ===== LOAD DEVLOG =====
function loadDevlog() {
  try {
    const raw = fs.readFileSync(DEVLOG_JSON_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { entries: [] };
  }
}

// ===== LOAD / SAVE CODES =====
function loadCodes() {
  try {
    const raw = fs.readFileSync(CODES_JSON_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return { codes: [] };
  }
}
function saveCodes(codesData) {
  fs.writeFileSync(CODES_JSON_PATH, JSON.stringify(codesData, null, 2), 'utf8');
}

// ===== GEO-IP HELPER =====
function getCountryFlag(ip) {
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') return '🏠';
  const geo = geoip.lookup(ip);
  if (!geo || !geo.country) return '🌍';
  const code = geo.country.toUpperCase();
  const flag = String.fromCodePoint(...[...code].map(c => 0x1F1E6 - 65 + c.charCodeAt(0)));
  return flag || '🌍';
}

function getClientIp(req) {
  let ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (ip === '::1' || ip === '::ffff:127.0.0.1') ip = '127.0.0.1';
  return ip;
}

function getVideoContentType(ext) {
  const types = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  return types[ext.toLowerCase()] || 'video/mp4';
}

// ==========================================
// API ROUTES
// ==========================================

// ---- Tags (deprecated) ----
app.get('/api/tags', (req, res) => {
  const tagSet = new Set();
  gamesData.games.forEach(g => g.tags.forEach(t => tagSet.add(t)));
  moviesData.movies.forEach(m => m.tags.forEach(t => tagSet.add(t)));
  res.json({ tags: [...tagSet].sort() });
});

// ---- GAMES ----
app.get('/api/games', (req, res) => {
  let { sort, tag, search, page = 1, limit = 10, type } = req.query;
  limit = Math.min(parseInt(limit) || 10, 30);
  page = parseInt(page) || 1;

  let games = [...gamesData.games];

  if (type === 'games') {
    games = games.filter(g => !g.tags.some(t => t.toLowerCase() === 'tool'));
  } else if (type === 'tools') {
    games = games.filter(g => g.tags.some(t => t.toLowerCase() === 'tool'));
  }

  if (tag) {
    games = games.filter(g => g.tags.includes(tag));
  }

  if (search) {
    const s = search.toLowerCase();
    games = games.filter(g =>
      g.name.toLowerCase().includes(s) ||
      g.description.toLowerCase().includes(s)
    );
  }

  if (sort === 'trending') {
    games.sort((a, b) => (b.clicks || 0) + (b.downloads || 0) - ((a.clicks || 0) + (a.downloads || 0)));
  } else if (sort === 'popular') {
    games.sort((a, b) => {
      const aAvg = a.totalVotes ? a.totalStars / a.totalVotes : 0;
      const bAvg = b.totalVotes ? b.totalStars / b.totalVotes : 0;
      return bAvg - aAvg;
    });
  } else { // newest
    games.reverse();
  }

  const total = games.length;
  const start = (page - 1) * limit;
  const end = Math.min(start + limit, total);
  const paginated = games.slice(start, end);

  res.json({
    games: paginated,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit
  });
});

// ---- MOVIES ----
app.get('/api/movies', (req, res) => {
  let { sort, search, page = 1, limit = 10 } = req.query;
  limit = Math.min(parseInt(limit) || 10, 30);
  page = parseInt(page) || 1;

  let movies = [...moviesData.movies];

  if (search) {
    const s = search.toLowerCase();
    movies = movies.filter(m =>
      m.name.toLowerCase().includes(s) ||
      m.description.toLowerCase().includes(s)
    );
  }

  if (sort === 'trending') {
    movies.sort((a, b) => (b.clicks || 0) + (b.downloads || 0) - ((a.clicks || 0) + (a.downloads || 0)));
  } else if (sort === 'popular') {
    movies.sort((a, b) => {
      const aAvg = a.totalVotes ? a.totalStars / a.totalVotes : 0;
      const bAvg = b.totalVotes ? b.totalStars / b.totalVotes : 0;
      return bAvg - aAvg;
    });
  } else { // newest
    movies.reverse();
  }

  const total = movies.length;
  const start = (page - 1) * limit;
  const end = Math.min(start + limit, total);
  const paginated = movies.slice(start, end);

  res.json({
    movies: paginated,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit
  });
});

// ---- GLOBAL SEARCH ----
app.get('/api/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ results: [] });

  const s = q.toLowerCase();
  const allGames = gamesData.games;
  const allMovies = moviesData.movies;

  const gameResults = allGames
    .filter(g => g.name.toLowerCase().includes(s) || g.description.toLowerCase().includes(s))
    .map(g => ({ ...g, _type: 'game' }));

  const movieResults = allMovies
    .filter(m => m.name.toLowerCase().includes(s) || m.description.toLowerCase().includes(s))
    .map(m => ({ ...m, _type: 'movie' }));

  const results = [...gameResults, ...movieResults].slice(0, 20);
  res.json({ results });
});

// ---- SINGLE ITEM ----
app.get('/api/item/:id', (req, res) => {
  const id = req.params.id;
  let item = gamesData.games.find(g => g.id === id);
  let type = 'game';
  if (!item) {
    item = moviesData.movies.find(m => m.id === id);
    type = 'movie';
  }
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  res.json({ ...item, _type: type });
});

// ---- RIP GAMES (compatibility) ----
app.get('/api/rip-games', (req, res) => {
  const ripGames = gamesData.games.filter(g => g.tags && g.tags.some(t => t.toLowerCase() === 'rip'));
  res.json({ games: ripGames });
});

// ---- DEVLOG ----
app.get('/api/devlog', (req, res) => {
  const data = loadDevlog();
  data.entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(data);
});

// ==========================================
// DOWNLOADS & STREAMING
// ==========================================

// ---- GAME DOWNLOADS (zip) ----
app.get('/api/games/:id/download', (req, res) => {
  const game = gamesData.games.find(g => g.id === req.params.id);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  const zipPath = path.join(__dirname, 'games', game.id, `${game.id}.zip`);
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: 'Zip file not found on server' });
  }
  game.downloads = (game.downloads || 0) + 1;
  saveGames();

  const ip = getClientIp(req);
  const flag = getCountryFlag(ip);
  console.log(`📥 ${game.name} downloaded by ${ip} ${flag}`);

  res.setHeader('Content-Disposition', `attachment; filename="${game.id}.zip"`);
  res.setHeader('Content-Type', 'application/zip');
  const stream = fs.createReadStream(zipPath);
  stream.pipe(res);
});

// ---- MOVIE DOWNLOADS (serves actual file) ----
app.get('/api/movies/:id/download', (req, res) => {
  const movie = moviesData.movies.find(m => m.id === req.params.id);
  if (!movie) {
    return res.status(404).json({ error: 'Movie not found' });
  }

  const fileName = movie.file || `${movie.id}.zip`;
  const filePath = path.join(__dirname, 'movies', movie.id, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Movie file not found on server' });
  }

  movie.downloads = (movie.downloads || 0) + 1;
  saveMovies();

  const ip = getClientIp(req);
  const flag = getCountryFlag(ip);
  console.log(`📥 ${movie.name} (movie) downloaded by ${ip} ${flag}`);

  const ext = path.extname(fileName).toLowerCase();
  const contentType = getVideoContentType(ext);

  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', contentType);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// ---- MOVIE STREAM (for video player, supports range) ----
app.get('/api/movies/:id/stream', (req, res) => {
  const movie = moviesData.movies.find(m => m.id === req.params.id);
  if (!movie) {
    return res.status(404).json({ error: 'Movie not found' });
  }

  const fileName = movie.file || `${movie.id}.zip`;
  const filePath = path.join(__dirname, 'movies', movie.id, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Movie file not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(fileName).toLowerCase();
  const contentType = getVideoContentType(ext);

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = (end - start) + 1;

    const stream = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ---- CLICK TRACKING ----
app.post('/api/item/:id/click', (req, res) => {
  const id = req.params.id;
  let item = gamesData.games.find(g => g.id === id);
  if (item) {
    item.clicks = (item.clicks || 0) + 1;
    saveGames();
    return res.json({ success: true, clicks: item.clicks });
  }
  let movie = moviesData.movies.find(m => m.id === id);
  if (movie) {
    movie.clicks = (movie.clicks || 0) + 1;
    saveMovies();
    return res.json({ success: true, clicks: movie.clicks });
  }
  return res.status(404).json({ error: 'Item not found' });
});

// ---- RATING ----
app.post('/api/item/:id/rate', (req, res) => {
  const id = req.params.id;
  const { stars } = req.body;
  if (!stars || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'Invalid stars.' });
  }

  const clientIp = getClientIp(req);
  let item = gamesData.games.find(g => g.id === id);
  let saveFunc = saveGames;
  if (!item) {
    item = moviesData.movies.find(m => m.id === id);
    saveFunc = saveMovies;
  }
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  if (!item.ratedIPs) item.ratedIPs = [];
  if (item.ratedIPs.includes(clientIp)) {
    return res.status(400).json({ error: 'You already rated this item from this device!', alreadyRated: true });
  }

  item.ratedIPs.push(clientIp);
  item.totalStars = (item.totalStars || 0) + stars;
  item.totalVotes = (item.totalVotes || 0) + 1;
  saveFunc();

  const avg = item.totalStars / item.totalVotes;
  const percent = Math.round((avg / 5) * 100);
  console.log(`⭐ ${item.name} rated ${stars} stars (${clientIp})`);

  res.json({ success: true, avg, percent, votes: item.totalVotes });
});

// ---- REQUESTS ----
app.post('/api/requests', (req, res) => {
  const { gameName } = req.body;
  if (!gameName || gameName.trim().length === 0) {
    return res.status(400).json({ error: 'Please enter a name.' });
  }
  const clientIp = getClientIp(req);
  const now = Date.now();
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;

  const requestsData = loadRequests();
  const recentRequest = requestsData.requests.find(r => r.ip === clientIp && (now - r.timestamp) < TWELVE_HOURS);
  if (recentRequest) {
    const timeLeft = TWELVE_HOURS - (now - recentRequest.timestamp);
    const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
    const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
    let timeMsg = hoursLeft > 0 ? `${hoursLeft} hour(s)` : `${minutesLeft} minute(s)`;
    return res.status(429).json({ error: `Please wait ${timeMsg} before submitting another request.` });
  }

  requestsData.requests.push({
    id: Date.now() + Math.random(),
    ip: clientIp,
    gameName: gameName.trim(),
    timestamp: now,
    status: 'pending'
  });
  saveRequests(requestsData);
  console.log(`📝 New request: "${gameName.trim()}" from ${clientIp}`);
  res.json({ success: true, message: 'Request submitted successfully!' });
});

// ---- PROMO CODES ----
app.post('/api/apply-promo', (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Please enter a promo code.' });
  }
  const codesData = loadCodes();
  const found = codesData.codes.find(c => c.code.toLowerCase() === code.toLowerCase());
  if (!found) {
    return res.status(404).json({ error: 'Invalid promo code.' });
  }
  if (found.usesLeft === 0) {
    return res.status(400).json({ error: 'This promo code has been fully redeemed.' });
  }
  found.usesLeft--;
  saveCodes(codesData);
  res.json({ success: true, discount: found.discount, code: found.code });
});

// ---- FREE DOWNLOAD TOKENS (works for both games and movies) ----
const freeTokens = {};
function generateToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

app.post('/api/init-free-download', (req, res) => {
  const { itemIds } = req.body;
  if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ error: 'No items specified.' });
  }
  const token = generateToken();
  const expires = Date.now() + 10000; // 10 seconds
  freeTokens[token] = { itemIds, expires, used: false };

  for (const key in freeTokens) {
    if (freeTokens[key].expires < Date.now()) delete freeTokens[key];
  }
  res.json({ token });
});

app.get('/api/download-free/:itemId', (req, res) => {
  const { itemId } = req.params;
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Missing token.' });
  const tokenData = freeTokens[token];
  if (!tokenData) return res.status(404).json({ error: 'Invalid or expired token.' });
  if (tokenData.expires < Date.now()) {
    delete freeTokens[token];
    return res.status(410).json({ error: 'Token has expired.' });
  }
  if (tokenData.used) return res.status(410).json({ error: 'Token has already been used.' });
  if (!tokenData.itemIds.includes(itemId)) return res.status(403).json({ error: 'Token does not allow this item.' });

  tokenData.used = true;

  let item = gamesData.games.find(g => g.id === itemId);
  let saveFunc = saveGames;
  let folder = 'games';
  let isMovie = false;
  if (!item) {
    item = moviesData.movies.find(m => m.id === itemId);
    saveFunc = saveMovies;
    folder = 'movies';
    isMovie = true;
  }
  if (!item) return res.status(404).json({ error: 'Item not found' });

  let fileName;
  if (isMovie) {
    fileName = item.file || `${item.id}.zip`;
  } else {
    fileName = `${item.id}.zip`;
  }
  const filePath = path.join(__dirname, folder, item.id, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on server' });
  }

  item.downloads = (item.downloads || 0) + 1;
  saveFunc();

  const ip = getClientIp(req);
  const flag = getCountryFlag(ip);
  console.log(`📥 ${item.name} (free token) downloaded by ${ip} ${flag}`);

  let contentType = 'application/octet-stream';
  if (isMovie) {
    const ext = path.extname(fileName).toLowerCase();
    contentType = getVideoContentType(ext);
  } else {
    contentType = 'application/zip';
  }

  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', contentType);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// ===== SPA CATCH-ALL =====
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== START SERVER =====
loadGames();
loadMovies();
app.listen(PORT, () => {
  console.log(`🚀 Melozzy Hub running on http://localhost:${PORT}`);
  console.log(`📂 Games: ${path.join(__dirname, 'games')}`);
  console.log(`📂 Movies: ${path.join(__dirname, 'movies')}`);
});
