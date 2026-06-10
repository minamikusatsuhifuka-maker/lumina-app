-- テキスト分析: 元の入力テキストを生成結果と一緒に保存する（案Y / v33）
-- 生成結果レコードに input_text を1本追加し、各結果が自分の入力を保持する。
-- 既存データは input_text = NULL のまま（非破壊）。
-- 実運用では saves/route.ts の ensureInputTextColumn() が冪等に追加するため、
-- このファイルは記録・手動適用用。
ALTER TABLE text_analysis_saves
  ADD COLUMN IF NOT EXISTS input_text TEXT;
