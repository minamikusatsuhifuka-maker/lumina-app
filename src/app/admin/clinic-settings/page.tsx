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
  const [isDragging, setIsDragging] = useState(false);
  const [showSections, setShowSections] = useState(false);
  const [isSectionizing, setIsSectionizing] = useState(false);
  const [sectionizeError, setSectionizeError] = useState('');
  const [saveMode, setSaveMode] = useState<'combined' | 'individual' | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [bulkSaveResult, setBulkSaveResult] = useState<{ count: number; inserted: number; updated: number; names: string[] } | null>(null);
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<number>>(new Set());
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mergeForm, setMergeForm] = useState({ name: '', description: '', deleteOriginals: true });
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', description: '', content: '',
    sections: [] as ProfileSection[],
    isDefault: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

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

  // 受け入れる MIME / 拡張子の判定
  const ACCEPTED_MIMES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
  ];
  const ACCEPTED_EXT_RE = /\.(pdf|docx?|doc|txt|md)$/i;

  // ファイル処理のコアロジック（input change と DnD で共通）
  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      // mode=extract: テキスト抽出のみ（高速）。セクション分けは任意で別ボタンから実行
      const res = await fetch('/api/clinic-profile/upload?mode=extract', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(`エラー: ${data.error || '読み込み失敗'}`);
        return;
      }
      setUploadResult({ ...data, sections: [] });
      setSectionizeError('');
      setBulkSaveResult(null);
      // 単一ファイルなら自動的にcombined扱い、複数ファイルは未選択にする
      setSaveMode(data.successCount > 1 ? null : 'combined');
      const autoName = files.length === 1
        ? files[0].name.replace(/\.(pdf|docx?|doc|txt|md)$/i, '')
        : `${files.length}件のファイル`;
      setEditForm(prev => ({
        ...prev,
        content: data.extractedText,
        sections: [],
        name: prev.name || autoName,
      }));
    } catch (err: any) {
      alert(`通信エラー: ${err?.message || err}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => {
        saveButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processFiles(Array.from(e.target.files ?? []));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const dropped = Array.from(e.dataTransfer.files);
    // MIMEタイプか拡張子で受け入れ判定（ブラウザによってはMIMEが空のため）
    const files = dropped.filter(
      f => ACCEPTED_MIMES.includes(f.type) || ACCEPTED_EXT_RE.test(f.name),
    );
    if (files.length === 0) {
      alert('PDF・Word(.docx)・テキスト(.txt/.md) ファイルのみ対応しています');
      return;
    }
    await processFiles(files);
  };

  const handleBulkDelete = async () => {
    if (selectedProfileIds.size === 0) return;
    if (!confirm(`選択した${selectedProfileIds.size}件のプロファイルを削除しますか？`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/clinic-profile', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedProfileIds) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`エラー: ${data.error || '削除に失敗しました'}`);
        return;
      }
      setSelectedProfileIds(new Set());
      setIsBulkMode(false);
      await loadAll();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMerge = async () => {
    if (selectedProfileIds.size < 2) return;
    setIsMerging(true);
    try {
      const res = await fetch('/api/clinic-profile/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileIds: Array.from(selectedProfileIds),
          mergedName: mergeForm.name || undefined,
          mergedDescription: mergeForm.description || undefined,
          deleteOriginals: mergeForm.deleteOriginals,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.merged) {
        alert(`エラー: ${data.error || '統合に失敗しました'}`);
        return;
      }
      setSelectedProfileIds(new Set());
      setIsBulkMode(false);
      setShowMergeModal(false);
      setMergeForm({ name: '', description: '', deleteOriginals: true });
      await loadAll();
      alert(`✅ ${data.sourceCount}件を統合したプロファイルを作成しました！`);
    } finally {
      setIsMerging(false);
    }
  };

  const handleBulkSave = async () => {
    const fileTexts = uploadResult?.fileTexts;
    if (!fileTexts || fileTexts.length === 0) return;
    setIsBulkSaving(true);
    try {
      // 1. まず dryRun で重複チェック（既存と同じタイトルが何件あるか）
      const checkRes = await fetch('/api/clinic-profile/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileTexts, dryRun: true }),
      });
      const check = await checkRes.json();
      if (!checkRes.ok || check.error) {
        alert(`エラー: ${check.error || '重複チェックに失敗しました'}`);
        return;
      }

      // 2. 重複があれば確認ダイアログを出す（重複0件ならそのまま取り込む）
      if ((check.willUpdate ?? 0) > 0) {
        const dupTitles: string[] = check.duplicateTitles ?? [];
        const shown = dupTitles.slice(0, 10).join('\n');
        const more = dupTitles.length > 10 ? `\n…他${dupTitles.length - 10}件` : '';
        const ok = confirm(
          `${check.willUpdate}件のタイトルが既存の資料と重複します。\n` +
          `重複するタイトル:\n${shown}${more}\n\n` +
          `上書きして取り込みますか？\n` +
          `（新規 ${check.willInsert}件 + 上書き ${check.willUpdate}件）`,
        );
        if (!ok) return; // キャンセル → 何もしない
      }

      // 3. 実際に保存（上書き含む）
      const res = await fetch('/api/clinic-profile/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileTexts, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(`エラー: ${data.error || '一括保存に失敗しました'}`);
        return;
      }
      setBulkSaveResult({
        count: data.count ?? 0,
        inserted: data.inserted ?? (data.created ?? []).length,
        updated: data.updatedCount ?? (data.updated ?? []).length,
        names: [...(data.created ?? []), ...(data.updated ?? [])].map((c: { name: string }) => c.name),
      });
      await loadAll();
    } finally {
      setIsBulkSaving(false);
    }
  };

  const handleSectionize = async () => {
    if (!editForm.content.trim()) return;
    setIsSectionizing(true);
    setSectionizeError('');
    try {
      const res = await fetch('/api/clinic-profile/sectionize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editForm.content }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSectionizeError(data.error || 'セクション分けに失敗しました');
        return;
      }
      setEditForm(prev => ({ ...prev, sections: data.sections ?? [] }));
      setShowSections(true);
    } catch (err) {
      setSectionizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSectionizing(false);
    }
  };

  const handleSave = async () => {
    if (!editForm.name.trim()) return alert('プロファイル名を入力してください');
    if (!editForm.content.trim()) return alert('背景資料を入力してください');
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
          🏥 背景資料
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          方針・マーケティング要素などの資料をAIに学習させ、全機能に反映させます
        </p>
      </div>

      {/* 理念管理との住み分け注記 */}
      <div style={{
        background: 'var(--info-bg, #eef4ff)',
        border: '1px solid var(--info-border, #c7d8f5)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 16,
        fontSize: 13,
        color: 'var(--text-muted, #555)',
      }}>
        ℹ️ ここは記事・SNS・LP などの<strong>生成 AI に読ませる資料</strong>を登録する場所です。
        クリニックの<strong>経営理念</strong>は「💡 理念管理」で設定します。
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {([
          { id: 'profiles', label: '📋 背景資料プロファイル' },
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              背景資料プロファイル一覧
            </h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setIsBulkMode(!isBulkMode);
                  setSelectedProfileIds(new Set());
                }}
                style={{
                  padding: '8px 14px',
                  background: isBulkMode ? '#374151' : 'var(--bg-card)',
                  color: isBulkMode ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${isBulkMode ? '#374151' : 'var(--border)'}`,
                  borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                }}
              >
                {isBulkMode ? '✕ 選択モード解除' : '☑ 複数選択'}
              </button>
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
          </div>

          {/* 一括操作バー */}
          {isBulkMode && selectedProfileIds.size > 0 && (
            <div style={{
              marginBottom: 14, padding: 12, borderRadius: 12,
              background: '#1f2937',
              display: 'flex', alignItems: 'center', gap: 10,
              flexWrap: 'wrap',
            }}>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
                {selectedProfileIds.size}件を選択中
              </span>
              <button
                type="button"
                onClick={() => setSelectedProfileIds(new Set())}
                style={{
                  fontSize: 11, color: '#9ca3af',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                }}
              >
                ✕ 選択解除
              </button>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                {selectedProfileIds.size >= 2 && (
                  <button
                    type="button"
                    onClick={() => setShowMergeModal(true)}
                    style={{
                      padding: '7px 14px', borderRadius: 8,
                      background: '#2563eb', color: '#fff',
                      border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700,
                    }}
                  >
                    🔗 選択した{selectedProfileIds.size}件を1つに統合
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                  style={{
                    padding: '7px 14px', borderRadius: 8,
                    background: '#dc2626', color: '#fff',
                    border: 'none',
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    opacity: isDeleting ? 0.6 : 1,
                    fontSize: 12, fontWeight: 700,
                  }}
                >
                  {isDeleting ? '削除中...' : `🗑 ${selectedProfileIds.size}件を削除`}
                </button>
              </div>
            </div>
          )}

          {/* 全選択/全解除（一括モード時） */}
          {isBulkMode && profiles.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11 }}>
              <button
                type="button"
                onClick={() => setSelectedProfileIds(new Set(profiles.map((p) => p.id)))}
                style={{ background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer' }}
              >
                全て選択（{profiles.length}件）
              </button>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <button
                type="button"
                onClick={() => setSelectedProfileIds(new Set())}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                全て解除
              </button>
            </div>
          )}

          {profiles.length === 0 ? (
            <div style={{
              textAlign: 'center' as const, padding: '60px 20px',
              border: '2px dashed var(--border)', borderRadius: 14,
              color: 'var(--text-muted)',
            }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>🏥</div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>背景資料がまだ登録されていません</p>
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
              {profiles.map(p => {
                const checked = selectedProfileIds.has(p.id);
                return (
                <div key={p.id} style={{
                  padding: 16, borderRadius: 12,
                  background: isBulkMode && checked ? 'rgba(37,99,235,0.10)' : 'var(--bg-secondary)',
                  border: `1px solid ${isBulkMode && checked ? '#2563eb' : 'var(--border)'}`,
                  cursor: isBulkMode ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
                onClick={() => {
                  if (!isBulkMode) return;
                  setSelectedProfileIds(prev => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                    return next;
                  });
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
                    {isBulkMode && (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedProfileIds(prev => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginTop: 4, accentColor: '#2563eb', flexShrink: 0, width: 16, height: 16, cursor: 'pointer' }}
                      />
                    )}
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
                    {!isBulkMode && (
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
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* 統合モーダル */}
          {showMergeModal && (
            <div
              onClick={() => setShowMergeModal(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 16, padding: 24,
                  width: '100%', maxWidth: 460,
                  boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
                }}
              >
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                  🔗 {selectedProfileIds.size}件を1つに統合
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
                  選択したプロファイルの内容を結合して、1つの背景資料としてAIに渡せます。
                </p>

                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, marginBottom: 18 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      統合後のプロファイル名
                    </label>
                    <input
                      value={mergeForm.name}
                      onChange={(e) => setMergeForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="例: 理念・人材育成・経営計画 統合版"
                      style={{
                        width: '100%', padding: '8px 12px', fontSize: 13,
                        background: 'var(--bg-primary)', color: 'var(--text-primary)',
                        border: '1px solid var(--border)', borderRadius: 8, outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      説明（任意）
                    </label>
                    <input
                      value={mergeForm.description}
                      onChange={(e) => setMergeForm((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="このプロファイルの用途・特徴"
                      style={{
                        width: '100%', padding: '8px 12px', fontSize: 13,
                        background: 'var(--bg-primary)', color: 'var(--text-primary)',
                        border: '1px solid var(--border)', borderRadius: 8, outline: 'none',
                      }}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={mergeForm.deleteOriginals}
                      onChange={(e) => setMergeForm((prev) => ({ ...prev, deleteOriginals: e.target.checked }))}
                      style={{ accentColor: '#2563eb' }}
                    />
                    統合後に元のプロファイルを削除する
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleMerge}
                    disabled={isMerging}
                    style={{
                      flex: 1, padding: '10px 16px',
                      background: isMerging ? 'var(--bg-secondary)' : '#2563eb',
                      color: isMerging ? 'var(--text-muted)' : '#fff',
                      border: 'none', borderRadius: 12,
                      cursor: isMerging ? 'not-allowed' : 'pointer',
                      fontSize: 13, fontWeight: 700,
                    }}
                  >
                    {isMerging ? '統合中...' : '🔗 統合する'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMergeModal(false)}
                    style={{
                      padding: '10px 18px',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)', borderRadius: 12,
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 機能設定タブ */}
      {activeTab === 'features' && (
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            機能ごとの背景資料設定
          </h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
            各機能でどのプロファイルを使うか設定します。未設定の場合はデフォルトプロファイルが使われます。
          </p>

          {profiles.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: 30, fontSize: 12, color: 'var(--text-muted)' }}>
              まず背景資料プロファイルを作成してください
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
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                padding: 30, borderRadius: 12,
                border: `2px dashed ${isDragging ? '#16a34a' : 'var(--border)'}`,
                textAlign: 'center' as const,
                cursor: 'pointer',
                background: isDragging ? 'rgba(22,163,74,0.10)' : 'var(--bg-primary)',
                transform: isDragging ? 'scale(1.01)' : 'scale(1)',
                transition: 'all 0.18s ease',
                userSelect: 'none' as const,
              }}
            >
              <div
                style={{
                  fontSize: 30,
                  marginBottom: 6,
                  transform: isDragging ? 'scale(1.25)' : 'scale(1)',
                  transition: 'transform 0.18s ease',
                }}
              >
                {isDragging ? '📂' : '📎'}
              </div>
              {isDragging ? (
                <>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>
                    ここにドロップしてアップロード
                  </p>
                  <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>
                    複数ファイルを一度に受け付けます
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    ファイルをここにドラッグ&ドロップ、またはクリックして選択
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    PDF・Word(.docx)・テキスト(.txt/.md) 対応 ／ 複数ファイル同時OK
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    AIが自動でテキスト抽出・セクション分けします
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md"
              multiple
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            {isUploading && (
              <div style={{
                marginTop: 10, padding: 10, borderRadius: 8,
                background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.3)',
                fontSize: 12, color: '#2563eb',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                ファイル読み込み中... AIがテキスト抽出・セクション分けを行っています
              </div>
            )}
            {uploadResult && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                <div style={{
                  padding: 10, borderRadius: 8,
                  background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)',
                  fontSize: 12, color: ACCENT,
                }}>
                  ✅ {uploadResult.successCount ?? 0}件のファイルを読み込みました
                  {uploadResult.failedCount > 0 && (
                    <span style={{ color: '#ea580c', marginLeft: 8 }}>
                      ⚠️ {uploadResult.failedCount}件は読み込めませんでした
                    </span>
                  )}
                </div>
                {(uploadResult.fileResults ?? []).map((r: any, i: number) => (
                  <div key={i} style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 6,
                    background: r.success ? 'var(--bg-primary)' : 'rgba(239,68,68,0.10)',
                    color: r.success ? 'var(--text-secondary)' : '#dc2626',
                    border: r.success ? '1px solid var(--border)' : '1px solid rgba(239,68,68,0.3)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span>{r.success ? '✅' : '❌'}</span>
                    <span style={{ flex: 1, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const }}>
                      {r.fileName}
                    </span>
                    {!r.success && r.error && (
                      <span style={{ fontSize: 10, opacity: 0.8 }}>{r.error}</span>
                    )}
                  </div>
                ))}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  合計 {((uploadResult.extractedText ?? '').length).toLocaleString()}字 ／ {(uploadResult.sections ?? []).length}セクション生成
                </div>
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

          {/* 複数ファイル時の保存方式選択 */}
          {uploadResult && !isUploading && (uploadResult.successCount ?? 0) > 1 && !bulkSaveResult && (
            <div style={{
              padding: 16, borderRadius: 12,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                📁 保存方式を選んでください
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 10,
              }}>
                {/* 方式A: 個別保存 */}
                <button
                  type="button"
                  onClick={() => setSaveMode('individual')}
                  style={{
                    padding: 14, borderRadius: 12, textAlign: 'left',
                    background: saveMode === 'individual' ? 'rgba(34,197,94,0.10)' : 'var(--bg-card)',
                    border: `2px solid ${saveMode === 'individual' ? '#16a34a' : 'var(--border)'}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>📄×{uploadResult.successCount}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    ファイルごとに個別保存
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {uploadResult.successCount}件のプロファイルが作成されます。機能ごとに使い分けできます。
                  </div>
                  {saveMode === 'individual' && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#16a34a', fontWeight: 700 }}>✓ 選択中</div>
                  )}
                </button>

                {/* 方式B: まとめて保存 */}
                <button
                  type="button"
                  onClick={() => setSaveMode('combined')}
                  style={{
                    padding: 14, borderRadius: 12, textAlign: 'left',
                    background: saveMode === 'combined' ? 'rgba(59,130,246,0.10)' : 'var(--bg-card)',
                    border: `2px solid ${saveMode === 'combined' ? '#2563eb' : 'var(--border)'}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>📚×1</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    1つのプロファイルにまとめて保存
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    全ファイルの内容を統合した1つのプロファイルになります。
                  </div>
                  {saveMode === 'combined' && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#2563eb', fontWeight: 700 }}>✓ 選択中</div>
                  )}
                </button>
              </div>

              {saveMode === 'individual' && (
                <button
                  type="button"
                  onClick={handleBulkSave}
                  disabled={isBulkSaving}
                  style={{
                    marginTop: 12, width: '100%', padding: '12px 18px',
                    background: isBulkSaving ? 'var(--bg-secondary)' : '#16a34a',
                    color: isBulkSaving ? 'var(--text-muted)' : '#fff',
                    border: 'none', borderRadius: 12,
                    cursor: isBulkSaving ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 700,
                  }}
                >
                  {isBulkSaving
                    ? '💾 保存中...'
                    : `💾 ${uploadResult.successCount}件を個別プロファイルとして一括保存`}
                </button>
              )}

              {saveMode === 'combined' && (
                <p style={{ marginTop: 10, fontSize: 11, color: '#2563eb', textAlign: 'center' as const }}>
                  ↓ 下の「💾 保存する」ボタンでプロファイル名を入力して保存してください
                </p>
              )}
            </div>
          )}

          {/* 一括保存完了 */}
          {bulkSaveResult && (
            <div style={{
              padding: 14, borderRadius: 12,
              background: 'rgba(34,197,94,0.10)',
              border: '1px solid rgba(34,197,94,0.3)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', margin: 0, marginBottom: 8 }}>
                🎉 {bulkSaveResult.count}件のプロファイルを取り込みました！
                （新規 {bulkSaveResult.inserted}件 / 上書き {bulkSaveResult.updated}件）
              </p>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2, maxHeight: 140, overflowY: 'auto' as const }}>
                {bulkSaveResult.names.map((name, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#16a34a' }}>✅ {name}</div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('profiles')}
                style={{
                  marginTop: 10, width: '100%', padding: '10px 14px',
                  background: '#16a34a', color: '#fff',
                  border: 'none', borderRadius: 10,
                  cursor: 'pointer', fontSize: 12, fontWeight: 700,
                }}
              >
                📋 プロファイル一覧を確認する
              </button>
            </div>
          )}

          {/* テキスト抽出完了 → セクション分け実行ボタン（任意・combined or 単一ファイル時のみ） */}
          {uploadResult && !isUploading && editForm.content && editForm.sections.length === 0 && !bulkSaveResult &&
            (saveMode === 'combined' || (uploadResult.successCount ?? 0) === 1) && (
            <div style={{
              padding: 14, borderRadius: 12,
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap' as const, gap: 12,
            }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', margin: 0 }}>
                  ✅ テキスト抽出完了（{editForm.content.length.toLocaleString()}字）
                </p>
                <p style={{ fontSize: 11, color: '#3b82f6', margin: 0, marginTop: 2 }}>
                  このまま保存できます。AIでセクション分けすると後から整理しやすくなります。
                </p>
                {sectionizeError && (
                  <p style={{ fontSize: 11, color: '#dc2626', margin: 0, marginTop: 4 }}>
                    {sectionizeError}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleSectionize}
                disabled={isSectionizing}
                style={{
                  padding: '10px 18px',
                  background: isSectionizing ? 'var(--bg-secondary)' : '#2563eb',
                  color: isSectionizing ? 'var(--text-muted)' : '#fff',
                  border: 'none', borderRadius: 10,
                  cursor: isSectionizing ? 'not-allowed' : 'pointer',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}
              >
                {isSectionizing
                  ? '🤖 セクション分け中...'
                  : '📂 AIでセクション分けする（任意）'}
              </button>
            </div>
          )}

          {/* セクション分け完了通知 */}
          {editForm.sections.length > 0 && (
            <div style={{
              padding: 12, borderRadius: 10,
              background: 'rgba(34,197,94,0.10)',
              border: '1px solid rgba(34,197,94,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap' as const, gap: 10,
            }}>
              <span style={{ fontSize: 12, color: '#16a34a' }}>
                ✅ {editForm.sections.length}件のセクションに整理されました
              </span>
              <button
                type="button"
                onClick={handleSectionize}
                disabled={isSectionizing}
                style={{
                  fontSize: 11,
                  color: '#16a34a',
                  background: 'transparent',
                  border: 'none',
                  textDecoration: 'underline',
                  cursor: isSectionizing ? 'not-allowed' : 'pointer',
                  opacity: isSectionizing ? 0.4 : 1,
                }}
              >
                {isSectionizing ? '再実行中...' : '🔄 再実行'}
              </button>
            </div>
          )}

          {/* 保存（セクション分けの前に配置） */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              ref={saveButtonRef}
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

          {/* セクション分け（折りたたみ・デフォルト非表示） */}
          <div style={{ borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setShowSections(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                📂 セクション分け（任意・詳細設定）
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {showSections ? '▲ 閉じる' : '▼ 開いて設定する'}
              </span>
            </button>

            {showSections && (
              <div style={{ padding: 18, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  PDFアップロード時にAIが自動生成します。手動で追加・編集も可能です。
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
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
                          type="button"
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
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
