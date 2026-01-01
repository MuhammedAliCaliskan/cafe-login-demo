import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDdCOos3jN44IsWI8SnmLjrX2e0MtW7Qmw",
  authDomain: "cafe-calisan-uygulamasi.firebaseapp.com",
  projectId: "cafe-calisan-uygulamasi",
  storageBucket: "cafe-calisan-uygulamasi.firebasestorage.app",
  messagingSenderId: "830884666362",
  appId: "1:830884666362:web:7636b1094f6de9c549a243",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
