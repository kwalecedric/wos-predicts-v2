import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
  doc, getDoc, setDoc, updateDoc,
  collection, query, where, getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── HARDCODED CONFIG ──────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCNq_TwRzwE8To7U5S-HLl3F-ulrSwbt-I",
  authDomain:        "wos-predicts-v2.firebaseapp.com",
  projectId:         "wos-predicts-v2",
  storageBucket:     "wos-predicts-v2.firebasestorage.app",
  messagingSenderId: "905164458982",
  appId:             "1:905164458992:web:722707c56fddc291b82427"
};

const app           = initializeApp(firebaseConfig);
const auth          = getAuth(app);
const db            = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const SUPER_ADMIN_EMAIL = "kwalecedric01@gmail.com";
const DEFAULT_LEAGUE_ID = "GoQywLIG0V4oWGvl8yRQ";

const COLLECTIONS = {
  users:   "users",
  leagues: "leagues",
  picks:   "picks",
};

const STATUS = { pending: "pending", approved: "approved", rejected: "rejected" };
const ROLES  = { player: "player", subAdmin: "sub_admin", owner: "owner" };

// ── SCREEN MANAGER ────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.auth-screen').forEach(s => s.style.display = 'none');
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function clearLoadingState() {
  document.querySelectorAll('.submit-btn.loading').forEach(b => b.classList.remove('loading'));
}

// ── AUTH STATE LISTENER ───────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    clearLoadingState();
    return;
  }

  console.log('Auth fired. UID:', user.uid);
 if (user.email === SUPER_ADMIN_EMAIL) {
  sessionStorage.setItem('activeLeagueId', DEFAULT_LEAGUE_ID);
  window.location.href = 'dashboard.html';
  return;
}

  try {
    const userSnap = await getDoc(doc(db, 'users', user.uid));

    if (!userSnap.exists()) {
      clearLoadingState();
      showScreen('screen-league');
      return;
    }

    const userData  = userSnap.data();
    const leagues   = userData.leagues || {};
    const leagueIds = Object.keys(leagues);

    if (leagueIds.length === 0) {
      clearLoadingState();
      showScreen('screen-league');
      return;
    }

    const firstLeagueId = leagueIds[0];
    const leagueStatus  = leagues[firstLeagueId]?.status;

    if (leagueStatus === STATUS.approved) {
      sessionStorage.setItem('activeLeagueId', firstLeagueId);
      window.location.href = 'dashboard.html';
    } else if (leagueStatus === STATUS.pending) {
      clearLoadingState();
      showScreen('screen-pending');
    } else if (leagueStatus === STATUS.rejected) {
      clearLoadingState();
      showScreen('screen-rejected');
    } else {
      clearLoadingState();
      showScreen('screen-league');
    }

  } catch (err) {
    console.error('Auth error:', err);
    clearLoadingState();
    showToast('Something went wrong. Try again.', 'error');
  }
});

// ── CREATE USER PROFILE ───────────────────────────────────────
async function createUserProfile(user, displayName) {
  const userRef  = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  await setDoc(userRef, {
    uid:          user.uid,
    displayName:  displayName || user.displayName || 'Player',
    email:        user.email,
    photoURL:     user.photoURL || null,
    isSuperAdmin: user.uid === SUPER_ADMIN_UID,
    leagues:      userSnap.exists() ? (userSnap.data().leagues || {}) : {},
    createdAt:    serverTimestamp(),
  }, { merge: true });
}

// ── SIGN IN ───────────────────────────────────────────────────
async function handleSignIn() {
  clearErrors();
  const email = document.getElementById('signin-email').value.trim();
  const pass  = document.getElementById('signin-password').value;
  let valid   = true;

  if (!isValidEmail(email)) { showError('signin-email-err', 'Please enter a valid email'); valid = false; }
  if (!pass)                 { showError('signin-pass-err', 'Please enter your password'); valid = false; }
  if (!valid) return;

  const btn = document.querySelector('#form-signin .submit-btn');
  btn.classList.add('loading');

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    btn.classList.remove('loading');
    if (err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'  ||
        err.code === 'auth/invalid-credential') {
      showError('signin-pass-err', 'Incorrect email or password');
    } else if (err.code === 'auth/too-many-requests') {
      showError('signin-pass-err', 'Too many attempts. Try again later');
    } else {
      showError('signin-pass-err', 'Something went wrong. Try again');
    }
  }
}

// ── SIGN UP ───────────────────────────────────────────────────
async function handleSignUp() {
  clearErrors();
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass  = document.getElementById('signup-password').value;
  let valid   = true;

  if (!name)                { showError('signup-name-err', 'Please enter your name'); valid = false; }
  if (!isValidEmail(email)) { showError('signup-email-err', 'Please enter a valid email'); valid = false; }
  if (pass.length < 8)      { showError('signup-pass-err', 'Password must be at least 8 characters'); valid = false; }
  if (!valid) return;

  const btn = document.querySelector('#form-signup .submit-btn');
  btn.classList.add('loading');

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await createUserProfile(cred.user, name);
    btn.classList.remove('loading');
    showScreen('screen-league');
  } catch (err) {
    btn.classList.remove('loading');
    if (err.code === 'auth/email-already-in-use') {
      showError('signup-email-err', 'An account with this email already exists');
    } else if (err.code === 'auth/weak-password') {
      showError('signup-pass-err', 'Password is too weak');
    } else {
      showError('signup-email-err', 'Something went wrong. Try again');
    }
  }
}

// ── GOOGLE SIGN IN ────────────────────────────────────────────
async function googleAuth() {
  try {
    showToast('Opening Google sign-in...', '');
    const result = await signInWithPopup(auth, googleProvider);
    await createUserProfile(result.user, result.user.displayName);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      showToast('Google sign-in failed. Try again', 'error');
    }
  }
}

// ── JOIN LEAGUE ───────────────────────────────────────────────
async function joinLeague() {
  const code = document.getElementById('league-code-input').value.trim().toUpperCase();
  if (!code) { showError('league-code-err', 'Please enter a league code'); return; }

  const btn = document.getElementById('join-league-btn');
  btn.classList.add('loading');

  try {
    const q    = query(collection(db, 'leagues'), where('code', '==', code));
    const snap = await getDocs(q);

    if (snap.empty) {
      btn.classList.remove('loading');
      showError('league-code-err', 'Invalid code. Check with your group admin');
      return;
    }

    const leagueDoc = snap.docs[0];
    const league    = leagueDoc.data();
    const leagueId  = leagueDoc.id;

    if (league.codeExpiresAt && league.codeExpiresAt.toMillis() < Date.now()) {
      btn.classList.remove('loading');
      showError('league-code-err', 'This league code has expired');
      return;
    }

    if (league.status !== 'active') {
      btn.classList.remove('loading');
      showError('league-code-err', 'This league is no longer active');
      return;
    }

    const userRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userRef, {
      [`leagues.${leagueId}`]: {
        status:    STATUS.pending,
        role:      ROLES.player,
        joinedAt:  serverTimestamp(),
        points:    0,
        streak:    0,
        wildcards: 3,
      }
    });

    btn.classList.remove('loading');
    showScreen('screen-pending');

  } catch (err) {
    btn.classList.remove('loading');
    console.error('Join league error:', err);
    showError('league-code-err', 'Something went wrong. Try again');
  }
}

// ── FORGOT PASSWORD ───────────────────────────────────────────
async function showForgot() {
  const email = document.getElementById('signin-email').value.trim();
  if (!isValidEmail(email)) { showError('signin-email-err', 'Enter your email above first'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Reset link sent to ' + email, 'success');
  } catch {
    showError('signin-email-err', 'Email not found');
  }
}

// ── UI HELPERS ────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('form-signin').style.display = tab === 'signin' ? 'block' : 'none';
  document.getElementById('form-signup').style.display = tab === 'signup' ? 'block' : 'none';
  clearErrors();
}

function togglePwd(inputId, btn) {
  const input  = document.getElementById(inputId);
  const isText = input.type === 'text';
  input.type   = isText ? 'password' : 'text';
  btn.querySelector('svg').innerHTML = isText
    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
    : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('show'); }
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(window._toast);
  window._toast = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── EXPOSE TO HTML ────────────────────────────────────────────
window.handleSignIn  = handleSignIn;
window.handleSignUp  = handleSignUp;
window.googleAuth    = googleAuth;
window.showForgot    = showForgot;
window.joinLeague    = joinLeague;
window.switchAuthTab = switchAuthTab;
window.togglePwd     = togglePwd;

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const active = document.querySelector('.auth-screen[style*="block"]');
  if (active?.id === 'screen-league') joinLeague();
  else {
    const isSignin = document.getElementById('form-signin').style.display !== 'none';
    if (isSignin) handleSignIn(); else handleSignUp();
  }
});
