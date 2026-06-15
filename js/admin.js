import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  doc, getDoc, getDocs, updateDoc,
  collection, query, where, orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

import {
  auth, db, COLLECTIONS, STATUS, isSuperAdmin
} from "./firebase-config.js";

// ── STATE ─────────────────────────────────────────────────────
let currentUser    = null;
let activeLeagueId = null;
let todayMatches   = [];

// ── ENTRY POINT ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  if (!isSuperAdmin(user.email)) { window.location.href = "dashboard.html"; return; }

  currentUser    = user;
  activeLeagueId = sessionStorage.getItem('activeLeagueId') || 'GoQywLIG0V4oWGvl8yRQ';

  await Promise.all([loadLeagueInfo(), loadPlayers(), loadTodayMatches()]);
});

// ── LEAGUE INFO ───────────────────────────────────────────────
async function loadLeagueInfo() {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.leagues, activeLeagueId));
    if (!snap.exists()) return;
    const league = snap.data();
    document.getElementById('league-info-name').textContent = league.name || 'My League';
    document.getElementById('league-info-code').textContent = league.code || '';
    document.getElementById('league-info-sub').textContent  =
      `Prize pool: $${league.prizePool || 0}`;
  } catch (err) {
    console.error('Error loading league:', err);
  }
}

// ── LOAD PLAYERS ──────────────────────────────────────────────
async function loadPlayers() {
  try {
    const snap  = await getDocs(collection(db, COLLECTIONS.users));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const pending  = users.filter(u => u.leagues?.[activeLeagueId]?.status === STATUS.pending);
    const approved = users.filter(u => u.leagues?.[activeLeagueId]?.status === STATUS.approved);

    renderPending(pending);
    renderApproved(approved);
  } catch (err) {
    console.error('Error loading players:', err);
  }
}

// ── RENDER PENDING ────────────────────────────────────────────
function renderPending(players) {
  const el = document.getElementById('pending-list');
  if (players.length === 0) {
    el.innerHTML = '<div class="empty-state">No pending requests</div>';
    return;
  }
  el.innerHTML = players.map(p => `
    <div class="player-row" id="player-row-${p.id}">
      <div class="player-info">
        <div class="player-name">${p.displayName || 'Player'}</div>
        <div class="player-email">${p.email || ''}</div>
      </div>
      <div class="player-actions">
        <button class="btn-approve" onclick="approvePlayer('${p.id}')">Approve</button>
        <button class="btn-reject"  onclick="rejectPlayer('${p.id}')">Reject</button>
      </div>
    </div>
  `).join('');
}

// ── RENDER APPROVED ───────────────────────────────────────────
function renderApproved(players) {
  const el = document.getElementById('approved-list');
  if (players.length === 0) {
    el.innerHTML = '<div class="empty-state">No approved players yet</div>';
    return;
  }
  el.innerHTML = players.map(p => {
    const pts = p.leagues?.[activeLeagueId]?.points ?? 0;
    return `
    <div class="player-row" id="player-row-${p.id}">
      <div class="player-info">
        <div class="player-name">${p.displayName || 'Player'}</div>
        <div class="player-email">${p.email || ''} · ${pts} pts</div>
      </div>
      <div class="player-actions">
        <span class="player-status status-approved">Approved</span>
        <button class="btn-remove" onclick="removePlayer('${p.id}')">Remove</button>
      </div>
    </div>`;
  }).join('');
}

// ── APPROVE PLAYER ────────────────────────────────────────────
window.approvePlayer = async function(uid) {
  try {
    await updateDoc(doc(db, COLLECTIONS.users, uid), {
      [`leagues.${activeLeagueId}.status`]: STATUS.approved,
    });
    showToast('Player approved ✅', 'success');
    await loadPlayers();
  } catch (err) {
    console.error(err);
    showToast('Error approving player', 'error');
  }
};

// ── REJECT PLAYER ─────────────────────────────────────────────
window.rejectPlayer = async function(uid) {
  if (!confirm('Reject this player?')) return;
  try {
    await updateDoc(doc(db, COLLECTIONS.users, uid), {
      [`leagues.${activeLeagueId}.status`]: STATUS.rejected,
    });
    showToast('Player rejected', 'error');
    await loadPlayers();
  } catch (err) {
    console.error(err);
    showToast('Error rejecting player', 'error');
  }
};

// ── REMOVE PLAYER ─────────────────────────────────────────────
window.removePlayer = async function(uid) {
  if (!confirm('Remove this player from the league?')) return;
  try {
    await updateDoc(doc(db, COLLECTIONS.users, uid), {
      [`leagues.${activeLeagueId}.status`]: STATUS.rejected,
    });
    showToast('Player removed', 'error');
    await loadPlayers();
  } catch (err) {
    console.error(err);
    showToast('Error removing player', 'error');
  }
};

// ── LOAD TODAY'S MATCHES ──────────────────────────────────────
async function loadTodayMatches() {
  try {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const q    = query(collection(db, COLLECTIONS.matches),
                   where('kickoff', '>=', start.toISOString()),
                   where('kickoff', '<',  end.toISOString()));
    const snap = await getDocs(q);

    todayMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderResultsForm();
  } catch (err) {
    console.error('Error loading matches:', err);
    document.getElementById('results-list').innerHTML =
      '<div class="empty-state">Could not load matches.</div>';
  }
}

// ── RENDER RESULTS FORM ───────────────────────────────────────
function renderResultsForm() {
  const el = document.getElementById('results-list');
  if (todayMatches.length === 0) {
    el.innerHTML = '<div class="empty-state">No matches today.</div>';
    return;
  }

  el.innerHTML = todayMatches.map(match => `
    <div class="match-row" id="match-row-${match.id}">
      <div>
        <div class="match-teams">${match.homeTeam} vs ${match.awayTeam}</div>
        <div class="match-time">${formatKickoff(match.kickoff)}</div>
      </div>
      <div class="score-inputs">
        <input type="number" class="score-box" id="home-${match.id}" min="0" max="20"
          placeholder="0" value="${match.resultHome ?? ''}">
        <span class="score-dash">—</span>
        <input type="number" class="score-box" id="away-${match.id}" min="0" max="20"
          placeholder="0" value="${match.resultAway ?? ''}">
      </div>
      <button class="btn-save-result" onclick="saveResult('${match.id}')">
        ${match.resultHome !== undefined ? 'Update' : 'Save'}
      </button>
    </div>
  `).join('');
}

// ── SAVE RESULT ───────────────────────────────────────────────
window.saveResult = async function(matchId) {
  const homeVal = document.getElementById(`home-${matchId}`).value;
  const awayVal = document.getElementById(`away-${matchId}`).value;

  if (homeVal === '' || awayVal === '') {
    showToast('Enter both scores', 'error');
    return;
  }

  const homeScore = parseInt(homeVal);
  const awayScore = parseInt(awayVal);
  const btn       = document.querySelector(`#match-row-${matchId} .btn-save-result`);
  btn.disabled    = true;
  btn.textContent = 'Saving...';

  try {
    await updateDoc(doc(db, COLLECTIONS.matches, matchId), {
      resultHome: homeScore,
      resultAway: awayScore,
      resultSavedAt: serverTimestamp(),
    });

    btn.textContent = 'Saved ✅';
    showToast('Result saved!', 'success');

    // Trigger auto-scoring
    await autoScore(matchId, homeScore, awayScore);

  } catch (err) {
    console.error(err);
    btn.disabled    = false;
    btn.textContent = 'Save';
    showToast('Error saving result', 'error');
  }
};

// ── AUTO SCORING ──────────────────────────────────────────────
async function autoScore(matchId, homeScore, awayScore) {
  try {
    const picksSnap = await getDocs(
      query(collection(db, COLLECTIONS.picks),
        where('matchId', '==', matchId),
        where('leagueId', '==', activeLeagueId))
    );

    if (picksSnap.empty) return;

    const homeWin = homeScore > awayScore;
    const awayWin = awayScore > homeScore;
    const isDraw  = homeScore === awayScore;

    for (const pickDoc of picksSnap.docs) {
      const pick = pickDoc.data();
      let pts    = 0;

      switch (pick.pick) {
        case 'home_win':
          pts = homeWin ? 3 : 0; break;
        case 'away_win':
          pts = awayWin ? 3 : 0; break;
        case 'draw':
          pts = isDraw ? 4 : 0; break;
        case 'correct_score':
          if (homeWin && pick.scoreHome > pick.scoreAway) pts = 6;
          else if (awayWin && pick.scoreAway > pick.scoreHome) pts = 6;
          else if (isDraw && pick.scoreHome === pick.scoreAway) pts = 7;
          if (pts > 0 &&
              parseInt(pick.scoreHome) === homeScore &&
              parseInt(pick.scoreAway) === awayScore) {
            pts = isDraw ? 7 : 6;
          } else {
            pts = 0;
          }
          break;
        case 'red_card':      pts = pick.redCard      ? 7  : 0; break;
        case 'five_yellows':  pts = pick.fiveYellows  ? 5  : 0; break;
        case 'motm':          pts = pick.motmCorrect  ? 10 : 0; break;
        case 'prolongation':  pts = pick.extraTime    ? 10 : 0; break;
        case 'penalties':     pts = pick.penalties    ? 10 : 0; break;
      }

      // Apply wildcard
      if (pick.wildcard && pts > 0) pts *= 2;

      // Update pick
      await updateDoc(doc(db, COLLECTIONS.picks, pickDoc.id), {
        pointsEarned: pts,
        scored: true,
        scoredAt: serverTimestamp(),
      });

      // Update user league points
      const userRef  = doc(db, COLLECTIONS.users, pick.userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) continue;

      const userData    = userSnap.data();
      const leagueData  = userData.leagues?.[activeLeagueId] || {};
      const totalPoints = (leagueData.points || 0) + pts;
      const correct     = (leagueData.correct || 0) + (pts > 0 ? 1 : 0);
      const total       = (leagueData.total   || 0) + 1;
      const streak      = pts > 0 ? (leagueData.streak || 0) + 1 : 0;

      await updateDoc(userRef, {
        [`leagues.${activeLeagueId}.points`]:  totalPoints,
        [`leagues.${activeLeagueId}.correct`]: correct,
        [`leagues.${activeLeagueId}.total`]:   total,
        [`leagues.${activeLeagueId}.streak`]:  streak,
      });
    }

    showToast('Auto-scoring complete ✅', 'success');

  } catch (err) {
    console.error('Auto-score error:', err);
    showToast('Auto-scoring failed', 'error');
  }
}

// ── TAB SWITCHER ──────────────────────────────────────────────
window.switchTab = function(tab) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', ['players','results'][i] === tab);
  });
  document.getElementById('tab-players').classList.toggle('active', tab === 'players');
  document.getElementById('tab-results').classList.toggle('active', tab === 'results');
};

// ── HELPERS ───────────────────────────────────────────────────
function formatKickoff(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(window._t);
  window._t = setTimeout(() => t.classList.remove('show'), 3000);
}
