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

    const content = msg.gifUrl
  ? `<img src="${msg.gifUrl}" style="max-width:200px;border-radius:12px;display:block;">`
  : `<div class="msg-bubble">${escapeHtml(msg.text)}</div>`;

html += `<div class="msg-group ${groupClass}">
      ${showSender ? `<div class="msg-sender">${escapeHtml(msg.displayName || 'Player')}</div>` : ''}
      ${content}
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
// ── GIF PICKER ────────────────────────────────────────────────
const GIPHY_KEY = 'qeToAVc7iNQ7UiQoWGKSy8jPYwnGvrDk';

window.toggleGifPicker = function() {
  const picker      = document.getElementById('gif-picker');
  const emojiPicker = document.getElementById('emoji-picker');
  emojiPicker.style.display = 'none';
  picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
  if (picker.style.display === 'block') {
    document.getElementById('gif-search').focus();
    loadTrendingGifs();
  }
};

async function loadTrendingGifs() {
  const res  = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=12&rating=g`);
  const data = await res.json();
  renderGifs(data.data);
}

window.searchGifs = async function() {
  const q = document.getElementById('gif-search').value.trim();
  if (!q) { loadTrendingGifs(); return; }
  const res  = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=12&rating=g`);
  const data = await res.json();
  renderGifs(data.data);
};

function renderGifs(gifs) {
  const el = document.getElementById('gif-results');
  if (!gifs || gifs.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;grid-column:span 3;padding:20px;">No GIFs found</div>';
    return;
  }
  el.innerHTML = gifs.map(g => `
    <img src="${g.images.fixed_height_small.url}"
      style="width:100%;border-radius:8px;cursor:pointer;object-fit:cover;aspect-ratio:1;"
      onclick="sendGif('${g.images.original.url}')">`
  ).join('');
}

window.sendGif = async function(gifUrl) {
  document.getElementById('gif-picker').style.display = 'none';
  try {
    const chatRef = collection(db, 'leagues', activeLeagueId, COLLECTIONS.chat);
    await addDoc(chatRef, {
      text:        '',
      gifUrl:      gifUrl,
      userId:      currentUser.uid,
      displayName: userProfile.displayName || 'Player',
      sentAt:      serverTimestamp(),
    });
  } catch (err) {
    console.error('GIF send error:', err);
  }
};

// Also handle enter key in gif search
document.getElementById('gif-search')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') searchGifs();
});

// ── ESCAPE HTML ───────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
document.addEventListener('click', (e) => {
  const emojiPicker = document.getElementById('emoji-picker');
  const gifPicker   = document.getElementById('gif-picker');
  const emojiBtn    = document.getElementById('emoji-btn');
  const gifBtn      = document.getElementById('gif-btn');
  if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
    emojiPicker.style.display = 'none';
  }
  if (gifPicker && !gifPicker.contains(e.target) && e.target !== gifBtn) {
    gifPicker.style.display = 'none';
  }
});
window.addEventListener('load', () => {
  document.getElementById('gif-btn')?.addEventListener('click', window.toggleGifPicker);
  document.getElementById('emoji-btn')?.addEventListener('click', window.toggleEmojiPicker);
});
