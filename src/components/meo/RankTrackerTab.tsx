'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { card, inputStyle, primaryBtn, smallBtn, badge, ErrorBox } from '@/components/meo/ui';

interface Keyword {
  id: number;
  keyword: string;
  target_url: string | null;
}
interface RankLog {
  id: number;
  keyword: string;
  rank: number | null;
  impressions: number | null;
  clicks: number | null;
  source: string;
  logged_at: string;
}

export default function RankTrackerTab({ onCreateArticle }: { onCreateArticle: (kw: string) => void }) {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [logs, setLogs] = useState<RankLog[]>([]);
  const [newKw, setNewKw] = useState('');
  const [manualRank, setManualRank] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [kRes, lRes] = await Promise.all([fetch('/api/seo/keywords'), fetch('/api/seo/ranks')]);
      const kJson = await kRes.json();
      const lJson = await lRes.json();
      if (kRes.ok) setKeywords(kJson.keywords || []);
      if (lRes.ok) setLogs(lJson.logs || []);
    } catch {
      setError('読み込みに失敗しました');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addKeyword = async () => {
    if (!newKw.trim()) return;
    await fetch('/api/seo/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: newKw }),
    });
    setNewKw('');
    await load();
  };

  const removeKeyword = async (id: number) => {
    await fetch('/api/seo/keywords', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  const syncGsc = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/seo/ranks/sync-gsc', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) setSyncMsg(json.error || 'GSC同期に失敗しました');
      else setSyncMsg(`GSCから ${json.synced} 件の順位を記録しました`);
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const addManual = async (keyword: string) => {
    const v = manualRank[keyword];
    if (!v) return;
    await fetch('/api/seo/ranks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, rank: Number(v) }),
    });
    setManualRank((p) => ({ ...p, [keyword]: '' }));
    await load();
  };

  // キーワードごとのログ（時系列）
  const logsByKw = (kw: string) =>
    logs
      .filter((l) => l.keyword === kw && l.rank != null)
      .map((l) => ({
        date: new Date(l.logged_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
        rank: Number(l.rank),
        source: l.source,
      }));

  // 下落判定：最新が直前より順位が悪化（数値が増加）
  const isDropping = (kw: string): boolean => {
    const ls = logsByKw(kw);
    if (ls.length < 2) return false;
    return ls[ls.length - 1].rank > ls[ls.length - 2].rank + 0.5;
  };
  const latestRank = (kw: string): number | null => {
    const ls = logsByKw(kw);
    return ls.length ? ls[ls.length - 1].rank : null;
  };

  return (
    <div>
      <div style={{ ...card, marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>追跡キーワードを追加</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <input
            value={newKw}
            onChange={(e) => setNewKw(e.target.value)}
            placeholder="例）草津 皮膚科"
            style={{ ...inputStyle, marginTop: 0 }}
          />
          <button onClick={addKeyword} style={{ ...smallBtn, whiteSpace: 'nowrap' }}>
            追加
          </button>
        </div>
        <button onClick={syncGsc} disabled={syncing} style={primaryBtn}>
          {syncing ? 'GSC同期中…' : 'Search Consoleから順位を取得'}
        </button>
        {syncMsg && <p style={{ fontSize: 12, color: '#0f766e', marginTop: 8 }}>{syncMsg}</p>}
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          ※ GSCの平均掲載順位を推移として記録します。特定地点の実測順位は手入力（または将来の外部API連携）で補えます。
        </p>
      </div>

      {error && <ErrorBox message={error} />}
      {keywords.length === 0 && (
        <p style={{ color: '#94a3b8', fontSize: 14 }}>追跡キーワードを追加してください。</p>
      )}

      {keywords.map((k) => {
        const data = logsByKw(k.keyword);
        const dropping = isDropping(k.keyword);
        const latest = latestRank(k.keyword);
        return (
          <div key={k.id} style={{ ...card, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 700 }}>
                {k.keyword}
                {latest != null && (
                  <span style={{ fontSize: 13, color: '#475569', marginLeft: 8 }}>
                    平均 {latest.toFixed(1)} 位
                  </span>
                )}
                {dropping && <span style={{ ...badge, color: '#b91c1c', background: '#fee2e2', marginLeft: 8 }}>下落</span>}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {dropping && (
                  <button onClick={() => onCreateArticle(k.keyword)} style={{ ...smallBtn, color: '#0f766e' }}>
                    記事を作成
                  </button>
                )}
                <button onClick={() => removeKeyword(k.id)} style={{ ...smallBtn, color: '#b91c1c' }}>
                  削除
                </button>
              </div>
            </div>

            {data.length >= 2 ? (
              <div style={{ height: 160, marginTop: 8 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis reversed domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [`${v} 位`, '順位']} />
                    <Line type="monotone" dataKey="rank" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                ログが2件以上で推移グラフを表示します。
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <input
                type="number"
                placeholder="順位を手入力"
                value={manualRank[k.keyword] ?? ''}
                onChange={(e) => setManualRank((p) => ({ ...p, [k.keyword]: e.target.value }))}
                style={{ ...inputStyle, marginTop: 0, width: 140 }}
              />
              <button onClick={() => addManual(k.keyword)} style={smallBtn}>
                記録
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
