# 機能別デフォルト背景情報 設計書
作成日時: 2026-05-13 10:00 JST
ステータス: 📝 設計完了、実装未着手
推定工数: 半日〜1日（10機能対応のため）
優先度: 中（Phase3 着手前にやる価値あり）

---

## 0. 朝の自分・将来の自分へ

この設計書は、xLUMINA の各機能に「常に読み込ませたい背景情報」を機能ごとに固定設定できるようにする機能の設計書です。

「コンテキストライブラリで管理している情報を、各機能ページで毎回手で選ばずに、デフォルトで設定された組み合わせを自動で読み込ませたい」というのが、ユーザー（自分）の要望でした。

実装に入る前に必ず§1の要件と§3のDB設計を読んで、頭に入れること。実装ステップは§7にまとまっています。

---

## 1. 確定要件サマリー

| # | 要件 | 確定内容 |
|---|---|---|
| Q1 | 1機能あたりの設定可能数 | **無制限**（複数登録OK） |
| Q2 | ユーザー操作 | 機能画面で「初期値」として読み込まれ、ユーザーが毎回確認・調整可能 |
| Q3 | UI配置 | コンテキストライブラリの各カードに「この機能のデフォルトに追加」ボタン |
| Q4 | 対象機能 | 10機能（後述） |
| Q5 | 適用方法 | 画面に「現在の背景情報：◯◯」と表示しつつ、生成時に使われる |
| Q6 | データ保持 | **ハイブリッド型**（参照しつつコピーも保持。元データ消失時はコピーから復元） |

### 対象機能 一覧（10機能）

| キー | パス | 表示名 |
|---|---|---|
| `write` | `/dashboard/write` | 文章作成 |
| `lp-generator` | `/dashboard/lp-generator` | LP自動生成 |
| `kindle` | `/dashboard/kindle` | Kindle書籍生成 |
| `hr-studio` | `/dashboard/hr-studio` | 人材育成スタジオ |
| `email-generator` | `/dashboard/email-generator` | ステップメール |
| `copy-generator` | `/dashboard/copy-generator` | コピー生成 |
| `medical-studio` | `/dashboard/medical-studio` | 医療文書スタジオ |
| `business-studio` | `/dashboard/business-studio` | 収益化スタジオ |
| `nexus` | `/dashboard/nexus` | nexusブランドスタジオ |
| `hp-generator` | `/dashboard/hp-generator` | HP生成 |

---

## 2. ユーザー体験フロー（完成後イメージ）

### 設定フェーズ（コンテキストライブラリで）

```
1. /dashboard/context-library を開く
2. 「ヒンドゥー教の絶対身に付けた方が良い教え」カードを発見
3. カード下部の操作ボタン群を見る:
   [📋コピー] [✍️文章作成へ] [📱SNS投稿へ] [📄LP作成へ] [📊資料作成へ]
   [📌 デフォルト背景情報に追加 ▼]  ← 新規追加
4. 「📌 デフォルト背景情報に追加」をクリック
5. ドロップダウンが開いて、10機能のチェックボックスが出る:
   ☐ 文章作成
   ☑ Kindle書籍生成     ← チェック済み（既にデフォルト登録済み）
   ☐ ステップメール
   ...
6. 「ステップメール」にもチェックを入れる
7. 「保存」をクリック → トースト「✅ ステップメールのデフォルト背景情報に追加しました」
```

### 利用フェーズ（各機能画面で）

```
1. /dashboard/email-generator を開く
2. 画面上部に「📌 現在の背景情報（自動読み込み）」セクションが表示される
3. そこに「ヒンドゥー教の絶対身に付けた方が良い教え」が初期値として表示
4. ユーザーは:
   - そのまま使う → 生成ボタンを押すと、その背景情報を含めてAIに送信
   - 不要なら × ボタンで一時的に外す（次回起動時はまた表示）
   - 他のコンテキストを追加することも可能（その回のみ）
```

### データ消失耐性（Q6 ハイブリッド型の動き）

```
シナリオ：「ヒンドゥー教...」を Kindle のデフォルトに登録 → ライブラリから削除
1. 通常時：機能画面では、ライブラリの最新内容が反映される（参照型）
2. ライブラリで削除された場合:
   - 参照先が見つからない
   - 自動的にコピー保存していた内容を読み込む
   - 画面上に「⚠️ 元データが削除されています。コピーから復元中」と小さく表示
3. ユーザーが「コピーを正式に独立データとして救済」ボタンを押せる
   → ライブラリに復活させるか、機能専用データとして固定するか選べる
```

---

## 3. データベース設計

### 新規テーブル：`feature_default_contexts`

機能と背景情報の紐付け＋コピー保存を兼ねる中央テーブル。

```sql
CREATE TABLE feature_default_contexts (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,                   -- 'kindle' | 'write' | 'email-generator' ...
  
  -- 参照型（パターンA）
  context_save_id INTEGER REFERENCES context_saves(id) ON DELETE SET NULL,
  
  -- コピー型（パターンB の保険データ）
  topic_snapshot TEXT NOT NULL,                -- ライブラリ削除時のフォールバック
  context_text_snapshot TEXT NOT NULL,         -- 同上
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),       -- スナップショット作成日時
  
  -- 並び順管理
  display_order INTEGER DEFAULT 0,             -- ユーザーが並べ替え可能に
  
  -- メタ情報
  is_active BOOLEAN DEFAULT TRUE,              -- 一時的に無効化したい時用
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 同一ユーザー・機能・コンテキストの重複登録を防ぐ
  UNIQUE(user_id, feature_key, context_save_id)
);

-- インデックス
CREATE INDEX idx_fdc_user_feature ON feature_default_contexts(user_id, feature_key);
CREATE INDEX idx_fdc_active ON feature_default_contexts(is_active) WHERE is_active = TRUE;
```

### ハイブリッド読み込みロジック（API側で）

```typescript
// 機能ページ起動時の読み込みロジック擬似コード
async function loadDefaultContexts(userId: string, featureKey: string) {
  const rows = await sql`
    SELECT
      fdc.id,
      fdc.context_save_id,
      fdc.topic_snapshot,
      fdc.context_text_snapshot,
      fdc.snapshot_at,
      cs.topic AS current_topic,
      cs.context_text AS current_context_text,
      cs.updated_at AS current_updated_at
    FROM feature_default_contexts fdc
    LEFT JOIN context_saves cs ON cs.id = fdc.context_save_id AND cs.user_id = fdc.user_id
    WHERE fdc.user_id = ${userId}
      AND fdc.feature_key = ${featureKey}
      AND fdc.is_active = TRUE
    ORDER BY fdc.display_order ASC, fdc.created_at ASC
  `;
  
  return rows.map(row => {
    if (row.current_topic && row.current_context_text) {
      // 参照先が生きている → 最新を返す
      return {
        topic: row.current_topic,
        contextText: row.current_context_text,
        source: 'live',
      };
    } else {
      // 参照先が削除されている → スナップショットから復元
      return {
        topic: row.topic_snapshot,
        contextText: row.context_text_snapshot,
        source: 'snapshot',
        snapshotAt: row.snapshot_at,
      };
    }
  });
}
```

### スナップショット更新タイミング

スナップショットは「保険」なので、いつ更新するかが設計判断になります：

| 戦略 | メリット | デメリット | 採用 |
|---|---|---|---|
| 登録時のみ | シンプル | ライブラリ更新が反映されない | |
| 機能ページ表示のたび | 常に最新 | DB書き込みコスト高 | |
| **登録時 + 1日1回 cron** | バランスが良い | cron 実装が必要 | ✅ |

→ **採用**: 登録時にスナップショット作成 + 既存の cron インフラを流用して日次バックグラウンドで更新

---

## 4. API 設計

### 4-1. デフォルト背景情報の取得
```
GET /api/feature-default-contexts?feature=kindle
レスポンス: [{ id, topic, contextText, source: 'live'|'snapshot', snapshotAt? }]
```

### 4-2. デフォルト背景情報の追加
```
POST /api/feature-default-contexts
Body: { featureKey: 'kindle', contextSaveId: 5 }
動作:
  - context_saves から該当データを取得
  - feature_default_contexts に挿入（スナップショットも同時保存）
  - 重複時は409エラー
レスポンス: { id, success: true }
```

### 4-3. デフォルト背景情報の削除
```
DELETE /api/feature-default-contexts?id=123
```

### 4-4. 並び替え
```
PATCH /api/feature-default-contexts/reorder
Body: { featureKey: 'kindle', orderedIds: [3, 1, 5, 2] }
```

### 4-5. スナップショット更新（cron）
```
POST /api/cron/feature-contexts-snapshot
動作:
  - 全 feature_default_contexts レコードを走査
  - context_save_id が NULL でないものについて、context_saves の現在値を取得
  - topic_snapshot / context_text_snapshot を更新
  - snapshot_at を NOW() に
```

### 4-6. 一覧画面用：機能ごとの登録状態を一括取得
```
GET /api/feature-default-contexts/by-context-save?contextSaveId=5
レスポンス: { featureKeys: ['kindle', 'email-generator'] }
用途: コンテキストライブラリで各カードに「どの機能に登録済みか」を表示
```

---

## 5. UI 設計

### 5-1. コンテキストライブラリ画面（`/dashboard/context-library`）

各カード下部のボタン群に1つ追加：

```
現状:
[📋コピー] [✍️文章作成へ] [📱SNS投稿へ] [📄LP作成へ] [📊資料作成へ]                [🗑️削除]

追加後:
[📋コピー] [✍️文章作成へ] [📱SNS投稿へ] [📄LP作成へ] [📊資料作成へ] [📌 デフォルト設定 ▼] [🗑️削除]
                                                              ↑
                                                       クリックでドロップダウン
```

### 5-2. 「デフォルト設定」ドロップダウンUI

```
┌─────────────────────────────────────┐
│ 📌 このコンテキストをどの機能の        │
│    デフォルト背景情報にしますか？      │
├─────────────────────────────────────┤
│ ☐ ✍️ 文章作成                       │
│ ☑ 📚 Kindle書籍生成      ← 登録済    │
│ ☐ 🌱 人材育成スタジオ                 │
│ ☐ 📧 ステップメール                  │
│ ☐ 💬 コピー生成                      │
│ ☐ 📄 LP自動生成                      │
│ ☐ 🏥 医療文書スタジオ                 │
│ ☐ 💰 収益化スタジオ                  │
│ ☐ 🌐 nexusブランドスタジオ           │
│ ☐ 🏠 HP生成                          │
├─────────────────────────────────────┤
│              [キャンセル] [💾 保存]   │
└─────────────────────────────────────┘
```

### 5-3. 各機能ページの背景情報表示エリア

機能ページの上部（プロンプト入力欄の直前）に挿入：

```
┌─ 📌 現在の背景情報（デフォルト読み込み済み）─────────────┐
│                                                          │
│  [✅] ヒンドゥー教の絶対身に付けた方が良い教え      [×]   │
│  [✅] 仏教の絶対身に付けた方が良い教え              [×]   │
│  [⚠️] ユダヤ教の教え（コピーから復元）              [×]   │
│                                                          │
│  ＋ コンテキストを追加  |  設定を編集                    │
└──────────────────────────────────────────────────────────┘
```

- ☑ で一時的にON/OFF切り替え（その回のみ）
- × で一時的に外す（次回起動時はまた表示）
- ⚠️ アイコンで「コピーから復元中」を示す
- 「設定を編集」→ コンテキストライブラリの該当カードへジャンプ

---

## 6. 既存コードへの影響

### 影響を受けるファイル

| ファイル | 変更内容 | 工数感 |
|---|---|---|
| 新規 `/api/feature-default-contexts/route.ts` | POST/GET/DELETE | 中 |
| 新規 `/api/feature-default-contexts/reorder/route.ts` | PATCH | 小 |
| 新規 `/api/feature-default-contexts/by-context-save/route.ts` | GET | 小 |
| 新規 `/api/cron/feature-contexts-snapshot/route.ts` | POST | 中 |
| `/src/app/dashboard/context-library/page.tsx` | ボタン+ドロップダウン追加 | 中 |
| 新規 `/src/components/FeatureDefaultContextSelector.tsx` | ドロップダウンコンポーネント | 中 |
| 新規 `/src/components/DefaultContextBar.tsx` | 機能ページ上部の背景情報表示エリア | 中 |
| 各機能ページ × 10ファイル | `<DefaultContextBar />` を挿入＋プロンプト生成時に取り込み | 中 |
| `vercel.json` | cron 設定追加 | 小 |
| 新規 DB マイグレーション SQL | テーブル作成 | 小 |

### マイグレーションファイル例

```sql
-- migrations/2026-05-13_create_feature_default_contexts.sql
CREATE TABLE feature_default_contexts (
  -- §3 のスキーマをそのまま
);

CREATE INDEX idx_fdc_user_feature ON feature_default_contexts(user_id, feature_key);
CREATE INDEX idx_fdc_active ON feature_default_contexts(is_active) WHERE is_active = TRUE;
```

実行コマンド：
```bash
node scripts/run-migration.mjs migrations/2026-05-13_create_feature_default_contexts.sql
```

---

## 7. 実装ステップ（推奨順序）

### Phase A：基盤構築（2〜3時間）
1. DB マイグレーション SQL 作成・実行
2. `/api/feature-default-contexts` の CRUD API 4本を実装
3. Postman 等で API 単体テスト

### Phase B：コンテキストライブラリ側UI（1〜1.5時間）
4. `FeatureDefaultContextSelector` コンポーネント作成
5. `context-library/page.tsx` のカードに組み込み
6. 「どの機能に登録済みか」表示も追加
7. ライブラリ画面で動作確認

### Phase C：機能ページ側UI（2〜3時間、機能数次第）
8. `DefaultContextBar` コンポーネント作成
9. **まず1機能だけに導入**（推奨：`/dashboard/write` または `/dashboard/kindle`）
10. プロンプト生成時に背景情報を含める処理を追加
11. 動作確認・微調整
12. 残り9機能に展開（コピペで済むはず）

### Phase D：スナップショット cron（30分）
13. `/api/cron/feature-contexts-snapshot` を実装
14. `vercel.json` に cron 追加
15. 手動で1回叩いて動作確認

### Phase E：仕上げ（30分）
16. 引き継ぎ資料を更新
17. main にコミット・push
18. 本番で動作確認

**合計推定工数：6〜8時間 = 半日強**

---

## 8. リスクと対策

### リスク1：10機能の改修で時間が膨れる
- 対策：Phase C-9 で「まず1機能」を完成させてから、残り9を展開
- 1機能あたり実質15分以内のコピペ作業になるはず

### リスク2：既存の各機能ページの構造がバラバラ
- 対策：`DefaultContextBar` コンポーネントを汎用化
- props で `featureKey` を渡すだけで動く設計
- ページ側は1〜2行追加するだけで済むようにする

### リスク3：背景情報のトークン量がコスト圧迫
- 対策：背景情報の合計トークン数を表示
- 一定値（例：50,000トークン）超えたら警告

### リスク4：snapshot更新のタイミングずれ
- 対策：手動更新ボタンを「現在の背景情報」エリアに置く
- 「最新化」ボタンで即座に snapshot を更新可能に

---

## 9. やらないことリスト（スコープ外）

- ❌ 他人の背景情報設定の共有・コピー
- ❌ プロフィール文・ブランドガイドラインなどコンテキストライブラリ外データの登録（Q6で対象外と確認）
- ❌ 機能ごとの細かいプロンプトテンプレート連携（別機能）
- ❌ 既存の手動選択型「背景情報セレクタ」の廃止（共存する）

---

## 10. 完了基準（テスト項目）

実装完了とみなす条件：

- [ ] コンテキストライブラリで「Kindle」をデフォルトに追加できる
- [ ] Kindle 書籍生成ページを開くと、追加した背景情報が初期表示される
- [ ] その状態で書籍生成すると、背景情報を含めた出力になる
- [ ] ライブラリで該当データを削除しても、Kindle ページではコピーから復元表示される
- [ ] 「⚠️ コピーから復元」表示が出る
- [ ] 全10機能で同様に動く
- [ ] 1人のユーザーで複数機能に同一コンテキストを紐付けても問題ない
- [ ] cron が動いて snapshot が日次更新される

---

## 11. 引き継ぎ資料への反映

実装完了後、引き継ぎ資料に追記：

```
| 機能 | コミット | URL |
| 機能別デフォルト背景情報設定 | 完了 | /dashboard/context-library, 全10機能ページ |
```

DBテーブル一覧にも追加：
```
feature_default_contexts
```

---

## 12. 関連メモ

- 本日の引き継ぎ：`handover_20260512_2210.md`
- Phase3 設計メモ：`phase3_design_memo_20260512.md`
- 本機能は Phase3 着手前にやる価値あり（各機能の使い勝手が一気に上がる）

---

## 最後に

ここまでの設計に12問の確認とブラッシュアップを経た要件が反映されています。実装中に「あれ、これどうするんだっけ」と迷ったら、§1の要件サマリーに立ち返ること。

実装に着手するときは、§7の Phase A から順番に。

それでは、次のセッションで会いましょう ☀️
