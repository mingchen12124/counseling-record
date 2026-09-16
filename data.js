// 所有跟 Firestore 資料庫讀寫有關的函式都放在這裡
import {
  db, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy, limit, serverTimestamp,
  writeBatch
} from "./firebase-init.js";

// ---------- 學生名單 students ----------
// 欄位：name(姓名), klass(班級, 例如 "210"), grade(國一/國二/國三), active(bool)
export async function getStudents(activeOnly = true) {
  const col = collection(db, "students");
  const snap = await getDocs(col);
  let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (activeOnly) list = list.filter(s => s.active !== false);
  list.sort((a, b) => (a.klass || "").localeCompare(b.klass || ""));
  return list;
}

export async function addStudent(student) {
  return addDoc(collection(db, "students"), {
    ...student,
    active: true,
    createdAt: serverTimestamp()
  });
}

export async function setStudentActive(id, active) {
  return updateDoc(doc(db, "students", id), { active });
}

// 把貼上的多行文字解析成學生資料
// 每行格式：班級 姓名 年級（用空白、逗號、Tab 分隔皆可），年級可省略
// 例如："210 洪峻耀 國二" 或 "210,洪峻耀,國二" 或 "210　洪峻耀"
export function parseStudentLines(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  const valid = [];
  const invalid = [];
  for (const line of lines) {
    const parts = line.split(/[\s,，、\t]+/).filter(Boolean);
    if (parts.length < 2) { invalid.push(line); continue; }
    const [klass, name, grade] = parts;
    valid.push({ klass, name, grade: grade || "" });
  }
  return { valid, invalid };
}

// 一次寫入多筆學生資料（用 Firestore batch，一次最多建議 400 筆）
export async function addStudentsBulk(students) {
  const batch = writeBatch(db);
  const col = collection(db, "students");
  students.forEach(s => {
    const ref = doc(col);
    batch.set(ref, { ...s, active: true, createdAt: serverTimestamp() });
  });
  await batch.commit();
  return students.length;
}

// ---------- 輔導紀錄 records ----------
// 欄位：studentId, studentDisplay(班級+姓名), grade, target(學生本人/家長/導師/自行輸入),
//       targetCustom, content, tags(array), date(YYYY/MM/DD字串), createdAt
export async function addRecord(record) {
  return addDoc(collection(db, "records"), {
    ...record,
    createdAt: serverTimestamp()
  });
}

export async function getRecordsForStudent(studentId) {
  const q = query(collection(db, "records"), where("studentId", "==", studentId));
  const snap = await getDocs(q);
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return list;
}

export async function getRecentRecords(n = 20) {
  const snap = await getDocs(collection(db, "records"));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return list.slice(0, n);
}

// ---------- 待追蹤事項 tracking ----------
// 欄位：studentId, studentDisplay, description, dueDate(YYYY/MM/DD), status(due/late/done), recordId
export async function addTracking(item) {
  return addDoc(collection(db, "tracking"), {
    ...item,
    status: "due",
    createdAt: serverTimestamp()
  });
}

export async function getTracking() {
  const snap = await getDocs(collection(db, "tracking"));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  list.forEach(t => {
    if (t.status !== "done" && t.dueDate && t.dueDate < today) t.status = "late";
  });
  list.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  return list;
}

export async function markTrackingDone(id) {
  return updateDoc(doc(db, "tracking", id), { status: "done" });
}

// ---------- IEP 目標 iepGoals ----------
// 欄位：studentId, studentDisplay, goalTitle, progress(0-100), notes
export async function getIepGoals(studentId) {
  const q = query(collection(db, "iepGoals"), where("studentId", "==", studentId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function upsertIepGoal(goal) {
  if (goal.id) {
    const { id, ...rest } = goal;
    return updateDoc(doc(db, "iepGoals", id), rest);
  }
  return addDoc(collection(db, "iepGoals"), goal);
}
