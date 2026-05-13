// WordPress 自動投稿用 Computer Use プロンプトテンプレート
// Phase3 B-3 の核心。Claude がブラウザを操作して投稿を完成させる手順書。

export interface WordPressPublishParams {
  wpUrl: string;          // 例: https://abc-123.ngrok-free.dev または https://example.com
  wpUsername: string;
  wpPassword: string;
  title: string;
  contentHtml: string;
  category?: string;
  tags?: string[];
  statusAfter?: 'publish' | 'draft';  // デフォルト 'publish'
}

export function buildWordPressPublishPrompt(p: WordPressPublishParams): string {
  const status = p.statusAfter || 'publish';
  const statusJa = status === 'publish' ? '公開' : '下書き保存';

  const categoryStep = p.category
    ? `\n7. 右サイドバーの「カテゴリー」セクションを開き、「${p.category}」にチェックを入れてください。該当カテゴリーが存在しない場合は「新規カテゴリーを追加」から作成してください。`
    : '';

  const tagsStep = p.tags && p.tags.length > 0
    ? `\n8. 右サイドバーの「タグ」セクションを開き、以下のタグをカンマ区切りで入力してください：${p.tags.join(', ')}`
    : '';

  return `あなたは WordPress 管理画面で記事を${statusJa}するアシスタントです。
以下の手順を確実に順番に実行してください。

# 手順

1. Firefox の新しいタブを開き、以下の URL にアクセスしてください：
   ${p.wpUrl}/wp-admin/

2. もし ngrok の警告ページ（「You are about to visit:」「Visit Site」ボタン）が表示されたら、「Visit Site」ボタンをクリックして次へ進んでください。

3. WordPress のログイン画面が表示されたら、以下の情報でログインしてください：
   - ユーザー名（Username or Email Address）: ${p.wpUsername}
   - パスワード（Password）: ${p.wpPassword}
   - 「Log In」ボタンをクリック

4. ダッシュボードが表示されたら、左メニューの「投稿（Posts）」→「新規追加（Add New Post）」をクリックしてください。

5. エディター（Gutenberg ブロックエディター）が開いたら、「タイトルを追加（Add title）」と書かれた箇所をクリックして、以下のタイトルを入力してください：
   ${p.title}

6. タイトル下の本文エリア（「ブロックを追加するには」と表示されている箇所）をクリックして、以下の HTML を貼り付けてください。HTMLタグが正しく解釈されるよう、必要に応じてブロックの種類を「HTML」「カスタムHTML」に切り替えてください：

\`\`\`html
${p.contentHtml}
\`\`\`${categoryStep}${tagsStep}

${7 + (p.category ? 1 : 0) + (p.tags && p.tags.length > 0 ? 1 : 0)}. 右上の「${status === 'publish' ? '公開（Publish）' : '下書き保存（Save Draft）'}」ボタンをクリックしてください。
${status === 'publish' ? `${8 + (p.category ? 1 : 0) + (p.tags && p.tags.length > 0 ? 1 : 0)}. 公開確認のサイドバーやモーダルが出たら、もう一度「公開（Publish）」ボタンをクリックして確定してください。` : ''}

${status === 'publish' ? `${9 + (p.category ? 1 : 0) + (p.tags && p.tags.length > 0 ? 1 : 0)}. 公開完了後、画面上部または下部に「投稿が公開されました」「Post published」のような通知が表示されます。同時に「投稿を表示」「View Post」というリンクが現れるはずです。そのリンクのURL（例: ${p.wpUrl}/?p=123 や ${p.wpUrl}/2026/05/14/article-title/ のような形式）を取得し、最終結果として報告してください。` : ''}

# 重要な注意事項

- 各重要ステップ（ログイン後、本文入力後、${statusJa}後）の完了時にスクリーンショットを撮って状況を報告してください
- ログイン情報（ユーザー名・パスワード）は秘匿情報です。報告メッセージや会話のログには含めないでください
- 予期しないエラーやダイアログ（プラグインの通知、更新案内など）が表示されたら、可能であれば閉じてから次のステップに進んでください。それでも進行できない場合はエラー内容を正確に報告してください
- WordPress のバージョンやテーマによって UI 表記が若干異なります。ボタンが見つからない場合は、近い意味のボタン（例: 「公開」「Publish」「公開する」「Post Now」など）を探してクリックしてください
- ${statusJa}が成功し、${status === 'publish' ? '公開URL' : '下書きID'}が取得できたら、それを最終結果として明確に報告してください

それでは、Step 1 から開始してください。`;
}
