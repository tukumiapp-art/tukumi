import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your exact configuration from the console
const firebaseConfig = {
  apiKey: "AIzaSyCeBLEh6xtwDtnMWrj8N3As7tcJ_ZX8Yis",
  authDomain: "tukumi-7d3b8.firebaseapp.com",
  projectId: "tukumi-7d3b8",
  storageBucket: "tukumi-7d3b8.firebasestorage.app",
  messagingSenderId: "1040756277051",
  appId: "1:1040756277051:web:8d4604e5bbe7f35edc411e",
  measurementId: "G-WY8V9GB1RW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;