// App.js (TEK PARÇA)
// Paketler:
// npx expo install expo-document-picker expo-file-system expo-notifications
// npm i xlsx
// npx expo install @react-native-async-storage/async-storage

import 'react-native-get-random-values';
import 'react-native-gesture-handler';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
  Modal,
  ScrollView,
  Switch,
  Linking,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';

import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import { db } from './firebase';
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  where,
  setDoc,
  getDoc,
} from 'firebase/firestore';

const Stack = createStackNavigator();

/* ---------------- LOCAL FALLBACK DATA ---------------- */

const fallbackManagers = {
  '1001': {
    sicil: '1001',
    ad: 'Yenal',
    baristas: [
      { sicil: '2001', ad: 'Ahmet', soyad: 'Yılmaz' },
      { sicil: '2002', ad: 'Mehmet', soyad: 'Kaya' },
      { sicil: '2003', ad: 'Ayşe', soyad: 'Demir' },
      { sicil: '2004', ad: 'Elif', soyad: 'Çelik' },
      { sicil: '2005', ad: 'Can', soyad: 'Aydın' },
    ],
  },
  '1002': {
    sicil: '1002',
    ad: 'Deniz',
    baristas: [
      { sicil: '3001', ad: 'Burak', soyad: 'Arslan' },
      { sicil: '3002', ad: 'Zeynep', soyad: 'Koç' },
      { sicil: '3003', ad: 'Mert', soyad: 'Şahin' },
      { sicil: '3004', ad: 'Seda', soyad: 'Öztürk' },
      { sicil: '3005', ad: 'Emre', soyad: 'Kılıç' },
    ],
  },

  // Yeni yöneticiler (4 adet)
  '1003': { sicil: '1003', ad: 'Selin', baristas: [] },
  '1004': { sicil: '1004', ad: 'Kaan', baristas: [] },
  '1005': { sicil: '1005', ad: 'Ece', baristas: [] },
  '1006': { sicil: '1006', ad: 'Ozan', baristas: [] },
};

const fallbackAnnouncements = [
  '☕ Yeni kahve çekirdeği geldi',
  '📢 Haftalık temizlik planı güncellendi',
  '⏰ Shift saatlerine dikkat edelim',
  '⭐ Misafir memnuniyeti anketi başladı',
];

const fallbackTrainingLinks = [
  { title: '☕ Espresso Kalibrasyonu', url: 'https://www.starbucks.com' },
  { title: '🥛 Süt Köpürtme Teknikleri', url: 'https://www.starbucks.com' },
  { title: '🧾 POS Kısa Rehber', url: 'https://www.starbucks.com' },
];

/* ---------------- STORAGE KEYS ---------------- */

const STORAGE_REMEMBER = 'remember_me';
const STORAGE_SESSION = 'session_v1';

/* ---------------- HELPERS ---------------- */

function normalizeFirestoreManagers(docs) {
  const result = {};
  docs.forEach((d) => {
    const data = d.data();
    const key = (data.sicil || d.id || '').toString();
    if (!key) return;

    const baristasArray =
      Array.isArray(data.baristas) ? data.baristas :
      Array.isArray(data.baristalar) ? data.baristalar :
      Array.isArray(data.BARISTAS) ? data.BARISTAS :
      Array.isArray(data.BARISTALAR) ? data.BARISTALAR :
      [];

    result[key] = {
      sicil: key,
      ad: data.ad ?? data.AD ?? data.Ad ?? 'Yönetici',
      baristas: baristasArray.map((b) => ({
        sicil: (b.sicil ?? b.SICIL ?? '').toString(),
        ad: b.ad ?? b.AD ?? b.Ad ?? 'Ad',
        soyad: b.soyad ?? b.SOYAD ?? b.Soyad ?? '',
      })),
    };
  });
  return result;
}

function pad2(n) {
  return n.toString().padStart(2, '0');
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
function makeTimeOptions(stepMinutes = 30) {
  const arr = [];
  for (let h = 6; h <= 23; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      arr.push(`${pad2(h)}:${pad2(m)}`);
    }
  }
  arr.push('00:00');
  return arr;
}
const TIME_OPTIONS = makeTimeOptions(30);

function fullName(person) {
  if (!person) return '';
  return `${person.ad || ''} ${person.soyad || ''}`.trim();
}

function parseTimeToDate(dateISO, hhmm) {
  // dateISO: YYYY-MM-DD, hhmm: HH:mm
  const [y, mo, da] = dateISO.split('-').map((x) => parseInt(x, 10));
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  const dt = new Date(y, mo - 1, da, h, m, 0, 0);
  return dt;
}

/* ---------------- AUTH (demo) ----------------
   Şifreleri Firestore’da tutuyoruz:
   collection: auth
   docId: sicil
   fields: { password: "1234", role: "manager"|"barista", managerKey: "1001" }
------------------------------------------------ */

async function ensureAuthDocIfMissing({ sicil, role, managerKey }) {
  try {
    const ref = doc(db, 'auth', String(sicil));
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        password: '1234',
        role,
        managerKey: managerKey || null,
        createdAt: serverTimestamp(),
      });
    }
  } catch {}
}

async function getPasswordForSicil(sicil) {
  try {
    const snap = await getDoc(doc(db, 'auth', String(sicil)));
    if (!snap.exists()) return null;
    return snap.data()?.password ?? null;
  } catch {
    return null;
  }
}

async function setPasswordForSicil(sicil, newPassword) {
  await setDoc(
    doc(db, 'auth', String(sicil)),
    { password: String(newPassword) },
    { merge: true }
  );
}

/* ---------------- NOTIFICATIONS (Firestore in-app) ---------------- */

async function createNotification({ managerKey, toSicil, title, body }) {
  try {
    await addDoc(collection(db, 'managers', managerKey, 'notifications'), {
      toSicil: String(toSicil),
      title: String(title || 'Bildirim'),
      body: String(body || ''),
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch {}
}

/* ---------------- LOCAL NOTIFICATION (30 dk kala) ---------------- */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureNotificationPermissions() {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      return req.status === 'granted';
    }
    return true;
  } catch {
    return false;
  }
}

async function scheduleShiftReminder({ title, body, triggerDate }) {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: triggerDate,
    });
  } catch {
    return null;
  }
}

/* ---------------- UI HELPERS ---------------- */

function Segmented({ left, right, active, onLeft, onRight }) {
  return (
    <View style={styles.segmentWrap}>
      <TouchableOpacity
        style={[styles.segmentBtn, active === 'left' && styles.segmentBtnActive]}
        onPress={onLeft}
        activeOpacity={0.85}
      >
        <Text style={[styles.segmentText, active === 'left' && styles.segmentTextActive]}>
          {left}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.segmentBtn, active === 'right' && styles.segmentBtnActive]}
        onPress={onRight}
        activeOpacity={0.85}
      >
        <Text style={[styles.segmentText, active === 'right' && styles.segmentTextActive]}>
          {right}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ---------------- SCREENS ---------------- */

function LoginScreen({ navigation, managers, onLoginSuccess }) {
  const [sicil, setSicil] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_REMEMBER);
      if (saved !== null) setRemember(saved === '1');
    })();
  }, []);

  const handleLogin = async () => {
    const s = String(sicil || '').trim();
    if (!s) {
      Alert.alert('Hata', 'Sicil boş olamaz.');
      return;
    }

    // role tespiti
    let role = null;
    let managerKey = null;
    let baristaObj = null;

    if (managers[s]) {
      role = 'manager';
      managerKey = s;
      await ensureAuthDocIfMissing({ sicil: s, role: 'manager', managerKey: s });
    } else {
      for (const [mk, mgr] of Object.entries(managers)) {
        const found = (mgr.baristas || []).find((b) => String(b.sicil) === s);
        if (found) {
          role = 'barista';
          managerKey = mk;
          baristaObj = found;
          await ensureAuthDocIfMissing({ sicil: s, role: 'barista', managerKey: mk });
          break;
        }
      }
    }

    if (!role) {
      Alert.alert('Hata', 'Kullanıcı bulunamadı');
      return;
    }

    // Firestore şifre kontrol (yoksa 1234)
    const storedPass = (await getPasswordForSicil(s)) ?? '1234';
    if (String(password) !== String(storedPass)) {
      Alert.alert('Hata', 'Şifre yanlış');
      return;
    }

    // remember me kaydet
    await AsyncStorage.setItem(STORAGE_REMEMBER, remember ? '1' : '0');
    if (remember) {
      await AsyncStorage.setItem(
        STORAGE_SESSION,
        JSON.stringify({ sicil: s, role, managerKey })
      );
    } else {
      await AsyncStorage.removeItem(STORAGE_SESSION);
    }

    onLoginSuccess?.();

    if (role === 'manager') {
      navigation.replace('Manager', { managerKey: s });
    } else {
      navigation.replace('Barista', { barista: baristaObj, managerKey });
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.loginContainer}>
        <Text style={styles.title}>Kafe Çalışan Girişi</Text>

        <TextInput
          placeholder="Sicil Numarası"
          value={sicil}
          onChangeText={setSicil}
          style={styles.input}
          keyboardType="numeric"
        />

        <TextInput
          placeholder="Şifre"
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
        />

        <View style={styles.rememberRow}>
          <Text style={{ fontWeight: '800' }}>Beni hatırla</Text>
          <Switch value={remember} onValueChange={setRemember} />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleLogin} activeOpacity={0.85}>
          <Text style={styles.buttonText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- MANAGER HOME ---------------- */

function ManagerScreen({ route, navigation, managers }) {
  const { managerKey } = route.params;
  const manager = managers[managerKey];

  if (!manager) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.screen}>
          <Text style={styles.title}>Yönetici bulunamadı</Text>
          <TouchableOpacity style={styles.logout} onPress={() => navigation.replace('Login')}>
            <Text style={styles.logoutText}>Login’e Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const logout = async () => {
    await AsyncStorage.removeItem(STORAGE_SESSION);
    navigation.replace('Login');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <Text style={styles.managerName}>👔 {manager.ad} (Yönetici)</Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Announcements')}
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>📢 Duyurular</Text>
          <Text style={styles.cardHint}>Merkez duyuruları</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Training')}
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>🎓 Eğitim Merkezi</Text>
          <Text style={styles.cardHint}>Videolar / linkler</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Notifications', { managerKey, sicil: managerKey })}
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>🔔 Bildirimler</Text>
          <Text style={styles.cardHint}>İşlem geçmişi / sistem mesajları</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('BaristaList', { managerKey })}
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>👥 Barista Listesi</Text>
          <Text style={styles.cardHint}>Sil / transfer / ekle</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Shift', { managerKey })}
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>🗓 Shift Atama</Text>
          <Text style={styles.cardHint}>Haftalık takvim • Manuel • Excel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() =>
            navigation.navigate('ShiftRequests', {
              role: 'manager',
              managerKey,
              sicil: managerKey,
            })
          }
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>📩 Shift İstekleri</Text>
          <Text style={styles.cardHint}>Bekleyen / Geçmiş</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('PasswordManagement', { managerKey })}
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>🔑 Şifre Yönetimi</Text>
          <Text style={styles.cardHint}>Barista şifrelerini gör/değiştir</Text>
        </TouchableOpacity>

        <View style={styles.logoutWrapper}>
          <TouchableOpacity style={styles.logout} onPress={logout} activeOpacity={0.85}>
            <Text style={styles.logoutText}>Çıkış Yap</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- BARISTA HOME ---------------- */

function BaristaScreen({ route, navigation }) {
  const { barista, managerKey } = route.params;

  const logout = async () => {
    await AsyncStorage.removeItem(STORAGE_SESSION);
    navigation.replace('Login');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <Text style={styles.managerName}>☕ {fullName(barista)}</Text>
        <Text style={{ textAlign: 'center', color: '#666', marginBottom: 10 }}>
          Sicil: {barista.sicil}
        </Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('MyShifts', { managerKey, sicil: barista.sicil })}
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>🗓 Shiftlerim</Text>
          <Text style={styles.cardHint}>Günlük kendi shiftin + Haftalık tüm ekip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Announcements')}
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>📢 Duyurular</Text>
          <Text style={styles.cardHint}>Merkez duyuruları</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Training')}
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>🎓 Eğitim Merkezi</Text>
          <Text style={styles.cardHint}>Videolar / linkler</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Notifications', { managerKey, sicil: barista.sicil })}
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>🔔 Bildirimler</Text>
          <Text style={styles.cardHint}>Onay / red mesajları</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() =>
            navigation.navigate('ShiftRequests', {
              role: 'barista',
              managerKey,
              sicil: barista.sicil,
              barista,
            })
          }
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>📩 Shift İsteklerim</Text>
          <Text style={styles.cardHint}>Bekleyen / Geçmiş</Text>
        </TouchableOpacity>

        <View style={styles.logoutWrapper}>
          <TouchableOpacity style={styles.logout} onPress={logout} activeOpacity={0.85}>
            <Text style={styles.logoutText}>Çıkış Yap</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- TRAINING (Herkes) ---------------- */

function TrainingScreen({ navigation }) {
  const [items, setItems] = useState(fallbackTrainingLinks);

  useEffect(() => {
    try {
      const qy = query(collection(db, 'training'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(
        qy,
        (snap) => {
          const arr = snap.docs
            .map((d) => d.data())
            .filter((x) => x?.active !== false)
            .map((x) => ({ title: x.title, url: x.url }))
            .filter((x) => x.title && x.url);

          setItems(arr.length > 0 ? arr : fallbackTrainingLinks);
        },
        () => setItems(fallbackTrainingLinks)
      );
      return () => unsub();
    } catch {
      setItems(fallbackTrainingLinks);
    }
  }, []);

  const open = async (url) => {
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) return Alert.alert('Hata', 'Link açılamıyor.');
      Linking.openURL(url);
    } catch {
      Alert.alert('Hata', 'Link açılamadı.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.listTitle}>🎓 Eğitim Merkezi</Text>
          <View style={{ width: 24 }} />
        </View>

        <FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.trainingCard}
              onPress={() => open(item.url)}
              activeOpacity={0.85}
            >
              <Text style={{ fontWeight: '900' }}>{item.title}</Text>
              <Text style={{ marginTop: 6, color: '#006241', fontWeight: '800' }}>
                Linki Aç
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

/* ---------------- MY SHIFTS (Barista) + 30dk bildirim ---------------- */

function MyShiftsScreen({ route, navigation }) {
  const { managerKey, sicil } = route.params;

  const [weekDays, setWeekDays] = useState([]);
  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()));
  const [shifts, setShifts] = useState([]);

  const scheduledIdsRef = useRef([]);

  useEffect(() => {
    const base = startOfWeek(new Date());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      days.push({ iso: toISODate(d), label: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}` });
    }
    setWeekDays(days);
    setSelectedDate((prev) => (days.some((x) => x.iso === prev) ? prev : days[0].iso));
  }, []);

  useEffect(() => {
    try {
      const colRef = collection(db, 'managers', managerKey, 'shifts');
      const unsub = onSnapshot(
        colRef,
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setShifts(arr);
        },
        () => setShifts([])
      );
      return () => unsub();
    } catch {
      setShifts([]);
    }
  }, [managerKey]);

  // 30 dk kala local bildirim kur
  useEffect(() => {
    (async () => {
      // eski planları temizle
      try {
        for (const id of scheduledIdsRef.current) {
          await Notifications.cancelScheduledNotificationAsync(id);
        }
      } catch {}
      scheduledIdsRef.current = [];

      const granted = await ensureNotificationPermissions();
      if (!granted) return;

      const todayISO = toISODate(new Date());
      const myToday = shifts.filter(
        (s) => s.date === todayISO && String(s.baristaSicil) === String(sicil)
      );

      for (const s of myToday) {
        const startDt = parseTimeToDate(todayISO, String(s.start || '00:00'));
        const triggerDt = new Date(startDt.getTime() - 30 * 60 * 1000);
        if (triggerDt.getTime() <= Date.now()) continue;

        const nid = await scheduleShiftReminder({
          title: '⏰ Shift Yaklaşıyor',
          body: `${s.start} - ${s.end} (${s.role || 'Barista'}) 30 dk kaldı`,
          triggerDate: triggerDt,
        });

        if (nid) scheduledIdsRef.current.push(nid);
      }
    })();
  }, [shifts, sicil]);

  const todayMyShifts = useMemo(() => {
    return shifts
      .filter((s) => s.date === selectedDate && String(s.baristaSicil) === String(sicil))
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }, [shifts, selectedDate, sicil]);

  const todayAllShifts = useMemo(() => {
    return shifts
      .filter((s) => s.date === selectedDate)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }, [shifts, selectedDate]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.listTitle}>🗓 Shiftler</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.weekRow}>
          {weekDays.map((d) => {
            const active = selectedDate === d.iso;
            return (
              <TouchableOpacity
                key={d.iso}
                onPress={() => setSelectedDate(d.iso)}
                style={[styles.dayChip, active && styles.dayChipActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>✅ Bugünkü Shiftim</Text>
        <FlatList
          data={todayMyShifts}
          keyExtractor={(x) => x.id}
          ListEmptyComponent={<Text style={styles.mutedCenter}>Bugün için sana atanmış shift yok.</Text>}
          renderItem={({ item }) => (
            <View style={styles.shiftCard}>
              <Text style={{ fontWeight: '900' }}>
                {item.start} – {item.end}
              </Text>
              <Text style={{ marginTop: 6, color: '#444' }}>
                {item.role || 'Barista'} • {item.status || 'draft'}
              </Text>
              {!!item.note && <Text style={{ marginTop: 6, color: '#444' }}>📝 {item.note}</Text>}
            </View>
          )}
        />

        <Text style={[styles.sectionTitle, { marginTop: 10 }]}>👥 Bugün (Tüm Ekip)</Text>
        <FlatList
          data={todayAllShifts}
          keyExtractor={(x) => x.id}
          ListEmptyComponent={<Text style={styles.mutedCenter}>Bu gün için shift yok.</Text>}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={styles.shiftCard}>
              <Text style={{ fontWeight: '900' }}>
                {item.start} – {item.end} • {item.baristaName || item.baristaSicil}
              </Text>
              <Text style={{ marginTop: 6, color: '#444' }}>
                {item.role || 'Barista'} • {item.status || 'draft'}
              </Text>
              {!!item.note && <Text style={{ marginTop: 6, color: '#444' }}>📝 {item.note}</Text>}
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

/* ---------------- BARISTA LIST (Manager) ---------------- */

function BaristaListScreen({ route, navigation, managers, setManagers }) {
  const { managerKey } = route.params;
  const manager = managers[managerKey];

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedBarista, setSelectedBarista] = useState(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newSicil, setNewSicil] = useState('');
  const [newAd, setNewAd] = useState('');
  const [newSoyad, setNewSoyad] = useState('');

  const otherManagers = useMemo(() => {
    return Object.keys(managers)
      .filter((k) => k !== managerKey)
      .map((k) => ({ key: k, ad: managers[k]?.ad || 'Yönetici' }));
  }, [managers, managerKey]);

  if (!manager) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.screen}>
          <Text style={styles.title}>Liste yüklenemedi</Text>
        </View>
      </SafeAreaView>
    );
  }

  const openAddModal = () => {
    setNewSicil('');
    setNewAd('');
    setNewSoyad('');
    setAddModalOpen(true);
  };

  const addBarista = async () => {
    const sicil = newSicil.trim();
    const ad = newAd.trim();
    const soyad = newSoyad.trim();

    if (!sicil || !ad) {
      Alert.alert('Hata', 'Sicil ve ad zorunludur.');
      return;
    }

    const existing = new Set(
      Object.values(managers).flatMap((m) => (m.baristas || []).map((b) => String(b.sicil)))
    );
    if (existing.has(String(sicil))) {
      Alert.alert('Hata', 'Bu sicil zaten kullanılıyor.');
      return;
    }

    const newBaristaObj = { sicil: String(sicil), ad, soyad };

    setManagers((prev) => {
      const copy = { ...prev };
      copy[managerKey] = { ...copy[managerKey] };
      copy[managerKey].baristas = [...(copy[managerKey].baristas || []), newBaristaObj];
      return copy;
    });

    // auth doc (default password 1234)
    await ensureAuthDocIfMissing({ sicil: String(sicil), role: 'barista', managerKey });

    setAddModalOpen(false);
  };

  const removeBarista = (sicil) => {
    Alert.alert('Emin misiniz?', 'Bu partneri silmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          setManagers((prev) => {
            const copy = { ...prev };
            copy[managerKey] = { ...copy[managerKey] };
            copy[managerKey].baristas = (copy[managerKey].baristas || []).filter(
              (b) => String(b.sicil) !== String(sicil)
            );
            return copy;
          });
        },
      },
    ]);
  };

  const openTransfer = (barista) => {
    if (!otherManagers.length) {
      Alert.alert('Hata', 'Transfer edilecek başka yönetici yok.');
      return;
    }
    setSelectedBarista(barista);
    setTransferModalOpen(true);
  };

  const doTransfer = (targetManagerKey) => {
    if (!selectedBarista) return;

    setManagers((prev) => {
      const copy = { ...prev };

      copy[managerKey] = { ...copy[managerKey] };
      copy[managerKey].baristas = (copy[managerKey].baristas || []).filter(
        (b) => String(b.sicil) !== String(selectedBarista.sicil)
      );

      copy[targetManagerKey] = { ...copy[targetManagerKey] };
      copy[targetManagerKey].baristas = [
        ...(copy[targetManagerKey].baristas || []),
        selectedBarista,
      ];

      return copy;
    });

    setTransferModalOpen(false);
    setSelectedBarista(null);
    Alert.alert('Tamam', 'Transfer işlemi tamamlandı.');
  };

  const confirmTransfer = (m) => {
    Alert.alert(
      'Transfer Onayı',
      `${selectedBarista?.ad} ${selectedBarista?.soyad} (${selectedBarista?.sicil})\n\n` +
        `Şu yöneticiden:\n👔 ${manager?.ad} • ${managerKey}\n\n` +
        `Şu yöneticiye transfer edilsin mi?\n👔 ${m.ad} • ${m.key}`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Evet, Transfer Et', style: 'destructive', onPress: () => doTransfer(m.key) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>

          <Text style={styles.listTitle}>👥 {manager.ad} Baristaları</Text>
          <View style={{ width: 24 }} />
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={openAddModal} activeOpacity={0.85}>
          <Text style={styles.buttonText}>➕ Barista Ekle</Text>
        </TouchableOpacity>

        <FlatList
          data={manager.baristas || []}
          keyExtractor={(item) => String(item.sicil)}
          ListEmptyComponent={<Text style={styles.mutedCenter}>Bu yöneticiye bağlı barista yok.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.sicil}>{item.sicil}</Text>

              <Text style={styles.name}>
                {item.ad} {item.soyad}
              </Text>

              <TouchableOpacity onPress={() => removeBarista(item.sicil)} activeOpacity={0.7}>
                <Text style={styles.action}>Sil</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => openTransfer(item)} activeOpacity={0.7}>
                <Text style={styles.action}>Transfer</Text>
              </TouchableOpacity>
            </View>
          )}
        />

        <Modal visible={transferModalOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Transfer Et</Text>

              {!!selectedBarista && (
                <Text style={styles.modalHint}>
                  {selectedBarista.sicil} • {selectedBarista.ad} {selectedBarista.soyad}
                </Text>
              )}

              <Text style={styles.modalLabel}>Hangi yöneticiye transfer edilsin?</Text>

              <ScrollView style={styles.pickerList} contentContainerStyle={{ paddingBottom: 8 }}>
                {otherManagers.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    onPress={() => confirmTransfer(m)}
                    style={styles.pickRow}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickText}>👔 {m.ad} • {m.key}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 12 }]}
                onPress={() => {
                  setTransferModalOpen(false);
                  setSelectedBarista(null);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modalGhostText}>Vazgeç</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={addModalOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Barista Ekle</Text>

              <Text style={styles.modalLabel}>Sicil</Text>
              <TextInput
                value={newSicil}
                onChangeText={setNewSicil}
                style={styles.input}
                keyboardType="numeric"
                placeholder="Örn: 2457"
              />

              <Text style={styles.modalLabel}>Ad</Text>
              <TextInput value={newAd} onChangeText={setNewAd} style={styles.input} placeholder="Örn: Ali" />

              <Text style={styles.modalLabel}>Soyad</Text>
              <TextInput value={newSoyad} onChangeText={setNewSoyad} style={styles.input} placeholder="Örn: Yılmaz" />

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={() => setAddModalOpen(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalGhostText}>Vazgeç</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={addBarista}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalPrimaryText}>Ekle</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- ANNOUNCEMENTS (Herkes) ---------------- */

function AnnouncementsScreen({ navigation }) {
  const [items, setItems] = useState(fallbackAnnouncements);

  useEffect(() => {
    try {
      const qy = query(collection(db, 'announcements'));
      const unsub = onSnapshot(
        qy,
        (snap) => {
          const arr = snap.docs
            .map((d) => d.data())
            .filter((x) => x?.active !== false)
            .map((x) => x.text)
            .filter(Boolean);

          setItems(arr.length > 0 ? arr : fallbackAnnouncements);
        },
        () => setItems(fallbackAnnouncements)
      );
      return () => unsub();
    } catch {
      setItems(fallbackAnnouncements);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.listTitle}>📢 Duyurular</Text>
          <View style={{ width: 24 }} />
        </View>

        <FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <View style={styles.announceCard}>
              <Text style={{ fontWeight: '800' }}>• {item}</Text>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

/* ---------------- NOTIFICATIONS ---------------- */

function NotificationsScreen({ route, navigation }) {
  const { managerKey, sicil } = route.params;
  const [items, setItems] = useState([]);

  useEffect(() => {
    try {
      const colRef = collection(db, 'managers', managerKey, 'notifications');
      const qy = query(colRef, where('toSicil', '==', String(sicil)), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(
        qy,
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setItems(arr);
        },
        () => setItems([])
      );
      return () => unsub();
    } catch {
      setItems([]);
    }
  }, [managerKey, sicil]);

  const markRead = async (id) => {
    try {
      await updateDoc(doc(db, 'managers', managerKey, 'notifications', id), { read: true });
    } catch {}
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.listTitle}>🔔 Bildirimler</Text>
          <View style={{ width: 24 }} />
        </View>

        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          ListEmptyComponent={<Text style={styles.mutedCenter}>Bildirim yok.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.notifyCard, item.read && { opacity: 0.6 }]}
              activeOpacity={0.85}
              onPress={() => markRead(item.id)}
            >
              <Text style={{ fontWeight: '900' }}>{item.title || 'Bildirim'}</Text>
              <Text style={{ marginTop: 6, color: '#444' }}>{item.body || ''}</Text>
              <Text style={{ marginTop: 8, color: '#006241', fontWeight: '800' }}>
                {item.read ? 'Okundu' : 'Okundu olarak işaretle'}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

/* ---------------- SHIFT (Yönetici) ---------------- */

function ShiftScreen({ route, navigation, managers }) {
  const { managerKey } = route.params;
  const manager = managers[managerKey];

  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()));
  const [weekDays, setWeekDays] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [formBaristaSicil, setFormBaristaSicil] = useState('');
  const [formStart, setFormStart] = useState('08:00');
  const [formEnd, setFormEnd] = useState('16:00');
  const [formRole, setFormRole] = useState('Barista');
  const [formStatus, setFormStatus] = useState('draft');
  const [formNote, setFormNote] = useState('');

  useEffect(() => {
    const base = startOfWeek(new Date());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      days.push({ iso: toISODate(d), label: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}` });
    }
    setWeekDays(days);
    setSelectedDate((prev) => (days.some((x) => x.iso === prev) ? prev : days[0].iso));
  }, []);

  useEffect(() => {
    if (!managerKey) return;
    setLoading(true);

    const colRef = collection(db, 'managers', managerKey, 'shifts');
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setShifts(arr);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [managerKey]);

  const dayShifts = useMemo(() => {
    return shifts
      .filter((s) => s.date === selectedDate)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }, [shifts, selectedDate]);

  const baristaOptions = useMemo(() => {
    return (manager?.baristas || []).map((b) => ({
      sicil: String(b.sicil),
      name: fullName(b) || b.sicil,
    }));
  }, [manager]);

  const openCreate = () => {
    if (!manager) return;
    if ((manager.baristas || []).length === 0) {
      Alert.alert('Hata', 'Önce barista eklemelisin.');
      return;
    }
    setEditingShift(null);
    setFormBaristaSicil(String(manager.baristas[0].sicil));
    setFormStart('08:00');
    setFormEnd('16:00');
    setFormRole('Barista');
    setFormStatus('draft');
    setFormNote('');
    setModalOpen(true);
  };

  const openEdit = (shift) => {
    setEditingShift(shift);
    setFormBaristaSicil(String(shift.baristaSicil || ''));
    setFormStart(String(shift.start || '08:00'));
    setFormEnd(String(shift.end || '16:00'));
    setFormRole(String(shift.role || 'Barista'));
    setFormStatus(String(shift.status || 'draft'));
    setFormNote(String(shift.note || ''));
    setModalOpen(true);
  };

  const validateShift = () => {
    if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      Alert.alert('Hata', 'Tarih formatı bozuk.');
      return false;
    }
    if (!formBaristaSicil) {
      Alert.alert('Hata', 'Barista seçmelisin.');
      return false;
    }
    if (!/^\d{2}:\d{2}$/.test(formStart) || !/^\d{2}:\d{2}$/.test(formEnd)) {
      Alert.alert('Hata', 'Saat formatı HH:mm olmalı.');
      return false;
    }
    return true;
  };

  const saveShift = async () => {
    if (!manager) return;
    if (!validateShift()) return;

    const b = (manager.baristas || []).find((x) => String(x.sicil) === String(formBaristaSicil));
    const baristaName = b ? fullName(b) : '';

    try {
      if (editingShift?.id) {
        await updateDoc(doc(db, 'managers', managerKey, 'shifts', editingShift.id), {
          date: selectedDate,
          start: formStart,
          end: formEnd,
          baristaSicil: String(formBaristaSicil),
          baristaName,
          role: formRole || 'Barista',
          status: formStatus || 'draft',
          note: formNote || '',
        });
      } else {
        await addDoc(collection(db, 'managers', managerKey, 'shifts'), {
          date: selectedDate,
          start: formStart,
          end: formEnd,
          baristaSicil: String(formBaristaSicil),
          baristaName,
          role: formRole || 'Barista',
          status: formStatus || 'draft',
          note: formNote || '',
        });
      }

      await createNotification({
        managerKey,
        toSicil: String(formBaristaSicil),
        title: '🗓 Shift Güncellendi',
        body: `${selectedDate} ${formStart}-${formEnd} shift ataması yapıldı.`,
      });

      setModalOpen(false);
    } catch (e) {
      Alert.alert('Hata', 'Shift kaydedilemedi.');
    }
  };

  const deleteShiftById = async (id) => {
    Alert.alert('Silinsin mi?', 'Bu shifti silmek istiyor musun?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'managers', managerKey, 'shifts', id));
          } catch {
            Alert.alert('Hata', 'Silinemedi.');
          }
        },
      },
    ]);
  };

  const importFromExcel = async () => {
    if (!manager) return;

    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (res.canceled) return;
    const file = res.assets?.[0];
    if (!file?.uri) return;

    try {
      const XLSX = require('xlsx');

      const b64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const wb = XLSX.read(b64, { type: 'base64' });
      const sheet = wb.Sheets['shifts'] || wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const allowed = new Map((manager.baristas || []).map((b) => [String(b.sicil), b]));
      const errors = [];
      const payload = [];

      rows.forEach((r, idx) => {
        const rowNum = idx + 2;

        const date = String(r.date || '').trim();
        const start = String(r.start || '').trim();
        const end = String(r.end || '').trim();
        const baristaSicil = String(r.baristaSicil || '').trim();

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(`Satır ${rowNum}: date YYYY-MM-DD olmalı`);
        if (!start || !/^\d{2}:\d{2}$/.test(start)) errors.push(`Satır ${rowNum}: start HH:mm olmalı`);
        if (!end || !/^\d{2}:\d{2}$/.test(end)) errors.push(`Satır ${rowNum}: end HH:mm olmalı`);
        if (!baristaSicil) errors.push(`Satır ${rowNum}: baristaSicil boş olamaz`);

        const b = allowed.get(baristaSicil);
        if (!b) errors.push(`Satır ${rowNum}: baristaSicil (${baristaSicil}) bu yöneticiye bağlı değil`);

        if (date && start && end && baristaSicil && b) {
          payload.push({
            date,
            start,
            end,
            baristaSicil: String(baristaSicil),
            baristaName: fullName(b),
            role: String(r.role || 'Barista').trim() || 'Barista',
            status: String(r.status || 'draft').trim() || 'draft',
            note: String(r.note || '').trim(),
          });
        }
      });

      if (errors.length > 0) {
        Alert.alert(
          'Excel Hataları',
          errors.slice(0, 8).join('\n') + (errors.length > 8 ? `\n+${errors.length - 8} satır daha…` : '')
        );
        return;
      }

      const colRef = collection(db, 'managers', managerKey, 'shifts');
      for (const p of payload) {
        await addDoc(colRef, p);
        await createNotification({
          managerKey,
          toSicil: String(p.baristaSicil),
          title: '📥 Shift Excel ile Atandı',
          body: `${p.date} ${p.start}-${p.end} shift eklendi.`,
        });
      }

      Alert.alert('Tamam', `${payload.length} shift içe aktarıldı.`);
    } catch {
      Alert.alert('Hata', 'Excel okunamadı.');
    }
  };

  if (!manager) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.screen}>
          <Text style={styles.title}>Yetki yok</Text>
          <TouchableOpacity style={styles.logout} onPress={() => navigation.goBack()}>
            <Text style={styles.logoutText}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.listTitle}>🗓 Shift Atama</Text>
          <TouchableOpacity onPress={importFromExcel} activeOpacity={0.7}>
            <Text style={styles.importIcon}>📥</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.mutedCenter}>👔 {manager.ad} • Haftalık Takvim</Text>

        <View style={styles.weekRow}>
          {weekDays.map((d) => {
            const active = selectedDate === d.iso;
            return (
              <TouchableOpacity
                key={d.iso}
                onPress={() => setSelectedDate(d.iso)}
                style={[styles.dayChip, active && styles.dayChipActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.9}>
          <Text style={styles.buttonText}>➕ Shift Ekle</Text>
        </TouchableOpacity>

        {loading ? (
          <Text style={styles.mutedCenter}>Yükleniyor…</Text>
        ) : (
          <FlatList
            data={dayShifts}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.mutedCenter}>Bu gün için shift yok.</Text>}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => (
              <View style={styles.shiftCard}>
                <Text style={{ fontWeight: '800' }}>
                  {item.baristaName} • {item.baristaSicil}
                </Text>
                <Text style={{ marginTop: 6 }}>
                  {item.start} – {item.end} • {item.role || 'Barista'} • {item.status || 'draft'}
                </Text>
                {!!item.note && <Text style={{ marginTop: 6, color: '#444' }}>📝 {item.note}</Text>}

                <View style={styles.shiftActions}>
                  <TouchableOpacity onPress={() => openEdit(item)} activeOpacity={0.7}>
                    <Text style={styles.shiftActionText}>Düzenle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteShiftById(item.id)} activeOpacity={0.7}>
                    <Text style={styles.shiftActionText}>Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}

        <Modal visible={modalOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editingShift ? 'Shift Düzenle' : 'Shift Ekle'}</Text>

              <Text style={styles.modalLabel}>Tarih</Text>
              <View style={styles.pill}>
                <Text style={{ fontWeight: '800' }}>{selectedDate}</Text>
              </View>

              <Text style={styles.modalLabel}>Barista</Text>
              <ScrollView style={styles.pickerList} contentContainerStyle={{ paddingBottom: 6 }}>
                {baristaOptions.map((b) => {
                  const active = String(formBaristaSicil) === String(b.sicil);
                  return (
                    <TouchableOpacity
                      key={b.sicil}
                      onPress={() => setFormBaristaSicil(String(b.sicil))}
                      style={[styles.pickRow, active && styles.pickRowActive]}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.pickText, active && styles.pickTextActive]}>
                        {b.sicil} • {b.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Başlangıç</Text>
                  <ScrollView style={styles.pickerListSmall}>
                    {TIME_OPTIONS.map((t) => {
                      const active = formStart === t;
                      return (
                        <TouchableOpacity
                          key={`s-${t}`}
                          onPress={() => setFormStart(t)}
                          style={[styles.pickRowSmall, active && styles.pickRowActive]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.pickText, active && styles.pickTextActive]}>{t}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Bitiş</Text>
                  <ScrollView style={styles.pickerListSmall}>
                    {TIME_OPTIONS.map((t) => {
                      const active = formEnd === t;
                      return (
                        <TouchableOpacity
                          key={`e-${t}`}
                          onPress={() => setFormEnd(t)}
                          style={[styles.pickRowSmall, active && styles.pickRowActive]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.pickText, active && styles.pickTextActive]}>{t}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              <Text style={styles.modalLabel}>Rol (opsiyonel)</Text>
              <TextInput value={formRole} onChangeText={setFormRole} style={styles.input} />

              <Text style={styles.modalLabel}>Durum (draft/approved)</Text>
              <TextInput value={formStatus} onChangeText={setFormStatus} style={styles.input} />

              <Text style={styles.modalLabel}>Not (opsiyonel)</Text>
              <TextInput value={formNote} onChangeText={setFormNote} style={styles.input} />

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={() => setModalOpen(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalGhostText}>Vazgeç</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={saveShift}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalPrimaryText}>Kaydet</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalHint}>
                Excel: sheet <Text style={{ fontWeight: '900' }}>shifts</Text> • kolonlar:
                date,start,end,baristaSicil,role,status,note
              </Text>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- SHIFT REQUESTS ---------------- */

function ShiftRequestsScreen({ route, navigation }) {
  const { role, managerKey, sicil, barista } = route.params;

  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('pending');
  const [modalOpen, setModalOpen] = useState(false);

  const [date, setDate] = useState(toISODate(new Date()));
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('16:00');
  const [note, setNote] = useState('');

  useEffect(() => {
    try {
      const colRef = collection(db, 'managers', managerKey, 'shiftRequests');
      const qy = query(colRef, orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(
        qy,
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (role === 'barista') setItems(arr.filter((x) => String(x.baristaSicil) === String(sicil)));
          else setItems(arr);
        },
        () => setItems([])
      );
      return () => unsub();
    } catch {
      setItems([]);
    }
  }, [managerKey, role, sicil]);

  const filtered = useMemo(() => {
    if (tab === 'pending') return items.filter((x) => (x.status || 'pending') === 'pending');
    return items.filter((x) => (x.status || 'pending') !== 'pending');
  }, [items, tab]);

  const createRequest = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Alert.alert('Hata', 'Tarih YYYY-MM-DD olmalı.');
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return Alert.alert('Hata', 'Saat HH:mm olmalı.');

    try {
      await addDoc(collection(db, 'managers', managerKey, 'shiftRequests'), {
        baristaSicil: String(sicil),
        baristaName: barista ? fullName(barista) : String(sicil),
        date,
        start,
        end,
        note: String(note || ''),
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      await createNotification({
        managerKey,
        toSicil: managerKey,
        title: '📩 Yeni Shift İsteği',
        body: `${sicil} için ${date} ${start}-${end} isteği geldi.`,
      });

      setModalOpen(false);
      setNote('');
      setTab('pending');
      Alert.alert('Tamam', 'İstek gönderildi.');
    } catch {
      Alert.alert('Hata', 'İstek gönderilemedi.');
    }
  };

  const approve = async (req) => {
    try {
      await updateDoc(doc(db, 'managers', managerKey, 'shiftRequests', req.id), { status: 'approved' });

      await addDoc(collection(db, 'managers', managerKey, 'shifts'), {
        date: req.date,
        start: req.start,
        end: req.end,
        baristaSicil: String(req.baristaSicil),
        baristaName: String(req.baristaName || ''),
        role: 'Barista',
        status: 'approved',
        note: req.note || '',
        fromRequestId: req.id,
      });

      await createNotification({
        managerKey,
        toSicil: req.baristaSicil,
        title: '✅ Shift İsteğin Onaylandı',
        body: `${req.date} ${req.start}-${req.end} isteğin onaylandı.`,
      });

      setTab('history');
      Alert.alert('Tamam', 'Onaylandı ve shift’e eklendi.');
    } catch {
      Alert.alert('Hata', 'Onaylanamadı.');
    }
  };

  const reject = async (req) => {
    try {
      await updateDoc(doc(db, 'managers', managerKey, 'shiftRequests', req.id), { status: 'rejected' });

      await createNotification({
        managerKey,
        toSicil: req.baristaSicil,
        title: '❌ Shift İsteğin Reddedildi',
        body: `${req.date} ${req.start}-${req.end} isteğin reddedildi.`,
      });

      setTab('history');
      Alert.alert('Tamam', 'Reddedildi.');
    } catch {
      Alert.alert('Hata', 'Reddedilemedi.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.listTitle}>📩 Shift İstekleri</Text>

          {role === 'barista' ? (
            <TouchableOpacity onPress={() => setModalOpen(true)} activeOpacity={0.7}>
              <Text style={styles.importIcon}>➕</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        <Segmented
          left="Bekleyen"
          right="Geçmiş"
          active={tab === 'pending' ? 'left' : 'right'}
          onLeft={() => setTab('pending')}
          onRight={() => setTab('history')}
        />

        <FlatList
          data={filtered}
          keyExtractor={(x) => x.id}
          ListEmptyComponent={
            <Text style={styles.mutedCenter}>
              {tab === 'pending' ? 'Bekleyen istek yok.' : 'Geçmiş istek yok.'}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.requestCard}>
              <Text style={{ fontWeight: '900' }}>
                {item.baristaName || item.baristaSicil} • {item.baristaSicil}
              </Text>
              <Text style={{ marginTop: 6 }}>
                {item.date} • {item.start} – {item.end}
              </Text>
              {!!item.note && <Text style={{ marginTop: 6, color: '#444' }}>📝 {item.note}</Text>}

              <Text style={{ marginTop: 8, fontWeight: '900', color: '#006241' }}>
                Durum: {item.status || 'pending'}
              </Text>

              {role === 'manager' && (item.status === 'pending' || !item.status) && (
                <View style={styles.shiftActions}>
                  <TouchableOpacity onPress={() => approve(item)} activeOpacity={0.7}>
                    <Text style={styles.shiftActionText}>Onayla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => reject(item)} activeOpacity={0.7}>
                    <Text style={styles.shiftActionText}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />

        <Modal visible={modalOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Shift İsteği Oluştur</Text>

              <Text style={styles.modalLabel}>Tarih (YYYY-MM-DD)</Text>
              <TextInput value={date} onChangeText={setDate} style={styles.input} />

              <Text style={styles.modalLabel}>Başlangıç</Text>
              <TextInput value={start} onChangeText={setStart} style={styles.input} />

              <Text style={styles.modalLabel}>Bitiş</Text>
              <TextInput value={end} onChangeText={setEnd} style={styles.input} />

              <Text style={styles.modalLabel}>Not (opsiyonel)</Text>
              <TextInput value={note} onChangeText={setNote} style={styles.input} />

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={() => setModalOpen(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalGhostText}>Vazgeç</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={createRequest}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalPrimaryText}>Gönder</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalHint}>Yönetici onayladığında otomatik shift’e eklenir.</Text>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- PASSWORD MANAGEMENT (Manager) ---------------- */

function PasswordManagementScreen({ route, navigation, managers }) {
  const { managerKey } = route.params;
  const manager = managers[managerKey];

  const [items, setItems] = useState([]); // {sicil, name, password}
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editSicil, setEditSicil] = useState('');
  const [editName, setEditName] = useState('');
  const [newPass, setNewPass] = useState('');

  useEffect(() => {
    (async () => {
      if (!manager) return;
      setLoading(true);
      const arr = [];
      for (const b of manager.baristas || []) {
        const pw = (await getPasswordForSicil(b.sicil)) ?? '1234';
        arr.push({ sicil: String(b.sicil), name: fullName(b) || String(b.sicil), password: pw });
      }
      setItems(arr);
      setLoading(false);
    })();
  }, [managerKey, manager]);

  const openEdit = (row) => {
    setEditSicil(row.sicil);
    setEditName(row.name);
    setNewPass(String(row.password || '1234'));
    setEditOpen(true);
  };

  const save = async () => {
    if (!editSicil) return;
    if (!newPass || String(newPass).length < 3) {
      Alert.alert('Hata', 'Şifre en az 3 karakter olsun.');
      return;
    }
    try {
      await setPasswordForSicil(editSicil, newPass);
      setItems((prev) => prev.map((x) => (x.sicil === editSicil ? { ...x, password: newPass } : x)));

      await createNotification({
        managerKey,
        toSicil: editSicil,
        title: '🔑 Şifren Güncellendi',
        body: 'Yöneticin şifreni güncelledi.',
      });

      setEditOpen(false);
      Alert.alert('Tamam', 'Şifre güncellendi.');
    } catch {
      Alert.alert('Hata', 'Şifre güncellenemedi.');
    }
  };

  if (!manager) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.screen}>
          <Text style={styles.title}>Yetki yok</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.listTitle}>🔑 Şifre Yönetimi</Text>
          <View style={{ width: 24 }} />
        </View>

        {loading ? (
          <Text style={styles.mutedCenter}>Yükleniyor…</Text>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(x) => x.sicil}
            ListEmptyComponent={<Text style={styles.mutedCenter}>Barista yok.</Text>}
            renderItem={({ item }) => (
              <View style={styles.passwordCard}>
                <Text style={{ fontWeight: '900' }}>{item.sicil} • {item.name}</Text>
                <Text style={{ marginTop: 6, color: '#444' }}>Şifre: <Text style={{ fontWeight: '900' }}>{item.password}</Text></Text>

                <TouchableOpacity onPress={() => openEdit(item)} activeOpacity={0.85} style={{ marginTop: 10 }}>
                  <Text style={{ color: '#006241', fontWeight: '900' }}>Değiştir</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}

        <Modal visible={editOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Şifre Değiştir</Text>
              <Text style={styles.modalHint}>{editSicil} • {editName}</Text>

              <Text style={styles.modalLabel}>Yeni Şifre</Text>
              <TextInput value={newPass} onChangeText={setNewPass} style={styles.input} />

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={() => setEditOpen(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalGhostText}>Vazgeç</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={save}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalPrimaryText}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- APP ROOT ---------------- */

export default function App() {
  const [managers, setManagers] = useState(fallbackManagers);
  const [booting, setBooting] = useState(true);
  const navRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadManagers = async () => {
      try {
        const snap = await getDocs(collection(db, 'managers'));
        const fromFs = normalizeFirestoreManagers(snap.docs);

        if (!isMounted) return;

        if (Object.keys(fromFs).length > 0) {
          setManagers((prev) => {
            const merged = { ...prev };
            Object.keys(fromFs).forEach((key) => {
              const prevBaristas = prev[key]?.baristas || [];
              const fsBaristas = fromFs[key]?.baristas || [];
              merged[key] = {
                ...prev[key],
                ...fromFs[key],
                baristas: fsBaristas.length > 0 ? fsBaristas : prevBaristas,
              };
            });
            return merged;
          });
        }
      } catch {}
    };

    const autoLogin = async () => {
      try {
        const remember = await AsyncStorage.getItem(STORAGE_REMEMBER);
        if (remember !== '1') return;

        const sess = await AsyncStorage.getItem(STORAGE_SESSION);
        if (!sess) return;

        const parsed = JSON.parse(sess); // {sicil, role, managerKey}
        if (!parsed?.sicil || !parsed?.role) return;

        // managers yüklendikten sonra yönlendir
        setTimeout(() => {
          if (!navRef.current) return;
          if (parsed.role === 'manager') {
            navRef.current.reset({ index: 0, routes: [{ name: 'Manager', params: { managerKey: parsed.sicil } }] });
          } else {
            // barista objesini fallback/managers içinden bul
            let baristaObj = null;
            const mk = parsed.managerKey;
            const mgr = mk ? managers[mk] : null;
            if (mgr) {
              baristaObj = (mgr.baristas || []).find((b) => String(b.sicil) === String(parsed.sicil)) || null;
            }
            navRef.current.reset({
              index: 0,
              routes: [{ name: 'Barista', params: { barista: baristaObj || { sicil: parsed.sicil, ad: 'Barista', soyad: '' }, managerKey: parsed.managerKey } }],
            });
          }
        }, 200);
      } catch {}
    };

    (async () => {
      await loadManagers();
      await autoLogin();
      if (isMounted) setBooting(false);
    })();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (booting) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.screen, { justifyContent: 'center' }]}>
          <Text style={styles.mutedCenter}>Açılıyor…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login">
          {(props) => (
            <LoginScreen
              {...props}
              managers={managers}
              onLoginSuccess={() => {}}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Manager">
          {(props) => <ManagerScreen {...props} managers={managers} />}
        </Stack.Screen>

        <Stack.Screen name="BaristaList">
          {(props) => <BaristaListScreen {...props} managers={managers} setManagers={setManagers} />}
        </Stack.Screen>

        <Stack.Screen name="Shift">
          {(props) => <ShiftScreen {...props} managers={managers} />}
        </Stack.Screen>

        <Stack.Screen name="ShiftRequests" component={ShiftRequestsScreen} />

        <Stack.Screen name="Announcements" component={AnnouncementsScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Training" component={TrainingScreen} />

        <Stack.Screen name="MyShifts" component={MyShiftsScreen} />

        <Stack.Screen name="PasswordManagement">
          {(props) => <PasswordManagementScreen {...props} managers={managers} />}
        </Stack.Screen>

        <Stack.Screen name="Barista" component={BaristaScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },

  screen: {
    flex: 1,
    padding: 20,
  },

  title: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 18,
  },

  managerName: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 18,
    marginTop: Platform.OS === 'ios' ? 8 : 0,
  },

  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },

  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  button: {
    backgroundColor: '#006241',
    padding: 16,
    borderRadius: 10,
  },

  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '600' },

  card: {
    backgroundColor: '#f2f2f2',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },

  cardTitle: { fontWeight: '700', marginBottom: 6, fontSize: 16 },
  cardHint: { color: '#555' },

  mutedCenter: { textAlign: 'center', marginTop: 12, color: '#666' },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    justifyContent: 'space-between',
  },

  back: {
    fontSize: 28,
    width: 24,
    textAlign: 'left',
  },

  listTitle: {
    fontSize: 18,
    fontWeight: '700',
  },

  addBtn: {
    backgroundColor: '#006241',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
    gap: 10,
  },

  sicil: { width: 70, fontWeight: '700' },
  name: { flex: 1 },

  action: {
    color: '#006241',
    fontWeight: '700',
    paddingHorizontal: 6,
  },

  logoutWrapper: { marginTop: 'auto', paddingBottom: 12 },

  logout: {
    backgroundColor: '#006241',
    padding: 16,
    borderRadius: 10,
  },

  logoutText: { color: '#fff', textAlign: 'center', fontWeight: '600' },

  announceCard: {
    backgroundColor: '#f2f2f2',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },

  notifyCard: {
    backgroundColor: '#f2f2f2',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },

  requestCard: {
    backgroundColor: '#f2f2f2',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },

  trainingCard: {
    backgroundColor: '#f2f2f2',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },

  passwordCard: {
    backgroundColor: '#f2f2f2',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },

  sectionTitle: {
    fontWeight: '900',
    fontSize: 15,
    marginTop: 6,
    marginBottom: 6,
  },

  importIcon: { fontSize: 18, fontWeight: '900', color: '#006241' },

  weekRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },

  dayChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
  },
  dayChipActive: {
    backgroundColor: '#006241',
  },
  dayChipText: { fontWeight: '800', color: '#333' },
  dayChipTextActive: { color: '#fff' },

  shiftCard: {
    backgroundColor: '#f2f2f2',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  shiftActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  shiftActionText: {
    color: '#006241',
    fontWeight: '900',
  },

  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#f2f2f2',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#006241',
  },
  segmentText: { fontWeight: '900', color: '#333' },
  segmentTextActive: { color: '#fff' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    maxHeight: '92%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  modalLabel: {
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 6,
  },
  pill: {
    backgroundColor: '#f2f2f2',
    padding: 12,
    borderRadius: 10,
  },
  pickerList: {
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  pickerListSmall: {
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  pickRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#f7f7f7',
  },
  pickRowSmall: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#f7f7f7',
  },
  pickRowActive: {
    backgroundColor: '#006241',
  },
  pickText: { fontWeight: '800', color: '#333' },
  pickTextActive: { color: '#fff' },

  modalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalBtnGhost: {
    backgroundColor: '#f2f2f2',
  },
  modalBtnPrimary: {
    backgroundColor: '#006241',
  },
  modalGhostText: { fontWeight: '900', color: '#333' },
  modalPrimaryText: { fontWeight: '900', color: '#fff' },

  modalHint: {
    marginTop: 10,
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },
});
