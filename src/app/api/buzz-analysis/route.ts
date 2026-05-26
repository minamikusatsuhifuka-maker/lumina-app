import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';
import { streamWithModel, type AIModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Depth = 'light' | 'standard' | 'deep';
type Mode = 'single' | 'multi' | 'pattern';
type MediaType = 'note' | 'x' | 'blog' | 'instagram' | 'lp' | 'ad';

// 深さ別の出力目安と max_tokens
const DEPTH_CONFIG: Record<Depth, { maxTokens: number; charTarget: string }> = {
  light: { maxTokens: 3500, charTarget: '2000字程度' },
  standard: { maxTokens: 6500, charTarget: '4000字程度' },
  deep: { maxTokens: 12000, charTarget: '8000字程度' },
};

// 媒体名（systemPrompt の冒頭で使用）
function getMediaName(mediaType: string): string {
  const map: Record<string, string> = {
    note: 'note記事',
    x: 'X（旧Twitter）投稿',
    blog: 'ブログ記事',
    instagram: 'Instagram投稿',
    lp: 'ランディングページ',
    ad: '広告コピー',
  };
  return map[mediaType] || 'コンテンツ';
}

// 媒体別の分析観点コンテキスト
function getMediaContext(mediaType: string): string {
  switch (mediaType) {
    case 'note':
      return `【媒体: note記事】
- note は知識・体験をストーリーで伝える長文プラットフォーム
- 共感・実用性・専門性のバランスが鍵
- 「読み終わった後の行動変容」を促す構成が多い`;
    case 'x':
      return `【媒体: X（旧Twitter）投稿】
- 140〜280字の短文で衝撃・共感を生む必要
- ツリー投稿で深掘りも可
- 強烈な書き出し（フック）が9割
- リプライ・引用RT誘発が拡散の鍵`;
    case 'blog':
      return `【媒体: ブログ記事】
- SEO対策と網羅性が重要
- 見出し階層・検索意図への回答
- 内部リンク・関連記事誘導でPV最大化`;
    case 'instagram':
      return `【媒体: Instagram投稿】
- 1枚目（カバー）で止まらせる
- 10枚カルーセルで深掘り
- 保存・シェアを促す構成
- ハッシュタグ戦略`;
    case 'lp':
      return `【媒体: ランディングページ】
- ファーストビューでベネフィット即提示
- CTA配置とコンバージョン最適化
- 信頼性証拠（実績、レビュー、保証）の配置
- スクロール誘発の流れ`;
    case 'ad':
      return `【媒体: 広告コピー】
- 短く強い言葉で注意を引く
- ベネフィットの即時提示
- ターゲットの感情に直接訴える
- スクロールを止めるフック`;
    default:
      return '';
  }
}

// 5フレームワーク分析セクション（3モード共通でプロンプト末尾に挿入）
const ADVANCED_ANALYSIS_SECTION = `
## 🧠 高度な分析（5フレームワーク）

### 影響力の武器6原則（チャルディーニ）
以下のうち、活用されているもの・効果的に使われているものを分析:
- **返報性**: 読者に何かを「与えて」いるか（無料情報、ノウハウ等）
- **コミットメントと一貫性**: 読者に小さな同意を積み重ねさせる構造があるか
- **社会的証明**: 「みんなが」「多くの人が」等の表現、事例・体験談
- **好意**: 親しみやすさ、共通点、ユーモア、自己開示
- **権威**: 専門家性、資格・経歴、信頼できる引用
- **希少性**: 限定性、緊急性、独自性の演出

各原則について「使われ方の具体例」「効果の強さ」を記述。

### 行動経済学・認知バイアス
以下のうち活用されているもの:
- **損失回避**: 「失う」「逃す」「後悔」を強調
- **アンカリング**: 比較対象を先に提示
- **フレーミング効果**: 同じ内容でも表現で印象を変える
- **バンドワゴン効果**: 流行・トレンド感の演出
- **保有効果**: 「あなたの〜」と所有感を喚起
- **現在バイアス**: 「今すぐ」「すぐに」の即時性訴求
- **ナッジ**: 行動を促す穏やかな後押し
- **ピーク・エンドの法則**: 印象的な瞬間と締めの設計

各バイアスについて「具体的な活用例」「効果の説明」を記述。

### コピーライティング技法
以下の観点で分析:
- **構成フレームワーク**: PASONA / AIDMA / QUEST / PREP のどれを使っているか
- **見出し技法**: 数字、疑問形、緊急性、ベネフィット型 等
- **CTA（行動喚起）技法**: 命令形 / 利益強調 / 限定性 / 簡単さアピール
- **ストーリーテリング**: 起承転結、共感→課題→解決の流れ
- **比喩・例え**: わかりやすさを生む比喩表現

### 学びの抽出（自分のコンテンツに活かすコツ）
3〜5個、具体的なアクションとして記述:
- 「次に自分が書くなら、〇〇を真似たい」
- 「この見出し技法は△△の文脈でも使える」
- 「この心理トリガーは□□のテーマで応用できる」
`;

// 1本のURLから本文を抽出（extract-url と同等のロジック）
async function extractArticle(
  url: string,
  client: Anthropic,
  userId: string,
): Promise<
  | { ok: true; text: string }
  | { ok: false; error: string }
> {
  try {
    const fetchRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; xLUMINA/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!fetchRes.ok) {
      return { ok: false, error: `HTTP ${fetchRes.status}` };
    }
    const html = await fetchRes.text();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `以下のHTMLから、記事・ブログ・ニュースの本文テキストのみを抽出してください。

除外するもの：
- ナビゲーションメニュー
- 広告・バナー
- フッター・ヘッダー
- SNSボタン・シェアボタン
- コメント欄
- サイドバー
- Cookie通知

抽出するもの：
- 記事タイトル
- 本文（段落ごとに改行）
- 著者・日付（あれば）

プレーンテキストのみで出力してください（HTMLタグ不要）。

URL: ${url}

HTML:
${html.slice(0, 20000)}`,
        },
      ],
    });

    const firstBlock = response.content[0];
    const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text : '';

    // 抽出に使ったトークンも記録
    await trackUsage({
      userId,
      featureKey: 'buzz-analysis',
      stepLabel: `[extract] ${url.slice(0, 40)}`,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      model: 'claude-sonnet-4-6',
    });

    if (!text.trim()) {
      return { ok: false, error: '本文を抽出できませんでした' };
    }
    return { ok: true, text };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err).slice(0, 200) };
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: '認証が必要です' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const userId = (session.user as any).id ?? '';

  const {
    mode = 'single',
    url,
    urls,
    field,
    depth = 'standard',
    mediaType = 'note',
    model = 'claude',
  } = (await req.json()) as {
    mode?: Mode;
    url?: string;
    urls?: string[];
    field?: string;
    depth?: Depth;
    mediaType?: MediaType;
    model?: AIModel;
  };

  const mediaName = getMediaName(mediaType);
  const mediaContext = getMediaContext(mediaType);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const client = new Anthropic({ apiKey });

  const { maxTokens, charTarget } = DEPTH_CONFIG[depth];

  let systemPrompt = '';
  let userPrompt = '';
  let stepLabel = '';

  // ========== モード別: プロンプト生成 ==========

  if (mode === 'single') {
    // 既存ロジックを維持
    if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      return new Response(JSON.stringify({ error: 'URLが正しくありません（http/https）' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const extractRes = await extractArticle(url, client, userId);
    if (!extractRes.ok) {
      return new Response(
        JSON.stringify({ error: `URLコンテンツ取得エラー: ${extractRes.error}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    stepLabel = `[${mediaType}] ${url.slice(0, 50)}`;
    systemPrompt = `あなたは ${mediaName} の「バズり要素」を分析する優秀なコンテンツマーケターです。読者心理、行動経済学、影響力の武器（チャルディーニの6原則）、コピーライティング技法を駆使して、バズる構造を多角的に分析し、自分のコンテンツに活かせる学びを言語化してください。

${mediaContext}

絶対に守るルール：
1. URLは生のURLのみ記載（例: https://example.com）
2. HTMLタグは一切使用禁止
3. Markdownのリンク記法も禁止（[テキスト](URL)形式も使わない）
4. 客観的に分析し、推測は「〜と考えられる」と明示
5. 必ず最後の「🔑 重要キーワード」まで完結させる（出力目安: ${charTarget}）`;

    userPrompt = `以下の記事を分析し、バズり要素を言語化してください。

# 記事URL
${url}

# 記事本文
${extractRes.text}

# 分析の観点

## 📋 記事概要
- タイトル
- テーマ・トピック
- 想定読者ペルソナ
- 推定文字数

## 🎯 バズり要素分析

### 1. 構成パターン
- 導入の引き込み方
- 本文の流れ・章立て
- クライマックスの作り方
- 結論への落とし込み

### 2. 口調・文体の特徴
- 一人称、語尾
- 読者との距離感
- 感情表現の使い方
- リズム・テンポ

### 3. マーケティング要素
- タイトルの工夫（数字、強い言葉、好奇心トリガー）
- 見出しの作り方
- CTA（行動喚起）の配置
- SEO キーワード推定

### 4. 心理学的トリガー
- 共感、希少性、社会的証明、権威性などの活用
- 読者の感情をどう動かしているか

## 💡 学びポイント・応用方法
- この記事から学べる5つの再現可能な技
- 自分の記事に応用する具体的なアイデア
${ADVANCED_ANALYSIS_SECTION}
## 🔑 重要キーワード
（記事を象徴する10〜15個のキーワード）

# 注意
- 客観的に分析、推測は「〜と考えられる」と明示
- 出力目安: ${charTarget}
- 必ず最後まで完結させてください`;
  } else if (mode === 'multi') {
    // 5本まとめ分析
    if (!Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ error: 'URL配列が必要です' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const cleanUrls = urls
      .map(u => (typeof u === 'string' ? u.trim() : ''))
      .filter(u => /^https?:\/\//.test(u));
    if (cleanUrls.length < 2) {
      return new Response(
        JSON.stringify({ error: 'http/https で始まるURLを2本以上入力してください' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (cleanUrls.length > 5) {
      return new Response(JSON.stringify({ error: 'URLは最大5本までです' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 全URLを並列抽出
    const extractResults = await Promise.all(
      cleanUrls.map(u => extractArticle(u, client, userId)),
    );
    const successful: Array<{ url: string; text: string }> = [];
    const failed: Array<{ url: string; error: string }> = [];
    extractResults.forEach((r, i) => {
      if (r.ok) successful.push({ url: cleanUrls[i], text: r.text });
      else failed.push({ url: cleanUrls[i], error: r.error });
    });

    // 「5本中3本以上成功」が必須、または2本入力時は2本成功必須
    const minRequired = Math.min(3, cleanUrls.length);
    if (successful.length < minRequired) {
      return new Response(
        JSON.stringify({
          error: `URL本文取得に失敗しました（成功 ${successful.length} / ${cleanUrls.length}本）。${minRequired}本以上の取得が必要です。`,
          failed,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    stepLabel = `[multi ${successful.length}/${cleanUrls.length}][${mediaType}] ${successful[0].url.slice(0, 30)}`;

    systemPrompt = `あなたは ${mediaName} の「バズり要素」を分析する優秀なコンテンツマーケターです。複数のコンテンツを比較分析し、共通するバズり要素を、心理学・行動経済学・影響力の武器（チャルディーニの6原則）・コピーライティング技法の観点から多角的に言語化してください。

${mediaContext}

絶対に守るルール：
1. URLは生のURLのみ記載
2. HTMLタグは一切使用禁止
3. Markdownのリンク記法も禁止
4. 客観的に分析し、推測は「〜と考えられる」と明示
5. 必ず最後の「🔑 重要キーワード」まで完結させる（出力目安: ${charTarget}）`;

    const articlesSection = successful
      .map(
        (a, i) => `# 記事${i + 1}
URL: ${a.url}
本文:
${a.text}`,
      )
      .join('\n\n');

    const failedNote = failed.length > 0
      ? `\n\n# 取得失敗（参考）
${failed.map(f => `- ${f.url}: ${f.error}`).join('\n')}
※ 上記は本文取得に失敗したため分析対象から除外しました。`
      : '';

    userPrompt = `以下の${successful.length}本の記事を比較分析し、共通する「バズり要素 TOP5」を言語化してください。

${articlesSection}${failedNote}

# 出力構成

## 📊 共通するバズり要素 TOP5
（${successful.length}記事に共通する成功要素を、重要度順に5つ）

### 1. [要素名]
- 各記事での具体例
- なぜこれがバズるか

### 2. [要素名]
（以下同様）

### 3. [要素名]

### 4. [要素名]

### 5. [要素名]

## 🎯 各記事の独自要素
（各記事固有の工夫、独自の強み）

## 💡 学びポイント・応用方法
（自分の記事に応用する具体的なアイデア）
${ADVANCED_ANALYSIS_SECTION}
## 🔑 重要キーワード
（${successful.length}記事から抽出した10〜15個のキーワード）

# 注意
- ${successful.length}記事すべてを横断的に比較分析
- 客観的に分析、推測は「〜と考えられる」と明示
- 出力目安: ${charTarget}
- 必ず最後まで完結させてください`;
  } else if (mode === 'pattern') {
    // 分野別バズりパターン
    if (!field || typeof field !== 'string' || !field.trim()) {
      return new Response(JSON.stringify({ error: '分野名を入力してください' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const cleanField = field.trim().slice(0, 100);

    stepLabel = `[pattern:${depth}][${mediaType}] ${cleanField}`;

    // depth 別に「最終セクション名」と「パターン数」を変える
    const patternCount = depth === 'light' ? 3 : 5;
    const lastSection =
      depth === 'deep'
        ? '🎯 投稿運用のヒント'
        : '🔑 この分野で頻出するキーワード';

    systemPrompt = `あなたは ${mediaName} のコンテンツマーケティングを分析する優秀な専門家です。指定された分野でバズるコンテンツの典型パターンを、心理学・行動経済学・影響力の武器（チャルディーニの6原則）・コピーライティング技法の観点から多角的に言語化してください。実在の記事ではなく、構造的パターンとして分析してください。

${mediaContext}

絶対に守るルール：
1. 実在の記事タイトルや具体的な数値（PV数等）の捏造は絶対にしない
2. URLは記載しない（生成しない）
3. HTMLタグは一切使用禁止
4. Markdownのリンク記法も禁止
5. ${patternCount}つのパターンすべてを必ず最後まで書き切る
6. 必ず最後の「${lastSection}」まで完結させる（出力目安: ${charTarget}）`;

    // ========== depth 別プロンプト ==========
    if (depth === 'light') {
      // ライト: 3パターン × シンプル（〜2000字）
      userPrompt = `以下の分野で note や Web 記事でバズる「典型的なパターン」を3つに分類して言語化してください。

# 分野
${cleanField}

# 出力構成

## 🎯 この分野でバズる3つの典型パターン（ざっくり要点版）

### パターン1: [パターン名]
- 特徴（2〜3行）
- 典型的なタイトル例（1つ）
- 構成テンプレート（3〜5項目の箇条書き）

### パターン2: [パターン名]
（同様）

### パターン3: [パターン名]
（同様）

## 💡 自分の記事への応用方法
- 3パターンを使い分ける指針（5行程度）
${ADVANCED_ANALYSIS_SECTION}
## 🔑 この分野で頻出するキーワード
（8〜10個）

# 注意
- 実在の記事ではなく、構造パターンとして分析
- 全体で2000字以内に収める
- 必ず最後まで完結させてください`;
    } else if (depth === 'deep') {
      // ディープ: 5パターン × 徹底分析（〜8000字）
      userPrompt = `以下の分野で note や Web 記事でバズる「典型的なパターン」を5つに分類して、徹底的に深掘り分析してください。

# 分野
${cleanField}

# 出力構成

## 🎯 この分野でバズる5つの典型パターン（徹底分析版）

### パターン1: [パターン名]
- 特徴（5〜7行で詳述）
- 典型的なタイトル例（5つ、それぞれ短評付き）
- 構成テンプレート（段落ごとの役割と狙い）
- 口調・文体の例（具体的なフレーズ3つ以上）
- マーケティング要素（タイトル、見出し、CTA、SEO等の活用法）
- 心理トリガー（共感、希少性、社会的証明、権威性などの活用例）
- 想定読者ペルソナ（年代、性別、悩み、知識レベル等）
- このパターンが効く理由（読者心理の観点から）

### パターン2: [パターン名]
（同様に深掘り）

### パターン3: [パターン名]
（同様に深掘り）

### パターン4: [パターン名]
（同様に深掘り）

### パターン5: [パターン名]
（同様に深掘り）

## 💡 自分の記事への応用方法
- 各パターンを使い分ける指針
- 自分の強みと組み合わせる方法
- 5パターンを順番に投稿することでの読者育成シナリオ
- よくある失敗例と回避策
${ADVANCED_ANALYSIS_SECTION}
## 🔑 この分野で頻出するキーワード
（15〜20個）

## 🎯 投稿運用のヒント
- 各パターンの最適な投稿頻度
- 反応を見るための指標（いいね、保存、コメント等の解釈）

# 注意
- 実在の記事ではなく、構造パターンとして分析
- 全体で8000字以内
- 必ず最後まで完結させてください`;
    } else {
      // スタンダード: 5パターン × バランス（〜4000字）
      userPrompt = `以下の分野で note や Web 記事でバズる「典型的なパターン」を5つに分類して言語化してください。

# 分野
${cleanField}

# 出力構成

## 🎯 この分野でバズる5つの典型パターン

### パターン1: [パターン名]
- 特徴
- 典型的なタイトル例（3つ）
- 構成テンプレート
- 口調・文体の例
- マーケティング要素
- 心理トリガー
- 想定読者ペルソナ

### パターン2: [パターン名]
（同様）

### パターン3: [パターン名]
（同様）

### パターン4: [パターン名]
（同様）

### パターン5: [パターン名]
（同様）

## 💡 自分の記事への応用方法
- 各パターンを使い分ける指針
- 自分の強みと組み合わせる方法
${ADVANCED_ANALYSIS_SECTION}
## 🔑 この分野で頻出するキーワード
（10〜15個）

# 注意
- 実在の記事ではなく、構造パターンとして分析
- 各パターンに再現可能な具体例を含める
- 全体で4000字以内
- 必ず最後まで完結させてください`;
    }
  } else {
    return new Response(JSON.stringify({ error: '不正なmodeです（single/multi/pattern）' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ========== ストリーミング応答 ==========
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));

        const usage = await streamWithModel(
          model,
          userPrompt,
          systemPrompt,
          controller,
          encoder,
          maxTokens,
          'standard',
        );

        await trackUsage({
          userId,
          featureKey: 'buzz-analysis',
          stepLabel,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          model: 'claude-sonnet-4-6',
        });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'done',
              usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens },
            })}\n\n`,
          ),
        );
      } catch (error: any) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: String(error?.message || error) })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
