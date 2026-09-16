// ============================================================
// 請把下面的設定值，換成您自己 Firebase 專案的設定
// 位置：Firebase 主控台 →（左上角齒輪）專案設定 → 一般 →
//       往下捲到「您的應用程式」→ SDK 設定與設定
// 把那邊顯示的 firebaseConfig 物件內容，整個貼過來取代下面這個
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyA4lvzc48kOnZsxIpXMCCb0ZLOMJ8n7LEk",
  authDomain: "record-965e8.firebaseapp.com",
  projectId: "record-965e8",
  storageBucket: "record-965e8.firebasestorage.app",
  messagingSenderId: "922831828013",
  appId: "1:922831828013:web:3269d35ade29b0818e34a4",
  measurementId: "G-054D7S9RDN"
};

// 只允許這個 Google 帳號（您的學校信箱）登入使用本系統
// 如果之後要多開放其他老師使用，可以改成陣列並修改 app.js 裡的檢查邏輯
export const ALLOWED_EMAIL = "mingchen@yfms.tyc.edu.tw";
