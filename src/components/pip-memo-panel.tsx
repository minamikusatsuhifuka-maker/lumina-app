'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { loadMemoSheets, saveMemoSheets, type MemoSheet } from '@/lib/memo-storage';

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(options: { width: number; height: number }): Promise<Window>;
      window?: Window;
    };
  }
}

export function PipMemoPanel() {
  const [isMounted, setIsMounted] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [sheets, setSheets] = useState<MemoSheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string>('');
  const pipRef = useRef<Window | null>(null);
  const sheetsRef = useRef<MemoSheet[]>([]);
  sheetsRef.current = sheets;

  useEffect(() => {
    setIsMounted(true);
    const loaded = loadMemoSheets();
    setSheets(loaded);
    if (loaded.length > 0) setActiveSheetId(loaded[0].id);
  }, []);

  // memo-updated イベントをリッスン（FloatingToolbarからの追記通知）
  useEffect(() => {
    const onUpdate = () => {
      const loaded = loadMemoSheets();
      setSheets(loaded);
      if (pipRef.current) renderPipContent(pipRef.current, loaded);
    };
    window.addEventListener('memo-updated', onUpdate);
    return () => window.removeEventListener('memo-updated', onUpdate);
  }, []);

  const activeSheet = sheets.find(s => s.id === activeSheetId) || sheets[0];

  // PiP小窓のHTML生成
  const buildPipHTML = useCallback((memoSheets: MemoSheet[]) => {
    const current = memoSheets[0];
    const lines = current?.content ? current.content.split('\n').filter(l => l.trim()) : [];
    const items = lines.map((line, i) => `
      <div style="
        display:flex;align-items:flex-start;gap:4px;
        padding:4px 6px;border-radius:6px;
        background:rgba(108,99,255,0.08);
        border:1px solid rgba(108,99,255,0.2);
        margin-bottom:3px;
      ">
        <span style="flex:1;font-size:10px;line-height:1.5;word-break:break-all;color:#e0e0f0">${line}</span>
        <button data-copy="${i}" style="
          padding:1px 5px;border-radius:4px;border:1px solid rgba(108,99,255,0.3);
          background:rgba(108,99,255,0.15);color:#c0c0ff;font-size:9px;cursor:pointer;flex-shrink:0
        ">📋</button>
        <button data-del="${i}" style="
          padding:1px 5px;border-radius:4px;border:none;
          background:rgba(239,68,68,0.15);color:#ff6b6b;font-size:9px;cursor:pointer;flex-shrink:0
        ">✕</button>
      </div>
    `).join('');

    return `
      <div style="
        font-family:sans-serif;
        background:linear-gradient(135deg,#1a1a2e,#16213e);
        color:#e0e0f0;
        padding:6px 8px;
        height:100%;
        box-sizing:border-box;
        display:flex;
        flex-direction:column;
        gap:4px;
        border:1px solid rgba(108,99,255,0.3);
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <span style="font-size:11px;font-weight:700;color:#c0c0ff">📝 メモ小窓</span>
          <button id="btn-clear-all" style="
            padding:1px 7px;border-radius:4px;border:1px solid rgba(108,99,255,0.3);
            background:rgba(108,99,255,0.15);color:#c0c0ff;font-size:9px;cursor:pointer
          ">🗑 全消去</button>
        </div>
        <div id="memo-list" style="
          flex:1;overflow-y:auto;padding-right:2px;
        ">${items || '<div style="font-size:10px;color:#8888aa;text-align:center;padding:12px 0">テキストを選択して「メモに追記」を押してください</div>'}</div>
        <div style="display:flex;gap:4px;flex-shrink:0;border-top:1px solid rgba(108,99,255,0.3);padding-top:4px">
          <button id="btn-save" style="
            flex:1;padding:4px;border-radius:6px;
            border:2px solid rgba(108,99,255,0.5);
            background:rgba(108,99,255,0.2);
            color:#c0c0ff;font-size:11px;font-weight:700;cursor:pointer
          ">📌 選択範囲を保存</button>
          <button id="btn-copy-all" style="
            padding:4px 8px;border-radius:6px;
            border:1px solid rgba(108,99,255,0.3);
            background:rgba(108,99,255,0.1);
            color:#c0c0ff;font-size:11px;font-weight:700;cursor:pointer
          ">📋 全コピー</button>
        </div>
      </div>
    `;
  }, []);

  const showPipToast = (pw: Window, msg: string) => {
    const d = pw.document;
    const old = d.getElementById('pip-toast');
    if (old) old.remove();
    const toast = d.createElement('div');
    toast.id = 'pip-toast';
    toast.style.cssText = 'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);background:#6c63ff;color:#fff;padding:4px 12px;border-radius:6px;font-size:10px;font-weight:700;z-index:9999;white-space:nowrap';
    toast.textContent = msg;
    d.body.appendChild(toast);
    setTimeout(() => { try { toast.remove(); } catch {} }, 1500);
  };

  const bindMemoButtons = (pw: Window) => {
    const d = pw.document;
    d.querySelectorAll('[data-copy]').forEach(btn => {
      (btn as HTMLButtonElement).onclick = () => {
        const idx = parseInt(btn.getAttribute('data-copy') || '0');
        const current = sheetsRef.current[0];
        const lines = current?.content ? current.content.split('\n').filter(l => l.trim()) : [];
        const text = lines[idx] || '';
        pw.navigator.clipboard.writeText(text).then(() => {
          btn.textContent = '✅';
          setTimeout(() => { btn.textContent = '📋'; }, 1000);
        }).catch(() => {});
      };
    });
    d.querySelectorAll('[data-del]').forEach(btn => {
      (btn as HTMLButtonElement).onclick = () => {
        const idx = parseInt(btn.getAttribute('data-del') || '0');
        const current = sheetsRef.current[0];
        if (!current) return;
        const lines = current.content.split('\n').filter(l => l.trim());
        lines.splice(idx, 1);
        const newContent = lines.join('\n');
        const updated = sheetsRef.current.map(s =>
          s.id === current.id ? { ...s, content: newContent, updatedAt: new Date().toISOString() } : s
        );
        saveMemoSheets(updated);
        setSheets(updated);
        renderPipContent(pw, updated);
      };
    });
  };

  const renderPipContent = (pw: Window, memoSheets: MemoSheet[]) => {
    const d = pw.document;
    const list = d.getElementById('memo-list');
    if (!list) return;
    const current = memoSheets[0];
    const lines = current?.content ? current.content.split('\n').filter(l => l.trim()) : [];
    if (lines.length === 0) {
      list.innerHTML = '<div style="font-size:10px;color:#8888aa;text-align:center;padding:12px 0">テキストを選択して「メモに追記」を押してください</div>';
      return;
    }
    list.innerHTML = lines.map((line, i) => `
      <div style="
        display:flex;align-items:flex-start;gap:4px;
        padding:4px 6px;border-radius:6px;
        background:rgba(108,99,255,0.08);
        border:1px solid rgba(108,99,255,0.2);
        margin-bottom:3px;
      ">
        <span style="flex:1;font-size:10px;line-height:1.5;word-break:break-all;color:#e0e0f0">${line}</span>
        <button data-copy="${i}" style="padding:1px 5px;border-radius:4px;border:1px solid rgba(108,99,255,0.3);background:rgba(108,99,255,0.15);color:#c0c0ff;font-size:9px;cursor:pointer;flex-shrink:0">📋</button>
        <button data-del="${i}" style="padding:1px 5px;border-radius:4px;border:none;background:rgba(239,68,68,0.15);color:#ff6b6b;font-size:9px;cursor:pointer;flex-shrink:0">✕</button>
      </div>
    `).join('');
    bindMemoButtons(pw);
  };

  const bindPipEvents = (pw: Window) => {
    const d = pw.document;
    const btnSave = d.getElementById('btn-save');
    if (btnSave) {
      btnSave.onclick = () => {
        const sel = window.getSelection()?.toString().trim();
        if (!sel) {
          showPipToast(pw, 'テキストを選択してください');
          return;
        }
        const current = sheetsRef.current[0];
        if (!current) return;
        const newContent = current.content ? current.content + '\n' + sel : sel;
        const updated = sheetsRef.current.map(s =>
          s.id === current.id ? { ...s, content: newContent, updatedAt: new Date().toISOString() } : s
        );
        saveMemoSheets(updated);
        setSheets(updated);
        renderPipContent(pw, updated);
      };
    }
    const btnClear = d.getElementById('btn-clear-all');
    if (btnClear) {
      btnClear.onclick = () => {
        if (!pw.confirm('全てのメモを消去しますか？')) return;
        const current = sheetsRef.current[0];
        if (!current) return;
        const updated = sheetsRef.current.map(s =>
          s.id === current.id ? { ...s, content: '', updatedAt: new Date().toISOString() } : s
        );
        saveMemoSheets(updated);
        setSheets(updated);
        renderPipContent(pw, updated);
      };
    }
    const btnCopyAll = d.getElementById('btn-copy-all');
    if (btnCopyAll) {
      btnCopyAll.onclick = () => {
        const current = sheetsRef.current[0];
        const text = current?.content || '';
        if (!text) { showPipToast(pw, 'メモがありません'); return; }
        pw.navigator.clipboard.writeText(text).then(() => {
          showPipToast(pw, '✅ コピーしました');
        }).catch(() => {
          showPipToast(pw, 'コピーに失敗しました');
        });
      };
    }
    bindMemoButtons(pw);
  };

  const openPip = useCallback(async () => {
    try {
      if (!window.documentPictureInPicture) {
        alert('Chrome 116以降が必要です（Document Picture-in-Picture API）');
        return;
      }
      const pw = await window.documentPictureInPicture.requestWindow({
        width: 280,
        height: 360,
      });
      pw.document.body.style.margin = '0';
      pw.document.body.style.overflow = 'hidden';
      pw.document.head.innerHTML = `<style>
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(108,99,255,0.4); border-radius: 2px; }
        button:hover { opacity: 0.85; }
      </style>`;
      pw.document.body.innerHTML = buildPipHTML(sheetsRef.current);
      bindPipEvents(pw);
      pipRef.current = pw;
      setPipActive(true);
      pw.addEventListener('pagehide', () => {
        pipRef.current = null;
        setPipActive(false);
      });
    } catch (e) {
      console.error('PiP error:', e);
    }
  }, [buildPipHTML]);

  const closePip = useCallback(() => {
    try {
      if (window.documentPictureInPicture?.window) {
        window.documentPictureInPicture.window.close();
      }
    } catch {}
    pipRef.current = null;
    setPipActive(false);
  }, []);

  if (!isMounted) return null;

  return (
    <button
      onClick={pipActive ? closePip : openPip}
      style={{
        position: 'fixed',
        right: 88,
        bottom: 24,
        zIndex: 9998,
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: pipActive ? '2px solid #6c63ff' : '1px solid rgba(108,99,255,0.3)',
        background: pipActive ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : '#1a1a2e',
        color: '#fff',
        fontSize: 20,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        transition: 'all 0.2s',
      }}
      title={pipActive ? 'メモ小窓を閉じる' : 'メモ小窓を開く'}
    >
      📝
    </button>
  );
}
