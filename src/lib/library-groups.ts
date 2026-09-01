// 283: 📚リサーチ保存で「同一リサーチの本文・要約など」を1枚のカードにまとめる判定（表示側のみ・DB無変更）。
//
// 保存側（263）の書き方を写した手がかり（R-79）:
//   - バッチDR（/api/batch-research/[id]/run の saveTopicToLibrary）
//       本文: tags "ディープリサーチ,バッチ,batch:<jobId>-<index>"   metadata.kind='research'
//       要約: tags "ディープリサーチ,要約,バッチ,batch:<jobId>-<index>s" metadata.kind='summary'
//     → `batch:<jobId>-<index>` がトピック固有のキー。**確実に紐づく**。
//   - 通常DR（/dashboard/deepresearch の SaveToLibraryButton）
//       本文: tags "ディープリサーチ"（自動ストック保存も同じ）
//       要約: tags "ディープリサーチ,要約" ／ 詳細: "…,詳細" ／ 活用アドバイス: "…,活用アドバイス"
//       metadata は { savedAt } のみ。親子関係を示すフィールドは**無い**。
//     → タイトル完全一致＋保存時刻が近い、の推定だけ。
//
// 286: 推定は**ペアリング**で解く（283の「ちょうど2件」は廃止）。
//   同一タイトルの成果物を本文群と要約群（詳細・活用アドバイスも同様）に分け、
//   保存時刻が最も近いもの同士から順に組にする（貪欲マッチング・時間窓あり）。
//   同種別同士は組にしない（本文2件は別々の実行）。組にならなかったものは単独カード。
//   同点の順序: 時間差 → 本文の方が先に保存されている組を優先 → 本文の id → 相手の id（決定的・R-74）。
//
// 判定は決定的（R-74）: 入力の並びと値だけから同じ結果を返す。乱数・現在時刻を使わない。

export type LibraryArtifactKind = 'research' | 'summary' | 'detail' | 'advice';

export const ARTIFACT_LABEL: Record<LibraryArtifactKind, string> = {
  research: '本文',
  summary: '要約',
  detail: '詳細',
  advice: '活用アドバイス',
};

/** カード内の並び順（本文を先頭に） */
export const ARTIFACT_ORDER: LibraryArtifactKind[] = ['research', 'summary', 'detail', 'advice'];

/**
 * 推定でまとめるときの「保存時刻が近い」の上限（1箇所で管理）。通常DRは本文の自動保存→要約の手動保存が
 * 同じ画面内で続くため1時間。ペアリング（最も近いもの同士）を入れたので窓の重要度は下がったが、
 * 1年前の要約と今日の本文が組にならないよう上限は残す（286 §3-2）。
 */
export const ESTIMATED_PAIR_WINDOW_MS = 60 * 60 * 1000;

export type LibraryLinkKind = 'batch' | 'estimated';

export type LibraryLike = {
  id: string;
  type?: string | null;
  title?: string | null;
  tags?: string | string[] | null;
  metadata?: unknown;
  created_at?: string | null;
  group_name?: string | null;
};

export type LibraryArtifact<T extends LibraryLike> = { item: T; kind: LibraryArtifactKind };

export type LibraryCard<T extends LibraryLike> = {
  /** カードの安定キー（batch:<jobId>-<index> ／ est:<先頭id> ／ 単体は id） */
  key: string;
  title: string;
  /** 本文→要約→詳細→活用アドバイスの順 */
  artifacts: LibraryArtifact<T>[];
  /** null=単体（まとめていない） */
  link: LibraryLinkKind | null;
  /** 代表（本文があれば本文） */
  primary: T;
};

export function splitTags(tags: LibraryLike['tags']): string[] {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

function parseMeta(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** ディープリサーチの保存行か（263/通常DRとも type='deepresearch'・group_name='ディープリサーチ'） */
export function isDeepResearchItem(item: LibraryLike): boolean {
  return item.type === 'deepresearch' || item.group_name === 'ディープリサーチ';
}

const BATCH_TAG = /^batch:(\d+)-(\d+)(s?)$/;

/** バッチ保存のトピック固有キー（要約の末尾 s を落として本文と同じキーにする）。無ければ null */
export function batchLinkKey(item: LibraryLike): string | null {
  for (const t of splitTags(item.tags)) {
    const m = BATCH_TAG.exec(t);
    if (m) return `batch:${m[1]}-${m[2]}`;
  }
  return null;
}

/** 成果物の種別。metadata.kind（バッチ）を最優先、次にタグ（通常DR）。どれも無ければ本文 */
export function artifactKindOf(item: LibraryLike): LibraryArtifactKind {
  const meta = parseMeta(item.metadata);
  if (meta.kind === 'summary') return 'summary';
  if (meta.kind === 'research') return 'research';
  const tags = splitTags(item.tags);
  if (tags.includes('要約')) return 'summary';
  if (tags.includes('詳細')) return 'detail';
  if (tags.includes('活用アドバイス')) return 'advice';
  return 'research';
}

function createdMs(item: LibraryLike): number {
  const t = item.created_at ? new Date(item.created_at).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
}

function sortArtifacts<T extends LibraryLike>(arts: LibraryArtifact<T>[]): LibraryArtifact<T>[] {
  return [...arts].sort((a, b) => {
    const d = ARTIFACT_ORDER.indexOf(a.kind) - ARTIFACT_ORDER.indexOf(b.kind);
    if (d !== 0) return d;
    const ta = createdMs(a.item);
    const tb = createdMs(b.item);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return String(a.item.id).localeCompare(String(b.item.id));
  });
}

function makeCard<T extends LibraryLike>(
  key: string,
  arts: LibraryArtifact<T>[],
  link: LibraryLinkKind | null,
): LibraryCard<T> {
  const sorted = sortArtifacts(arts);
  const primary = sorted[0].item;
  return { key, title: (primary.title ?? '').trim(), artifacts: sorted, link, primary };
}

/**
 * 一覧の行をカードにまとめる。カードの並びは「そのカードに属する行が入力で最初に現れた位置」を保つ
 * （一覧APIの is_favorite DESC, created_at DESC の順がそのまま活きる）。
 */
export function groupLibraryItems<T extends LibraryLike>(items: T[]): LibraryCard<T>[] {
  // 1) 確実な鍵: batch:<jobId>-<index>
  const batchGroups = new Map<string, LibraryArtifact<T>[]>();
  const rest: T[] = [];
  for (const it of items) {
    const key = isDeepResearchItem(it) ? batchLinkKey(it) : null;
    if (key) {
      const arr = batchGroups.get(key) ?? [];
      arr.push({ item: it, kind: artifactKindOf(it) });
      batchGroups.set(key, arr);
    } else {
      rest.push(it);
    }
  }

  // 2) 推定（286 ペアリング）: 通常DRでタイトル完全一致の成果物を、本文と他の種別（要約/詳細/活用アドバイス）で
  //    時刻が最も近いもの同士から組にする。同種別は組にしない。窓を超える組は作らない
  const estimatedOf = new Map<string, string>(); // itemId -> card key（est:<本文id>）
  const byTitle = new Map<string, T[]>();
  for (const it of rest) {
    if (!isDeepResearchItem(it)) continue;
    const title = (it.title ?? '').trim();
    if (!title || !Number.isFinite(createdMs(it))) continue;
    const arr = byTitle.get(title) ?? [];
    arr.push(it);
    byTitle.set(title, arr);
  }
  for (const arr of byTitle.values()) {
    if (arr.length < 2) continue;
    const researches = arr.filter((it) => artifactKindOf(it) === 'research');
    const others = arr.filter((it) => artifactKindOf(it) !== 'research');
    if (researches.length === 0 || others.length === 0) continue; // 同種別だけ → 組にしない
    // 候補: 窓内の（本文, 他種別）の全組み合わせを、時間差 → 本文が先 → 本文id → 相手id の順に並べる（決定的）
    type Cand = { r: T; o: T; dt: number; rFirst: 0 | 1 };
    const cands: Cand[] = [];
    for (const r of researches) {
      for (const o of others) {
        const dt = Math.abs(createdMs(o) - createdMs(r));
        if (dt > ESTIMATED_PAIR_WINDOW_MS) continue;
        cands.push({ r, o, dt, rFirst: createdMs(r) <= createdMs(o) ? 0 : 1 });
      }
    }
    cands.sort(
      (a, b) =>
        a.dt - b.dt ||
        a.rFirst - b.rFirst ||
        String(a.r.id).localeCompare(String(b.r.id)) ||
        String(a.o.id).localeCompare(String(b.o.id)),
    );
    // 貪欲マッチング: 本文1件につき同じ種別は1つまで、他種別の成果物はどこか1枚にだけ属する
    const taken = new Map<string, Set<LibraryArtifactKind>>(); // 本文id -> 既に組んだ種別
    const used = new Set<string>(); // 他種別のid
    for (const c of cands) {
      const rid = String(c.r.id);
      const oid = String(c.o.id);
      if (used.has(oid)) continue;
      const kind = artifactKindOf(c.o);
      const kinds = taken.get(rid) ?? new Set<LibraryArtifactKind>();
      if (kinds.has(kind)) continue;
      kinds.add(kind);
      taken.set(rid, kinds);
      used.add(oid);
      const key = `est:${rid}`;
      estimatedOf.set(rid, key);
      estimatedOf.set(oid, key);
    }
  }

  // 3) 入力順にカードを組み立てる
  const cards: LibraryCard<T>[] = [];
  const emitted = new Set<string>();
  const estimatedGroups = new Map<string, LibraryArtifact<T>[]>();
  for (const it of rest) {
    const key = estimatedOf.get(String(it.id));
    if (!key) continue;
    const arr = estimatedGroups.get(key) ?? [];
    arr.push({ item: it, kind: artifactKindOf(it) });
    estimatedGroups.set(key, arr);
  }
  for (const it of items) {
    const bk = isDeepResearchItem(it) ? batchLinkKey(it) : null;
    if (bk) {
      if (emitted.has(bk)) continue;
      emitted.add(bk);
      const arts = batchGroups.get(bk)!;
      cards.push(makeCard(bk, arts, arts.length >= 2 ? 'batch' : null));
      continue;
    }
    const ek = estimatedOf.get(String(it.id));
    if (ek) {
      if (emitted.has(ek)) continue;
      emitted.add(ek);
      cards.push(makeCard(ek, estimatedGroups.get(ek)!, 'estimated'));
      continue;
    }
    cards.push(makeCard(String(it.id), [{ item: it, kind: artifactKindOf(it) }], null));
  }
  return cards;
}
