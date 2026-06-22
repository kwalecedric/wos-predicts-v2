import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  collection, addDoc, onSnapshot,
  query, orderBy, doc, updateDoc,
  serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import {
  auth, db, COLLECTIONS, isSuperAdmin
} from "./firebase-config.js";
// ── STATE ─────────────────────────────────────────────────────
let currentUser    = null;
let activeLeagueId = null;
let selectedType   = 'info';
let isAdmin        = false;

// ── ENTRY POINT ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser    = user;
  activeLeagueId = sessionStorage.getItem('activeLeagueId') || 'GoQywLIG0V4oWGvl8yRQ';
  sessionStorage.setItem('activeLeagueId', activeLeagueId);

  isAdmin = isSuperAdmin(user.email);
  if (isAdmin) {
    document.getElementById('compose-card').style.display = 'block';
  }

  listenToNotifications();
});

// ── LISTEN TO NOTIFICATIONS ───────────────────────────────────
function listenToNotifications() {
  const notifRef = collection(db, 'leagues', activeLeagueId, COLLECTIONS.notifications);
  const q        = query(notifRef, orderBy('createdAt', 'desc'));

  onSnapshot(q, (snap) => {
    renderNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('Notifications error:', err);
  });
}

// ── RENDER NOTIFICATIONS ──────────────────────────────────────
function renderNotifications(notifications) {
  const list = document.getElementById('notif-list');

  if (notifications.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div>No announcements yet</div>
      </div>`;
    return;
  }

  list.innerHTML = notifications.map(n => {
    const icon     = getTypeIcon(n.type);
    const time     = n.createdAt?.toDate ? formatTime(n.createdAt.toDate()) : '';
    const unread   = !n.readBy?.includes(currentUser.uid);

    return `
      <div class="notif-card ${unread ? 'unread' : ''}" onclick="markRead('${n.id}')">
        <div class="notif-icon">${icon}</div>
        <div class="notif-body">
          <div class="notif-title">${escapeHtml(n.title)}</div>
          <div class="notif-text">${escapeHtml(n.body)}</div>
          <div class="notif-time">${time}</div>
        </div>
        ${unread ? '<div class="notif-dot"></div>' : ''}
      </div>`;
  }).join('');
}

// ── SEND NOTIFICATION ─────────────────────────────────────────
window.sendNotification = async function() {
  const title = document.getElementById('notif-title-input').value.trim();
  const body  = document.getElementById('notif-body-input').value.trim();

  if (!title) { showToast('Please enter a title', 'error'); return; }
  if (!body)  { showToast('Please enter a message', 'error'); return; }

  const btn    = document.getElementById('send-notif-btn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const notifRef = collection(db, 'leagues', activeLeagueId, COLLECTIONS.notifications);
    await addDoc(notifRef, {
      title,
      body,
      type:      selectedType,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid,
      readBy:    [currentUser.uid],
    });

    document.getElementById('notif-title-input').value = '';
    document.getElementById('notif-body-input').value  = '';
    showToast('Announcement sent! 📢', 'success');

  } catch (err) {
    console.error('Send error:', err);
    showToast('Failed to send. Try again.', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Send to league';
  }
};

// ── MARK AS READ ──────────────────────────────────────────────
window.markRead = async function(notifId) {
  try {
    const notifRef = doc(db, 'leagues', activeLeagueId, COLLECTIONS.notifications, notifId);
    await updateDoc(notifRef, {
      readBy: arrayUnion(currentUser.uid),
    });
  } catch (err) {
    // Silent fail — not critical
  }
};

// ── TYPE SELECTOR ─────────────────────────────────────────────
window.setType = function(type, btn) {
  selectedType = type;
  document.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
};

// ── HELPERS ───────────────────────────────────────────────────
function getTypeIcon(type) {
  const icons = {
    info:      'ℹ️',
    result:    '⚽',
    warning:   '⚠️',
    celebrate: '🎉',
  };
  return icons[type] || '📢';
}

function formatTime(date) {
  const now  = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24)  return `${hrs}h ago`;
  if (days < 7)  return `${days}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(window._t);
  window._t = setTimeout(() => t.classList.remove('show'), 3000);
}
