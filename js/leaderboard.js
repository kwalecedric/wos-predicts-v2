import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  doc, getDoc, getDocs,
  collection, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

import {
  auth, db, COLLECTIONS,
  isSuperAdmin, getUserLeagueStatus, STATUS
} from "./firebase-config.js";

// ── STATE ─────────────────────────────────────────────────────
let currentUser    = null;
let userProfile    = null;
let activeLeagueId = null;
let allPlayers     = [];
let currentFilter  = 'alltime';

// ── ENTRY POINT ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;

  activeLeagueId = sessionStorage.getItem('activeLeagueId');
  if (!activeLeagueId) { window.location.href = "index.html"; return; }

  // Verify user is approved
  if (!isSuperAdmin(user.uid)) {
    const userRef  = doc(db, COLLECTIONS.users, user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) { window.location.href = "index.html"; return; }
    const status = getUserLeagueStatus(userSnap.data(), activeLeagueId);
    if (status !== STATUS.approved) { window.location.href = "index.html"; return; }
  }

  await init();
});

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  await Promise.all([
    loadLeagueInfo(),
    loadMyProfile(),
    loadLeaderboard(),
  ]);
}

// ── LOAD LEAGUE INFO ──────────────────────────────────────────
async function loadLeagueInfo() {
  try {
    const leagueRef  = doc(db, COLLECTIONS.leagues, activeLeagueId);
    const leagueSnap = await getDoc(leagueRef);
    if (!leagueSnap.exists()) return;

    const league = leagueSnap.data();
    document.getElementById('league-name-badge').textContent = league.name || 'My League';

    // Build prize breakdown
    if (league.prizes || league.prizePool) {
      buildPrizeBanner(league);
    }
  } catch (err) {
    console.error('Error loading league:', err);
  }
}

// ── BUILD PRIZE BANNER ────────────────────────────────────────
function buildPrizeBanner(league) {
  const banner = document.getElementById('prize-banner');
  const list   = document.getElementById('prize-list');

  // Use custom prizes array if set, otherwise show prizePool total
  const prizes = league.prizes || [
    { position: '🥇 1st Place', amount: league.prize1 || '—' },
    { position: '🥈 2nd Place', amount: league.prize2 || '—' },
    { position: '🥉 3rd Place', amount: league.prize3 || '—' },
    { position: '🏅 4th Place', amount: league.prize4 || '—' },
    { position: '🎖️ 5th Place', amount: league.prize5 || '—' },
  ];

  list.innerHTML = prizes.map(p => `
    <div class="prize-row">
      <div class="prize-position">${p.position}</div>
      <div class="prize-amount">${p.amount}</div>
    </div>
  `).join('');

  banner.style.display = 'block';
}

// ── LOAD MY PROFILE ───────────────────────────────────────────
async function loadMyProfile() {
  try {
    const userRef  = doc(db, COLLECTIONS.users, currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    userProfile = userSnap.data();
    const leagueData = userProfile.leagues?.[activeLeagueId] || {};

    document.getElementById('my-name').textContent = userProfile.displayName || 'You';

    const points   = leagueData.points   ?? 0;
    const streak   = leagueData.streak   ?? 0;
    const correct  = leagueData.correct  ?? 0;
    const total    = leagueData.total    ?? 0;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    document.getElementById('my-points').textContent   = points;
    document.getElementById('my-accuracy').textContent = accuracy + '%';
    document.getElementById('my-streak').textContent   = streak;

  } catch (err) {
    console.error('Error loading profile:', err);
  }
}

// ── LOAD LEADERBOARD ──────────────────────────────────────────
async function loadLeaderboard() {
  try {
    const usersSnap = await getDocs(collection(db, COLLECTIONS.users));
    const allUsers  = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter to only approved members of this league
    allPlayers = allUsers
      .filter(u => u.leagues?.[activeLeagueId]?.status === STATUS.approved)
      .map(u => {
        const ld      = u.leagues[activeLeagueId];
        const correct = ld.correct ?? 0;
        const total   = ld.total   ?? 0;
        return {
          uid:         u.uid || u.id,
          displayName: u.displayName || 'Player',
          points:      ld.points   ?? 0,
          streak:      ld.streak   ?? 0,
          wildcards:   ld.wildcards ?? 3,
          correct,
          total,
          accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.points - a.points);

    renderLeaderboard();

  } catch (err) {
    console.error('Error loading leaderboard:', err);
    document.getElementById('lb-list').innerHTML =
      '<div class="empty-state">Could not load leaderboard.</div>';
  }
}

// ── RENDER LEADERBOARD ────────────────────────────────────────
function renderLeaderboard() {
  const container = document.getElementById('lb-list');

  if (allPlayers.length === 0) {
    container.innerHTML = '<div class="empty-state">No players yet in this league.</div>';
    return;
  }

  // Find my rank
  const myRank = allPlayers.findIndex(p => p.uid === currentUser.uid) + 1;
  document.getElementById('my-rank').textContent = myRank > 0 ? '#' + myRank : '#—';

  const colors = [
    '#00E676','#FFB300','#FF6B6B','#64B5F6',
    '#BA68C8','#4DB6AC','#FF8A65','#A5D6A7',
  ];

  container.innerHTML = allPlayers.map((player, i) => {
    const rank    = i + 1;
    const isMe    = player.uid === currentUser.uid;
    const rankStr = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const rowClass = isMe ? 'lb-row me' :
                     rank === 1 ? 'lb-row top1' :
                     rank === 2 ? 'lb-row top2' :
                     rank === 3 ? 'lb-row top3' : 'lb-row';
    const color   = colors[i % colors.length];
    const initial = (player.displayName || 'P').charAt(0).toUpperCase();
    const streak  = player.streak >= 3
      ? `<span class="streak-badge">🔥 ${player.streak}</span>` : '';

    return `
      <div class="${rowClass}" onclick="openPlayerModal('${player.uid}')">
        <div class="lb-rank">${rankStr}</div>
        <div class="lb-avatar" style="background:${color};">${initial}</div>
        <div class="lb-info">
          <div class="lb-name">${player.displayName}${isMe ? ' (you)' : ''}</div>
          <div class="lb-sub">
            <span>${player.accuracy}% accuracy</span>
            ${streak}
          </div>
        </div>
        <div class="lb-pts">
          <div class="lb-pts-val">${player.points}</div>
          <div class="lb-pts-label">pts</div>
        </div>
      </div>`;
  }).join('');
}

// ── FILTER ────────────────────────────────────────────────────
window.setFilter = function(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + filter).classList.add('active');
  // For now all filters show same data — week/today filtering
  // will be added when picks have timestamps indexed
  renderLeaderboard();
};

// ── OPEN PLAYER MODAL ─────────────────────────────────────────
window.openPlayerModal = async function(uid) {
  const player = allPlayers.find(p => p.uid === uid);
  if (!player) return;

  const colors  = ['#00E676','#FFB300','#FF6B6B','#64B5F6','#BA68C8','#4DB6AC'];
  const idx     = allPlayers.indexOf(player);
  const color   = colors[idx % colors.length];
  const initial = (player.displayName || 'P').charAt(0).toUpperCase();
  const rank    = idx + 1;

  // Set header
  document.getElementById('player-modal-header').innerHTML = `
    <div class="player-modal-avatar" style="background:${color};">${initial}</div>
    <div>
      <div class="player-modal-name">${player.displayName}</div>
      <div class="player-modal-sub">Rank #${rank} · ${player.accuracy}% accuracy</div>
    </div>
  `;

  // Set stats
  document.getElementById('player-modal-stats').innerHTML = `
    <div class="player-modal-stat">
      <div class="player-modal-stat-val" style="color:var(--green);">${player.points}</div>
      <div class="player-modal-stat-label">Points</div>
    </div>
    <div class="player-modal-stat">
      <div class="player-modal-stat-val" style="color:var(--amber);">${player.streak}</div>
      <div class="player-modal-stat-label">Streak</div>
    </div>
    <div class="player-modal-stat">
      <div class="player-modal-stat-val">${player.correct}/${player.total}</div>
      <div class="player-modal-stat-label">Correct</div>
    </div>
  `;

  // Show modal
  document.getElementById('modal-overlay').classList.add('show');
  document.getElementById('player-modal').classList.add('show');

  // Load prediction history
  await loadPlayerHistory(uid);
};

// ── CLOSE PLAYER MODAL ────────────────────────────────────────
window.closePlayerModal = function() {
  document.getElementById('modal-overlay').classList.remove('show');
  document.getElementById('player-modal').classList.remove('show');
};

// ── LOAD PLAYER HISTORY ───────────────────────────────────────
async function loadPlayerHistory(uid) {
  const list = document.getElementById('player-history-list');
  list.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';

  try {
    // Get all submitted picks for this player in this league
    const picksRef  = collection(db, COLLECTIONS.picks);
    const q         = query(
      picksRef,
      where('userId', '==', uid),
      where('leagueId', '==', activeLeagueId),
      orderBy('submittedAt', 'desc')
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = '<div class="empty-state">No predictions yet.</div>';
      return;
    }

    // Get match data for each pick
    const picks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Only show picks that have been scored (have a result)
    // Active/pending picks are hidden
    const scoredPicks = picks.filter(p => p.scored === true);

    if (scoredPicks.length === 0) {
      list.innerHTML = '<div class="empty-state">No scored predictions yet.</div>';
      return;
    }

    // Fetch match names for display
    const matchIds  = [...new Set(scoredPicks.map(p => p.matchId))];
    const matchData = {};

    for (const matchId of matchIds) {
      const matchSnap = await getDoc(doc(db, COLLECTIONS.matches, matchId));
      if (matchSnap.exists()) {
        const m = matchSnap.data();
        matchData[matchId] = `${m.homeTeam} vs ${m.awayTeam}`;
      }
    }

    list.innerHTML = scoredPicks.map(pick => {
      const matchName  = matchData[pick.matchId] || 'Unknown match';
      const pickLabel  = getPickLabel(pick.pick);
      const pts        = pick.pointsEarned ?? 0;
      const correct    = pts > 0;
      const resultIcon = correct ? '✅' : '❌';
      const wcBadge    = pick.wildcard ? ' 🃏' : '';

      return `
        <div class="history-row">
          <div class="history-result">${resultIcon}</div>
          <div class="history-info">
            <div class="history-match">${matchName}</div>
            <div class="history-pick">${pickLabel}${wcBadge}</div>
          </div>
          <div class="history-pts ${pts === 0 ? 'zero' : ''}">
            ${pts > 0 ? '+' + pts : '0'} pts
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    console.error('Error loading history:', err);
    list.innerHTML = '<div class="empty-state">Could not load history.</div>';
  }
}

// ── HELPERS ───────────────────────────────────────────────────
function getPickLabel(pick) {
  const labels = {
    home_win:      'Home win',
    draw:          'Draw',
    away_win:      'Away win',
    correct_score: 'Exact score',
    five_yellows:  '5+ yellows',
    red_card:      'Red card',
    motm:          'MOTM',
    prolongation:  'Extra time',
    penalties:     'Penalties',
  };
  return labels[pick] || pick;
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(window._t);
  window._t = setTimeout(() => t.classList.remove('show'), 3000);
}