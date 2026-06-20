import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from "firebase/auth";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  increment,
  where,
  runTransaction
} from "firebase/firestore";

// Configuração obtida do firebase-applet-config.json
const firebaseConfig = {
  apiKey: "AIzaSyBvOCsY12uxlcsswwrlN67j5O4fiQCjoX0",
  authDomain: "gen-lang-client-0917395120.firebaseapp.com",
  projectId: "gen-lang-client-0917395120",
  storageBucket: "gen-lang-client-0917395120.firebasestorage.app",
  messagingSenderId: "919393741069",
  appId: "1:919393741069:web:317c3adf852ace28cc2844"
};

// Inicializa o App Firebase de forma segura (prevenindo duplicações)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Inicializa o Firestore com Sincronização Offline habilitada para múltiplos abas ou aba única
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export {
  app,
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  increment,
  where,
  runTransaction
};
