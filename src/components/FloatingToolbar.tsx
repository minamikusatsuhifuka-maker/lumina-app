'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { loadMemoSheets, appendToMemoSheet } from '@/lib/memo-storage';
import { PipMemoPanel } from './pip-memo-panel';

const FLOAT_COLORS = [
  { color: '#ef4444', label: '赤' },
  { color: '#f97316', label: 'オレンジ' },
  { color: '#eab308', label: '黄' },
  { color: '#22c55e', label: '緑' },
  { color: '#3b82f6', label: '青' },
  { color: '#8b5cf6', label: '紫' },
];

const FLOAT_HIGHLIGHTS = [
  { color: '#fef08a', label: '黄ハイライト' },
  { color: '#bbf7d0', label: '緑ハイライト' },
  { color: '#bfdbfe', label: '青ハイライト' },
  { color: '#fecaca', label: '赤ハイライト' },
];

type ToolbarState = {
  x: number;
  y: number;
  height: number;
  text: string;
} | null;

export function FloatingToolbar() {
  const [isMounted, setIsMounted] = useState(false);
  const [floatingToolbar, setFloatingToolbar] = useState<ToolbarState>(null);
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [toolbarDragged, setToolbarDragged] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const pendingDragRef = useRef<{ startX: number; startY: number; elLeft: number; elTop: number } | null>(null);

  useEffect(() => { setIsMounted(true); }, []);

  // テキスト選択検知
  useEffect(() => {
    const onMouseUp = () => {
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          setFloatingToolbar(null);
          return;
        }
        const text = selection.toString().trim();
        if (text.length < 2) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) return;

        const toolbarW = 340;
        let finalX = rect.left + rect.width / 2;
        if (finalX - toolbarW / 2 < 10) finalX = toolbarW / 2 + 10;
        if (finalX + toolbarW / 2 > window.innerWidth - 10) finalX = window.innerWidth - toolbarW / 2 - 10;

        setToolbarDragged(false);
        setFloatingToolbar({ x: finalX, y: rect.top, height: rect.height, text });
      }, 10);
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  // ツールバー外クリックで閉じる
  useEffect(() => {
    const hide = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest('[data-floating-toolbar]')) return;
      setFloatingToolbar(null);
    };
    document.addEventListener('mousedown', hide);
    return () => document.removeEventListener('mousedown', hide);
  }, []);

  // ドラッグ
  useEffect(() => {
    const THRESH = 5;
    const onMouseMove = (e: MouseEvent) => {
      if (pendingDragRef.current && !isDraggingRef.current) {
        const dx = Math.abs(e.clientX - pendingDragRef.current.startX);
        const dy = Math.abs(e.clientY - pendingDragRef.current.startY);
        if (dx > THRESH || dy > THRESH) {
          const p = pendingDragRef.current;
          isDraggingRef.current = true;
          dragOffsetRef.current = { x: p.startX - p.elLeft, y: p.startY - p.elTop };
          setToolbarPos({ x: e.clientX - dragOffsetRef.current.x, y: e.clientY - dragOffsetRef.current.y });
          setToolbarDragged(true);
          document.body.style.userSelect = 'none';
          pendingDragRef.current = null;
        }
        return;
      }
      if (!isDraggingRef.current) return;
      e.preventDefault();
      setToolbarPos({ x: e.clientX - dragOffsetRef.current.x, y: e.clientY - dragOffsetRef.current.y });
    };
    const onMouseUp = () => {
      pendingDragRef.current = null;
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const applyFormat = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
  }, []);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.querySelector('[data-floating-toolbar]') as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    pendingDragRef.current = { startX: e.clientX, startY: e.clientY, elLeft: rect.left, elTop: rect.top };
  }, []);

  const addToMemo = useCallback(() => {
    if (!floatingToolbar?.text) return;
    const sheets = loadMemoSheets();
    const activeSheet = sheets[0];
    if (activeSheet) {
      appendToMemoSheet(activeSheet.id, floatingToolbar.text);
      window.dispatchEvent(new Event('memo-updated'));
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 1500);
    }
  }, [floatingToolbar]);

  if (!isMounted) return null;

  return (
    <>
      {/* フローティングツールバー */}
      {floatingToolbar && (
        <div
          data-floating-toolbar="true"
          style={{
            position: 'fixed',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: '#1a1a2e',
            border: '1px solid rgba(108,99,255,0.4)',
            borderRadius: 12,
            padding: '6px 10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            userSelect: 'none',
            cursor: 'grab',
            ...(toolbarDragged
              ? { left: toolbarPos.x, top: toolbarPos.y }
              : { left: floatingToolbar.x, top: floatingToolbar.y, transform: 'translate(-50%, calc(-100% - 10px))' }),
          }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'BUTTON' || tag === 'INPUT') return;
            startDrag(e);
          }}
        >
          {/* 書式ボタン */}
          {[
            { cmd: 'bold', label: 'B', style: { fontWeight: 700 } },
            { cmd: 'italic', label: 'I', style: { fontStyle: 'italic' as const } },
            { cmd: 'underline', label: 'U', style: { textDecoration: 'underline' } },
          ].map(({ cmd, label, style }) => (
            <button
              key={cmd}
              onMouseDown={(e) => { e.preventDefault(); applyFormat(cmd); }}
              style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: 13, ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={cmd}
            >
              {label}
            </button>
          ))}

          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />

          {/* 文字色 */}
          {FLOAT_COLORS.map(({ color, label }) => (
            <button
              key={color}
              onMouseDown={(e) => { e.preventDefault(); applyFormat('foreColor', color); }}
              style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.3)', background: color, cursor: 'pointer' }}
              title={`文字色: ${label}`}
            />
          ))}

          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />

          {/* ハイライト */}
          {FLOAT_HIGHLIGHTS.map(({ color, label }) => (
            <button
              key={color}
              onMouseDown={(e) => { e.preventDefault(); applyFormat('backColor', color); }}
              style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.2)', background: color, cursor: 'pointer' }}
              title={`ハイライト: ${label}`}
            />
          ))}

          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />

          {/* 書式クリア */}
          <button
            onMouseDown={(e) => { e.preventDefault(); applyFormat('removeFormat'); }}
            style={{ padding: '0 6px', height: 26, borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#aaa', cursor: 'pointer', fontSize: 10 }}
          >
            ✕
          </button>

          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />

          {/* メモに追記 */}
          <button
            onMouseDown={(e) => { e.preventDefault(); addToMemo(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0 10px', height: 26, borderRadius: 8, border: 'none',
              background: savedMsg ? '#1d9e75' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              transition: 'background 0.2s',
            }}
          >
            {savedMsg ? '✓ 保存済み' : '📝 メモに追記'}
          </button>
        </div>
      )}

      {/* PiPメモパネル（右下から2番目・AIアシスタントの左隣） */}
      <PipMemoPanel />
    </>
  );
}
