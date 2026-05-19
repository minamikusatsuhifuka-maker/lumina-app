// WordPress 自動投稿用 Computer Use プロンプトテンプレート
// Phase3 B-3 の核心。Claude がブラウザを操作して投稿を完成させる手順書。
// v2 (2026-05-19): 1874字/11ステップ → 約500字/6ステップに圧縮。Cookie警告リカバリ追記。

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
  const isPublish = status === 'publish';
  const statusJa = isPublish ? '公開' : '下書き保存';

  const taxonomy: string[] = [];
  if (p.category) taxonomy.push(`カテゴリ「${p.category}」を設定（無ければ新規作成）`);
  if (p.tags && p.tags.length > 0) taxonomy.push(`タグ「${p.tags.join(', ')}」を設定`);
  const taxonomyLine = taxonomy.length > 0 ? `\n5b. ${taxonomy.join('、')}` : '';

  return `WordPressに記事を${statusJa}してください。

ログイン情報:
URL: ${p.wpUrl}/wp-admin/
Username: ${p.wpUsername}
Password: ${p.wpPassword}

記事:
タイトル: ${p.title}
本文HTML: ${p.contentHtml}

手順:
1. URLを開く（ngrok警告が出たら Visit Site をクリック）
2. Username と Password でログイン（Cookie エラーで失敗したら再ログインを試行）
3. 投稿 → 新規追加
4. タイトルを入力
5. 本文エリアにHTMLを貼り付け（必要なら「カスタムHTML」ブロックに切替）${taxonomyLine}
6. ${isPublish ? '「公開」をクリック、確認ダイアログが出たら再度「公開」で確定し、公開URL（例: ' + p.wpUrl + '/?p=123 等）を報告' : '「下書き保存」をクリックし、保存できたことを報告'}

ボタン名が日本語と英語で異なる場合は近い意味のボタンを選んでください。
エラー時は具体的な内容（画面表示・エラーメッセージ）を報告してください。`.trim();
}
