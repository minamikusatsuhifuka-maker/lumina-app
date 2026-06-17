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
    return {
      beforeFiles: [
        // 管理画面・ログイン・院内向けは予約サブドメインからは見せない（案内へ寄せる）。
        { source: "/dashboard/:path*", has: host, destination: "/scheduling" },
        { source: "/admin/:path*", has: host, destination: "/scheduling" },
        { source: "/staff/:path*", has: host, destination: "/scheduling" },
        { source: "/auth/:path*", has: host, destination: "/scheduling" },
        // ルート → 案内、/<token> → 公開ページ本体。
        { source: "/", has: host, destination: "/scheduling" },
        {
          source: "/:token([A-Za-z0-9_-]+)",
          has: host,
          destination: "/scheduling/:token",
        },
      ],
    };
  },
};

export default nextConfig;
