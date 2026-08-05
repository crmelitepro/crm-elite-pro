/**
 * GOOGLE FIREBASE CONFIGURATION & INITIALIZATION (RESILIENT LOADER)
 * CRM Elite Pro
 */

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
  const customConfigStr = localStorage.getItem('crm_consorcio_firebase_config');
  if (!customConfigStr) {
    console.log('ℹ️ Firebase não configurado. Modo local ativo com 100% de funcionalidade.');
    return;
  }

  try {
    const activeConfig = JSON.parse(customConfigStr);

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
  } catch (error) {
    console.warn('⚠️ Não foi possível conectar ao Firebase com as chaves fornecidas.', error);
  }
}

initFirebaseSDK();
