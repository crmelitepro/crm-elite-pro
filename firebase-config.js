/**
 * GOOGLE FIREBASE CONFIGURATION & INITIALIZATION (RESILIENT LOADER)
 * CRM Elite Pro - Ademicon
 */

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBcgFutHppFd054YQRp3JBGzDGnQazkFuk",
  authDomain: "crm-elite-pro.firebaseapp.com",
  projectId: "crm-elite-pro",
  storageBucket: "crm-elite-pro.firebasestorage.app",
  messagingSenderId: "708118778115",
  appId: "1:708118778115:web:d648e93c79dc68e15b1936",
  measurementId: "G-R9ZKESBCPQ"
};

window.FirebaseService = {
  app: null,
  auth: null,
  db: null,
  isFirebaseConfigured: false,
  googleProvider: null,
  onAuthStateChanged: null,
  signInWithEmailAndPassword: null,
  createUserWithEmailAndPassword: null,
  signOut: null,
  signInWithPopup: null,
  collection: null,
  doc: null,
  getDocs: null,
  getDoc: null,
  setDoc: null,
  addDoc: null,
  updateDoc: null,
  deleteDoc: null,
  onSnapshot: null,
  saveCustomConfig: (newConfig) => {
    localStorage.setItem('crm_consorcio_firebase_config', JSON.stringify(newConfig));
    location.reload();
  }
};

async function initFirebaseSDK() {
  let activeConfig = DEFAULT_FIREBASE_CONFIG;
  
  const customConfigStr = localStorage.getItem('crm_consorcio_firebase_config');
  if (customConfigStr) {
    try {
      const parsed = JSON.parse(customConfigStr);
      if (parsed && parsed.apiKey && parsed.projectId) {
        activeConfig = parsed;
      }
    } catch (e) {
      console.warn('Erro ao ler chaves personalizadas. Usando padrão.');
    }
  }

  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { 
      getAuth, 
      onAuthStateChanged, 
      signInWithEmailAndPassword, 
      createUserWithEmailAndPassword, 
      signOut, 
      GoogleAuthProvider, 
      signInWithPopup 
    } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const { 
      getFirestore, 
      collection, 
      doc, 
      getDocs, 
      getDoc, 
      setDoc, 
      addDoc, 
      updateDoc, 
      deleteDoc, 
      onSnapshot 
    } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    const app = initializeApp(activeConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    Object.assign(window.FirebaseService, {
      app,
      auth,
      db,
      isFirebaseConfigured: true,
      googleProvider: new GoogleAuthProvider(),
      onAuthStateChanged,
      signInWithEmailAndPassword,
      createUserWithEmailAndPassword,
      signOut,
      signInWithPopup,
      collection,
      doc,
      getDocs,
      getDoc,
      setDoc,
      addDoc,
      updateDoc,
      deleteDoc,
      onSnapshot
    });

    console.log('⚡ Firebase conectado com sucesso!');
    if (typeof window.setupFirebaseAuthListener === 'function') {
      window.setupFirebaseAuthListener();
    }
    return window.FirebaseService;
  } catch (error) {
    console.warn('⚠️ Não foi possível conectar ao Firebase com as chaves fornecidas.', error);
    return null;
  }
}

window.firebaseInitPromise = initFirebaseSDK();

window.ensureFirebaseReady = async function() {
  if (window.firebaseInitPromise) {
    await window.firebaseInitPromise;
  }
  return window.FirebaseService;
};
