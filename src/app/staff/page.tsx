'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AIDialogueButton } from '@/components/clinic/AIDialogueButton';

export default function StaffHomePage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myGrade, setMyGrade] = useState<any>(null);
  const [nextGrade, setNextGrade] = useState<any>(null);
  const [todayQuestion, setTodayQuestion] = useState<string>('');
  const [myName, setMyName] = useState<string>('');

  useEffect(() => {
    Promise.all([
      fetch('/api/clinic/tasks').then(r => r.json()),
      fetch('/api/clinic/strategies').then(r => r.json()),
      fetch('/api/clinic/surveys').then(r => r.json()),
      fetch('/api/clinic/exams').then(r => r.json()),
      // 同心円の問いかけ・等級情報
      fetch('/api/clinic/concentric-circles').then(r => r.json()).catch(() => []),
      fetch('/api/clinic/staff/my-grade').then(r => r.json()).catch(() => null),
    ]).then(([t, s, sv, ex, circles, gradeInfo]) => {
      if (Array.isArray(t)) setTasks(t);
      if (Array.isArray(s)) setStrategies(s);
      if (Array.isArray(sv)) setSurveys(sv);
      if (Array.isArray(ex)) setExams(ex);

      // 今日の問いかけ（曜日に応じて同心円の各層から）
      if (Array.isArray(circles) && circles.length > 0) {
        const dayIdx = new Date().getDay(); // 0=日〜6=土
        const layer = circles[dayIdx % circles.length];
        if (layer?.question) setTodayQuestion(layer.question);
      }

      // 等級情報
      if (gradeInfo?.current) setMyGrade(gradeInfo.current);
      if (gradeInfo?.next) setNextGrade(gradeInfo.next);
      if (gradeInfo?.name) setMyName(gradeInfo.name);

      setLoading(false);
    });
  }, []);

  const overdue = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date());
  const todayTasks = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString());
  const activeStrategies = strategies.filter(s => s.status === 'active').slice(0, 3);
  const activeSurveys = surveys.filter(s => s.is_active);
  const myTasks = tasks.filter(t => t.status !== 'done').slice(0, 5);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'おはようございます' : now.getHours() < 18 ? 'こんにちは' : 'お疲れ様です';

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{greeting} 👋</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</div>
      </div>

      {/* スタッフ向けティールビジョンカード */}
      <div style={{ marginBottom: 24, padding: 20, borderRadius: 16, background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(139,92,246,0.08))', border: '1px solid rgba(6,182,212,0.25)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#06b6d4', marginBottom: 8 }}>🩵 あなたが主役の組織</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          このクリニックは「誰かに管理される場所」ではありません。<br/>
          あなた自身が考え、選択し、成長する場所です。<br/>
          G1からG5への成長は、あなたの影響の輪が広がること——<br/>
          自分 → チーム → クリニック → 患者さん → 地域社会。
        </div>
      </div>

      {/* 今日の問いかけ */}
      {todayQuestion && (
        <div style={{ marginBottom: 24, padding: 16, borderRadius: 14, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>🔵 今日の問いかけ</div>
          <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.8, fontStyle: 'italic' }}>
            「{todayQuestion}」
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            ※ 同心円モデルの各層と連動して毎日変わります
          </div>
        </div>
      )}

      {/* 自分の等級・次のステップ */}
      {(myGrade || nextGrade) && (
        <div style={{ marginBottom: 24, padding: 16, borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🏅 あなたの成長ステージ</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center' }}>
            {/* 現在等級 */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#6c63ff', marginBottom: 4 }}>現在</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#6c63ff' }}>
                {myGrade ? `${myGrade.position} G${myGrade.level}` : '等級未設定'}
              </div>
              {myGrade?.description && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                  {myGrade.description.slice(0, 40)}...
                </div>
              )}
            </div>

            <div style={{ fontSize: 20, color: 'var(--text-muted)', textAlign: 'center' }}>→</div>

            {/* 次の等級 */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#4ade80', marginBottom: 4 }}>次のステージ</div>
              {nextGrade ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#4ade80' }}>
                    {nextGrade.position} G{nextGrade.level_number}
                  </div>
                  {nextGrade.requirements_promotion && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                      {String(nextGrade.requirements_promotion).slice(0, 40)}...
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>最高等級 🎉</div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <a href="/staff/grade" style={{ fontSize: 12, color: '#6c63ff', textDecoration: 'none' }}>
              等級制度の詳細を見る →
            </a>
          </div>
        </div>
      )}

      {/* 今日の先払いチェック */}
      <div style={{ marginBottom: 24, padding: 16, borderRadius: 14, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309', marginBottom: 10 }}>💰 今日の先払いチェック</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            '今日、自己成長のために時間を先払いしましたか？',
            '今日、仲間のために何かを先払いしましたか？',
            '今日、患者さんに期待以上の価値を先払いしましたか？',
          ].map((q, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
              <input type="checkbox" style={{ marginTop: 2, accentColor: '#d97706' }} />
              <span>{q}</span>
            </label>
          ))}
        </div>
      </div>

      {/* サマリーカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { label: '期限超過', count: overdue.length, color: '#ef4444', icon: '🔴' },
          { label: '今日期限', count: todayTasks.length, color: '#f5a623', icon: '🟡' },
          { label: 'アンケート', count: activeSurveys.length, color: '#6c63ff', icon: '📝' },
          { label: '試験', count: exams.length, color: '#00d4b8', icon: '📋' },
        ].map(c => (
          <div key={c.label} style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.count}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.icon} {c.label}</div>
          </div>
        ))}
      </div>

      {/* 私のタスク */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>📌 私のタスク</span>
          <Link href="/staff/tasks" style={{ fontSize: 12, color: '#6c63ff', textDecoration: 'none' }}>全て見る →</Link>
        </div>
        {myTasks.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>タスクがありません</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {myTasks.map(t => (
              <div key={t.id} style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{t.title}</span>
                <span style={{ fontSize: 11, color: t.due_date && new Date(t.due_date) < new Date() ? '#ef4444' : 'var(--text-muted)' }}>{t.due_date ? new Date(t.due_date).toLocaleDateString('ja-JP') : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* クリニックの今 */}
      {activeStrategies.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 10 }}>🗺 クリニックの今</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeStrategies.map(s => (
              <Link key={s.id} href="/staff/strategy" style={{ textDecoration: 'none' }}>
                <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.category}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <AIDialogueButton contextType="growth" contextLabel="成長・キャリア相談" />
    </div>
  );
}
