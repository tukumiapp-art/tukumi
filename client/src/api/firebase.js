import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence 
} from "firebase/auth";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions"; // Added for PaymentModal

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCeBLEh6xtwDtnMWrj8N3As7tcJ_ZX8Yis",
  authDomain: "tukumi-7d3b8.firebaseapp.com",
  projectId: "tukumi-7d3b8",
  storageBucket: "tukumi-7d3b8.firebasestorage.app",
  messagingSenderId: "1040756277051",
  appId: "1:1040756277051:web:8d4604e5bbe7f35edc411e",
  measurementId: "G-WY8V9GB1RW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Modern Offline Cache (Facebook Style)
// Fixes "enableIndexedDbPersistence" deprecation warning
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

const storage = getStorage(app);
const functions = getFunctions(app); // Export this to fix the crash

// Keep user logged in even after refresh
setPersistence(auth, browserLocalPersistence).catch(console.error);

export { auth, db, storage, functions };