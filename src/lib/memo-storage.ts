const MEMO_KEY = "lumina_memo_sheets";

export interface MemoSheet {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

export function loadMemoSheets(): MemoSheet[] {
  try {
    const s = localStorage.getItem(MEMO_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  const defaultSheet: MemoSheet = {
    id: "memo-1",
    name: "メモ 1",
    content: "",
    updatedAt: new Date().toISOString(),
  };
  saveMemoSheets([defaultSheet]);
  return [defaultSheet];
}

export function saveMemoSheets(sheets: MemoSheet[]): void {
  localStorage.setItem(MEMO_KEY, JSON.stringify(sheets));
}

export function appendToMemoSheet(sheetId: string, text: string): MemoSheet[] {
  const sheets = loadMemoSheets();
  const updated = sheets.map((s) => {
    if (s.id === sheetId) {
      const newContent = s.content ? s.content + "\n" + text : text;
      return { ...s, content: newContent, updatedAt: new Date().toISOString() };
    }
    return s;
  });
  saveMemoSheets(updated);
  return updated;
}

export function updateMemoSheet(sheetId: string, content: string): MemoSheet[] {
  const sheets = loadMemoSheets();
  const updated = sheets.map((s) =>
    s.id === sheetId ? { ...s, content, updatedAt: new Date().toISOString() } : s
  );
  saveMemoSheets(updated);
  return updated;
}

export function createMemoSheet(name: string): MemoSheet[] {
  const sheets = loadMemoSheets();
  const newSheet: MemoSheet = {
    id: `memo-${Date.now()}`,
    name,
    content: "",
    updatedAt: new Date().toISOString(),
  };
  const updated = [...sheets, newSheet];
  saveMemoSheets(updated);
  return updated;
}

export function deleteMemoSheet(sheetId: string): MemoSheet[] {
  const sheets = loadMemoSheets();
  return sheets.filter((s) => s.id !== sheetId);
}
