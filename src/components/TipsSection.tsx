'use client';
import { useState, useEffect } from 'react';

type Tip = {
  category: string;
  tip: string;
  detail: string;
  tag: string;
  tagColor: string;
  addedAt?: string;
};

const DEFAULT_TIPS: Tip[] = [
  {
    category: '🤖 Claude活用',
    tip: 'プロンプトの冒頭に「あなたは〇〇の専門家です」と役割を与えると、回答の質が大幅に向上します。',
    detail: '例：「あなたはマーケティング戦略の専門家です。以下の商品のターゲット層を分析してください」のように具体的な役割を与えることで、より専門的で実用的な回答が得られます。役割は業界・職種・経験年数まで詳しく指定するほど効果的です。',
    tag: '初級', tagColor: '#4ade80', addedAt: '2026-03-24',
  },
  {
    category: '⚡ 時短テクニック',
    tip: '長文を要約させるときは「3行で」「箇条書き5つで」と形式を指定すると、使いやすいアウトプットが得られます。',
    detail: '出力形式を具体的に指定することで、後加工の手間が省けます。「表形式で」「JSON形式で」「マークダウンで」など、次の作業に合わせた形式を指定しましょう。これだけで作業時間が30〜50%短縮できます。',
    tag: '初級', tagColor: '#4ade80', addedAt: '2026-03-24',
  },
  {
    category: '🧠 思考整理',
    tip: '迷ったときは「メリット・デメリットをそれぞれ5つ挙げて」と依頼すると、意思決定が格段に早くなります。',
    detail: '意思決定に行き詰まったときは、AIに「悪魔の代弁者」になってもらいましょう。「この案に反対する立場から5つの反論を挙げてください」と依頼することで、自分では気づけなかったリスクを発見できます。',
    tag: '中級', tagColor: '#f5a623', addedAt: '2026-03-24',
  },
  {
    category: '💻 コーディング',
    tip: 'バグ修正を依頼するときは「エラーメッセージ」「該当コード」「期待する動作」の3点をセットで伝えると一発で解決しやすくなります。',
    detail: 'さらに効果的な方法：「このコードをリファクタリングして、可読性を高めてください。変更箇所にはコメントを追加してください」のように、目的と制約を同時に伝えると、すぐ使えるコードが返ってきます。',
    tag: '中級', tagColor: '#f5a623', addedAt: '2026-03-24',
  },
  {
    category: '🚀 上級テクニック',
    tip: '複雑なタスクは「まずステップに分解して」と先に計画を立てさせてから実行させると、精度が飛躍的に上がります。',
    detail: 'Chain-of-Thought（思考の連鎖）プロンプティングと呼ばれる技法です。「step by step で考えてください」や「まず計画を立ててから実行してください」と伝えるだけで、複雑な問題解決の精度が大幅に向上します。',
    tag: '上級', tagColor: '#f87171', addedAt: '2026-03-24',
  },
  {
    category: '📋 プロンプト設計',
    tip: '出力形式をJSON・Markdown・表など具体的に指定すると、後処理が不要になり開発効率が大幅に上がります。',
    detail: 'Few-shot プロンプティング：望む出力の例を1〜3個示すと、AIが形式を学習して同じパターンで返してくれます。「以下の例のような形式で回答してください：[例]」と入力するだけで、出力の一貫性が劇的に向上します。',
    tag: '中級', tagColor: '#f5a623', addedAt: '2026-03-24',
  },
  {
    category: '🔁 反復改善',
    tip: '一度の回答に満足せず「もっと具体的に」「別のアプローチで」と追加指示することで、理想のアウトプットに近づけられます。',
    detail: 'AIとの対話は1回で完結させようとしないことが重要です。「この部分をもっと詳しく」「もっとカジュアルなトーンで書き直して」「競合との差別化をより強調して」のように、フィードバックを重ねることで品質が向上します。',
    tag: '初級', tagColor: '#4ade80', addedAt: '2026-03-24',
  },
  {
    category: '🛡️ セキュリティ',
    tip: 'APIキーや個人情報はプロンプトに直接含めず、環境変数で管理しましょう。AIに渡す情報は最小限に。',
    detail: '機密情報を含む文書をAIに渡す際は、固有名詞や数字を匿名化してから渡すと安全です。「A社」「X氏」「○○万円」のように置き換えてから分析を依頼し、結果を受け取ったら元の情報に戻す方法が実務で広く使われています。',
    tag: '重要', tagColor: '#a89fff', addedAt: '2026-03-24',
  },
  {
    category: '📊 データ分析',
    tip: 'CSVやJSONデータをそのまま貼り付けて「このデータから示唆を3つ教えて」と依頼すると、即座に洞察が得られます。',
    detail: '数値データを渡すときは「外れ値を特定して」「前月比で変化が大きい項目を教えて」「このトレンドが続いた場合3ヶ月後の予測を出して」のように、分析の切り口を明示するとより実用的な洞察が得られます。',
    tag: '中級', tagColor: '#f5a623', addedAt: '2026-03-24',
  },
];

export default function TipsSection() {
  const [tips, setTips] = useState<Tip[]>([]);
  const [selectedTip, setSelectedTip] = useState<number | null>(null);
  const [newTip, setNewTip] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (category: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem('lumina_tips_v2');
      const custom: Tip[] = stored ? JSON.parse(stored) : [];
      setTips([...DEFAULT_TIPS, ...custom]);
    } catch {
      setTips(DEFAULT_TIPS);
    }
  }, []);

  const updateTips = async () => {
    setUpdating(true);
    try {
      const res = await fetch('/api/tips', { method: 'POST' });
      const data = await res.json();
      if (data.tips && Array.isArray(data.tips)) {
        const today = new Date().toISOString().slice(0, 10);
        const newTips: Tip[] = data.tips.map((t: Tip) => ({ ...t, addedAt: today }));

        const stored = JSON.parse(localStorage.getItem('lumina_tips_v2') || '[]');
        const merged = [...stored, ...newTips];
        localStorage.setItem('lumina_tips_v2', JSON.stringify(merged));
        setTips([...DEFAULT_TIPS, ...merged]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  const addTip = () => {
    if (!newTip.trim()) return;
    const tip: Tip = {
      category: newCategory || '💡 カスタムTips',
      tip: newTip,
      detail: '',
      tag: 'カスタム',
      tagColor: '#00d4b8',
      addedAt: new Date().toISOString().slice(0, 10),
    };
    const stored = JSON.parse(localStorage.getItem('lumina_tips_v2') || '[]');
    stored.push(tip);
    localStorage.setItem('lumina_tips_v2', JSON.stringify(stored));
    setTips(prev => [...prev, tip]);
    setNewTip('');
    setNewCategory('');
    setShowAdd(false);
  };

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f0f0ff' }}>
          💡 AI活用・コーディング裏技Tips
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={updateTips}
            disabled={updating}
            style={{
              padding: '6px 14px',
              background: updating ? 'rgba(255,255,255,0.03)' : 'rgba(108,99,255,0.1)',
              border: '1px solid rgba(108,99,255,0.3)',
              borderRadius: 20, color: updating ? '#5a5a7a' : '#a89fff',
              fontSize: 12, fontWeight: 600, cursor: updating ? 'not-allowed' : 'pointer',
            }}
          >
            {updating ? '更新中...' : '🔄 AIで更新'}
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{
              padding: '6px 14px', background: 'rgba(0,212,184,0.1)',
              border: '1px solid rgba(0,212,184,0.3)', borderRadius: 20,
              color: '#00d4b8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            ＋ Tipsを追加
          </button>
        </div>
      </div>
      <p style={{ color: '#7878a0', fontSize: 13, marginBottom: 16 }}>
        クリックすると詳細が表示されます。活用ガイドは
        <a href="/dashboard/guide" style={{ color: '#6c63ff', textDecoration: 'underline', marginLeft: 4 }}>こちら</a>
      </p>

      {/* Tips追加フォーム */}
      {showAdd && (
        <div style={{
          background: 'rgba(0,212,184,0.05)', border: '1px solid rgba(0,212,184,0.2)',
          borderRadius: 12, padding: 16, marginBottom: 20,
        }}>
          <input
            placeholder="カテゴリ（例：💡 活用Tips）"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '8px 12px', color: '#e0e0f0', fontSize: 13, marginBottom: 8,
              boxSizing: 'border-box',
            }}
          />
          <textarea
            placeholder="Tipsの内容を入力してください..."
            value={newTip}
            onChange={e => setNewTip(e.target.value)}
            rows={3}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '8px 12px', color: '#e0e0f0', fontSize: 13, resize: 'vertical',
              marginBottom: 8, boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addTip} style={{
              padding: '7px 16px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
              border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>保存</button>
            <button onClick={() => setShowAdd(false)} style={{
              padding: '7px 16px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              color: '#7878a0', fontSize: 13, cursor: 'pointer',
            }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* Tipsアコーディオン */}
      {(() => {
        const groupedTips = tips.reduce((acc, tip, idx) => {
          const key = tip.category;
          if (!acc[key]) acc[key] = [];
          acc[key].push({ ...tip, originalIdx: idx });
          return acc;
        }, {} as Record<string, (Tip & { originalIdx: number })[]>);

        Object.keys(groupedTips).forEach(key => {
          groupedTips[key].sort((a, b) => {
            const da = a.addedAt || '2000-01-01';
            const db = b.addedAt || '2000-01-01';
            return db.localeCompare(da);
          });
        });

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(groupedTips).map(([category, groupTips]) => {
              const isOpen = openGroups.has(category);
              const newest = groupTips[0];
              const hasMultiple = groupTips.length > 1;

              return (
                <div key={category} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}>
                  {/* アコーディオンヘッダー */}
                  <div
                    onClick={() => toggleGroup(category)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 18px', cursor: 'pointer',
                      background: isOpen ? 'rgba(108,99,255,0.08)' : 'transparent',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#a89fff' }}>{category}</span>
                      {hasMultiple && (
                        <span style={{
                          fontSize: 11, color: '#5a5a7a',
                          background: 'rgba(255,255,255,0.05)',
                          padding: '1px 8px', borderRadius: 99,
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}>
                          {groupTips.length}件
                        </span>
                      )}
                      {!isOpen && (
                        <span style={{
                          fontSize: 12, color: '#7878a0',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          maxWidth: 300,
                        }}>
                          {newest.tip.slice(0, 40)}...
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: newest.tagColor,
                        background: `${newest.tagColor}22`,
                        padding: '2px 8px', borderRadius: 20,
                        border: `1px solid ${newest.tagColor}44`,
                      }}>{newest.tag}</span>
                      <span style={{ color: '#5a5a7a', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* アコーディオン本体 */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {groupTips.map((tip, i) => {
                        const isNewest = i === 0 && hasMultiple;
                        const isOld = i > 0 && hasMultiple;

                        return (
                          <div
                            key={i}
                            onClick={(e) => { e.stopPropagation(); setSelectedTip(selectedTip === tip.originalIdx ? null : tip.originalIdx); }}
                            style={{
                              padding: '14px 18px',
                              borderBottom: i < groupTips.length - 1
                                ? '1px solid rgba(255,255,255,0.04)' : 'none',
                              cursor: 'pointer',
                              opacity: isOld ? 0.55 : 1,
                              background: selectedTip === tip.originalIdx
                                ? 'rgba(108,99,255,0.08)' : 'transparent',
                              transition: 'background 0.15s',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              {isNewest && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: '#00d4b8',
                                  background: 'rgba(0,212,184,0.1)',
                                  padding: '1px 7px', borderRadius: 99,
                                  border: '1px solid rgba(0,212,184,0.3)',
                                }}>✨ 最新</span>
                              )}
                              {isOld && (
                                <span style={{
                                  fontSize: 10, color: '#5a5a7a',
                                  background: 'rgba(255,255,255,0.04)',
                                  padding: '1px 7px', borderRadius: 99,
                                  border: '1px solid rgba(255,255,255,0.08)',
                                }}>旧バージョン</span>
                              )}
                              {tip.addedAt && (
                                <span style={{ fontSize: 10, color: '#5a5a7a' }}>
                                  📅 {tip.addedAt}
                                </span>
                              )}
                            </div>
                            <p style={{
                              fontSize: 13, color: isOld ? '#6a6a8a' : '#c0c0d8',
                              lineHeight: 1.7, margin: 0,
                            }}>
                              {tip.tip}
                            </p>
                            {selectedTip === tip.originalIdx && tip.detail && (
                              <div style={{
                                marginTop: 12, paddingTop: 12,
                                borderTop: '1px solid rgba(108,99,255,0.2)',
                                fontSize: 12, color: '#9090b8', lineHeight: 1.7,
                              }}>
                                {tip.detail}
                              </div>
                            )}
                            <div style={{ marginTop: 6, fontSize: 11, color: '#5a5a7a' }}>
                              {selectedTip === tip.originalIdx ? '▲ 閉じる' : '▼ 詳細を見る'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
