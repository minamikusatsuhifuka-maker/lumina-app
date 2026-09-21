import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// 保存時暗号化ヘルパ（109）。サーバー専用（node:crypto を使うためブラウザには載らない）。
// 単体テストから直接 import するため 'server-only' パッケージは入れず、DB 依存も持たない純関数のみ。
//
// - AES-256-GCM。レコード毎に 12byte の IV を乱数で作り、認証タグ（16byte）を付けて保存する
// - 保存形式: `v1.<iv base64url>.<tag base64url>.<暗号文 base64url>`（先頭の v1 でフォーマット移行に備える）
// - 鍵は env SCHEDULING_ENCRYPTION_KEY（hex 64 文字 = 32byte）。未設定・不正なら EncryptionKeyError を投げる。
//   **平文へのフォールバックはこのモジュールではしない**（呼び出し側が isEncryptionConfigured で判断する）
// - メールの検索・重複判定用ハッシュは sha256(正規化 email)。鍵に依存しないのでバックフィルの順序を問わない

export const ENCRYPTION_KEY_ENV = 'SCHEDULING_ENCRYPTION_KEY';
export const ENC_FORMAT_VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionKeyError';
  }
}

// hex 文字列を 32byte の鍵に変換（形式が違えば例外。空文字は「未設定」扱いで例外）
export function parseEncryptionKey(hex: string | undefined | null): Buffer {
  const s = (hex ?? '').trim();
  if (!s) {
    throw new EncryptionKeyError(`${ENCRYPTION_KEY_ENV} が未設定です（openssl rand -hex 32 で生成した 64 文字の hex を設定してください）`);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(s)) {
    throw new EncryptionKeyError(`${ENCRYPTION_KEY_ENV} の形式が不正です（hex 64 文字 = 32byte が必要）`);
  }
  const key = Buffer.from(s, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new EncryptionKeyError(`${ENCRYPTION_KEY_ENV} の長さが不正です`);
  }
  return key;
}

// env から鍵を読む。未設定・不正なら EncryptionKeyError。
export function getEncryptionKey(): Buffer {
  return parseEncryptionKey(process.env[ENCRYPTION_KEY_ENV]);
}

// 鍵が使える状態か（呼び出し側の「暗号化列を書くか」の判断に使う。ここでは例外を投げない）
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

// 平文 → `v1.iv.tag.ct`
export function encryptString(plain: string, key: Buffer = getEncryptionKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENC_FORMAT_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ct.toString('base64url'),
  ].join('.');
}

// `v1.iv.tag.ct` → 平文。形式不正・改竄・鍵違いは例外（呼び出し側で扱う）
export function decryptString(encoded: string, key: Buffer = getEncryptionKey()): string {
  const parts = String(encoded ?? '').split('.');
  if (parts.length !== 4 || parts[0] !== ENC_FORMAT_VERSION) {
    throw new Error('暗号文の形式が不正です');
  }
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ct = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('暗号文の形式が不正です');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString('utf8');
}

// 保存形式かどうか（平文と暗号文を見分ける軽い判定。復号の成否は保証しない）
export function looksEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(`${ENC_FORMAT_VERSION}.`) && value.split('.').length === 4;
}

// メールの正規化（trim + lowercase）。登録・検索・ハッシュの全てでこれを通す
export function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

// sha256(正規化 email) の hex。鍵に依存しない
export function hashEmail(raw: string): string {
  return createHash('sha256').update(normalizeEmail(raw)).digest('hex');
}
