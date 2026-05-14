/* ─────────────────────────────────────────────────────────────────
BeatSniper — Frontend App Logic
─────────────────────────────────────────────────────────────────*/

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => […ctx.querySelectorAll(sel)];

// ── State ──────────────────────────────────────────────────────────
let state = {
loggedIn: false,
me: null,
friends: [],
currentSnipeFriend: null,
snipeTargets: [],
activeFilter: ‘all’,
friendSnipeCache: {},
};

// ── Init ───────────────────────────────────────────────────────────
async function init() {
const status = await api(’/api/status’);
state.loggedIn = status.logged_in;

renderNav(status);

if (state.loggedIn) {
$(’#login-screen’).style.display = ‘none’;
$(’#dashboard’).style.display = ‘flex’;
await loadDashboard();
} else {
$(’#login-screen’).style.display = ‘’;
$(’#dashboard’).style.display = ‘none’;
}

setupEvents();
}

// ── API helper ─────────────────────────────────────────────────────
async function api(url, opts = {}) {
const r = await fetch(url, { credentials: ‘include’, …opts });
if (!r.ok) {
const err = await r.json().catch(() => ({ error: r.statusText }));
throw new Error(err.error || r.statusText);
}
return r.json();
}

// ── Nav ────────────────────────────────────────────────────────────
function renderNav(status) {
const nav = $(’#nav-actions’);
if (status.logged_in) {
nav.innerHTML = `<span class="nav-username text-muted" style="font-size:0.82rem">${escHtml(status.player_name || '')}</span> <button class="btn-ghost" id="logout-btn">Log out</button>`;
$(’#logout-btn’).addEventListener(‘click’, logout);
} else {
nav.innerHTML = `<a href="/login" class="btn-primary" style="padding:9px 20px;font-size:0.85rem">Connect BeatLeader</a>`;
}
}

async function logout() {
await fetch(’/logout’, { method: ‘POST’, credentials: ‘include’ });
location.reload();
}

// ── Dashboard ──────────────────────────────────────────────────────
async function loadDashboard() {
try {
const me = await api(’/api/me’);
state.me = me;
renderProfile(me);
loadFriends();
loadMyScores();
} catch (e) {
showError(’Failed to load profile: ’ + e.message);
}
}

function renderProfile(me) {
const strip = $(’#profile-strip’);
const avatar = $(’#my-avatar’);
avatar.src = me.avatar || ‘’;
avatar.onerror = () => { avatar.src = ‘data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23333"/></svg>’; };
$(’#my-name’).textContent = me.name || ‘Player’;
$(’#my-country’).textContent = me.country ? `${me.country}` : ‘’;

const stats = $(’#profile-stats’);
const pp = Math.round(me.pp || 0).toLocaleString();
const rank = me.rank ? `#${me.rank.toLocaleString()}` : ‘—’;
const countryRank = me.countryRank ? `#${me.countryRank.toLocaleString()}` : ‘—’;
const acc = me.scoreStats?.averageRankedAccuracy
? (me.scoreStats.averageRankedAccuracy * 100).toFixed(2) + ‘%’
: ‘—’;
const totalPlays = me.scoreStats?.totalPlayCount?.toLocaleString() || ‘—’;

stats.innerHTML = `<div class="pstat"><div class="pstat-label">Global Rank</div><div class="pstat-val cyan">${rank}</div></div> <div class="pstat"><div class="pstat-label">Country Rank</div><div class="pstat-val">${countryRank}</div></div> <div class="pstat"><div class="pstat-label">PP</div><div class="pstat-val violet">${pp}pp</div></div> <div class="pstat"><div class="pstat-label">Avg Acc</div><div class="pstat-val">${acc}</div></div> <div class="pstat"><div class="pstat-label">Plays</div><div class="pstat-val">${totalPlays}</div></div>`;
}

// ── Friends ────────────────────────────────────────────────────────
async function loadFriends() {
const grid = $(’#friends-grid’);
grid.innerHTML = loadingHtml(‘Loading friends…’);

try {
const data = await api(’/api/friends’);
const friends = Array.isArray(data) ? data : (data.data || data.friends || []);
state.friends = friends;

```
if (!friends.length) {
  grid.innerHTML = emptyHtml('🎮', 'No friends found', 'Add friends on BeatLeader to snipe them.');
  return;
}

// Pre-fetch snipe counts in background
grid.innerHTML = friends.map(f => friendCardHtml(f, null)).join('');
friends.forEach(f => loadSnipeCount(f));
```

} catch (e) {
grid.innerHTML = `<div class="error-banner">Failed to load friends: ${escHtml(e.message)}</div>`;
}
}

function friendCardHtml(f, snipeCount) {
const pp = Math.round(f.pp || 0).toLocaleString();
const rank = f.rank ? `#${f.rank.toLocaleString()}` : ‘—’;
const snipeHtml = snipeCount === null
? `<span class="text-muted" style="font-size:0.8rem">Calculating…</span>`
: snipeCount > 0
? `<span class="snipe-count"><span class="snipe-dot"></span>${snipeCount} snipeable</span>`
: `<span class="text-muted" style="font-size:0.8rem">You're ahead 👑</span>`;

return `<div class="glass-card friend-card" data-friend-id="${f.id}" title="View snipe targets for ${escHtml(f.name)}"> <div class="friend-top"> <img class="friend-avatar" src="${escHtml(f.avatar || '')}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><circle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23333%22/></svg>'"> <div> <div class="friend-name">${escHtml(f.name || 'Player')}</div> <div class="friend-rank">${rank}</div> </div> <div class="friend-pp">${pp}<span style="font-size:0.7rem;opacity:0.6">pp</span></div> </div> <div class="friend-bottom"> <div id="snipe-count-${f.id}">${snipeHtml}</div> <button class="btn-snipe" data-friend-id="${f.id}">🎯 Snipe</button> </div> </div>`;
}

async function loadSnipeCount(friend) {
try {
if (state.friendSnipeCache[friend.id]) {
updateSnipeCount(friend.id, state.friendSnipeCache[friend.id].length);
return;
}
const data = await api(`/api/snipe/${friend.id}`);
state.friendSnipeCache[friend.id] = data.targets || [];
updateSnipeCount(friend.id, data.targets.length);
} catch {
// silently ignore
}
}

function updateSnipeCount(friendId, count) {
const el = $(`#snipe-count-${friendId}`);
if (!el) return;
el.innerHTML = count > 0
? `<span class="snipe-count"><span class="snipe-dot"></span>${count} snipeable</span>`
: `<span class="text-muted" style="font-size:0.8rem">You're ahead 👑</span>`;
}

// ── My Scores ──────────────────────────────────────────────────────
async function loadMyScores(sort = ‘date’) {
const grid = $(’#my-scores-grid’);
grid.innerHTML = loadingHtml(‘Loading scores…’);
try {
const data = await api(`/api/scores/me?sortBy=${sort}&count=24`);
const scores = data.data || [];
if (!scores.length) {
grid.innerHTML = emptyHtml(‘🎵’, ‘No scores yet’, ‘Play some maps!’);
return;
}
grid.innerHTML = scores.map(scoreCardHtml).join(’’);
} catch (e) {
grid.innerHTML = `<div class="error-banner">Failed to load scores: ${escHtml(e.message)}</div>`;
}
}

function scoreCardHtml(s) {
const song = s.song || s.leaderboard?.song || {};
const name = song.name || s.songName || ‘Unknown’;
const cover = song.coverImage || s.coverImage || ‘’;
const diff = s.difficulty?.difficultyName || s.difficultyName || ‘’;
const acc = s.accuracy ? (s.accuracy * 100).toFixed(2) + ‘%’ : ‘—’;
const pp = s.pp ? Math.round(s.pp).toLocaleString() + ‘pp’ : ‘’;
const rank = s.rank ? `#${s.rank.toLocaleString()}` : ‘—’;

return `<div class="glass-card score-card"> <img class="score-cover" src="${escHtml(cover)}" alt="" onerror="this.style.background='linear-gradient(135deg,#1a1a2e,#16213e)'"> <div class="score-info"> <div class="score-name" title="${escHtml(name)}">${escHtml(name)}</div> <div class="score-diff">${escHtml(diff)}</div> <div class="score-stats"> <div class="score-stat"><span class="label">ACC</span><span class="val text-cyan">${acc}</span></div> ${pp ?`<div class="score-stat"><span class="label">PP</span><span class="val text-violet">${pp}</span></div>`: ''} </div> </div> <div class="score-rank">${rank}</div> </div>`;
}

// ── Snipe Panel ────────────────────────────────────────────────────
async function openSnipePanel(friendId) {
const panel = $(’#snipe-panel’);
const backdrop = $(’#panel-backdrop’);
const list = $(’#snipe-list’);
const headerEl = $(’#snipe-header’);

panel.classList.add(‘open’);
backdrop.classList.add(‘active’);
document.body.style.overflow = ‘hidden’;

list.innerHTML = loadingHtml(‘Calculating targets…’);
headerEl.innerHTML = ‘’;

try {
let data;
if (state.friendSnipeCache[friendId]) {
const friend = state.friends.find(f => f.id == friendId);
data = { targets: state.friendSnipeCache[friendId], friend: friend || {} };
} else {
data = await api(`/api/snipe/${friendId}`);
state.friendSnipeCache[friendId] = data.targets || [];
}

```
state.currentSnipeFriend = data.friend;
state.snipeTargets = data.targets || [];

// Render header
const f = data.friend;
headerEl.innerHTML = `
  <img class="snipe-friend-avatar" src="${escHtml(f.avatar || '')}" alt="" onerror="this.style.background='#333'">
  <div>
    <div class="snipe-friend-name">${escHtml(f.name || 'Friend')}</div>
    <div class="snipe-friend-stats">#${(f.rank || 0).toLocaleString()} · ${Math.round(f.pp || 0).toLocaleString()}pp</div>
  </div>
  <div class="snipe-count-badge">🎯 ${state.snipeTargets.length} targets</div>
`;

renderSnipeList();
```

} catch (e) {
list.innerHTML = `<div class="error-banner">Failed to load targets: ${escHtml(e.message)}</div>`;
}
}

function renderSnipeList() {
const list = $(’#snipe-list’);
let targets = state.snipeTargets;

if (state.activeFilter === ‘unplayed’) {
targets = targets.filter(t => !t.played);
} else if (state.activeFilter === ‘close’) {
targets = targets.filter(t => t.played && Math.abs(t.gap) < 2);
}

if (!targets.length) {
list.innerHTML = emptyHtml(‘🎯’, ‘No targets match’, ‘Try a different filter.’);
return;
}

list.innerHTML = targets.map(snipeItemHtml).join(’’);
}

function snipeItemHtml(t) {
const gap = Math.abs(t.gap);
let difficulty, gapClass;

if (!t.played) {
difficulty = ‘unplayed’; gapClass = ‘unplayed’;
} else if (gap < 1) {
difficulty = ‘easy’; gapClass = ‘easy’;
} else if (gap < 3) {
difficulty = ‘medium’; gapClass = ‘medium’;
} else {
difficulty = ‘hard’; gapClass = ‘hard’;
}

const myAccHtml = t.played
? `<span class="acc-me">Me: ${t.myAcc?.toFixed(2) ?? '—'}%</span>`
: `<span class="acc-unplayed">You haven't played this</span>`;

const gapLabel = t.played ? `-${gap.toFixed(2)}%` : ‘Unplayed’;

const blUrl = `https://beatleader.com/leaderboard/global/${t.leaderboardId}`;

return `<a class="snipe-item ${difficulty}" href="${blUrl}" target="_blank" rel="noopener" title="Open on BeatLeader"> <img class="snipe-cover" src="${escHtml(t.coverImage || '')}" alt="" onerror="this.style.background='linear-gradient(135deg,#1a1a2e,#16213e)'"> <div class="snipe-info"> <div class="snipe-song">${escHtml(t.songName || 'Unknown')}</div> <span class="snipe-diff-badge">${escHtml(t.difficulty || '')}</span> <div class="snipe-acc-compare"> <span class="acc-them">Them: ${t.friendAcc?.toFixed(2) ?? '—'}%</span> ${myAccHtml} </div> </div> <div class="snipe-gap-pill ${gapClass}">${gapLabel}</div> </a>`;
}

function closeSnipePanel() {
$(’#snipe-panel’).classList.remove(‘open’);
$(’#panel-backdrop’).classList.remove(‘active’);
document.body.style.overflow = ‘’;
}

// ── Events ─────────────────────────────────────────────────────────
function setupEvents() {
// Tabs
$$(’.tab’).forEach(tab => {
tab.addEventListener(‘click’, () => {
$$(’.tab’).forEach(t => t.classList.remove(‘active’));
$$(’.tab-content’).forEach(c => c.classList.remove(‘active’));
tab.classList.add(‘active’);
$(`#tab-${tab.dataset.tab}`).classList.add(‘active’);
});
});

// Friend cards & snipe buttons (delegated)
$(’#friends-grid’).addEventListener(‘click’, e => {
const snipeBtn = e.target.closest(’.btn-snipe’);
const card = e.target.closest(’.friend-card’);
const friendId = (snipeBtn || card)?.dataset.friendId;
if (friendId) openSnipePanel(friendId);
});

// Snipe panel close
$(’#snipe-close’).addEventListener(‘click’, closeSnipePanel);
$(’#panel-backdrop’).addEventListener(‘click’, closeSnipePanel);

// Filter buttons
$(’#snipe-panel’).addEventListener(‘click’, e => {
const btn = e.target.closest(’.filter-btn’);
if (btn) {
$$(’.filter-btn’).forEach(b => b.classList.remove(‘active’));
btn.classList.add(‘active’);
state.activeFilter = btn.dataset.filter;
renderSnipeList();
}
});

// My scores sort
$(’#my-sort’)?.addEventListener(‘change’, e => {
const sortMap = { date: ‘date’, pp: ‘pp’, acc: ‘acc’ };
loadMyScores(sortMap[e.target.value] || ‘date’);
});

// Keyboard close
document.addEventListener(‘keydown’, e => {
if (e.key === ‘Escape’) closeSnipePanel();
});
}

// ── Helpers ────────────────────────────────────────────────────────
function loadingHtml(msg) {
return `<div class="loading-state"><div class="spinner"></div><span>${msg}</span></div>`;
}

function emptyHtml(emoji, title, sub) {
return `<div class="empty-state"><div class="emoji">${emoji}</div><strong>${title}</strong><p style="margin-top:6px;font-size:0.85rem">${sub}</p></div>`;
}

function escHtml(str) {
return String(str ?? ‘’)
.replace(/&/g, ‘&’)
.replace(/</g, ‘<’)
.replace(/>/g, ‘>’)
.replace(/”/g, ‘"’);
}

function showError(msg) {
const el = document.createElement(‘div’);
el.className = ‘error-banner’;
el.style.cssText = ‘position:fixed;bottom:2rem;right:2rem;z-index:999;max-width:320px’;
el.textContent = msg;
document.body.appendChild(el);
setTimeout(() => el.remove(), 5000);
}

// ── Boot ───────────────────────────────────────────────────────────
init();
