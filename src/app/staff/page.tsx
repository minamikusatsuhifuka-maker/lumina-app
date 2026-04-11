'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';

export default function StaffHomePage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myGrade, setMyGrade] = useState<any>(null);
  const [nextGrade, setNextGrade] = useState<any>(null);
  const [todayQuestion, setTodayQuestion] = useState<string>('');

  useEffect(() => {
    Promise.all([
      fetch('/api/clinic/tasks').then(r => r.json()),
      fetch('/api/clinic/surveys').then(r => r.json()),
      fetch('/api/clinic/exams').then(r => r.json()),
      fetch('/api/clinic/concentric-circles').then(r => r.json()).catch(() => []),
      fetch('/api/clinic/staff/my-grade').then(r => r.json()).catch(() => null),
    ]).then(([t, sv, ex, circles, gradeInfo]) => {
      if (Array.isArray(t)) setTasks(t);
      if (Array.isArray(sv)) setSurveys(sv);
      if (Array.isArray(ex)) setExams(ex);

      // 今日の問いかけ（曜日ごとに同心円の各層から）
      if (Array.isArray(circles) && circles.length > 0) {
        const dayIdx = new Date().getDay();
        const layer = circles[dayIdx % circles.length];
        if (layer?.question) setTodayQuestion(layer.question);
      }

      // 等級情報
      if (gradeInfo?.current) setMyGrade(gradeInfo.current);
      if (gradeInfo?.next) setNextGrade(gradeInfo.next);

      setLoading(false);
    });
  }, []);

  const overdue = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date());
  const todayTasks = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString());
  const activeSurveys = surveys.filter(s => s.is_active);
  const myTasks = tasks.filter(t => t.status !== 'done').slice(0, 5);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 11 ? 'おはようございます' : hour < 17 ? 'こんにちは' : 'お疲れ様です';
  const greetingEmoji = hour < 11 ? '☀️' : hour < 17 ? '👋' : '🌙';

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
      読み込み中...
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 80 }}>

      {/* ① 挨拶 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
          {greeting} {greetingEmoji}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
          {now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' })}
        </div>
      </div>

      {/* ② 今日の問いかけ（最優先） */}
      {todayQuestion && (
        <div style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 14, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6c63ff', marginBottom: 8, letterSpacing: '0.05em' }}>🔵 今日の問いかけ</div>
          <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.8, fontStyle: 'italic' }}>
            「{todayQuestion}」
          </div>
        </div>
      )}

      {/* ③ 自分の等級・次のステップ */}
      {(myGrade || nextGrade) && (
        <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>🏅 あなたの成長ステージ</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#6c63ff', marginBottom: 3 }}>現在</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#6c63ff' }}>
                {myGrade ? `${myGrade.position || ''} G${myGrade.level}` : '等級未設定'}
              </div>
            </div>
            <div style={{ fontSize: 18, color: 'var(--text-muted)', textAlign: 'center' }}>→</div>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#4ade80', marginBottom: 3 }}>次のステージ</div>
              {nextGrade ? (
                <div style={{ fontSize: 15, fontWeight: 700, color: '#4ade80' }}>
                  {nextGrade.position || ''} G{nextGrade.level_number}
                </div>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>最高等級 🎉</div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <Link href="/staff/grade" style={{ fontSize: 11, color: '#6c63ff', textDecoration: 'none' }}>等級制度の詳細 →</Link>
          </div>
        </div>
      )}

      {/* ④ アクション必要なもの（期限超過・今日期限） */}
      {(overdue.length > 0 || todayTasks.length > 0 || activeSurveys.length > 0) && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {overdue.length > 0 && (
            <Link href="/staff/tasks" style={{ textDecoration: 'none' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>🔴 期限超過のタスクが{overdue.length}件あります</span>
                <span style={{ fontSize: 11, color: '#ef4444' }}>確認 →</span>
              </div>
            </Link>
          )}
          {todayTasks.length > 0 && (
            <Link href="/staff/tasks" style={{ textDecoration: 'none' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#d97706', fontWeight: 600 }}>🟡 今日期限のタスクが{todayTasks.length}件あります</span>
                <span style={{ fontSize: 11, color: '#d97706' }}>確認 →</span>
              </div>
            </Link>
          )}
          {activeSurveys.length > 0 && (
            <Link href="/staff/surveys" style={{ textDecoration: 'none' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#6c63ff', fontWeight: 600 }}>📝 回答待ちのアンケートが{activeSurveys.length}件あります</span>
                <span style={{ fontSize: 11, color: '#6c63ff' }}>回答 →</span>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ⑤ 今日の先払いチェック */}
      <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 14, background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.18)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 10 }}>💰 今日の先払いチェック</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            '今日、自己成長のために時間を先払いしましたか？',
            '今日、仲間のために何かを先払いしましたか？',
            '今日、患者さんに期待以上の価値を先払いしましたか？',
          ].map((q, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
              <input type="checkbox" style={{ marginTop: 2, accentColor: '#d97706', flexShrink: 0 }} />
              <span>{q}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ⑥ 私のタスク */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>📌 私のタスク</span>
          <Link href="/staff/tasks" style={{ fontSize: 12, color: '#6c63ff', textDecoration: 'none' }}>全て見る →</Link>
        </div>
        {myTasks.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
            タスクはすべて完了しています
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {myTasks.map(t => (
              <div key={t.id} style={{ padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{t.title}</span>
                <span style={{ fontSize: 11, color: t.due_date && new Date(t.due_date) < new Date() ? '#ef4444' : 'var(--text-muted)', flexShrink: 0 }}>
                  {t.due_date ? new Date(t.due_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ⑦ クイックリンク */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>よく使う機能</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { href: '/staff/growth', icon: '✨', label: '成長計画' },
            { href: '/staff/circle', icon: '🔵', label: '成長の地図' },
            { href: '/staff/one-on-one', icon: '🤝', label: '1on1振り返り' },
            { href: '/staff/handbook', icon: '📖', label: 'ハンドブック' },
            { href: '/staff/surveys', icon: '📝', label: 'アンケート' },
            { href: '/staff/exams', icon: '📋', label: '試験' },
          ].map(link => (
            <Link key={link.href} href={link.href} style={{ textDecoration: 'none' }}>
              <div style={{ padding: '12px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{link.icon}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{link.label}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <AIDialogueButton contextType="growth" contextLabel="成長・キャリア相談" />
    </div>
  );
}
