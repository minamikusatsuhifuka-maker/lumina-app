import type { NextConfig } from "next";

// 日程調整の公開ページ用サブドメイン。既定 yoyaku.xlumina.jp。
// 別名にする場合は Vercel の env SCHEDULING_HOST を設定すれば、コード変更なしで切替可能。
const SCHEDULING_HOST = process.env.SCHEDULING_HOST || "yoyaku.xlumina.jp";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  // ホスト名ルーティング：予約サブドメインからは公開ページのみ見せる。
  // - yoyaku.xlumina.jp/         → /scheduling（URL案内ページ）
  // - yoyaku.xlumina.jp/<token>  → /scheduling/<token>（公開ページ本体）
  // 単一セグメントの英数字のみ token として扱う（/api・/_next・ドット付き静的ファイルは素通り）。
  // xlumina.jp 等は host 条件に一致しないため一切影響なし（管理画面はそのまま）。
  async rewrites() {
    const host = [{ type: "host" as const, value: SCHEDULING_HOST }];
    const toInfo = (source: string) => ({ source, has: host, destination: "/scheduling" });
    return {
      beforeFiles: [
        // 1) 有効トークンのみ公開ページ本体へ。
        //    公開トークンは base64url 24文字（randomBytes(18)）。最小長 {20,} を課して
        //    "scheduling"(10) "dashboard"(9) "auth"(4) 等の短い予約語を拾わないようにする。
        //    /api・/_next・ドット付き静的ファイルは単一英数セグメントでないため不一致＝素通り（CORS不要を維持）。
        {
          source: "/:token([A-Za-z0-9_-]{20,})",
          has: host,
          destination: "/scheduling/:token",
        },
        // 2) ルート → 案内ページ。
        toInfo("/"),
        // 3) 管理画面・ログイン・院内向け・内部パスは案内へ寄せて非露出に。
        toInfo("/dashboard/:path*"),
        toInfo("/dashboard"),
        toInfo("/auth/:path*"),
        toInfo("/auth"),
        toInfo("/admin/:path*"),
        toInfo("/admin"),
        toInfo("/staff/:path*"),
        toInfo("/staff"),
        toInfo("/scheduling"),
      ],
    };
  },
};

export default nextConfig;
