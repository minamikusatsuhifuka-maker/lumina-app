-- GA4スナップショットにAI分析結果保存用カラムを追加
-- 実行: psql または Neon コンソールで実行

-- ai_insight: AI分析結果全体（課題分析・アクションプラン・マーケ施策・xLUMINA活用）
ALTER TABLE ga_snapshots
  ADD COLUMN IF NOT EXISTS ai_insight jsonb;

-- channel_breakdown: チャネル別セッションデータ（既存ならスキップ）
ALTER TABLE ga_snapshots
  ADD COLUMN IF NOT EXISTS channel_breakdown jsonb;

-- top_pages: 人気ページTOP10（既存ならスキップ）
ALTER TABLE ga_snapshots
  ADD COLUMN IF NOT EXISTS top_pages jsonb;

-- saved_at: AI分析の保存日時（NULLなら未保存）
ALTER TABLE ga_snapshots
  ADD COLUMN IF NOT EXISTS saved_at timestamptz;
