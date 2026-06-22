import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  doc, getDoc, getDocs, updateDoc,
  collection, query, where,
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
    document.getElementById('league-info-sub').textContent  = `Prize pool: $${league.prizePool || 0}`;
  } catch (err) {
    console.error('Error loading league:', err);
  }
}

// ── LOAD PLAYERS ──────────────────────────────────────────────
async function loadPlayers() {
  try {
    const snap  = await getDocs(collection(db, COLLECTIONS.users));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPending(users.filter(u => u.leagues?.[activeLeagueId]?.status === STATUS.pending));
    renderApproved(users.filter(u => u.leagues?.[activeLeagueId]?.status === STATUS.approved));
  } catch (err) {
    console.error('Error loading players:', err);
  }
}

// ── RENDER PENDING ────────────────────────────────────────────
function renderPending(players) {
  const el = document.getElementById('pending-list');
  if (players.length === 0) { el.innerHTML = '<div class="empty-state">No pending requests</div>'; return; }
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
    </div>`).join('');
}

// ── RENDER APPROVED ───────────────────────────────────────────
function renderApproved(players) {
  const el = document.getElementById('approved-list');
  if (players.length === 0) { el.innerHTML = '<div class="empty-state">No approved players yet</div>'; return; }
  el.innerHTML = players.map(p => {
    const pts = p.leagues?.[activeLeagueId]?.points ?? 0;
    return `
    <div class="player-row">
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

// ── APPROVE / REJECT / REMOVE ─────────────────────────────────
window.approvePlayer = async function(uid) {
  try {
    await updateDoc(doc(db, COLLECTIONS.users, uid), { [`leagues.${activeLeagueId}.status`]: STATUS.approved });
    showToast('Player approved ✅', 'success');
    await loadPlayers();
  } catch (err) { showToast('Error approving player', 'error'); }
};

window.rejectPlayer = async function(uid) {
  if (!confirm('Reject this player?')) return;
  try {
    await updateDoc(doc(db, COLLECTIONS.users, uid), { [`leagues.${activeLeagueId}.status`]: STATUS.rejected });
    showToast('Player rejected', 'error');
    await loadPlayers();
  } catch (err) { showToast('Error rejecting player', 'error'); }
};

window.removePlayer = async function(uid) {
  if (!confirm('Remove this player from the league?')) return;
  try {
    await updateDoc(doc(db, COLLECTIONS.users, uid), { [`leagues.${activeLeagueId}.status`]: STATUS.rejected });
    showToast('Player removed', 'error');
    await loadPlayers();
  } catch (err) { showToast('Error removing player', 'error'); }
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
    document.getElementById('results-list').innerHTML = '<div class="empty-state">Could not load matches.</div>';
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
    <div class="match-row" id="match-row-${match.id}" style="flex-direction:column;align-items:stretch;gap:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <div class="match-teams">${match.homeTeam} vs ${match.awayTeam}</div>
          <div class="match-time">${formatKickoff(match.kickoff)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="number" class="score-box" id="home-${match.id}" min="0" max="20"
            placeholder="0" value="${match.resultHome ?? ''}">
          <span class="score-dash">—</span>
          <input type="number" class="score-box" id="away-${match.id}" min="0" max="20"
            placeholder="0" value="${match.resultAway ?? ''}">
          <button class="btn-save-result" onclick="saveResult('${match.id}')">
            ${match.resultHome !== undefined ? 'Update' : 'Save'}
          </button>
        </div>
      </div>

      <!-- SPECIAL PICKS CONFIRMATION -->
      <div style="background:var(--bg);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;">
          Special picks confirmation
        </div>

        <label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text);cursor:pointer;">
          <input type="checkbox" id="redcard-${match.id}" ${match.hadRedCard ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:var(--green);">
          🟥 Red card was shown
        </label>

        <label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text);cursor:pointer;">
          <input type="checkbox" id="yellows-${match.id}" ${match.hadFiveYellows ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:var(--green);">
          🟨 5+ yellow cards shown
        </label>

        <label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text);cursor:pointer;">
          <input type="checkbox" id="extratime-${match.id}" ${match.hadExtraTime ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:var(--green);">
          ⏱️ Match went to extra time
        </label>

        <label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text);cursor:pointer;">
          <input type="checkbox" id="penalties-${match.id}" ${match.hadPenalties ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:var(--green);">
          🎯 Match went to penalties
        </label>

        <div style="display:flex;align-items:center;gap:8px;">
          <label style="font-size:13px;color:var(--text);white-space:nowrap;">🌟 MOTM:</label>
          <input type="text" id="motm-${match.id}"
            value="${match.motmPlayer || ''}"
            placeholder="Player name e.g. Mbappé"
            style="flex:1;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--text);font-size:13px;font-family:inherit;outline:none;">
        </div>
      </div>
    </div>
  `).join('');
}

// ── SAVE RESULT ───────────────────────────────────────────────
window.saveResult = async function(matchId) {
  const homeVal = document.getElementById(`home-${matchId}`).value;
  const awayVal = document.getElementById(`away-${matchId}`).value;

  if (homeVal === '' || awayVal === '') { showToast('Enter both scores', 'error'); return; }

  const homeScore    = parseInt(homeVal);
  const awayScore    = parseInt(awayVal);
  const hadRedCard   = document.getElementById(`redcard-${matchId}`).checked;
  const hadFiveYellows = document.getElementById(`yellows-${matchId}`).checked;
  const hadExtraTime = document.getElementById(`extratime-${matchId}`).checked;
  const hadPenalties = document.getElementById(`penalties-${matchId}`).checked;
  const motmPlayer   = document.getElementById(`motm-${matchId}`).value.trim().toLowerCase();

  const btn       = document.querySelector(`#match-row-${matchId} .btn-save-result`);
  btn.disabled    = true;
  btn.textContent = 'Saving...';

  try {
    await updateDoc(doc(db, COLLECTIONS.matches, matchId), {
      resultHome:      homeScore,
      resultAway:      awayScore,
      hadRedCard,
      hadFiveYellows,
      hadExtraTime,
      hadPenalties,
      motmPlayer,
      resultSavedAt:   serverTimestamp(),
    });

    btn.textContent = 'Saved ✅';
    showToast('Result saved!', 'success');
    await autoScore(matchId, homeScore, awayScore, {
      hadRedCard, hadFiveYellows, hadExtraTime, hadPenalties, motmPlayer
    });

  } catch (err) {
    console.error(err);
    btn.disabled    = false;
    btn.textContent = 'Save';
    showToast('Error saving result', 'error');
  }
};

// ── AUTO SCORING ──────────────────────────────────────────────
async function autoScore(matchId, homeScore, awayScore, specials) {
  try {
    const picksSnap = await getDocs(
      query(collection(db, COLLECTIONS.picks),
        where('matchId', '==', matchId),
        where('leagueId', '==', activeLeagueId))
    );

    if (picksSnap.empty) { showToast('No picks to score for this match', ''); return; }

    const homeWin = homeScore > awayScore;
    const awayWin = awayScore > homeScore;
    const isDraw  = homeScore === awayScore;

    for (const pickDoc of picksSnap.docs) {
      const pick = pickDoc.data();
      let pts    = 0;

      switch (pick.pick) {
        case 'home_win':
          pts = homeWin ? 3 : 0;
          break;
        case 'away_win':
          pts = awayWin ? 3 : 0;
          break;
        case 'draw':
          pts = isDraw ? 4 : 0;
          break;
        case 'correct_score':
          const pHome = parseInt(pick.scoreHome);
          const pAway = parseInt(pick.scoreAway);
          if (pHome === homeScore && pAway === awayScore) {
            pts = isDraw ? 7 : 6;
          }
          break;
        case 'red_card':
          pts = specials.hadRedCard ? 7 : 0;
          break;
        case 'five_yellows':
          pts = specials.hadFiveYellows ? 5 : 0;
          break;
        case 'motm':
          const playerPick = (pick.motmPlayer || '').toLowerCase().trim();
          const motmActual = specials.motmPlayer.toLowerCase().trim();
          pts = (playerPick && motmActual && (
            motmActual.includes(playerPick) || playerPick.includes(motmActual)
          )) ? 10 : 0;
          break;
        case 'prolongation':
          pts = specials.hadExtraTime ? 10 : 0;
          break;
        case 'penalties':
          pts = specials.hadPenalties ? 10 : 0;
          break;
      }

      // Apply wildcard
      if (pick.wildcard && pts > 0) pts *= 2;

      // Update pick doc
      await updateDoc(doc(db, COLLECTIONS.picks, pickDoc.id), {
        pointsEarned: pts,
        scored:       true,
        scoredAt:     serverTimestamp(),
      });

      // Update user league stats
      const userRef  = doc(db, COLLECTIONS.users, pick.userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) continue;

      const leagueData  = userSnap.data().leagues?.[activeLeagueId] || {};
      const prevStreak  = leagueData.streak || 0;
      const newStreak   = pts > 0 ? prevStreak + 1 : 0;

      await updateDoc(userRef, {
        [`leagues.${activeLeagueId}.points`]:  (leagueData.points  || 0) + pts,
        [`leagues.${activeLeagueId}.correct`]: (leagueData.correct || 0) + (pts > 0 ? 1 : 0),
        [`leagues.${activeLeagueId}.total`]:   (leagueData.total   || 0) + 1,
        [`leagues.${activeLeagueId}.streak`]:  newStreak,
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
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(window._t);
  window._t = setTimeout(() => t.classList.remove('show'), 3000);
}
