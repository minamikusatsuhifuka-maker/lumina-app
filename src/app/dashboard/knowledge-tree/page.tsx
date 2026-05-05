'use client';

import { useEffect, useState, useMemo } from 'react';

type SuggestedTitle = { title: string; reason: string; category: string; level: string };

type KnowledgeNode = {
  id: number;
  parent_id: number | null;
  topic: string;
  source_type: 'deepresearch' | 'notesearch' | string;
  summary: string | null;
  depth: number;
  suggested_titles: SuggestedTitle[] | null;
  created_at: string;
};

type TreeNode = KnowledgeNode & { children: TreeNode[] };

export default function KnowledgeTreePage() {
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);

  useEffect(() => {
    fetch('/api/knowledge/nodes')
      .then(r => r.ok ? r.json() : { nodes: [] })
      .then((data) => setNodes(data.nodes || []))
      .catch(() => setNodes([]))
      .finally(() => setLoading(false));
  }, []);

  const tree = useMemo<TreeNode[]>(() => {
    const buildTree = (parentId: number | null): TreeNode[] =>
      nodes
        .filter(n => n.parent_id === parentId)
        .map(n => ({ ...n, children: buildTree(n.id) }));
    return buildTree(null);
  }, [nodes]);

  const stats = useMemo(() => ({
    total: nodes.length,
    deepresearch: nodes.filter(n => n.source_type === 'deepresearch').length,
    notesearch: nodes.filter(n => n.source_type === 'notesearch').length,
    maxDepth: nodes.length > 0 ? Math.max(...nodes.map(n => n.depth)) : 0,
  }), [nodes]);

  const fmtDate = (s: string) => {
    try {
      const d = new Date(s);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return s;
    }
  };

  const depthBadge = (depth: number) => {
    const lv =
      depth >= 4 ? { bg: 'rgba(239,68,68,0.18)', color: '#ef4444', label: 'Lv.4 プロ' } :
      depth >= 3 ? { bg: 'rgba(245,158,11,0.18)', color: '#f59e0b', label: 'Lv.3 専門' } :
      depth >= 2 ? { bg: 'rgba(234,179,8,0.18)', color: '#ca8a04', label: 'Lv.2 応用' } :
      depth >= 1 ? { bg: 'rgba(29,158,117,0.18)', color: '#1D9E75', label: 'Lv.1 基礎' } :
      { bg: 'rgba(59,130,246,0.18)', color: '#3b82f6', label: 'Lv.0 入門' };
    return (
      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: lv.bg, color: lv.color, fontWeight: 700 }}>
        {lv.label}
      </span>
    );
  };

  const renderNode = (node: TreeNode, indent: number) => (
    <div key={node.id} style={{ marginLeft: indent * 22, marginTop: 6 }}>
      <div
        onClick={() => setSelectedNode(node)}
        style={{
          cursor: 'pointer',
          padding: 12,
          background: selectedNode?.id === node.id ? 'var(--accent-soft)' : 'var(--bg-primary)',
          border: selectedNode?.id === node.id ? '1px solid var(--accent)' : '1px solid var(--border)',
          borderLeft: `4px solid ${selectedNode?.id === node.id ? 'var(--accent)' : 'var(--border-accent)'}`,
          borderRadius: 10,
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 14 }}>{node.source_type === 'deepresearch' ? '🔭' : '📓'}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>
            {node.topic}
          </span>
          {depthBadge(node.depth)}
        </div>
        {node.summary && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
            {node.summary}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, opacity: 0.7 }}>
          📅 {fmtDate(node.created_at)}
        </div>
      </div>
      {node.children.map(child => renderNode(child, indent + 1))}
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🌳 知識ツリー</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          検索の繋がりを可視化。ノードをクリックすると関連タイトル案が確認できます。
        </p>
      </div>

      {/* 統計 */}
      {nodes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: '総検索数', value: stats.total, icon: '🔢' },
            { label: 'ディープリサーチ', value: stats.deepresearch, icon: '🔭' },
            { label: 'noteサーチ', value: stats.notesearch, icon: '📓' },
            { label: '最大深度', value: `Lv.${stats.maxDepth}`, icon: '🏆' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-primary))',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 14,
              textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: 18 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selectedNode ? '1fr 320px' : '1fr', gap: 16 }}>
        {/* ツリー表示 */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center' as const, padding: 48, color: 'var(--text-muted)' }}>
              読み込み中...
            </div>
          ) : nodes.length === 0 ? (
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              padding: 40,
              textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                まだ検索履歴がありません
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                ディープリサーチかnoteサーチを実行すると、ここにツリーが育ちます
              </div>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 8 }}>
                <a href="/dashboard/deepresearch" style={{ padding: '8px 16px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                  🔭 ディープリサーチ
                </a>
                <a href="/dashboard/note" style={{ padding: '8px 16px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                  📓 noteサーチ
                </a>
              </div>
            </div>
          ) : (
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
              maxHeight: '70vh',
              overflowY: 'auto' as const,
            }}>
              {tree.map(node => renderNode(node, 0))}
            </div>
          )}
        </div>

        {/* 選択ノード詳細 */}
        {selectedNode && (
          <div style={{ position: 'sticky' as const, top: 16, alignSelf: 'flex-start' }}>
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>📍 詳細</span>
                <button
                  onClick={() => setSelectedNode(null)}
                  style={{ width: 24, height: 24, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
                >✕</button>
              </div>

              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                {selectedNode.topic}
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                  {selectedNode.source_type === 'deepresearch' ? '🔭 ディープリサーチ' : '📓 noteサーチ'}
                </span>
                {depthBadge(selectedNode.depth)}
              </div>

              {selectedNode.summary && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: 10, borderRadius: 8, marginBottom: 12, lineHeight: 1.7 }}>
                  {selectedNode.summary}...
                </div>
              )}

              {selectedNode.suggested_titles && selectedNode.suggested_titles.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                    関連タイトル案
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                    {selectedNode.suggested_titles.map((t, i) => {
                      const lvColor =
                        t.level === 'プロ' ? { bg: 'rgba(239,68,68,0.18)', color: '#ef4444' } :
                        t.level === '専門' ? { bg: 'rgba(245,158,11,0.18)', color: '#f59e0b' } :
                        t.level === '応用' ? { bg: 'rgba(234,179,8,0.18)', color: '#ca8a04' } :
                        t.level === '基礎' ? { bg: 'rgba(29,158,117,0.18)', color: '#1D9E75' } :
                        { bg: 'rgba(59,130,246,0.18)', color: '#3b82f6' };
                      const params = new URLSearchParams({
                        q: t.title,
                        fromNode: String(selectedNode.id),
                        depth: String(selectedNode.depth + 1),
                      });
                      return (
                        <a
                          key={i}
                          href={`/dashboard/deepresearch?${params.toString()}`}
                          style={{
                            display: 'block',
                            padding: 8,
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            textDecoration: 'none',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 5, background: lvColor.bg, color: lvColor.color, fontWeight: 700, flexShrink: 0 }}>
                              {t.level}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>{t.title}</span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                <a
                  href={`/dashboard/deepresearch?q=${encodeURIComponent(selectedNode.topic)}${selectedNode.parent_id ? `&fromNode=${selectedNode.parent_id}&depth=${selectedNode.depth}` : ''}`}
                  style={{
                    padding: '8px 12px',
                    background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 12, fontWeight: 700, textDecoration: 'none', textAlign: 'center' as const,
                  }}
                >
                  🔭 このトピックを再リサーチ
                </a>
                <a
                  href={`/dashboard/note?q=${encodeURIComponent(selectedNode.topic)}${selectedNode.parent_id ? `&fromNode=${selectedNode.parent_id}&depth=${selectedNode.depth}` : ''}`}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--accent-soft)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-accent)', borderRadius: 8,
                    fontSize: 12, fontWeight: 700, textDecoration: 'none', textAlign: 'center' as const,
                  }}
                >
                  📓 noteサーチで再検索
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
