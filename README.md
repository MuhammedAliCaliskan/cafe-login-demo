# Cafe Login Demo (Manager / Barista)

> 🇹🇷 Türkçe açıklama aşağıdadır  
> 🇬🇧 English description is below

---

## 🇹🇷 Türkçe

Kafe operasyonlarını yönetmek için geliştirilmiş bir **mobil demo uygulaması**.  
Yöneticiler ve baristalar için ayrı kullanıcı akışları içerir.

### 🎯 Amaç
Gerçek hayattaki bir kafe / mağaza operasyonunda:
- Shift planlama
- Çalışan yönetimi
- Onay & talep süreçleri  

gibi operasyonların mobil uygulama üzerinden nasıl yönetilebileceğini göstermek.

### 🚀 Özellikler
- Yönetici & Barista girişi (demo şifre)
- Yönetici:
  - Barista ekleme / silme / transfer
  - Haftalık manuel shift planlama
  - Shift isteklerini onaylama / reddetme
- Barista:
  - Kendi shiftlerini görüntüleme
  - Shift isteği oluşturma
- Bekleyen & geçmiş shift istekleri
- Duyurular (tüm kullanıcılar görür)
- Bildirim sistemi (uygulama içi)
- Excel ile shift içe aktarma (sabit şablon)

### 🧑‍💻 Kullanılan Teknolojiler
- React Native (Expo)
- Firebase Firestore

### ▶️ Kurulum
```bash
npm install
npx expo start
🔑 Demo Kullanıcılar
Yönetici sicilleri: 1001, 1002, 1003, 1004, 1005, 1006

Şifre: 1234

🛣️ Geliştirme Planı
Otomatik giriş (Beni Hatırla)

Yönetici için şifre yönetimi

Shift öncesi bildirimler

Eğitim & duyuru merkezi

🇬🇧 English
A mobile cafe operations demo application designed to simulate real-world workflows between managers and baristas.

🎯 Purpose
To demonstrate how daily cafe/store operations such as:

Shift scheduling

Staff management

Approval & request workflows

can be handled through a mobile application.

🚀 Features
Manager & Barista login (demo password)

Manager:

Add / remove / transfer baristas

Weekly manual shift planning

Approve / reject shift requests

Barista:

View assigned shifts

Create shift requests

Pending & history shift requests

Global announcements

In-app notification system

Excel-based shift import (template driven)

🧑‍💻 Tech Stack
React Native (Expo)

Firebase Firestore

▶️ Getting Started
bash
Kodu kopyala
npm install
npx expo start
🔑 Demo Users
Manager IDs: 1001, 1002, 1003, 1004, 1005, 1006

Password: 1234

🛣️ Roadmap
Remember me (auto login)

Password management for managers

Pre-shift notifications

Training & announcement center
