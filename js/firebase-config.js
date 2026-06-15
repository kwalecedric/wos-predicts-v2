import { initializeApp }               from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { getFirestore }                from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCNq_TwRzwE8To7U5S-HLl3F-ulrSwbt-I",
  authDomain:        "wos-predicts-v2.firebaseapp.com",
  projectId:         "wos-predicts-v2",
  storageBucket:     "wos-predicts-v2.firebasestorage.app",
  messagingSenderId: "905164458982",
  appId:             "1:905164458982:web:722707c56fddc291b82427"
};

const app = initializeApp(firebaseConfig);

export const auth           = getAuth(app);
export const db             = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const SUPER_ADMIN_UID  = "c4k9oD9ejANTqtkLlc0Y082kYnI2";
export const DEFAULT_LEAGUE_ID = "GoQywLIG0V4oWGvl8yRQ";

export const RAPIDAPI_KEY  = "be356bced3msh57c6ef63b89280ap113f79jsn40f7e7727aa3";
export const RAPIDAPI_HOST = "api-football186.p.rapidapi.com";

export const COLLECTIONS = {
  users:         "users",
  leagues:       "leagues",
  matches:       "matches",
  picks:         "picks",
  results:       "results",
  chat:          "chat",
  notifications: "notifications",
  competition:   "competition",
};

export const ROLES = {
  player:   "player",
  subAdmin: "sub_admin",
  owner:    "owner",
};

export const STATUS = {
  pending:  "pending",
  approved: "approved",
  rejected: "rejected",
};

export function generateLeagueCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}