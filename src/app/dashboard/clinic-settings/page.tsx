'use client';

import { useEffect, useRef, useState } from 'react';

interface ProfileSection { title: string; category: string; content: string }
interface Profile {
  id: number;
  name: string;
  description?: string;
  content: string;
  sections: ProfileSection[];
  is_default: boolean;
  created_at?: string;
}
interface FeatureSetting {
  feature_key: string;
  profile_id: number | null;
  is_enabled: boolean;
}

const FEATURES = [
  { key: 'kindle', label: '📚 Kindle書籍生成', desc: '書籍の執筆・企画に理念を反映' },
  { key: 'deepresearch', label: '🔭 ディープリサーチ', desc: 'リサーチの視点・観点に反映' },
  { key: 'writing', label: '✍️ 文章作成', desc: '文体・トーン・価値観に反映' },
  { key: 'sns-post', label: '📱 SNS投稿生成', desc: 'ブランドボイスに反映' },
  { key: 'architecture', label: '🏗 アーキテクチャ設計', desc: '開発方針・優先事項に反映' },
  { key: 'materials', label: '📊 資料作成', desc: 'プレゼン・提案書のトーンに反映' },
];

const CATEGORIES = ['理念・ビジョン', '人材育成', 'マーケティング', '診療方針', '教え・学び', '患者対応', 'その他'];

export default function ClinicSettingsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<FeatureSetting[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<'profiles' | 'features' | 'edit'>('profiles');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', description: '', content: '',
    sections: [] as ProfileSection[],
    isDefault: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const res = await fetch('/api/clinic-profile');
      const data = await res.json();
      setProfiles(data.profiles ?? []);
      setSettings(data.settings ?? []);
    } catch {}
  };

  const startCreate = () => {
    setSelectedProfile(null);
    setEditForm({ name: '', description: '', content: '', sections: [], isDefault: false });
    setUploadResult(null);
    setActiveTab('edit');
  };

  const startEdit = (profile: Profile) => {
    setSelectedProfile(profile);
    setEditForm({
      name: profile.name,
      description: profile.description ?? '',
      content: profile.content,
      sections: profile.sections ?? [],
      isDefault: profile.is_default,
    });
    setUploadResult(null);
    setActiveTab('edit');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/clinic-profile/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(`エラー: ${data.error || '読み込み失敗'}`);
        return;
      }
      setUploadResult(data);
      setEditForm(prev => ({
        ...prev,
        content: data.extractedText,
        sections: data.sections ?? [],
        name: prev.name || (data.fileName ?? '').replace(/\.(pdf|docx?|doc|txt|md)$/i, ''),
      }));
    } catch (err: any) {
      alert(`通信エラー: ${err?.message || err}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!editForm.name.trim()) return alert('プロファイル名を入力してください');
    if (!editForm.content.trim()) return alert('背景情報を入力してください');
    setIsSaving(true);
    try {
      const method = selectedProfile ? 'PATCH' : 'POST';
      const body = selectedProfile ? { id: selectedProfile.id, ...editForm } : editForm;
      const res = await fetch('/api/clinic-profile', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失敗');
      await loadAll();
      setActiveTab('profiles');
    } catch (err: any) {
      alert(`保存エラー: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('このプロファイルを削除しますか？')) return;
    await fetch(`/api/clinic-profile?id=${id}`, { method: 'DELETE' });
    loadAll();
  };

  const handleFeatureSetting = async (featureKey: string, profileId: number | null, isEnabled: boolean) => {
    await fetch('/api/clinic-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featureKey, profileId, isEnabled }),
    });
    loadAll();
  };

  const addSection = () => {
    setEditForm(prev => ({
      ...prev,
      sections: [...prev.sections, { title: '', category: '理念・ビジョン', content: '' }],
    }));
  };
  const updateSection = (i: number, field: keyof ProfileSection, value: string) => {
    setEditForm(prev => {
      const updated = [...prev.sections];
      updated[i] = { ...updated[i], [field]: value };
      return { ...prev, sections: updated };
    });
  };
  const removeSection = (i: number) => {
    setEditForm(prev => ({ ...prev, sections: prev.sections.filter((_, idx) => idx !== i) }));
  };

  const ACCENT = '#15803d';
  const ACCENT_GRAD = 'linear-gradient(135deg, #16a34a, #15803d)';

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          🏥 クリニック設定
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          理念・方針・マーケティング要素をAIに学習させ、全機能に反映させます
        </p>
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {([
          { id: 'profiles', label: '📋 背景情報プロファイル' },
          { id: 'features', label: '⚙️ 機能ごとの設定' },
          { id: 'edit', label: selectedProfile ? '✏️ プロファイル編集' : '➕ 新規作成' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => {
              if (t.id === 'edit' && !selectedProfile && activeTab !== 'edit') startCreate();
              else setActiveTab(t.id);
            }}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 600,
              background: 'transparent', border: 'none',
              borderBottom: activeTab === t.id ? `2px solid ${ACCENT}` : '2px solid transparent',
              color: activeTab === t.id ? ACCENT : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 一覧タブ */}
      {activeTab === 'profiles' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              背景情報プロファイル一覧
            </h2>
            <button
              onClick={startCreate}
              style={{
                padding: '8px 16px', background: ACCENT_GRAD,
                color: '#fff', border: 'none', borderRadius: 8,
                cursor: 'pointer', fontSize: 12, fontWeight: 700,
              }}
            >
              ＋ 新規プロファイル作成
            </button>
          </div>

          {profiles.length === 0 ? (
            <div style={{
              textAlign: 'center' as const, padding: '60px 20px',
              border: '2px dashed var(--border)', borderRadius: 14,
              color: 'var(--text-muted)',
            }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>🏥</div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>背景情報がまだ登録されていません</p>
              <p style={{ fontSize: 11, marginBottom: 16 }}>クリニックの理念・方針・マーケティング要素を登録してください</p>
              <button
                onClick={startCreate}
                style={{
                  padding: '8px 18px', background: ACCENT_GRAD,
                  color: '#fff', border: 'none', borderRadius: 8,
                  cursor: 'pointer', fontSize: 12, fontWeight: 700,
                }}
              >
                ＋ 最初のプロファイルを作成
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
              {profiles.map(p => (
                <div key={p.id} style={{
                  padding: 16, borderRadius: 12,
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' as const }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</h3>
                        {p.is_default && (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(34,197,94,0.18)', color: ACCENT, fontWeight: 700 }}>
                            ✅ デフォルト
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{p.description}</p>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                        {(p.sections ?? []).map((s, i) => (
                          <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                            {s.category}: {s.title}
                          </span>
                        ))}
                      </div>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                        {p.content.length.toLocaleString()}字 ／ {(p.sections ?? []).length}セクション
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                      <button
                        onClick={() => startEdit(p)}
                        style={{
                          padding: '6px 12px', fontSize: 11, fontWeight: 600,
                          background: 'var(--bg-primary)', border: '1px solid var(--border)',
                          color: 'var(--text-secondary)', borderRadius: 8, cursor: 'pointer',
                        }}
                      >
                        ✏️ 編集
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        style={{
                          padding: '6px 12px', fontSize: 11, fontWeight: 600,
                          background: 'var(--bg-primary)', border: '1px solid rgba(239,68,68,0.4)',
                          color: '#ef4444', borderRadius: 8, cursor: 'pointer',
                        }}
                      >
                        🗑 削除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 機能設定タブ */}
      {activeTab === 'features' && (
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            機能ごとの背景情報設定
          </h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
            各機能でどのプロファイルを使うか設定します。未設定の場合はデフォルトプロファイルが使われます。
          </p>

          {profiles.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: 30, fontSize: 12, color: 'var(--text-muted)' }}>
              まず背景情報プロファイルを作成してください
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              {FEATURES.map(f => {
                const setting = settings.find(s => s.feature_key === f.key);
                const currentProfileId = setting?.profile_id ?? null;
                const isEnabled = setting?.is_enabled ?? true;
                return (
                  <div key={f.key} style={{
                    padding: 14, borderRadius: 12,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const,
                  }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{f.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{f.desc}</div>
                    </div>

                    <div
                      onClick={() => handleFeatureSetting(f.key, currentProfileId, !isEnabled)}
                      style={{
                        width: 44, height: 22, borderRadius: 999,
                        background: isEnabled ? ACCENT : 'var(--border)',
                        cursor: 'pointer', position: 'relative' as const,
                        transition: 'background 0.15s',
                      }}
                      title={isEnabled ? '有効' : '無効'}
                    >
                      <div style={{
                        position: 'absolute' as const, top: 2, left: isEnabled ? 24 : 2,
                        width: 18, height: 18, borderRadius: '50%',
                        background: '#fff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        transition: 'left 0.15s',
                      }} />
                    </div>

                    {isEnabled && (
                      <select
                        value={currentProfileId ?? ''}
                        onChange={e => handleFeatureSetting(
                          f.key,
                          e.target.value ? parseInt(e.target.value, 10) : null,
                          true,
                        )}
                        style={{
                          padding: '6px 10px', fontSize: 12,
                          background: 'var(--bg-primary)', color: 'var(--text-primary)',
                          border: '1px solid var(--border)', borderRadius: 8,
                          minWidth: 160,
                        }}
                      >
                        <option value="">デフォルト</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 編集タブ */}
      {activeTab === 'edit' && (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 18 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {selectedProfile ? `「${selectedProfile.name}」を編集` : '新規プロファイル作成'}
          </h2>

          {/* 基本情報 */}
          <div style={{ padding: 18, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>基本情報</h3>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>プロファイル名 *</label>
              <input
                value={editForm.name}
                onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例: Kindle執筆用・SNS投稿用・全機能共通"
                style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>説明（任意）</label>
              <input
                value={editForm.description}
                onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="このプロファイルの用途・特徴"
                style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, outline: 'none' }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={editForm.isDefault}
                onChange={e => setEditForm(prev => ({ ...prev, isDefault: e.target.checked }))}
                style={{ accentColor: ACCENT }}
              />
              デフォルトプロファイルに設定する
            </label>
          </div>

          {/* ファイルアップロード */}
          <div style={{ padding: 18, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
              📂 PDF / Word / テキストからインポート
            </h3>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: 30, borderRadius: 12,
                border: '2px dashed var(--border)', textAlign: 'center' as const,
                cursor: 'pointer', background: 'var(--bg-primary)',
              }}
            >
              <div style={{ fontSize: 30, marginBottom: 6 }}>📎</div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                PDF・Word(.docx)・テキストをクリックして選択
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                AIが自動でテキスト抽出・セクション分けします
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            {isUploading && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', animation: 'pulse 1.6s ease-in-out infinite' }}>
                📄 ファイル読み込み中... AIがテキスト抽出・セクション分けを行っています
              </div>
            )}
            {uploadResult && (
              <div style={{
                marginTop: 10, padding: 10, borderRadius: 8,
                background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)',
                fontSize: 12, color: ACCENT,
              }}>
                ✅ 「{uploadResult.fileName}」を読み込みました（{(uploadResult.extractedText ?? '').length.toLocaleString()}字・{(uploadResult.sections ?? []).length}セクション）
              </div>
            )}
          </div>

          {/* テキスト直接入力 */}
          <div style={{ padding: 18, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
              ✏️ テキストで直接入力
            </h3>
            <textarea
              value={editForm.content}
              onChange={e => setEditForm(prev => ({ ...prev, content: e.target.value }))}
              placeholder={`当院の理念・方針・マーケティング要素などを入力してください。

例：
【理念・ビジョン】
私たちは患者さまの「本当の美しさ」を引き出すことを使命としています...

【マーケティング方針】
患者さまとの信頼関係を最優先に、エビデンスに基づいた情報発信を...

【人材育成方針】
スタッフ一人ひとりが...`}
              rows={12}
              style={{
                width: '100%', padding: 12, fontSize: 13,
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 8,
                resize: 'vertical' as const, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {editForm.content.length.toLocaleString()}字
            </p>
          </div>

          {/* セクション分け */}
          <div style={{ padding: 18, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                📂 セクション分け（任意・AIが自動生成）
              </h3>
              <button
                onClick={addSection}
                style={{ fontSize: 11, color: ACCENT, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                ＋ セクション追加
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              {editForm.sections.map((section, i) => (
                <div key={i} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      value={section.title}
                      onChange={e => updateSection(i, 'title', e.target.value)}
                      placeholder="セクションタイトル"
                      style={{ flex: 1, padding: '6px 10px', fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, outline: 'none' }}
                    />
                    <select
                      value={section.category}
                      onChange={e => updateSection(i, 'category', e.target.value)}
                      style={{ padding: '6px 8px', fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6 }}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button
                      onClick={() => removeSection(i)}
                      style={{ padding: '0 10px', background: 'transparent', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    value={section.content}
                    onChange={e => updateSection(i, 'content', e.target.value)}
                    placeholder="このセクションの内容"
                    rows={3}
                    style={{
                      width: '100%', padding: 8, fontSize: 12,
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border)', borderRadius: 6,
                      resize: 'vertical' as const, fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                </div>
              ))}
              {editForm.sections.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' as const, padding: 16 }}>
                  セクション未設定（PDF/Wordインポート時に自動生成されます）
                </div>
              )}
            </div>
          </div>

          {/* 保存 */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={isSaving}
              style={{
                padding: '12px 24px',
                background: isSaving ? 'var(--bg-secondary)' : ACCENT_GRAD,
                color: isSaving ? 'var(--text-muted)' : '#fff',
                border: 'none', borderRadius: 12,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700,
              }}
            >
              {isSaving ? '保存中...' : '💾 保存する'}
            </button>
            <button
              onClick={() => setActiveTab('profiles')}
              style={{
                padding: '12px 24px',
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', borderRadius: 12,
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
