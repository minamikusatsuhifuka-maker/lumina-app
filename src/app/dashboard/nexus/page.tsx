'use client';

import { useEffect, useState } from 'react';
import { triggerDownload } from '@/lib/download';
import { renderMarkdown } from '@/lib/markdown-renderer';
import ContextSelector, {
  buildContextText,
  type ContextItem,
} from '@/components/ContextSelector';
import DefaultContextBar, {
  buildDefaultContextText,
  type DefaultContextItem,
} from '@/components/DefaultContextBar';
import ComputerUseTriggerButton from '@/components/ComputerUseTriggerButton';
import { buildWordPressPublishPrompt } from '@/lib/computeruse/prompts/wordpress-publish';

interface Service {
  name: string;
  description: string;
  price: string;
}

interface Achievement {
  title: string;
  value: string;
}

interface Testimonial {
  name: string;
  role: string;
  comment: string;
}

interface Brand {
  id: number;
  brand_name: string;
  tagline: string;
  description: string;
  owner_name: string;
  owner_profile: string;
  services: Service[];
  achievements: Achievement[];
  testimonials: Testimonial[];
  sns_links: Record<string, string>;
  color_theme: string;
}

interface BlogPost {
  id: number;
  title: string;
  content: string;
  excerpt: string;
  category: string;
  status: string;
  source_type: string;
  created_at: string;
}

interface BrandForm {
  brandName: string;
  tagline: string;
  description: string;
  ownerName: string;
  ownerProfile: string;
  colorTheme: string;
  services: Service[];
  achievements: Achievement[];
  testimonials: Testimonial[];
  snsLinks: Record<string, string>;
}

const COLOR_THEMES = [
  { id: 'dark', label: '🌑 ダーク', bg: '#0a0a0a', accent: '#6366f1' },
  { id: 'light', label: '☀️ ライト', bg: '#ffffff', accent: '#4f46e5' },
  { id: 'gradient', label: '🌌 グラデーション', bg: '#0f0c29', accent: '#a855f7' },
];

const PAGE_TYPES = [
  { id: 'top', label: '🏠 トップページ', desc: 'ブランドの顔・ヒーロー・実績・CTA' },
  { id: 'lp', label: '💰 サービスLP', desc: 'コンサル・コーチングの申込みページ' },
  { id: 'profile', label: '👤 プロフィール', desc: 'オーナーの詳細プロフィール' },
  { id: 'blog_index', label: '📝 ブログ一覧', desc: 'ブログ記事一覧ページ' },
];

const BLOG_CATEGORIES = [
  'AI活用',
  'コーチング',
  '収益化',
  '人材育成',
  'マインドセット',
  'ビジネス戦略',
];

const DEFAULT_FORM: BrandForm = {
  brandName: 'nexus',
  tagline: 'AIで、あなたの可能性を最大化する',
  description: '',
  ownerName: '',
  ownerProfile: '',
  colorTheme: 'dark',
  services: [{ name: '', description: '', price: '' }],
  achievements: [{ title: '', value: '' }],
  testimonials: [{ name: '', role: '', comment: '' }],
  snsLinks: { twitter: '', instagram: '', youtube: '', note: '' },
};

export default function NexusPage() {
  const [activeTab, setActiveTab] = useState<'brand' | 'site' | 'blog'>('brand');
  const [brand, setBrand] = useState<Brand | null>(null);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [brandForm, setBrandForm] = useState<BrandForm>(DEFAULT_FORM);

  // サイト生成
  const [selectedPageType, setSelectedPageType] = useState('top');
  const [isGeneratingSite, setIsGeneratingSite] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [nexusContexts, setNexusContexts] = useState<ContextItem[]>([]);
  const [defaultContexts, setDefaultContexts] = useState<DefaultContextItem[]>([]);

  // ブログ
  const [blogMode, setBlogMode] = useState<'list' | 'write' | 'edit'>('list');
  const [blogWriteMode, setBlogWriteMode] = useState<'theme' | 'research'>(
    'theme',
  );
  const [blogTheme, setBlogTheme] = useState('');
  const [researchText, setResearchText] = useState('');
  const [isWritingBlog, setIsWritingBlog] = useState(false);
  const [blogStreamText, setBlogStreamText] = useState('');
  const [generatedBlog, setGeneratedBlog] = useState('');
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('AI活用');
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void loadBrand();
    void loadBlogPosts();

    // ディープリサーチからの連携
    const fromResearch =
      new URLSearchParams(window.location.search).get('from') ===
      'deepresearch';
    if (fromResearch) {
      const text = sessionStorage.getItem('nexusBlogResearch');
      if (text) {
        setResearchText(text);
        setBlogWriteMode('research');
        setActiveTab('blog');
        setBlogMode('write');
        sessionStorage.removeItem('nexusBlogResearch');
        sessionStorage.removeItem('nexusBlogTopic');
      }
    }
  }, []);

  const loadBrand = async () => {
    try {
      const res = await fetch('/api/nexus/brand');
      if (!res.ok) return;
      const { brand: b } = await res.json();
      if (b) {
        setBrand(b);
        setBrandForm({
          brandName: b.brand_name ?? 'nexus',
          tagline: b.tagline ?? '',
          description: b.description ?? '',
          ownerName: b.owner_name ?? '',
          ownerProfile: b.owner_profile ?? '',
          colorTheme: b.color_theme ?? 'dark',
          services:
            Array.isArray(b.services) && b.services.length > 0
              ? b.services
              : [{ name: '', description: '', price: '' }],
          achievements:
            Array.isArray(b.achievements) && b.achievements.length > 0
              ? b.achievements
              : [{ title: '', value: '' }],
          testimonials:
            Array.isArray(b.testimonials) && b.testimonials.length > 0
              ? b.testimonials
              : [{ name: '', role: '', comment: '' }],
          snsLinks: b.sns_links ?? {
            twitter: '',
            instagram: '',
            youtube: '',
            note: '',
          },
        });
      }
    } catch {
      /* skip */
    }
  };

  const loadBlogPosts = async () => {
    try {
      const res = await fetch('/api/nexus/blog');
      if (!res.ok) return;
      const data = await res.json();
      setBlogPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch {
      /* skip */
    }
  };

  const handleSaveBrand = async () => {
    setIsSavingBrand(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/nexus/brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandForm),
      });
      if (!res.ok) {
        setErrorMessage('保存に失敗しました');
        return;
      }
      const { brand: saved } = await res.json();
      setBrand(saved);
      alert('✅ ブランド情報を保存しました');
    } catch {
      setErrorMessage('保存に失敗しました');
    } finally {
      setIsSavingBrand(false);
    }
  };

  const handleGenerateSite = async () => {
    if (!brand) {
      setErrorMessage('先にブランド情報を保存してください');
      return;
    }
    setIsGeneratingSite(true);
    setGeneratedHtml('');
    setErrorMessage('');

    try {
      const res = await fetch('/api/nexus/generate-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          pageType: selectedPageType,
          blogPosts: blogPosts
            .filter((p) => p.status === 'published')
            .slice(0, 6),
          contextInfo: [buildDefaultContextText(defaultContexts), buildContextText(nexusContexts)].filter(Boolean).join('\n\n---\n\n'),
        }),
      });
      if (!res.ok) {
        setErrorMessage('サイト生成に失敗しました');
        return;
      }
      const { html } = await res.json();
      setGeneratedHtml(html);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`通信エラー: ${msg}`);
    } finally {
      setIsGeneratingSite(false);
    }
  };

  const handleDownloadHtml = () => {
    triggerDownload(`nexus-${selectedPageType}-${new Date().toISOString().slice(0, 10)}.html`, generatedHtml, 'text/html; charset=utf-8');
  };

  const handleWriteBlog = async () => {
    if (blogWriteMode === 'theme' && !blogTheme.trim()) {
      setErrorMessage('テーマを入力してください');
      return;
    }
    if (blogWriteMode === 'research' && !researchText.trim()) {
      setErrorMessage('リサーチ内容を入力してください');
      return;
    }

    setIsWritingBlog(true);
    setGeneratedBlog('');
    setBlogStreamText('');
    setErrorMessage('');

    try {
      const res = await fetch('/api/nexus/write-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: blogWriteMode,
          theme: blogTheme,
          researchText,
          brandInfo: brand,
          contextInfo: [buildDefaultContextText(defaultContexts), buildContextText(nexusContexts)].filter(Boolean).join('\n\n---\n\n'),
        }),
      });

      if (!res.ok || !res.body) {
        setErrorMessage('記事生成に失敗しました');
        setIsWritingBlog(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'delta') {
                fullText += event.text;
                setBlogStreamText(fullText);
              } else if (event.type === 'done') {
                setGeneratedBlog(fullText);
                setBlogStreamText('');
              } else if (event.type === 'error') {
                setErrorMessage(event.message ?? '生成エラー');
              }
            } catch {
              /* skip */
            }
          }
        }
      }
      // doneが来なかった場合の保険
      if (fullText && !generatedBlog) {
        setGeneratedBlog(fullText);
        setBlogStreamText('');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`通信エラー: ${msg}`);
    } finally {
      setIsWritingBlog(false);
    }
  };

  const handleSaveBlogPost = async (
    status: 'draft' | 'published' = 'draft',
  ) => {
    if (!generatedBlog) return;
    setIsSavingPost(true);
    setErrorMessage('');

    // タイトルを記事の最初の行から取得
    const firstLine = generatedBlog.split('\n').find((l) => l.trim());
    const title =
      firstLine?.replace(/^#+\s*/, '') || blogTheme || 'ブログ記事';
    const excerpt = generatedBlog
      .slice(0, 300)
      .replace(/#+\s*/g, '')
      .trim()
      .slice(0, 200);

    try {
      await fetch('/api/nexus/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: generatedBlog,
          excerpt,
          category: selectedCategory,
          status,
          sourceType:
            blogWriteMode === 'research' ? 'deepresearch' : 'theme_input',
        }),
      });
      await loadBlogPosts();
      setBlogMode('list');
      setGeneratedBlog('');
      setBlogStreamText('');
      setBlogTheme('');
      setResearchText('');
    } catch {
      setErrorMessage('保存に失敗しました');
    } finally {
      setIsSavingPost(false);
    }
  };

  const displayBlogText = blogStreamText || generatedBlog;

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 28 }}>🌐</span>
          nexus ブランドスタジオ
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            marginTop: 4,
          }}
        >
          AIコンサル・コーチングブランドのサイト生成・ブログ自動化
        </p>
      </div>

      {/* タブ */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--border)',
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        {(
          [
            { id: 'brand' as const, label: '⚙️ ブランド設定' },
            { id: 'site' as const, label: '🌐 サイト生成' },
            {
              id: 'blog' as const,
              label: `📝 ブログ管理（${blogPosts.length}件）`,
            },
          ]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              fontSize: 14,
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom:
                activeTab === tab.id
                  ? '2px solid #6366f1'
                  : '2px solid transparent',
              color:
                activeTab === tab.id ? '#6366f1' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              background: 'none',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {errorMessage && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: 16,
            fontSize: 13,
            color: '#dc2626',
            background: 'rgba(220,38,38,0.06)',
            border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 8,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* ブランド設定タブ */}
      {activeTab === 'brand' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 基本情報 */}
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: 'var(--text-primary)' }}>
              📌 基本情報
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {(
                [
                  {
                    key: 'brandName' as const,
                    label: 'ブランド名',
                    placeholder: 'nexus',
                  },
                  {
                    key: 'ownerName' as const,
                    label: 'オーナー名',
                    placeholder: '山田 太郎',
                  },
                  {
                    key: 'tagline' as const,
                    label: 'タグライン',
                    placeholder: 'AIで、あなたの可能性を最大化する',
                  },
                ]
              ).map((field) => (
                <div key={field.key}>
                  <label
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      display: 'block',
                      marginBottom: 4,
                    }}
                  >
                    {field.label}
                  </label>
                  <input
                    value={brandForm[field.key]}
                    onChange={(e) =>
                      setBrandForm((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 13,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <label
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                ブランド説明
              </label>
              <textarea
                value={brandForm.description}
                onChange={(e) =>
                  setBrandForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="nexusはAIを活用した個人事業の収益化・人材育成を支援するコンサル・コーチングブランドです..."
                rows={3}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  resize: 'vertical',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <label
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                プロフィール
              </label>
              <textarea
                value={brandForm.ownerProfile}
                onChange={(e) =>
                  setBrandForm((prev) => ({
                    ...prev,
                    ownerProfile: e.target.value,
                  }))
                }
                placeholder="皮膚科専門医・AIコンサルタント。医療×AIの融合で新しい価値を創造..."
                rows={4}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  resize: 'vertical',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {/* カラーテーマ */}
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
              🎨 カラーテーマ
            </h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {COLOR_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setBrandForm((prev) => ({ ...prev, colorTheme: t.id }))
                  }
                  style={{
                    flex: 1,
                    minWidth: 140,
                    padding: '12px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: `2px solid ${brandForm.colorTheme === t.id ? t.accent : 'var(--border)'}`,
                    background: t.bg,
                    color: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{t.label.split(' ')[0]}</span>
                  <span style={{ fontSize: 12 }}>{t.label.split(' ')[1]}</span>
                  <div
                    style={{
                      width: 24,
                      height: 4,
                      borderRadius: 2,
                      background: t.accent,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* サービス */}
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>💼 サービス</h3>
              <button
                type="button"
                onClick={() =>
                  setBrandForm((prev) => ({
                    ...prev,
                    services: [
                      ...prev.services,
                      { name: '', description: '', price: '' },
                    ],
                  }))
                }
                style={{
                  fontSize: 12,
                  padding: '5px 10px',
                  background: '#6366f1',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                ＋ 追加
              </button>
            </div>
            {brandForm.services.map((service, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 3fr 1fr auto',
                  gap: 8,
                  marginBottom: 8,
                  alignItems: 'start',
                }}
              >
                <input
                  value={service.name}
                  onChange={(e) => {
                    const next = [...brandForm.services];
                    next[i] = { ...next[i], name: e.target.value };
                    setBrandForm((prev) => ({ ...prev, services: next }));
                  }}
                  placeholder="サービス名"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <input
                  value={service.description}
                  onChange={(e) => {
                    const next = [...brandForm.services];
                    next[i] = { ...next[i], description: e.target.value };
                    setBrandForm((prev) => ({ ...prev, services: next }));
                  }}
                  placeholder="説明"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <input
                  value={service.price}
                  onChange={(e) => {
                    const next = [...brandForm.services];
                    next[i] = { ...next[i], price: e.target.value };
                    setBrandForm((prev) => ({ ...prev, services: next }));
                  }}
                  placeholder="価格"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setBrandForm((prev) => ({
                      ...prev,
                      services: prev.services.filter((_, idx) => idx !== i),
                    }))
                  }
                  style={{
                    padding: '6px 8px',
                    background: 'none',
                    border: '1px solid #fca5a5',
                    borderRadius: 6,
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* 実績 */}
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>🏆 実績・数字</h3>
              <button
                type="button"
                onClick={() =>
                  setBrandForm((prev) => ({
                    ...prev,
                    achievements: [
                      ...prev.achievements,
                      { title: '', value: '' },
                    ],
                  }))
                }
                style={{
                  fontSize: 12,
                  padding: '5px 10px',
                  background: '#6366f1',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                ＋ 追加
              </button>
            </div>
            {brandForm.achievements.map((ach, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr auto',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  value={ach.title}
                  onChange={(e) => {
                    const next = [...brandForm.achievements];
                    next[i] = { ...next[i], title: e.target.value };
                    setBrandForm((prev) => ({
                      ...prev,
                      achievements: next,
                    }));
                  }}
                  placeholder="実績タイトル（例：サポート実績）"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <input
                  value={ach.value}
                  onChange={(e) => {
                    const next = [...brandForm.achievements];
                    next[i] = { ...next[i], value: e.target.value };
                    setBrandForm((prev) => ({
                      ...prev,
                      achievements: next,
                    }));
                  }}
                  placeholder="数値（例：200名以上）"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setBrandForm((prev) => ({
                      ...prev,
                      achievements: prev.achievements.filter(
                        (_, idx) => idx !== i,
                      ),
                    }))
                  }
                  style={{
                    padding: '6px 8px',
                    background: 'none',
                    border: '1px solid #fca5a5',
                    borderRadius: 6,
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* SNSリンク */}
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
              🔗 SNSリンク
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 10,
              }}
            >
              {(['twitter', 'instagram', 'youtube', 'note'] as const).map(
                (sns) => (
                  <div key={sns}>
                    <label
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        display: 'block',
                        marginBottom: 4,
                        textTransform: 'capitalize',
                      }}
                    >
                      {sns}
                    </label>
                    <input
                      value={brandForm.snsLinks[sns] ?? ''}
                      onChange={(e) =>
                        setBrandForm((prev) => ({
                          ...prev,
                          snsLinks: {
                            ...prev.snsLinks,
                            [sns]: e.target.value,
                          },
                        }))
                      }
                      placeholder={`https://${sns}.com/...`}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: 13,
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                ),
              )}
            </div>
          </div>

          {/* 保存ボタン */}
          <button
            type="button"
            onClick={handleSaveBrand}
            disabled={isSavingBrand}
            style={{
              padding: '14px',
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              cursor: isSavingBrand ? 'not-allowed' : 'pointer',
              opacity: isSavingBrand ? 0.5 : 1,
            }}
          >
            {isSavingBrand ? '保存中...' : '💾 ブランド情報を保存する'}
          </button>
        </div>
      )}

      {/* サイト生成タブ */}
      {activeTab === 'site' && (
        <div>
          {/* ページタイプ選択 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            {PAGE_TYPES.map((pt) => {
              const active = selectedPageType === pt.id;
              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => setSelectedPageType(pt.id)}
                  style={{
                    padding: '14px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                    border: `2px solid ${active ? '#6366f1' : 'var(--border)'}`,
                    background: active
                      ? 'rgba(99,102,241,0.08)'
                      : 'var(--bg-primary)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: 4,
                    }}
                  >
                    {pt.label}
                  </div>
                  <div
                    style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                  >
                    {pt.desc}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleGenerateSite}
            disabled={isGeneratingSite || !brand}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: 15,
              fontWeight: 600,
              background: isGeneratingSite ? '#9ca3af' : '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              cursor: isGeneratingSite || !brand ? 'not-allowed' : 'pointer',
              marginBottom: 20,
              opacity: !brand ? 0.4 : 1,
            }}
          >
            {isGeneratingSite
              ? '🌐 生成中（30〜60秒）...'
              : `🌐 ${PAGE_TYPES.find((p) => p.id === selectedPageType)?.label}を生成する`}
          </button>
          {!brand && (
            <p
              style={{
                fontSize: 12,
                color: '#ef4444',
                textAlign: 'center',
                marginTop: -16,
                marginBottom: 16,
              }}
            >
              先にブランド設定タブで情報を保存してください
            </p>
          )}

          {generatedHtml && (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  ✅ 生成完了
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setPreviewMode(!previewMode)}
                    style={{
                      fontSize: 12,
                      padding: '6px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      background: previewMode
                        ? '#6366f1'
                        : 'var(--bg-primary)',
                      color: previewMode ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {previewMode ? '📄 コード表示' : '👁 プレビュー'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadHtml}
                    style={{
                      fontSize: 12,
                      padding: '6px 12px',
                      background: '#059669',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    ⬇️ HTMLダウンロード
                  </button>
                </div>
              </div>
              {previewMode ? (
                <iframe
                  srcDoc={generatedHtml}
                  style={{ width: '100%', height: 600, border: 'none' }}
                  title="nexusサイトプレビュー"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <textarea
                  value={generatedHtml}
                  onChange={(e) => setGeneratedHtml(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    height: 400,
                    fontFamily: 'monospace',
                    fontSize: 11,
                    padding: 16,
                    border: 'none',
                    resize: 'vertical',
                    background: '#1e1e2e',
                    color: '#cdd6f4',
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ブログ管理タブ */}
      {activeTab === 'blog' && (
        <div>
          {blogMode === 'list' && (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                  📝 ブログ記事一覧
                </h3>
                <button
                  type="button"
                  onClick={() => setBlogMode('write')}
                  style={{
                    padding: '8px 16px',
                    background: '#6366f1',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ＋ 新しい記事を書く
                </button>
              </div>
              {blogPosts.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    border: '2px dashed var(--border)',
                    borderRadius: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📝</div>
                  <p>まだブログ記事がありません</p>
                  <p style={{ fontSize: 12, marginTop: 4 }}>
                    AIを使って自動的に記事を生成できます
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {blogPosts.map((post) => (
                    <div
                      key={post.id}
                      style={{
                        padding: '14px 16px',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        background: 'var(--bg-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            marginBottom: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {post.title}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background:
                                post.status === 'published'
                                  ? '#d1fae5'
                                  : '#f3f4f6',
                              color:
                                post.status === 'published'
                                  ? '#065f46'
                                  : '#6b7280',
                            }}
                          >
                            {post.status === 'published'
                              ? '✅ 公開中'
                              : '📝 下書き'}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {post.category}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {new Date(post.created_at).toLocaleDateString(
                              'ja-JP',
                            )}
                          </span>
                          {post.source_type === 'deepresearch' && (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: '#ede9fe',
                                color: '#5b21b6',
                              }}
                            >
                              🔍 リサーチ連携
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          marginLeft: 12,
                          flexShrink: 0,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPost(post);
                            setBlogMode('edit');
                          }}
                          style={{
                            fontSize: 12,
                            padding: '5px 10px',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            background: 'var(--bg-primary)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          ✏️ 編集
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm('削除しますか？')) return;
                            await fetch(
                              `/api/nexus/blog?id=${post.id}`,
                              { method: 'DELETE' },
                            );
                            void loadBlogPosts();
                          }}
                          style={{
                            fontSize: 12,
                            padding: '5px 10px',
                            border: '1px solid #fca5a5',
                            borderRadius: 6,
                            color: '#ef4444',
                            background: 'var(--bg-primary)',
                            cursor: 'pointer',
                          }}
                        >
                          🗑
                        </button>
                        <ComputerUseTriggerButton
                          label="🤖 WordPress自動投稿"
                          confirmMessage={`「${post.title}」をWordPressに自動投稿します。よろしいですか？`}
                          buildJob={() => {
                            const wpUrl = (typeof window !== 'undefined' && localStorage.getItem('computeruse_wp_url')) || '';
                            const wpUsername = (typeof window !== 'undefined' && localStorage.getItem('computeruse_wp_username')) || 'admin';
                            const wpPassword = (typeof window !== 'undefined' && localStorage.getItem('computeruse_wp_password')) || '';
                            if (!wpUrl || !wpPassword) {
                              throw new Error('WordPress接続設定がありません。ngrok URL等を localStorage に保存してください（computeruse_wp_url, computeruse_wp_username, computeruse_wp_password）');
                            }
                            const prompt = buildWordPressPublishPrompt({
                              wpUrl,
                              wpUsername,
                              wpPassword,
                              title: post.title,
                              contentHtml: post.content,
                              category: post.category,
                            });
                            return {
                              taskType: 'wordpress_publish',
                              targetService: 'wordpress',
                              sourceId: String(post.id),
                              params: { wpUrl, title: post.title, category: post.category },
                              prompt,
                            };
                          }}
                          onCompleted={() => { void loadBlogPosts(); }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {blogMode === 'write' && (
            <div>
              <button
                type="button"
                onClick={() => setBlogMode('list')}
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: 16,
                }}
              >
                ← 一覧に戻る
              </button>

              {/* 執筆モード選択 */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 16,
                  flexWrap: 'wrap',
                }}
              >
                {(
                  [
                    {
                      id: 'theme' as const,
                      label: '✏️ テーマを入力',
                      desc: 'キーワードからAIが全自動執筆',
                    },
                    {
                      id: 'research' as const,
                      label: '🔍 リサーチ連携',
                      desc: 'ディープリサーチ結果から記事化',
                    },
                  ]
                ).map((mode) => {
                  const active = blogWriteMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setBlogWriteMode(mode.id)}
                      style={{
                        flex: 1,
                        minWidth: 200,
                        padding: '12px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        textAlign: 'left',
                        border: `2px solid ${active ? '#6366f1' : 'var(--border)'}`,
                        background: active
                          ? 'rgba(99,102,241,0.08)'
                          : 'var(--bg-primary)',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          marginBottom: 2,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {mode.label}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {mode.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 入力エリア */}
              {blogWriteMode === 'theme' ? (
                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      display: 'block',
                      marginBottom: 6,
                    }}
                  >
                    テーマ・キーワード
                  </label>
                  <input
                    value={blogTheme}
                    onChange={(e) => setBlogTheme(e.target.value)}
                    placeholder="例：AIを使って個人事業を月10万円収益化する方法"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      fontSize: 14,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      marginTop: 8,
                    }}
                  >
                    {BLOG_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() =>
                          setBlogTheme((prev) =>
                            prev ? `${prev}、${cat}` : cat,
                          )
                        }
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      display: 'block',
                      marginBottom: 6,
                    }}
                  >
                    リサーチ内容を貼り付けてください
                  </label>
                  <textarea
                    value={researchText}
                    onChange={(e) => setResearchText(e.target.value)}
                    placeholder="ディープリサーチの結果、またはまとめたい内容を貼り付けてください..."
                    rows={6}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      fontSize: 13,
                      resize: 'vertical',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              )}

              {/* カテゴリ選択 */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  カテゴリ
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {BLOG_CATEGORIES.map((cat) => {
                    const active = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        style={{
                          fontSize: 12,
                          padding: '5px 12px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: active ? '#6366f1' : 'var(--bg-secondary)',
                          color: active ? '#fff' : 'var(--text-secondary)',
                          border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`,
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 機能別デフォルト背景情報（自動読み込み） */}
              <DefaultContextBar featureKey="nexus" onChange={setDefaultContexts} />
              {/* 背景情報セレクタ（blog/nexus両方の背景情報をサポート） */}
              <ContextSelector featureKey="blog" onSelect={setNexusContexts} />

              {/* 執筆ボタン */}
              <button
                type="button"
                onClick={handleWriteBlog}
                disabled={isWritingBlog}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: isWritingBlog ? '#9ca3af' : '#6366f1',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  cursor: isWritingBlog ? 'not-allowed' : 'pointer',
                  marginBottom: 20,
                }}
              >
                {isWritingBlog
                  ? '✍️ 執筆中（30〜60秒）...'
                  : '✍️ AIで記事を自動執筆する'}
              </button>

              {/* 生成結果 */}
              {displayBlogText && (
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 16px',
                      background: 'var(--bg-secondary)',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {isWritingBlog ? '✍️ 記事生成中...' : '✅ 記事生成完了'}
                    </span>
                    {generatedBlog && !isWritingBlog && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleSaveBlogPost('draft')}
                          disabled={isSavingPost}
                          style={{
                            fontSize: 12,
                            padding: '5px 10px',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            background: 'var(--bg-primary)',
                            color: 'var(--text-secondary)',
                            cursor: isSavingPost ? 'not-allowed' : 'pointer',
                            opacity: isSavingPost ? 0.5 : 1,
                          }}
                        >
                          💾 下書き保存
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveBlogPost('published')}
                          disabled={isSavingPost}
                          style={{
                            fontSize: 12,
                            padding: '5px 10px',
                            background: '#059669',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            cursor: isSavingPost ? 'not-allowed' : 'pointer',
                            opacity: isSavingPost ? 0.5 : 1,
                          }}
                        >
                          ✅ 公開する
                        </button>
                      </div>
                    )}
                  </div>
                  {isWritingBlog ? (
                    <div
                      style={{
                        padding: 20,
                        fontSize: 13,
                        lineHeight: 1.8,
                        whiteSpace: 'pre-wrap',
                        maxHeight: 600,
                        overflowY: 'auto',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-primary)',
                      }}
                    >
                      {displayBlogText}
                      <span
                        style={{
                          display: 'inline-block',
                          width: 6,
                          height: 14,
                          background: '#6366f1',
                          marginLeft: 2,
                          animation: 'pulse 0.8s infinite',
                          verticalAlign: 'middle',
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      className="markdown-body"
                      style={{
                        padding: 20,
                        fontSize: 13,
                        maxHeight: 600,
                        overflowY: 'auto',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-primary)',
                      }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(displayBlogText) }}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {blogMode === 'edit' && editingPost && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setBlogMode('list');
                  setEditingPost(null);
                }}
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: 16,
                }}
              >
                ← 一覧に戻る
              </button>
              <div style={{ marginBottom: 12 }}>
                <input
                  value={editingPost.title}
                  onChange={(e) =>
                    setEditingPost((prev) =>
                      prev ? { ...prev, title: e.target.value } : null,
                    )
                  }
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 16,
                    fontWeight: 600,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <textarea
                value={editingPost.content}
                onChange={(e) =>
                  setEditingPost((prev) =>
                    prev ? { ...prev, content: e.target.value } : null,
                  )
                }
                rows={25}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '14px',
                  fontSize: 13,
                  lineHeight: 1.8,
                  resize: 'vertical',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!editingPost) return;
                    await fetch('/api/nexus/blog', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        id: editingPost.id,
                        title: editingPost.title,
                        content: editingPost.content,
                        status: 'draft',
                      }),
                    });
                    void loadBlogPosts();
                    setBlogMode('list');
                    setEditingPost(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  💾 下書き保存
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!editingPost) return;
                    await fetch('/api/nexus/blog', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        id: editingPost.id,
                        title: editingPost.title,
                        content: editingPost.content,
                        status: 'published',
                      }),
                    });
                    void loadBlogPosts();
                    setBlogMode('list');
                    setEditingPost(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ✅ 公開する
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
