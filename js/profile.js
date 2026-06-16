import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  doc, getDoc, getDocs,
  collection, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

import {
  auth, db, COLLECTIONS, STATUS, isSuperAdmin
} from "./firebase-config.js";

// ── STATE ─────────────────────────────────────────────────────
let currentUser    = null;
let userProfile    = null;
let activeLeagueId = null;

// ── ENTRY POINT ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser    = user;
  activeLeagueId = sessionStorage.getItem('activeLeagueId') || 'GoQywLIG0V4oWGvl8yRQ';
  sessionStorage.setItem('activeLeagueId', activeLeagueId);

  await Promise.all([loadProfile(), loadHistory()]);
});

// ── LOAD PROFILE ──────────────────────────────────────────────
async function loadProfile() {
  try {
    const userSnap = await getDoc(doc(db, COLLECTIONS.users, currentUser.uid));

    if (userSnap.exists()) {
      userProfile = userSnap.data();
    } else {
      userProfile = {
        displayName: currentUser.displayName || 'Player',
        email:       currentUser.email,
        leagues:     {},
      };
    }

    const leagueData = userProfile.leagues?.[activeLeagueId] || {};
    const points     = leagueData.points   ?? 0;
    const streak     = leagueData.streak   ?? 0;
    const wildcards  = leagueData.wildcards ?? 3;
    const correct    = leagueData.correct  ?? 0;
    const total      = leagueData.total    ?? 0;
    const accuracy   = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Avatar
    const colors  = ['#00E676','#FFB300','#FF6B6B','#64B5F6','#BA68C8','#4DB6AC'];
    const color   = colors[currentUser.uid.charCodeAt(0) % colors.length];
    const initial = (userProfile.displayName || 'P').charAt(0).toUpperCase();
    const avatar  = document.getElementById('profile-avatar');
    avatar.textContent       = initial;
    avatar.style.background  = color;

    document.getElementById('profile-name').textContent  = userProfile.displayName || 'Player';
    document.getElementById('profile-email').textContent = userProfile.email || '';
    document.getElementById('stat-points').textContent   = points;
    document.getElementById('stat-accuracy').textContent = accuracy + '%';
    document.getElementById('stat-streak').textContent   = streak;

    // Rank
    await loadRank(points);

    // Badges
    const badges = document.getElementById('profile-badges');
    let badgeHtml = '';
    if (isSuperAdmin(currentUser.email)) {
      badgeHtml += '<span class="badge green">⚡ Super Admin</span>';
    }
    const role = leagueData.role;
    if (role === 'owner')     badgeHtml += '<span class="badge green">👑 Owner</span>';
    if (role === 'sub_admin') badgeHtml += '<span class="badge amber">🛡️ Sub Admin</span>';
    if (streak >= 3)          badgeHtml += '<span class="badge amber">🔥 On Fire</span>';
    if (wildcards > 0)        badgeHtml += `<span class="badge">🃏 ${wildcards} wildcards</span>`;
    badges.innerHTML = badgeHtml;

    // Wildcards display
    const wc = document.getElementById('wildcards-display');
    wc.innerHTML = Array.from({ length: 3 }, (_, i) => `
      <div style="
        width: 48px; height: 64px;
        background: ${i < wildcards ? 'var(--green)' : 'var(--bg)'};
        border: 2px solid ${i < wildcards ? 'var(--green)' : 'var(--border)'};
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        font-size: 20px;
        color: ${i < wildcards ? '#000' : 'var(--border)'};
      ">🃏</div>
    `).join('');

  } catch (err) {
    console.error('Error loading profile:', err);
  }
}

// ── LOAD RANK ─────────────────────────────────────────────────
async function loadRank(myPoints) {
  try {
    const snap  = await getDocs(collection(db, COLLECTIONS.users));
    const users = snap.docs.map(d => d.data());
    const approved = users.filter(u =>
      u.leagues?.[activeLeagueId]?.status === STATUS.approved
    );
    const sorted = approved.sort((a, b) =>
      (b.leagues[activeLeagueId].points || 0) - (a.leagues[activeLeagueId].points || 0)
    );
    const rank = sorted.findIndex(u => u.uid === currentUser.uid) + 1;
    document.getElementById('stat-rank').textContent = rank > 0 ? '#' + rank : '#—';
  } catch (err) {
    document.getElementById('stat-rank').textContent = '#—';
  }
}

// ── LOAD HISTORY ──────────────────────────────────────────────
async function loadHistory() {
  const list = document.getElementById('history-list');
  try {
    const q = query(
      collection(db, COLLECTIONS.picks),
      where('userId',   '==', currentUser.uid),
      where('leagueId', '==', activeLeagueId),
      orderBy('submittedAt', 'desc')
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = '<div class="empty-state">No predictions yet.</div>';
      return;
    }

    const picks       = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const scoredPicks = picks.filter(p => p.scored === true);
    const pending     = picks.filter(p => !p.scored);

    if (picks.length === 0) {
      list.innerHTML = '<div class="empty-state">No predictions yet.</div>';
      return;
    }

    // Fetch match names
    const matchIds  = [...new Set(picks.map(p => p.matchId))];
    const matchData = {};
    for (const matchId of matchIds) {
      const matchSnap = await getDoc(doc(db, COLLECTIONS.matches, matchId));
      if (matchSnap.exists()) {
        const m = matchSnap.data();
        matchData[matchId] = `${m.homeTeam} vs ${m.awayTeam}`;
      }
    }

    // Pending picks first
    let html = '';
    if (pending.length > 0) {
      html += pending.map(pick => {
        const matchName = matchData[pick.matchId] || 'Unknown match';
        const pickLabel = getPickLabel(pick.pick);
        const wcBadge   = pick.wildcard ? ' 🃏' : '';
        return `
          <div class="history-row">
            <div class="history-result">⏳</div>
            <div class="history-info">
              <div class="history-match">${matchName}</div>
              <div class="history-pick">${pickLabel}${wcBadge} · Pending</div>
            </div>
            <div class="history-pts zero">—</div>
          </div>`;
      }).join('');
    }

    // Scored picks
    if (scoredPicks.length > 0) {
      html += scoredPicks.map(pick => {
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
    }

    if (!html) {
      list.innerHTML = '<div class="empty-state">No predictions yet.</div>';
    } else {
      list.innerHTML = html;
    }

  } catch (err) {
    console.error('Error loading history:', err);
    list.innerHTML = '<div class="empty-state">Could not load history.</div>';
  }
}

// ── SIGN OUT ──────────────────────────────────────────────────
window.handleSignOut = async function() {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (err) {
    showToast('Error signing out', 'error');
  }
};

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
