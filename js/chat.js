import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  collection, addDoc, onSnapshot,
  query, orderBy, limit,
  serverTimestamp, doc, getDoc, getDocs
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

import {
  auth, db, COLLECTIONS, STATUS
} from "./firebase-config.js";

// ── STATE ─────────────────────────────────────────────────────
let currentUser    = null;
let userProfile    = null;
let activeLeagueId = null;
let unsubscribe    = null;

// ── ENTRY POINT ───────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser    = user;
 activeLeagueId = sessionStorage.getItem('activeLeagueId') || 'GoQywLIG0V4oWGvl8yRQ';
  sessionStorage.setItem('activeLeagueId', activeLeagueId);

  // Load user profile
const userSnap = await getDoc(doc(db, COLLECTIONS.users, user.uid));
  if (userSnap.exists()) {
    userProfile = userSnap.data();
  } else {
    userProfile = {
      displayName: 'Cedric',
      email: user.email,
    };
  }

  // Load league info
  await loadLeagueInfo();

  // Enable input
  const input  = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  input.addEventListener('input', () => {
    sendBtn.disabled = input.value.trim() === '';
  });

  // Start listening to messages
  listenToMessages();
});

// ── LOAD LEAGUE INFO ──────────────────────────────────────────
async function loadLeagueInfo() {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.leagues, activeLeagueId));
    if (!snap.exists()) return;
    const league = snap.data();
    document.getElementById('chat-title').textContent = league.name || 'League Chat';

    // Count approved members
    const usersSnap = await getDocs(collection(db, COLLECTIONS.users));
    const members   = usersSnap.docs.filter(d =>
      d.data().leagues?.[activeLeagueId]?.status === STATUS.approved
    );
    document.getElementById('member-count').textContent =
      `${members.length} member${members.length !== 1 ? 's' : ''}`;
  } catch (err) {
    console.error('Error loading league info:', err);
  }
}

// ── LISTEN TO MESSAGES ────────────────────────────────────────
function listenToMessages() {
  if (unsubscribe) unsubscribe();

  const chatRef = collection(db, 'leagues', activeLeagueId, COLLECTIONS.chat);
  const q       = query(chatRef, orderBy('sentAt', 'asc'), limit(100));

  unsubscribe = onSnapshot(q, (snap) => {
    renderMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('Chat error:', err);
  });
}

// ── RENDER MESSAGES ───────────────────────────────────────────
function renderMessages(messages) {
  const container = document.getElementById('chat-messages');

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="empty-chat">
        <div class="empty-chat-icon">💬</div>
        <div class="empty-chat-text">No messages yet.<br>Be the first to say something!</div>
      </div>`;
    return;
  }

  let html        = '';
  let lastDate    = '';
  let lastSender  = '';

  messages.forEach((msg, i) => {
    const isMe     = msg.userId === currentUser.uid;
    const time     = msg.sentAt?.toDate ? msg.sentAt.toDate() : new Date();
    const dateStr  = time.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr  = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const sameUser = lastSender === msg.userId;

    // Date divider
    if (dateStr !== lastDate) {
      html     += `<div class="date-divider">${dateStr}</div>`;
      lastDate  = dateStr;
      lastSender = '';
    }

    const groupClass = isMe ? 'mine' : 'theirs';
    const showSender = !isMe && !sameUser;

    html += `<div class="msg-group ${groupClass}">
      ${showSender ? `<div class="msg-sender">${escapeHtml(msg.displayName || 'Player')}</div>` : ''}
      <div class="msg-bubble">${escapeHtml(msg.text)}</div>
      <div class="msg-time">${timeStr}</div>
    </div>`;

    lastSender = msg.userId;
  });

  container.innerHTML = html;

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// ── SEND MESSAGE ──────────────────────────────────────────────
window.sendMessage = async function() {
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const text    = input.value.trim();
  if (!text) return;

  input.value      = '';
  sendBtn.disabled = true;
  autoResize(input);

  try {
    const chatRef = collection(db, 'leagues', activeLeagueId, COLLECTIONS.chat);
    await addDoc(chatRef, {
      text,
      userId:      currentUser.uid,
      displayName: userProfile.displayName || 'Player',
      sentAt:      serverTimestamp(),
    });
  } catch (err) {
    console.error('Send error:', err);
    input.value      = text;
    sendBtn.disabled = false;
  }
};

// ── AUTO RESIZE TEXTAREA ──────────────────────────────────────
window.autoResize = function(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
};

// ── HANDLE ENTER KEY ──────────────────────────────────────────
window.handleKey = function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};

// ── EMOJI PICKER ──────────────────────────────────────────────
window.toggleEmojiPicker = function() {
  const picker = document.getElementById('emoji-picker');
  picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
};

window.insertEmoji = function(emoji) {
  const input = document.getElementById('chat-input');
  input.value += emoji;
  input.focus();
  document.getElementById('send-btn').disabled = false;
  document.getElementById('emoji-picker').style.display = 'none';
  autoResize(input);
};

// ── ESCAPE HTML ───────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
