import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDdCOos3jN44IsWI8SnmLjrX2e0MtW7Qmw",
  authDomain: "cafe-calisan-uygulamasi.firebaseapp.com",
  projectId: "cafe-calisan-uygulamasi",
  storageBucket: "cafe-calisan-uygulamasi.firebasestorage.app",
  messagingSenderId: "830884666362",
  appId: "1:830884666362:web:7636b1094f6de9c549a243",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seed() {
  // MANAGER 1
  await setDoc(doc(db, 'managers', '1001'), {
    ad: 'Yenal',
    soyad: 'Yazıcıoğlu',
    sicil: '1001',
    rol: 'manager',
  });

  // MANAGER 2
  await setDoc(doc(db, 'managers', '1002'), {
    ad: 'Deniz',
    soyad: 'Demir',
    sicil: '1002',
    rol: 'manager',
  });

  // BARISTALAR
  await setDoc(doc(db, 'baristas', '2001'), {
    ad: 'Ahmet',
    soyad: 'Yılmaz',
    sicil: '2001',
    managerSicil: '1001',
  });

  await setDoc(doc(db, 'baristas', '2002'), {
    ad: 'Ayşe',
    soyad: 'Kaya',
    sicil: '2002',
    managerSicil: '1002',
  });

  console.log('✅ Seed işlemi tamamlandı');
}

seed();
