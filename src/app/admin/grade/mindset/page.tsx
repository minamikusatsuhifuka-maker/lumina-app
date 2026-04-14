'use client';
import { useState, useEffect, useRef } from 'react';

const CORE_VALUES = [
  { key: 'self_love', label: '💎 自己愛', color: '#ec4899' },
  { key: 'self_management', label: '🎯 セルフマネジメント', color: '#f5a623' },
  { key: 'self_growth', label: '🌱 自己成長', color: '#4ade80' },
  { key: 'enrich_others', label: '👨‍👩‍👧 身近な人を豊かに', color: '#6c63ff' },
  { key: 'social_contribution', label: '🌍 社会貢献', color: '#00d4b8' },
  { key: 'self_realization', label: '✨ 自己実現×理念', color: '#8b5cf6' },
  { key: 'power_partner', label: '🤝 パワーパートナー', color: '#f87171' },
];

const parseJson = (v: any) => { if (!v) return []; if (Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return []; } };

export default function MindsetPage() {
  const [framework, setFramework] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'corevalue' | 'grade'>('corevalue');
  const [selectedCv, setSelectedCv] = useState('self_growth');
  const [selectedGrade, setSelectedGrade] = useState(1);
  const [message, setMessage] = useState('');

  // 一括生成
  const [showGen, setShowGen] = useState(false);
  const [genPositions, setGenPositions] = useState('看護師・受付');
  const [genCount, setGenCount] = useState('5');
  const [generating, setGenerating] = useState(false);
  const [genPreview, setGenPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // 同心円モデル
  const [circleTab, setCircleTab] = useState<'circle' | 'growth'>('circle');
  const [layers, setLayers] = useState<any[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<any>(null);
  const [layerLoading, setLayerLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [layerSaving, setLayerSaving] = useState(false);
  const [layerSaved, setLayerSaved] = useState(false);
  const [editMission, setEditMission] = useState('');
  const [editQuestion, setEditQuestion] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // マインド成長フレームワーク編集
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    stageDescription: string;
    behavioralIndicators: string[];
    growthActions: string[];
  }>({ stageDescription: '', behavioralIndicators: [], growthActions: [] });
  const [editSaving, setEditSaving] = useState(false);

  const fetchData = async () => {
    const [fw, gr] = await Promise.all([
      fetch('/api/clinic/mindset-framework').then(r => r.json()),
      fetch('/api/clinic/grades').then(r => r.json()),
    ]);
    if (Array.isArray(fw)) setFramework(fw);
    if (Array.isArray(gr)) setGrades(gr);
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, []);

  const startEdit = (entry: any) => {
    setEditingId(entry.id);
    const parseArr = (v: any): string[] => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      try { const r = JSON.parse(v); return Array.isArray(r) ? r : []; } catch { return []; }
    };
    setEditForm({
      stageDescription: entry.stage_description || '',
      behavioralIndicators: parseArr(entry.behavioral_indicators),
      growthActions: parseArr(entry.growth_actions),
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setEditSaving(true);
    try {
      await fetch('/api/clinic/mindset-framework', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          stageDescription: editForm.stageDescription,
          behavioralIndicators: JSON.stringify(editForm.behavioralIndicators),
          growthActions: JSON.stringify(editForm.growthActions),
        }),
      });
      setFramework(prev => prev.map(f => f.id === editingId ? {
        ...f,
        stage_description: editForm.stageDescription,
        behavioral_indicators: editForm.behavioralIndicators,
        growth_actions: editForm.growthActions,
      } : f));
      setEditingId(null);
      setMessage('✅ 保存しました');
      setTimeout(() => setMessage(''), 2000);
    } catch { setMessage('❌ 保存に失敗しました'); }
    finally { setEditSaving(false); }
  };

  const renderEditForm = () => (
    <div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ステージの説明</label>
        <input
          value={editForm.stageDescription}
          onChange={e => setEditForm(prev => ({ ...prev, stageDescription: e.target.value }))}
          style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>行動指標（1行1項目）</label>
        <textarea
          value={editForm.behavioralIndicators.join('\n')}
          onChange={e => setEditForm(prev => ({ ...prev, behavioralIndicators: e.target.value.split('\n') }))}
          rows={4}
          style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const, lineHeight: 1.6 }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>成長アクション（1行1項目）</label>
        <textarea
          value={editForm.growthActions.join('\n')}
          onChange={e => setEditForm(prev => ({ ...prev, growthActions: e.target.value.split('\n') }))}
          rows={3}
          style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const, lineHeight: 1.6 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={saveEdit} disabled={editSaving}
          style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: editSaving ? 'rgba(108,99,255,0.3)' : '#6c63ff', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          {editSaving ? '保存中...' : '💾 保存'}
        </button>
        <button onClick={() => setEditingId(null)}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
          キャンセル
        </button>
      </div>
    </div>
  );

  useEffect(() => {
    fetch('/api/clinic/concentric-circles')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setLayers(d);
        setLayerLoading(false);
      });
  }, []);

  const generateAll = async () => {
    setGenerating(true); setMessage('');
    try {
      const res = await fetch('/api/clinic/mindset-framework/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gradeCount: parseInt(genCount), positions: genPositions }) });
      const data = await res.json();
      if (data.framework) setGenPreview(data);
      else setMessage(data.error || '生成に失敗しました');
    } catch { setMessage('生成に失敗しました'); }
    finally { setGenerating(false); }
  };

  const saveGenerated = async () => {
    if (!genPreview?.framework) return;
    setSaving(true);
    const items: any[] = [];
    for (const grade of genPreview.framework) {
      for (const [cvKey, cvData] of Object.entries(grade.coreValues || {})) {
        const d = cvData as any;
        items.push({
          gradeLevel: grade.gradeLevel,
          position: null,
          coreValue: cvKey === 'selfGrowth' ? 'self_growth' : cvKey === 'socialContribution' ? 'social_contribution' : cvKey === 'continuousLearning' ? 'continuous_learning' : cvKey,
          stageDescription: d.stageDescription,
          behavioralIndicators: JSON.stringify(d.behavioralIndicators || []),
          growthActions: JSON.stringify(d.growthActions || []),
          assessmentCriteria: d.assessmentCriteria,
        });
      }
    }
    await fetch('/api/clinic/mindset-framework', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    setShowGen(false); setGenPreview(null); fetchData(); setSaving(false);
  };

  const selectLayer = (layer: any) => {
    setSelectedLayer(layer);
    setEditMission(layer.mission || '');
    setEditQuestion(layer.question || '');
    setEditDescription(layer.description || '');
    setAiResult('');
  };

  const saveLayer = async () => {
    if (!selectedLayer) return;
    setLayerSaving(true);
    await fetch('/api/clinic/concentric-circles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        layer_id: selectedLayer.layer_id,
        mission: editMission,
        question: editQuestion,
        description: editDescription,
        keywords: selectedLayer.keywords,
      }),
    });
    setLayers(prev => prev.map(l =>
      l.layer_id === selectedLayer.layer_id
        ? { ...l, mission: editMission, question: editQuestion, description: editDescription }
        : l
    ));
    setLayerSaving(false);
    setLayerSaved(true);
    setTimeout(() => setLayerSaved(false), 2000);
  };

  const improveWithAI = async () => {
    if (!selectedLayer || aiLoading) return;
    setAiLoading(true);
    setAiResult('');
    try {
      const res = await fetch('/api/clinic/handbooks/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'rewrite',
          chapterContent: `ミッション：${editMission}\n問いかけ：${editQuestion}`,
          instruction: `ティール型クリニックの同心円モデル「${selectedLayer.label}」層として、自己成長と貢献の2軸が人生を豊かにするという哲学を大切に、温かみと誠実さのある表現にブラッシュアップしてください。

以下の形式で返してください：
【改善ミッション】
（心に響く・具体的・温かみのある表現で1〜2文）

【改善問いかけ】
（スタッフが思わず内省したくなる深い問いかけで1文）`,
        }),
      });
      const data = await res.json();
      if (data.result) setAiResult(data.result);
    } catch { setAiResult('エラーが発生しました。'); }
    finally { setAiLoading(false); }
  };

  const applyAIResult = (field: 'mission' | 'question') => {
    const missionMatch = aiResult.match(/【改善ミッション】\n([\s\S]*?)(?=\n【|$)/);
    const questionMatch = aiResult.match(/【改善問いかけ】\n([\s\S]*?)(?=\n【|$)/);
    if (field === 'mission' && missionMatch) setEditMission(missionMatch[1].trim());
    if (field === 'question' && questionMatch) setEditQuestion(questionMatch[1].trim());
  };

  const getFrameworkEntry = (gradeLevel: number, coreValue: string) => framework.find(f => f.grade_level === gradeLevel && f.core_value === coreValue);

  const gradeNumbers = [...new Set(framework.map(f => f.grade_level))].sort((a, b) => a - b);
  const effectiveGrades = gradeNumbers.length > 0 ? gradeNumbers : grades.map(g => g.level_number);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      {/* タブ切替 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[
          { k: 'circle', l: '🔵 同心円モデル' },
          { k: 'growth', l: '🌱 マインド成長フレームワーク' },
        ].map(t => (
          <button key={t.k} onClick={() => setCircleTab(t.k as any)}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: circleTab === t.k ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: circleTab === t.k ? '#6c63ff' : 'var(--text-muted)', borderColor: circleTab === t.k ? 'rgba(108,99,255,0.3)' : 'var(--border)' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* 同心円モデルタブ */}
      {circleTab === 'circle' && (
        <div style={{ display: 'flex', gap: 24 }}>
          {/* 左：SVG同心円 */}
          <div style={{ flexShrink: 0, width: 300 }}>
            <svg width="300" height="300" viewBox="0 0 300 300">
              {[
                { id: 5, r: 143, color: '#534AB7', fill: '#EEEDFE' },
                { id: 4, r: 114, color: '#185FA5', fill: '#E6F1FB' },
                { id: 3, r: 88,  color: '#1D9E75', fill: '#E1F5EE' },
                { id: 2, r: 64,  color: '#3B6D11', fill: '#EAF3DE' },
                { id: 1, r: 42,  color: '#993556', fill: '#FBEAF0' },
                { id: 0, r: 22,  color: '#6c63ff', fill: '#6c63ff' },
              ].map(({ id, r, color, fill }) => (
                <circle key={id} cx="150" cy="150" r={r}
                  fill={selectedLayer?.layer_id === id ? color + '40' : fill}
                  stroke={color} strokeWidth={selectedLayer?.layer_id === id ? 3 : 1.5}
                  style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                  onClick={() => { const l = layers.find(x => x.layer_id === id); if (l) selectLayer(l); }}
                />
              ))}
              {/* ラベル */}
              {[
                { id: 0, y: 147, text: '自分', fontSize: 10, color: '#fff' },
                { id: 1, y: 117, text: '家族', fontSize: 9, color: '#72243E' },
                { id: 2, y: 93,  text: '仲間・同僚・患者さん', fontSize: 8, color: '#27500A' },
                { id: 3, y: 70,  text: 'チーム', fontSize: 9, color: '#085041' },
                { id: 4, y: 45,  text: 'クリニック・地域', fontSize: 9, color: '#0C447C' },
                { id: 5, y: 18,  text: '社会・世界', fontSize: 9, color: '#3C3489' },
              ].map(({ id, y, text, fontSize, color }) => (
                <text key={id} x="150" y={y} textAnchor="middle" fontSize={fontSize}
                  fontWeight="500" fill={color} fontFamily="system-ui" style={{ pointerEvents: 'none' }}>
                  {text}
                </text>
              ))}
            </svg>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>各層をクリックして編集</div>
          </div>

          {/* 右：詳細パネル */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!selectedLayer ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.8 }}>
                ← 円の層をクリックしてください<br />ミッション・問いかけの確認・編集・AI改善ができます
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* ヘッダー */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: selectedLayer.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedLayer.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 10, background: selectedLayer.color + '20', color: selectedLayer.color, fontWeight: 600 }}>{selectedLayer.grade}</span>
                </div>

                {/* 概要 */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>概要</div>
                  <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={2}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' as const }} />
                </div>

                {/* ミッション */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ミッション</div>
                  <textarea value={editMission} onChange={e => setEditMission(e.target.value)} rows={2}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' as const }} />
                </div>

                {/* 問いかけ */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>問いかけ</div>
                  <textarea value={editQuestion} onChange={e => setEditQuestion(e.target.value)} rows={2}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' as const }} />
                </div>

                {/* キーワード */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>キーワード</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(Array.isArray(selectedLayer.keywords) ? selectedLayer.keywords : JSON.parse(selectedLayer.keywords || '[]')).map((k: string) => (
                      <span key={k} style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, background: selectedLayer.color + '15', color: selectedLayer.color, border: `0.5px solid ${selectedLayer.color}40` }}>{k}</span>
                    ))}
                  </div>
                </div>

                {/* ボタン */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={improveWithAI} disabled={aiLoading}
                    style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: aiLoading ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {aiLoading ? '考え中...' : '🤖 AIで磨く'}
                  </button>
                  <button onClick={saveLayer} disabled={layerSaving}
                    style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                    {layerSaving ? '保存中...' : '💾 保存'}
                  </button>
                  {layerSaved && <span style={{ fontSize: 11, color: '#4ade80', alignSelf: 'center' }}>保存しました</span>}
                </div>

                {/* AI結果 */}
                {aiResult && (
                  <div style={{ padding: 12, background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.15)', borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: '#6c63ff', fontWeight: 700, marginBottom: 6 }}>🤖 AI提案</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{aiResult}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => applyAIResult('mission')} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#6c63ff', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>ミッションに反映</button>
                      <button onClick={() => applyAIResult('question')} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#6c63ff', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>問いかけに反映</button>
                      <button onClick={() => setAiResult('')} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>閉じる</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 既存のマインド成長フレームワークはcircleTab === 'growth'の時のみ表示 */}
      {circleTab === 'growth' && (<>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>🌱 マインド成長フレームワーク</h1>
        <button onClick={() => setShowGen(true)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🌱 AIで一括生成</button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>4つのコア価値 × 等級段階のマインド成長を設計</p>

      {message && <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{message}</div>}

      {/* 表示モード切り替え */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setViewMode('corevalue')} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: viewMode === 'corevalue' ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: viewMode === 'corevalue' ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${viewMode === 'corevalue' ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>コア価値別ビュー</button>
        <button onClick={() => setViewMode('grade')} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: viewMode === 'grade' ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: viewMode === 'grade' ? '#6c63ff' : 'var(--text-muted)', border: `1px solid ${viewMode === 'grade' ? 'rgba(108,99,255,0.3)' : 'var(--border)'}` }}>等級別ビュー</button>
      </div>

      {framework.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><div style={{ fontSize: 48, marginBottom: 16 }}>🌱</div><div>マインドフレームワークが未登録です</div><div style={{ fontSize: 13, marginTop: 8 }}>「AIで一括生成」から始めましょう</div></div>
      ) : viewMode === 'corevalue' ? (
        <>
          {/* コア価値タブ */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {CORE_VALUES.map(cv => (
              <button key={cv.key} onClick={() => setSelectedCv(cv.key)} style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: selectedCv === cv.key ? `${cv.color}20` : 'var(--bg-card)',
                color: selectedCv === cv.key ? cv.color : 'var(--text-muted)',
                border: `1px solid ${selectedCv === cv.key ? `${cv.color}40` : 'var(--border)'}`,
              }}>{cv.label}</button>
            ))}
          </div>

          {/* Grade 1→N の縦表示 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {effectiveGrades.map(gl => {
              const entry = getFrameworkEntry(gl, selectedCv);
              const grade = grades.find(g => g.level_number === gl);
              const cvColor = CORE_VALUES.find(c => c.key === selectedCv)?.color || '#6c63ff';
              return (
                <div key={gl} style={{ display: 'flex', border: '1px solid var(--border)', borderBottom: 'none' }} className="last:border-b">
                  <div style={{ width: 120, padding: '14px 12px', background: `${cvColor}10`, borderRight: '1px solid var(--border)', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: cvColor }}>Grade {gl}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{grade?.name || ''}</div>
                  </div>
                  <div style={{ flex: 1, padding: '14px 16px' }}>
                    {entry ? (
                      editingId === entry.id ? renderEditForm() : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{entry.stage_description}</div>
                            <button onClick={() => startEdit(entry)}
                              style={{ marginLeft: 10, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', flexShrink: 0 }}>
                              ✏️ 編集
                            </button>
                          </div>
                          {parseJson(entry.behavioral_indicators).length > 0 && (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                              <span style={{ color: 'var(--text-muted)' }}>行動: </span>
                              {parseJson(entry.behavioral_indicators).map((b: string, i: number) => <span key={i}>{i > 0 ? ' / ' : ''}{b}</span>)}
                            </div>
                          )}
                          {parseJson(entry.growth_actions).length > 0 && (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              <span style={{ color: 'var(--text-muted)' }}>アクション: </span>
                              {parseJson(entry.growth_actions).map((a: string, i: number) => <span key={i}>{i > 0 ? ' / ' : ''}{a}</span>)}
                            </div>
                          )}
                        </>
                      )
                    ) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>未設定</div>}
                  </div>
                </div>
              );
            })}
            <div style={{ border: '1px solid var(--border)', borderTop: 'none', height: 0 }} />
          </div>
        </>
      ) : (
        <>
          {/* 等級選択 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {effectiveGrades.map(gl => {
              const grade = grades.find(g => g.level_number === gl);
              return (
                <button key={gl} onClick={() => setSelectedGrade(gl)} style={{
                  padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: selectedGrade === gl ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)',
                  color: selectedGrade === gl ? '#6c63ff' : 'var(--text-muted)',
                  border: `1px solid ${selectedGrade === gl ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`,
                }}>Lv.{gl} {grade?.name || ''}</button>
              );
            })}
          </div>

          {/* 4コア価値を一覧表示 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {CORE_VALUES.map(cv => {
              const entry = getFrameworkEntry(selectedGrade, cv.key);
              return (
                <div key={cv.key} style={{ padding: 16, background: 'var(--bg-secondary)', border: `1px solid ${cv.color}30`, borderRadius: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: cv.color, marginBottom: 8 }}>{cv.label}</div>
                  {entry ? (
                    editingId === entry.id ? renderEditForm() : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>{entry.stage_description}</div>
                          <button onClick={() => startEdit(entry)}
                            style={{ marginLeft: 10, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', flexShrink: 0 }}>
                            ✏️ 編集
                          </button>
                        </div>
                        {parseJson(entry.behavioral_indicators).map((b: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>• {b}</div>)}
                      </>
                    )
                  ) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>未設定</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      </>)}

      {/* 一括生成モーダル */}
      {showGen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: 20, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>🌱 マインド成長フレームワーク一括生成</h2>
              <button onClick={() => { setShowGen(false); setGenPreview(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {!genPreview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>職種</label><input value={genPositions} onChange={e => setGenPositions(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} /></div>
                <div><label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>等級数</label>
                  <select value={genCount} onChange={e => setGenCount(e.target.value)} style={{ width: '100%', padding: '10px 14px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}>{[3,4,5,6,7].map(n => <option key={n} value={n}>{n}段階</option>)}</select></div>
                <button onClick={generateAll} disabled={generating} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{generating ? '生成中（1〜2分）...' : '🤖 生成する'}</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{genPreview.framework?.length || 0}等級 × 4コア価値のフレームワークが生成されました</div>
                {(genPreview.framework || []).map((g: any, i: number) => (
                  <div key={i} style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Grade {g.gradeLevel} {g.gradeName}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {Object.entries(g.coreValues || {}).map(([k, v]: [string, any]) => (
                        <span key={k} style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)' }}>{v.stageDescription?.slice(0, 30)}...</span>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={saveGenerated} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{saving ? '保存中...' : '採用する'}</button>
                  <button onClick={() => setGenPreview(null)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>やり直す</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
