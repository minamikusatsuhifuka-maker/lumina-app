'use client';

import { useState, useRef, useEffect } from 'react';

export interface DateRange {
  start: string | null;
  end: string | null;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
  placeholder?: string;
}

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const WEEKDAYS = ['日','月','火','水','木','金','土'];

const PRESETS = [
  { label: '今日', days: 0 },
  { label: '過去7日', days: 6 },
  { label: '過去30日', days: 29 },
  { label: '過去90日', days: 89 },
];

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDisplay(range: DateRange): string {
  if (!range.start && !range.end) return '';
  if (range.start === range.end) return range.start ?? '';
  return `${range.start ?? ''} 〜 ${range.end ?? ''}`;
}

export function DateRangePicker({ value, onChange, placeholder = '期間を選択' }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [selectingStart, setSelectingStart] = useState(true);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const applyPreset = (days: number) => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - days);
    onChange({ start: toDateStr(start), end: toDateStr(today) });
    setIsOpen(false);
  };

  const handleDayClick = (dateStr: string) => {
    if (selectingStart) {
      onChange({ start: dateStr, end: null });
      setSelectingStart(false);
    } else {
      if (value.start && dateStr < value.start) {
        onChange({ start: dateStr, end: value.start });
      } else {
        onChange({ start: value.start, end: dateStr });
      }
      setSelectingStart(true);
      setIsOpen(false);
    }
  };

  const isInRange = (dateStr: string) => {
    const start = value.start;
    const end = value.end ?? hoverDate;
    if (!start || !end) return false;
    const s = start < end ? start : end;
    const e = start < end ? end : start;
    return dateStr >= s && dateStr <= e;
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const days: (string | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  const hasValue = value.start || value.end;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={panelRef}>
      <button onClick={() => setIsOpen(!isOpen)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8,
        border: `1px solid ${hasValue ? '#6c63ff' : 'var(--border)'}`,
        background: hasValue ? 'rgba(108,99,255,0.08)' : 'transparent',
        color: hasValue ? '#6c63ff' : 'var(--text-muted)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
      }}>
        <span>📅</span>
        <span>{hasValue ? formatDisplay(value) : placeholder}</span>
        {hasValue && (
          <span onClick={e => { e.stopPropagation(); onChange({ start: null, end: null }); }} style={{ marginLeft: 4, opacity: 0.6, fontSize: 11 }}>✕</span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 16, display: 'flex', gap: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 340,
        }}>
          {/* プリセット */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 80 }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>クイック選択</p>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p.days)} style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'none', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', textAlign: 'left',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >{p.label}</button>
            ))}
            <button onClick={() => { onChange({ start: null, end: null }); setSelectingStart(true); }} style={{
              padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', textAlign: 'left', marginTop: 4,
            }}>リセット</button>
          </div>

          {/* カレンダー */}
          <div style={{ minWidth: 220 }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
              {selectingStart ? '開始日を選択' : '終了日を選択'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }}
                style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>‹</button>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{viewYear}年 {MONTHS[viewMonth]}</span>
              <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }}
                style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
              {WEEKDAYS.map((w, i) => (
                <div key={w} style={{ textAlign: 'center', fontSize: 10, color: i === 0 ? '#E24B4A' : i === 6 ? '#378ADD' : 'var(--text-muted)', padding: '2px 0' }}>{w}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
              {days.map((dateStr, i) => {
                if (!dateStr) return <div key={i} />;
                const day = parseInt(dateStr.split('-')[2]);
                const dow = new Date(dateStr + 'T00:00:00').getDay();
                const inRange = isInRange(dateStr);
                const isStartOrEnd = dateStr === value.start || dateStr === (value.end ?? hoverDate);
                const isToday = dateStr === toDateStr(new Date());
                return (
                  <button key={dateStr} onClick={() => handleDayClick(dateStr)}
                    onMouseEnter={() => !selectingStart && setHoverDate(dateStr)}
                    onMouseLeave={() => setHoverDate(null)}
                    style={{
                      width: '100%', aspectRatio: '1', borderRadius: isStartOrEnd ? '50%' : inRange ? 3 : 4,
                      border: isToday ? '1.5px solid #6c63ff' : 'none',
                      background: isStartOrEnd ? '#6c63ff' : inRange ? 'rgba(108,99,255,0.12)' : 'transparent',
                      color: isStartOrEnd ? '#fff' : dow === 0 ? '#E24B4A' : dow === 6 ? '#378ADD' : 'var(--text-primary)',
                      fontSize: 12, cursor: 'pointer', fontWeight: isStartOrEnd ? 600 : 400, transition: 'background 0.1s',
                    }}
                  >{day}</button>
                );
              })}
            </div>
            {value.start && (
              <div style={{ marginTop: 8, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-card)', fontSize: 11, color: 'var(--text-muted)' }}>
                📅 {value.start} 〜 {value.end ?? '選択してください'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function getDateCondition(range: DateRange): string {
  if (!range.start && !range.end) return '';
  if (range.start && range.end) return `\n\n重要：${range.start}から${range.end}の期間の情報を優先して収集してください。`;
  if (range.start) return `\n\n重要：${range.start}以降の最新情報を優先してください。`;
  return `\n\n重要：${range.end}以前の情報を対象にしてください。`;
}
