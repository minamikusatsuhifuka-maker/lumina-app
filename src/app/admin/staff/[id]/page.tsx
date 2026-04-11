'use client';
import { useState, useEffect, use } from 'react';
import { HiringScoreChart } from '@/components/clinic/HiringScoreChart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

type DetailTab = 'summary' | 'growth_chart' | 'timeline' | 'documents' | 'notes' | 'grades' | 'score' | 'growth';
type NoteType = 'interview' | 'training' | 'praise' | 'incident' | 'other';

const NOTE_ICONS: Record<string, string> = { interview: '💬', training: '📚', praise: '🌟', incident: '⚠️', other: '📝' };
const NOTE_LABELS: Record<string, string> = { interview: '面談', training: '研修', praise: '称賛', incident: 'インシデント', other: 'その他' };

export default function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [staff, setStaff] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>('summary');

  // メモ追加フォーム
  const [noteType, setNoteType] = useState<NoteType>('other');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteAuthor, setNoteAuthor] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [message, setMessage] = useState('');

  // サマリー
  const [oneOnOnes, setOneOnOnes] = useState<any[]>([]);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);

  // 書類展開
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  // スコアリング
  const [scoreResult, setScoreResult] = useState<any>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  // 個人成長計画
  const [growthPlan, setGrowthPlan] = useState<any>(null);
  const [growthSaving, setGrowthSaving] = useState(false);
  const [alignResult, setAlignResult] = useState<any>(null);
  const [aligning, setAligning] = useState(false);
  const [gf, setGf] = useState<Record<string, string>>({
    lifeVision: '', personalMission: '', coreValues: '', shortTermGoals: '', longTermGoals: '',
  });

  // 5大欲求プロファイル（スタッフ恒常データ）
  const [dominantNeeds, setDominantNeeds] = useState<string[]>([]);
  const [leadNotes, setLeadNotes] = useState('');
  const [qualityWorld, setQualityWorld] = useState('');
  const [needsSaving, setNeedsSaving] = useState(false);

  // リードマネジメント記録
  const [lmType, setLmType] = useState('regular');
  const [lmFacts, setLmFacts] = useState('');
  const [lmAwareness, setLmAwareness] = useState('');
  const [lmStrengths, setLmStrengths] = useState('');
  const [lmNextStep, setLmNextStep] = useState('');
  const [lmNeeds, setLmNeeds] = useState<string[]>([]);
  const [lmSaving, setLmSaving] = useState(false);
  const [lmJikko, setLmJikko] = useState('');
  const [lmJisseki, setLmJisseki] = useState('');
  const [lmJitsuryoku, setLmJitsuryoku] = useState('');
  const [lmSeijitsu, setLmSeijitsu] = useState('');


  const runScoring = async () => {
    setScoreLoading(true);
    try {
      const res = await fetch('/api/clinic/hiring-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: id }),
      });
      const data = await res.json();
      if (data.scores) setScoreResult(data);
      else setMessage(data.error || 'スコアリングに失敗しました');
    } catch { setMessage('スコアリングに失敗しました'); }
    finally { setScoreLoading(false); }
  };

  const fetchSummary = async (staffName: string) => {
    setSummaryLoading(true);
    try {
      const [meetings, evals] = await Promise.all([
        fetch(`/api/clinic/one-on-one?staff_name=${encodeURIComponent(staffName)}`).then(r => r.json()),
        fetch(`/api/clinic/staff-evaluation?staff_name=${encodeURIComponent(staffName)}`).then(r => r.json()),
      ]);
      if (Array.isArray(meetings)) {
        setOneOnOnes(meetings.sort((a: any, b: any) => new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime()));
      }
      if (Array.isArray(evals) && evals.length > 0) {
        setEvaluation(evals[0]);
        setEvaluations(evals.sort((a: any, b: any) => a.period.localeCompare(b.period)));
      }
    } catch {}
    setSummaryLoading(false);
  };

  const generateAiInsight = async () => {
    if (!staff) return;
    setInsightLoading(true);
    setAiInsight('');
    try {
      const recentMeeting = oneOnOnes[oneOnOnes.length - 1];
      const latestEval = evaluations[evaluations.length - 1];
      const res = await fetch('/api/clinic/brushup-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `スタッフ情報：\n名前：${staff.name}\n職種：${staff.position || '未設定'}\n在籍：${staff.hired_at ? Math.floor((Date.now() - new Date(staff.hired_at).getTime()) / (365.25*24*60*60*1000)) + '年' : '不明'}\n\n最新1on1（${recentMeeting?.meeting_date || 'なし'}）：\n- 達成：${recentMeeting?.achievements || '未記録'}\n- 課題：${recentMeeting?.challenges || '未記録'}\n- 成長ステージ：${recentMeeting?.growth_stage || '未記録'}\n- マインドスコア：${recentMeeting?.mindset_score || '未記録'}/10\n\n最新評価（${latestEval?.period || 'なし'}）：\n- 総合スコア：${latestEval?.total_score || '未記録'}点\n- 推奨等級：${latestEval?.recommended_grade || '未記録'}\n\nこのスタッフの「成長ポイント（強み）」と「次に伸ばすべき点」をそれぞれ1〜2文で、温かく・具体的に書いてください。\n\n【成長ポイント】\n（強みを認める言葉で）\n\n【次のステップ】\n（義務ではなく成長の機会として）`,
          category: 'evaluation',
        }),
      });
      const data = await res.json();
      setAiInsight(data.reply || data.result || '');
    } catch {}
    setInsightLoading(false);
  };

  const fetchStaff = () => {
    fetch(`/api/clinic/staff/${id}`).then(r => r.json()).then(data => {
      if (data.id) {
        setStaff(data);
        if (Array.isArray(data.dominant_needs)) setDominantNeeds(data.dominant_needs);
        if (data.lead_notes) setLeadNotes(data.lead_notes);
        if (data.quality_world) setQualityWorld(data.quality_world);
        if (data.name) fetchSummary(data.name);
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchStaff();
    fetch(`/api/clinic/personal-growth-plans?staffId=${id}`).then(r => r.json()).then(d => {
      if (d?.id) {
        setGrowthPlan(d);
        setGf({ lifeVision: d.life_vision || '', personalMission: d.personal_mission || '', coreValues: d.core_values || '', shortTermGoals: d.short_term_goals || '', longTermGoals: d.long_term_goals || '' });
      }
    });
  }, [id]);

  const saveNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/clinic/staff/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: noteType, title: noteTitle, content: noteContent, authorName: noteAuthor }),
      });
      if (res.ok) {
        setMessage('メモを保存しました');
        setNoteTitle(''); setNoteContent(''); setNoteAuthor('');
        fetchStaff();
      }
    } catch { setMessage('保存に失敗しました'); }
    finally { setNoteSaving(false); }
  };

  const toggleNeed = (key: string) => setDominantNeeds(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const saveNeedsProfile = async () => {
    setNeedsSaving(true);
    try {
      await fetch(`/api/clinic/staff/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dominant_needs: dominantNeeds, lead_notes: leadNotes, quality_world: qualityWorld }),
      });
      setMessage('5大欲求プロファイルを保存しました');
    } catch { setMessage('保存に失敗しました'); }
    finally { setNeedsSaving(false); }
  };

  const calcYears = (d: string) => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const y = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
    const m = Math.floor((diff % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
    return y > 0 ? `${y}年${m}ヶ月` : `${m}ヶ月`;
  };

  // タイムライン構築
  const buildTimeline = () => {
    if (!staff) return [];
    const events: { date: string; icon: string; label: string; detail: string }[] = [];
    if (staff.hired_at) events.push({ date: staff.hired_at, icon: '🏥', label: '入職', detail: `${staff.position || ''}として入職` });
    (staff.documents || []).forEach((d: any) => events.push({ date: d.uploaded_at, icon: '📎', label: `書類追加: ${d.title}`, detail: `タイプ: ${d.type}` }));
    (staff.notes || []).forEach((n: any) => events.push({ date: n.created_at, icon: NOTE_ICONS[n.type] || '📝', label: `${NOTE_LABELS[n.type] || 'メモ'}: ${n.title}`, detail: n.content?.slice(0, 100) }));
    (staff.gradeHistories || []).forEach((g: any) => events.push({ date: g.changed_at, icon: '🏅', label: `等級変更: ${g.from_grade || '—'} → ${g.to_grade}`, detail: g.reason || '' }));
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const cardStyle: React.CSSProperties = { padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;
  if (!staff) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>スタッフが見つかりません</div>;

  const statusColor = staff.status === 'active' ? '#4ade80' : staff.status === 'retired' ? '#ef4444' : '#f5a623';
  const statusLabel = staff.status === 'active' ? '在職中' : staff.status === 'retired' ? '退職' : '休職中';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      {/* ヘッダー */}
      <div style={{ ...cardStyle, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #6c63ff, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 22, flexShrink: 0 }}>
          {staff.name?.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{staff.name}</span>
            <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40` }}>{statusLabel}</span>
          </div>
          {staff.name_kana && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{staff.name_kana}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            {staff.position && <span>{staff.position}</span>}
            {staff.department && <span>/ {staff.department}</span>}
            {staff.hired_at && <span>/ 入職 {new Date(staff.hired_at).toLocaleDateString('ja-JP')}（{calcYears(staff.hired_at)}）</span>}
          </div>
        </div>
      </div>

      {message && (
        <div style={{ padding: 10, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, fontSize: 13, color: '#4ade80', marginBottom: 12 }}>{message}</div>
      )}

      {/* 5大欲求プロファイル（リードマネジメント参考情報） */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>💡 このスタッフの主要欲求（リードマネジメント参考情報）</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { key: 'survival',       icon: '🏠', label: '① 生存',  desc: '安心・安定・報酬' },
            { key: 'love_belonging', icon: '❤️', label: '② 愛所属', desc: 'チーム・認められる' },
            { key: 'power',          icon: '💪', label: '③ 力',    desc: '成長・達成・影響力' },
            { key: 'freedom',        icon: '🦋', label: '④ 自由',  desc: '自分で決める・創意' },
            { key: 'fun',            icon: '🎯', label: '⑤ 楽しみ', desc: '学ぶ・面白い・やりがい' },
          ].map(need => (
            <button key={need.key} onClick={() => toggleNeed(need.key)} style={{
              padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: '2px solid', textAlign: 'left',
              background: dominantNeeds.includes(need.key) ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)',
              borderColor: dominantNeeds.includes(need.key) ? '#6c63ff' : 'var(--border)',
              color: dominantNeeds.includes(need.key) ? '#6c63ff' : 'var(--text-muted)',
            }}>
              {need.icon} {need.label}
              <div style={{ fontSize: 10, fontWeight: 400 }}>{need.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>🌈 上質世界（本人が求めている理想像）</label>
            <textarea value={qualityWorld} onChange={e => setQualityWorld(e.target.value)} placeholder="この人が心から望んでいる状態・環境・関係性" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>📝 リードメモ（関わり方のポイント）</label>
            <textarea value={leadNotes} onChange={e => setLeadNotes(e.target.value)} placeholder="この人をリードする際に意識すべきこと" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
          </div>
        </div>
        <button onClick={saveNeedsProfile} disabled={needsSaving} style={{
          padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: needsSaving ? 'rgba(108,99,255,0.3)' : '#6c63ff', color: '#fff', fontSize: 12, fontWeight: 700,
        }}>
          {needsSaving ? '保存中...' : '💾 保存'}
        </button>

        {/* 5大欲求レーダーチャート */}
        {dominantNeeds.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>📊 欲求プロファイル</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <RadarChart width={200} height={160} data={[
                { subject: '生存', value: dominantNeeds.includes('survival') ? 10 : 3, fullMark: 10 },
                { subject: '愛所属', value: dominantNeeds.includes('love_belonging') ? 10 : 3, fullMark: 10 },
                { subject: '力', value: dominantNeeds.includes('power') ? 10 : 3, fullMark: 10 },
                { subject: '自由', value: dominantNeeds.includes('freedom') ? 10 : 3, fullMark: 10 },
                { subject: '楽しみ', value: dominantNeeds.includes('fun') ? 10 : 3, fullMark: 10 },
              ]}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                <Radar name="欲求" dataKey="value" stroke="#6c63ff" fill="#6c63ff" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>主要欲求から考えるアプローチ</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dominantNeeds.includes('survival') && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>🏠 <strong style={{ fontWeight: 600 }}>生存：</strong>安定した環境・明確な評価基準・安心できる人間関係を優先して</div>}
                  {dominantNeeds.includes('love_belonging') && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>❤️ <strong style={{ fontWeight: 600 }}>愛所属：</strong>チームへの貢献実感・感謝の言葉・仲間との関係構築の機会を</div>}
                  {dominantNeeds.includes('power') && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>💪 <strong style={{ fontWeight: 600 }}>力：</strong>成長機会・責任ある役割・達成を認める場を積極的に作って</div>}
                  {dominantNeeds.includes('freedom') && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>🦋 <strong style={{ fontWeight: 600 }}>自由：</strong>自分で決める余白・創意工夫を活かせる仕事・細かい管理を減らして</div>}
                  {dominantNeeds.includes('fun') && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>🎯 <strong style={{ fontWeight: 600 }}>楽しみ：</strong>学びの機会・新しい挑戦・やりがいを感じられる仕事を意識的に</div>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {([
          { key: 'summary' as DetailTab, label: '📊 サマリー' },
          { key: 'growth_chart' as DetailTab, label: '📈 成長グラフ' },
          { key: 'timeline' as DetailTab, label: '📅 タイムライン' },
          { key: 'documents' as DetailTab, label: '📄 書類' },
          { key: 'notes' as DetailTab, label: '📝 メモ追加' },
          { key: 'grades' as DetailTab, label: '🏅 等級履歴' },
          { key: 'score' as DetailTab, label: '📊 採用スコア' },
          { key: 'growth' as DetailTab, label: '✨ 個人成長計画' },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: tab === t.key ? 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(236,72,153,0.08))' : 'var(--bg-card)',
            color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
            border: `1px solid ${tab === t.key ? 'var(--border-accent)' : 'var(--border)'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* サマリー */}
      {tab === 'summary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {summaryLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>
          ) : (
            <>
              {/* 基本情報カード */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: '職種', value: staff?.position || '未設定' },
                  { label: '在籍', value: staff?.hired_at ? `${Math.floor((Date.now() - new Date(staff.hired_at).getTime()) / (365.25*24*60*60*1000))}年` : '未設定' },
                  { label: '現在等級', value: evaluation?.current_grade || '未設定' },
                ].map(item => (
                  <div key={item.label} style={{ padding: '12px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* 評価スコア */}
              {evaluation && (
                <div style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>📊 最新評価スコア（{evaluation.period}）</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[
                      { label: '総合', value: evaluation.total_score, color: '#6c63ff' },
                      { label: '知識', value: evaluation.knowledge_score, color: '#4ade80' },
                      { label: 'スキル', value: evaluation.skill_score, color: '#06b6d4' },
                      { label: 'マインド', value: evaluation.mindset_score, color: '#f59e0b' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value || 0}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>/ 100</div>
                      </div>
                    ))}
                  </div>
                  {evaluation.promotion_approved && (
                    <div style={{ marginTop: 10, padding: '6px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', fontSize: 12, color: '#4ade80', textAlign: 'center' }}>
                      ✅ {evaluation.approved_grade}への昇格承認済み
                    </div>
                  )}
                </div>
              )}

              {/* 直近の1on1 */}
              {oneOnOnes.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🤝 直近の1on1（{new Date(oneOnOnes[oneOnOnes.length - 1].meeting_date).toLocaleDateString('ja-JP')}）</div>
                  <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    {oneOnOnes[oneOnOnes.length - 1].achievements && (
                      <div style={{ marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 700 }}>✨ 達成：</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{oneOnOnes[oneOnOnes.length - 1].achievements.slice(0, 80)}...</span>
                      </div>
                    )}
                    {oneOnOnes[oneOnOnes.length - 1].challenges && (
                      <div>
                        <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>🔍 課題：</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{oneOnOnes[oneOnOnes.length - 1].challenges.slice(0, 80)}...</span>
                      </div>
                    )}
                    {oneOnOnes[oneOnOnes.length - 1].mindset_score && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'rgba(108,99,255,0.1)', color: '#6c63ff' }}>マインド {oneOnOnes[oneOnOnes.length - 1].mindset_score}/10</span>
                        {oneOnOnes[oneOnOnes.length - 1].growth_stage && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>{oneOnOnes[oneOnOnes.length - 1].growth_stage}</span>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AI所見 */}
              <div style={{ padding: 14, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff' }}>🤖 AI所見</div>
                  <button onClick={generateAiInsight} disabled={insightLoading}
                    style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: insightLoading ? 'rgba(108,99,255,0.3)' : '#6c63ff', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {insightLoading ? '分析中...' : aiInsight ? '再分析' : '✨ AI所見を生成'}
                  </button>
                </div>
                {aiInsight ? (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{aiInsight}</div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                    「AI所見を生成」ボタンで、このスタッフの成長ポイントと次のステップをAIが分析します
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 成長グラフ */}
      {tab === 'growth_chart' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1on1マインドスコア折れ線グラフ */}
          <div style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🧠 マインド・意欲スコア推移</div>
            {oneOnOnes.filter(m => m.mindset_score || m.motivation_level).length < 2 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📈</div>
                1on1を2回以上記録するとグラフが表示されます
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={oneOnOnes.filter(m => m.mindset_score || m.motivation_level).map(m => ({
                  date: new Date(m.meeting_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }),
                  マインド: m.mindset_score || null,
                  意欲: m.motivation_level || null,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="マインド" stroke="#6c63ff" strokeWidth={2} dot={{ r: 4, fill: '#6c63ff' }} connectNulls />
                  <Line type="monotone" dataKey="意欲" stroke="#4ade80" strokeWidth={2} dot={{ r: 4, fill: '#4ade80' }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 評価スコア推移 */}
          {evaluations.length > 0 && (
            <div style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>📊 評価スコア推移</div>
              {evaluations.length < 2 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>2期以上の評価データが揃うとグラフが表示されます</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={evaluations.map(ev => ({
                    period: ev.period,
                    総合: ev.total_score || 0,
                    知識: ev.knowledge_score || 0,
                    マインド: ev.mindset_score || 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="総合" stroke="#6c63ff" strokeWidth={2.5} dot={{ r: 5, fill: '#6c63ff' }} />
                    <Line type="monotone" dataKey="知識" stroke="#4ade80" strokeWidth={1.5} dot={{ r: 3, fill: '#4ade80' }} />
                    <Line type="monotone" dataKey="マインド" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 3, fill: '#f59e0b' }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* 成長ステージ変化 */}
          {oneOnOnes.filter(m => m.growth_stage).length > 0 && (
            <div style={{ padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>🌱 成長ステージの変化</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {oneOnOnes.filter(m => m.growth_stage).map((m, i, arr) => {
                  const prev = arr[i - 1];
                  const changed = prev && prev.growth_stage !== m.growth_stage;
                  const STAGE_COLORS: Record<string, string> = { 'Lv1知る': '#94a3b8', 'Lv2わかる': '#60a5fa', 'Lv3行う': '#fbbf24', 'Lv4できる': '#4ade80', 'Lv5分かち合う': '#a78bfa' };
                  const color = STAGE_COLORS[m.growth_stage] || '#94a3b8';
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>}
                      <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: changed ? 700 : 400, background: color + '20', color, border: changed ? `2px solid ${color}` : `1px solid ${color}40` }}>
                        {m.growth_stage}
                        {changed && <span style={{ marginLeft: 4, fontSize: 9 }}>↑UP</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* タイムライン */}
      {tab === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {buildTimeline().length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>イベントがありません</div>
          ) : buildTimeline().map((ev, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: 16, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{ev.icon}</div>
                {i < buildTimeline().length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
              </div>
              <div style={{ flex: 1, paddingTop: 3 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ev.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(ev.date).toLocaleDateString('ja-JP')}</div>
                {ev.detail && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{ev.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 書類 */}
      {tab === 'documents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(staff.documents || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>書類がありません</div>
          ) : (staff.documents || []).map((doc: any) => (
            <div key={doc.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedDocId(expandedDocId === doc.id ? null : doc.id)}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>📄 {doc.title}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(108,99,255,0.1)', color: '#6c63ff' }}>{doc.type}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(doc.uploaded_at).toLocaleDateString('ja-JP')}</span>
              </div>
              {expandedDocId === doc.id && doc.ai_analysis && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {typeof doc.ai_analysis === 'string' ? (() => { try { return JSON.stringify(JSON.parse(doc.ai_analysis), null, 2); } catch { return doc.ai_analysis; } })() : JSON.stringify(doc.ai_analysis, null, 2)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ���モ追加 */}
      {tab === 'notes' && (
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>タイプ</label>
            <select value={noteType} onChange={e => setNoteType(e.target.value as NoteType)} style={inputStyle}>
              <option value="interview">💬 面談</option><option value="training">📚 研修</option>
              <option value="praise">🌟 称賛</option><option value="incident">⚠️ インシデント</option>
              <option value="other">📝 その他</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>タイトル *</label>
            <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="メモのタイトル" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>内容 *</label>
            <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="メモの内容を��力" style={{ ...inputStyle, minHeight: 200, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>記録者</label>
            <input value={noteAuthor} onChange={e => setNoteAuthor(e.target.value)} placeholder="記録者名" style={inputStyle} />
          </div>
          <button onClick={saveNote} disabled={noteSaving || !noteTitle.trim() || !noteContent.trim()} style={{
            padding: '10px 24px', borderRadius: 8, border: 'none', cursor: noteSaving ? 'not-allowed' : 'pointer',
            background: noteSaving || !noteTitle.trim() || !noteContent.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
            color: '#fff', fontWeight: 700, fontSize: 14, alignSelf: 'flex-start',
          }}>
            {noteSaving ? '保存中...' : '保存'}
          </button>

          {/* 既存メモ一覧 */}
          {(staff.notes || []).length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>記録済みメモ</div>
              {(staff.notes || []).map((n: any) => (
                <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>{NOTE_ICONS[n.type] || '📝'}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{new Date(n.created_at).toLocaleDateString('ja-JP')}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>{n.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 等級履歴 */}
      {tab === 'grades' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(staff.gradeHistories || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>等級変更履歴がありません</div>
          ) : (staff.gradeHistories || []).map((g: any) => (
            <div key={g.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>🏅</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {g.from_grade || '—'} → {g.to_grade}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(g.changed_at).toLocaleDateString('ja-JP')}
                    {g.changed_by && ` / ${g.changed_by}`}
                  </div>
                </div>
              </div>
              {g.reason && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{g.reason}</div>}
            </div>
          ))}
        </div>
      )}

      {/* 採用スコア */}
      {tab === 'score' && (
        <div style={cardStyle}>
          <button onClick={runScoring} disabled={scoreLoading} style={{
            padding: '10px 20px', borderRadius: 8, border: 'none', cursor: scoreLoading ? 'not-allowed' : 'pointer',
            background: scoreLoading ? 'rgba(236,72,153,0.3)' : 'linear-gradient(135deg, #ec4899, #8b5cf6)',
            color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 16,
          }}>
            {scoreLoading ? 'AIが理念との適合度を分析中...' : scoreResult ? '🔄 再スコアリング' : '📊 AIスコアリングを実行'}
          </button>

          {scoreResult && (
            <>
              <HiringScoreChart scores={scoreResult.scores} totalScore={scoreResult.totalScore} rank={scoreResult.rank} rankLabel={scoreResult.rankLabel} />
              {scoreResult.summary && (
                <div style={{ marginTop: 14, padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>💬 総合評価</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{scoreResult.summary}</div>
                </div>
              )}
              {scoreResult.strengths?.length > 0 && (
                <div style={{ marginTop: 8, padding: 12, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 600, marginBottom: 6 }}>💪 強み</div>
                  {scoreResult.strengths.map((s: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {s}</div>)}
                </div>
              )}
              {scoreResult.risks?.length > 0 && (
                <div style={{ marginTop: 8, padding: 12, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginBottom: 6 }}>⚠️ リスク</div>
                  {scoreResult.risks.map((r: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {r}</div>)}
                </div>
              )}
              {scoreResult.onboardingAdvice && (
                <div style={{ marginTop: 8, padding: 12, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#6c63ff', fontWeight: 600, marginBottom: 6 }}>📈 育成方針</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{scoreResult.onboardingAdvice}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 個人成長計画 */}
      {tab === 'growth' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>✨ 個人成長計画</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>🔭 人生ビジョン（10年後どうありたいか）</label>
              <textarea value={gf.lifeVision} onChange={e => setGf(p => ({ ...p, lifeVision: e.target.value }))} placeholder="10年後のありたい姿を自由に書いてください" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>🎯 個人ミッション</label>
              <input value={gf.personalMission} onChange={e => setGf(p => ({ ...p, personalMission: e.target.value }))} placeholder="自分のミッション（一文で）" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>💎 自分のコア価値</label>
              <input value={gf.coreValues} onChange={e => setGf(p => ({ ...p, coreValues: e.target.value }))} placeholder="大切にしている価値（カンマ区切り）" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>短期目標（1〜3ヶ月）</label>
                <textarea value={gf.shortTermGoals} onChange={e => setGf(p => ({ ...p, shortTermGoals: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>長期目標（1〜5年）</label>
                <textarea value={gf.longTermGoals} onChange={e => setGf(p => ({ ...p, longTermGoals: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={async () => {
              setGrowthSaving(true);
              await fetch('/api/clinic/personal-growth-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId: id, lifeVision: gf.lifeVision, personalMission: gf.personalMission, coreValues: gf.coreValues, shortTermGoals: gf.shortTermGoals, longTermGoals: gf.longTermGoals }) });
              setMessage('保存しました'); setGrowthSaving(false);
            }} disabled={growthSaving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: growthSaving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {growthSaving ? '保存中...' : '💾 保存'}
            </button>
            <button onClick={async () => {
              setAligning(true); setAlignResult(null);
              try {
                const res = await fetch('/api/clinic/personal-growth-plans/ai-align', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId: id }) });
                const data = await res.json();
                if (data.alignmentScore !== undefined) setAlignResult(data);
                else setMessage(data.error || '分析に失敗しました');
              } catch { setMessage('分析に失敗しました'); }
              finally { setAligning(false); }
            }} disabled={aligning} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: aligning ? 'rgba(236,72,153,0.3)' : 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {aligning ? '分析中...' : '🤖 自己実現×組織理念の重なりを分析'}
            </button>
          </div>

          {alignResult && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', border: `4px solid ${alignResult.alignmentScore >= 80 ? '#4ade80' : alignResult.alignmentScore >= 60 ? '#f5a623' : '#ef4444'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: alignResult.alignmentScore >= 80 ? '#4ade80' : alignResult.alignmentScore >= 60 ? '#f5a623' : '#ef4444' }}>{alignResult.alignmentScore}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>適合度</span>
                </div>
                <div style={{ flex: 1 }}>
                  {alignResult.alignmentAreas?.map((a: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>✅ {a}</div>)}
                </div>
              </div>
              {alignResult.powerPartnerMessage && (
                <div style={{ padding: 16, background: 'rgba(236,72,153,0.05)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: 12 }}>
                  <div style={{ fontSize: 12, color: '#ec4899', fontWeight: 600, marginBottom: 6 }}>🤝 パワーパートナーメッセージ</div>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, fontStyle: 'italic' }}>{alignResult.powerPartnerMessage}</div>
                </div>
              )}
              {alignResult.nextActionForGrowth?.length > 0 && (
                <div style={{ padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>🚀 今すぐできる成長アクション</div>
                  {alignResult.nextActionForGrowth.map((a: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {a}</div>)}
                </div>
              )}
            </div>
          )}

          {/* リードマネジメント記録 */}
          <div style={{ marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#8b5cf6', marginBottom: 16 }}>📝 リードマネジメント記録</h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>面談種別</label>
              <select value={lmType} onChange={e => setLmType(e.target.value)} style={inputStyle}>
                <option value="regular">定期面談</option>
                <option value="adhoc">随時面談</option>
                <option value="goal">目標設定</option>
                <option value="review">振り返り</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>事実ベースのフィードバック</label>
              <textarea value={lmFacts} onChange={e => setLmFacts(e.target.value)} placeholder="具体的な出来事・行動を客観的に記載。評価や感情は含めず、事実のみ記載する。" style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>本人の気づき・反応</label>
              <textarea value={lmAwareness} onChange={e => setLmAwareness(e.target.value)} placeholder="面談でどんな気づきが生まれたか。本人の言葉で記録する。" style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>引き出された強み・可能性</label>
              <textarea value={lmStrengths} onChange={e => setLmStrengths(e.target.value)} placeholder="この面談でわかったこの方の強み・可能性・価値" style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>次のステップ（本人が決めた目標）</label>
              <textarea value={lmNextStep} onChange={e => setLmNextStep(e.target.value)} placeholder="インサイドアウト：本人が自ら決めた行動目標" style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>💫 5大欲求への配慮メモ</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { key: 'power', emoji: '💪', label: '力（承認・達成感）' },
                  { key: 'love', emoji: '❤️', label: '愛と所属（つながり）' },
                  { key: 'fun', emoji: '🎉', label: '楽しみ（成長の喜び）' },
                  { key: 'freedom', emoji: '🕊️', label: '自由（自己決定）' },
                  { key: 'survival', emoji: '🛡️', label: '生存（安全・安心）' },
                ].map(n => (
                  <label key={n.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: 8, background: lmNeeds.includes(n.key) ? 'rgba(139,92,246,0.1)' : 'var(--bg-card)', border: `1px solid ${lmNeeds.includes(n.key) ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`, cursor: 'pointer' }}>
                    <input type="checkbox" checked={lmNeeds.includes(n.key)} onChange={e => setLmNeeds(prev => e.target.checked ? [...prev, n.key] : prev.filter(k => k !== n.key))} style={{ display: 'none' }} />
                    <span>{n.emoji}</span> {n.label}
                  </label>
                ))}
              </div>
            </div>

            {/* 実の確認 */}
            <div style={{ marginBottom: 16, padding: 14, border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>📊 実の確認（言動・行動・結果から判断）</div>
              {[
                { key: 'jikko', label: '実行', q: '前回の面談で決めたことを実行できたか？', ph: '具体的に何を、いつまでに、実行した（またはしなかった）か', value: lmJikko, set: setLmJikko },
                { key: 'jisseki', label: '実績', q: '今期、事実として出せた成果は？', ph: '数字・具体的な出来事・他者からの評価など', value: lmJisseki, set: setLmJisseki },
                { key: 'jitsuryoku', label: '実力', q: '成長の証拠となる行動・言動は？', ph: '以前はできなかったが今はできること / 自然に出てくる行動', value: lmJitsuryoku, set: setLmJitsuryoku },
                { key: 'seijitsu', label: '誠実', q: '自分・他者への誠実さが現れた場面は？', ph: 'ミスへの対応 / 約束の遵守 / 言動の一致', value: lmSeijitsu, set: setLmSeijitsu },
              ].map(item => (
                <div key={item.key} style={{ marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    <span style={{ padding: '1px 8px', borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>{item.label}</span>
                    {item.q}
                  </label>
                  <textarea value={item.value} onChange={e => item.set(e.target.value)} placeholder={item.ph} style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
                </div>
              ))}
            </div>

            <button onClick={async () => {
              if (!lmFacts.trim()) return;
              setLmSaving(true);
              const jitsuSection = [lmJikko && `実行：${lmJikko}`, lmJisseki && `実績：${lmJisseki}`, lmJitsuryoku && `実力：${lmJitsuryoku}`, lmSeijitsu && `誠実：${lmSeijitsu}`].filter(Boolean).join('\n');
              try {
                await fetch(`/api/clinic/staff/${id}/notes`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'interview', title: `リードマネジメント記録（${({ regular: '定期面談', adhoc: '随時面談', goal: '目標設定', review: '振り返り' })[lmType]}）`,
                    content: `【事実】\n${lmFacts}\n\n【本人の気づき】\n${lmAwareness}\n\n【強み・可能性】\n${lmStrengths}\n\n【次のステップ】\n${lmNextStep}\n\n【5大欲求配慮】\n${lmNeeds.map(k => ({ power: '💪力', love: '❤️愛と所属', fun: '🎉楽しみ', freedom: '🕊️自由', survival: '🛡️生存' })[k]).join('、')}${jitsuSection ? `\n\n【実の確認】\n${jitsuSection}` : ''}`,
                    author: '院長',
                  }),
                });
                setMessage('リードマネジメント記録を保存しました');
                setLmFacts(''); setLmAwareness(''); setLmStrengths(''); setLmNextStep(''); setLmNeeds([]);
                setLmJikko(''); setLmJisseki(''); setLmJitsuryoku(''); setLmSeijitsu('');
                fetchStaff();
              } catch { setMessage('保存に失敗しました'); }
              finally { setLmSaving(false); }
            }} disabled={lmSaving || !lmFacts.trim()} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: lmSaving || !lmFacts.trim() ? 'rgba(139,92,246,0.3)' : 'linear-gradient(135deg, #8b5cf6, #6c63ff)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {lmSaving ? '保存中...' : '💾 記録を保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
