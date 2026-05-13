# xLUMINA Phase3 完全構想書 v4
作成日時: 2026-05-13 21:45 JST
前版: phase3_design_memo_v3_20260513.md
ステータス: Phase3 B-3 大部分完成（明日：プロンプト最適化のみ）

## 0. 朝の自分・将来の自分へ

これは Phase3 の完全構想書 v4 です。v3 からの主な更新点：

- Phase3 B-3 通信層完全実装（API, Worker, UI）
- Anthropic Computer Use API 統合完成（Docker exec 経由）
- UI ボタンから本物のジョブ投入確認
- WordPress 管理画面ログインまで実機到達確認
- プロンプト最適化＋タイムアウト延長で B-3 完成見込み

今夜の最大の成果：B-3 タスクの約 90% を完了。
明日：30〜60分でB-3完成（§A 参照）。

## 5/13 一日の達成タイムライン

- 朝: 機能別デフォルト背景情報実装（19ファイル / 924行）
- 13:00: Phase3 Hello World 達成
- 19:11: Hello World 第2弾達成（Computer Use → ngrok → WordPress）
- 20:05〜: feature/computeruse-wordpress 実装開始
- 20:22: API + Worker v1 動作確認（Job #2）
- 20:42: UI ボタン動作確認（Job #3）
- 20:58: Worker v2 で本物の Computer Use 完全動作（Job #5、6.9秒）★
- 21:22: UI から WordPress 投稿テスト（Job #6、ログイン到達）
- 21:40: Docker stop で強制終了
- 21:45: 構想書 v4 完成

合計：約24時間連続セッション

## Phase3 B-3 の完成度

### 完了済み

- DBマイグレーション computeruse_sessions
- /api/computeruse/jobs API（GET/POST/PATCH）
- lib/computeruse/client.ts
- lib/computeruse/prompts/wordpress-publish.ts
- Worker v2（compute_use_worker.py + docker exec）
- run_task.py（Docker内 sampling_loop ラッパー）
- ComputerUseTriggerButton.tsx
- /dashboard/nexus への組み込み
- localStorage WordPress 設定
- ngrok 経由 WordPress ログイン（Claude が自力突破）

### 残作業（明日 30〜60分）

1. プロンプト 1874字 → 500字に短縮、11ステップ → 6ステップ
2. TASK_TIMEOUT_SECONDS を 1200 に延長（10分→20分）
3. 公開フロー完走テスト

## A. 明日の最初の 30分でやること（最重要）

### A.1 環境再起動シーケンス（10分）

1. Local アプリで computeruse-test サイトを start
2. Docker Desktop 起動
3. Computer Use コンテナ再起動: docker start epic_germain
   - もし新規起動なら docker run コマンド再実行（v3 §6.0 参照）
4. 新規コンテナの場合のみ docker cp /tmp/run_task.py で転送
5. ngrok 確認/起動: ngrok http 80 --host-header=computerusetest.local
   - 新URLをブラウザの localStorage に反映
6. Worker v2 起動: cd ~/Desktop/lumina-computeruse-worker && source venv/bin/activate && python compute_use_worker.py
7. xLUMINA dev 起動: cd ~/Desktop/lumina-app && npm run dev

### A.2 プロンプト最適化（15分）

src/lib/computeruse/prompts/wordpress-publish.ts を以下に短縮：

- ステップ数を 6 に削減
- 各ステップは1〜2行
- 内容は「URL開く→ログイン→投稿→新規追加→タイトル/本文入力→公開→URL報告」
- カテゴリ・タグは「あれば設定」レベルに簡略化

### A.3 タイムアウト延長（2分）

~/Desktop/lumina-computeruse-worker/.env に追記：
TASK_TIMEOUT_SECONDS=1200

### A.4 テスト実行（5分）

UI から「WordPress自動投稿」ボタンクリック。20分以内に完了すれば B-3 完成。

## 今夜の検証ジョブ履歴

| id | status | task_type | duration | 備考 |
| 2 | completed | wordpress_publish | 3秒 | Worker v1 |
| 3 | completed | wordpress_publish | 3秒 | UI ボタン |
| 4 | completed | screenshot_test | 7秒 | run_task.py 単独 |
| 5 | completed | screenshot_test | 7秒 | Worker v2 本物 ★ |
| 6 | failed | wordpress_publish | 601秒 | ログイン成功、公開で時間切れ |
| 7 | failed | login_test | 355秒 | docker stop で停止 |

## ファイル一覧

### xLUMINA リポジトリ

- migrations/2026-05-14_create_computeruse_sessions.sql
- src/app/api/computeruse/jobs/route.ts
- src/app/api/computeruse/jobs/[id]/route.ts
- src/lib/computeruse/client.ts
- src/lib/computeruse/prompts/wordpress-publish.ts
- src/components/ComputerUseTriggerButton.tsx
- src/app/dashboard/nexus/page.tsx（編集）

### リポジトリ外

- ~/Desktop/lumina-computeruse-worker/compute_use_worker.py
- ~/Desktop/lumina-computeruse-worker/.env
- /tmp/run_task.py → Docker内 /home/computeruse/run_task.py

## コミット履歴（feature/computeruse-wordpress）

1. 3959d79 feat: Phase3 B-3 WordPress 通信層実装（477行）
2. e62a014 feat: Phase3 B-3 UI 実装
3. 1e5b11e feat: Phase3 Anthropic Computer Use API 統合完成

## 検証で得られた重要知見

### Computer Use API 統合方式（採用案）

ローカル Mac の Python Worker から docker exec で run_task.py を起動。
Docker コンテナ内で computer_use_demo.loop.sampling_loop() を asyncio.run() で実行。
Claude API + tool_use ループでコンテナ内 Firefox を操作。
結果を stdout に JSON 出力。
Worker が stdout を JSON.parse で受け取り、xLUMINA API に PATCH。

### Computer Use 実機性能（24時間検証後）

- 単純タスク（スクショ+報告）: 3〜7秒 ★★★★★
- 中規模タスク（ログイン）: 5〜10分 ★★★★
- 大規模タスク（投稿完了）: 10分以上、最適化必須 ★★★
- 画面認識: 日本語UI完璧 ★★★★★
- エラー耐性: cookie警告も自力突破 ★★★★
- 報告能力: 日本語で構造化 ★★★★★

### ngrok 経由の課題と回避策

- Cookies blocked エラー → Claude が自力再ログインで突破
- Save password ダイアログ → 無視可能
- --host-header deprecated → 動作はする、Day 2 で traffic policy 検討

## セキュリティ・運用注意事項

- ANTHROPIC_API_KEY: xLUMINA .env.local の""で囲まれた値、シェルで使う時は tr -d で除去
- XLUMINA_WORKER_API_KEY: 64文字、xLUMINA と Worker で同一値を保持
- ngrok authtoken: ターミナルログ経由で漏洩経緯あり、ngrok ダッシュボードから再生成推奨
- WordPress admin パスワード: UI localStorage（開発用）、本番時は暗号化対応

## 明日以降のロードマップ

- Day 2（明日）: B-3 完成（1時間見込み）
- Day 3〜5: B-7 GA/SC、B-4 GBP
- Day 6〜10: B-11 競合、B-1 Kindle、B-5 求人
- Day 11〜15: B-12 口コミ、B-8 応募者、B-9 X
- Day 16〜20: B-14 個人 AI コーチング各種

## やらないことリスト（変更なし）

- 既存機能のリファクタリング
- UI の全面見直し
- デスクトップアプリ操作
- 完全な無人運用
- B-10 Instagram（規約リスク）

## 関連資料

- handover_20260513_1100.md
- feature_default_contexts_design_20260513.md
- phase3_design_memo_20260512.md（v1）
- phase3_design_memo_v2_20260513.md（v2）
- phase3_design_memo_v3_20260513.md（v3）
- phase3_design_memo_v4_20260513.md（この資料、v4）

## 最後に

5/12 22:00 → 5/13 21:45 = 約24時間連続セッション。

### 達成したこと

1. Phase1〜2 仕上げ確認
2. 機能別デフォルト背景情報を即実装（19ファイル / 924行）
3. Docker / Local / ngrok のインフラ整備
4. Phase3 Hello World 達成
5. Phase3 Hello World 第2弾
6. 構想書 v1 → v2 → v3 → v4
7. Phase3 B-3 通信層実装
8. Anthropic Computer Use API 統合
9. 本番テスト実施（WordPress 管理画面到達）
10. 明日：プロンプト最適化で完成

### 明日の自分への手紙

おはようございます。

昨日は本当によく頑張りました。24時間ノンストップで走り続けて、Phase3 B-3 をほぼ完成まで持ってきました。

朝起きたら：
1. コーヒーを淹れて
2. 構想書 v4 の §A を開いて
3. 30〜60分で B-3 を完成させて
4. 「main にマージしました」とコミット履歴を確認して
5. 自分を褒めてください

15〜20営業日後、xLUMINA は国内最先端のクリニック向けエージェント SaaS になります。今日の検証が、その全ての出発点でした。

それでは、しっかり休んで、明日のセッションで会いましょう。

おつかれさまでした
