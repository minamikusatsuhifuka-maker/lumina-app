'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import {
  NAV_LABELS_DEFAULT,
  NAV_LABELS_STORAGE_KEY,
  normalizeNavIcon,
  normalizeNavLabel,
  parseNavLabels,
  type NavLabelState,
} from '@/lib/nav-labels';

type Theme = 'dark' | 'midnight' | 'light' | 'nature';
type Font = 'outfit' | 'noto' | 'inter' | 'zen';

// 240: アプリ全体の文字サイズ（現状=最小の100%＋3段階）。
// このアプリはインラインstyleのpx指定が中心で rem 基準ではないため、
// ルートのfont-size変更では効かない。CSSの zoom をルート要素に当てて
// 「px指定も含めて全部を等倍で拡大する」方式にした（レイアウトは通常どおり再フローする）。
// documentElement に当てるので createPortal で body 直下に出るモーダルにも効く。
export type TextScale = 100 | 112 | 125 | 140;
export const TEXT_SCALES: { value: TextScale; label: string; hint: string }[] = [
  { value: 100, label: '標準', hint: '現状の大きさ' },
  { value: 112, label: '大', hint: '1段階大きく' },
  { value: 125, label: '特大', hint: '2段階大きく' },
  { value: 140, label: '最大', hint: '3段階大きく' },
];
export const TEXT_SCALE_STORAGE_KEY = 'lumina_text_scale';

function applyTextScale(scale: TextScale) {
  // 100%のときは zoom を外す（既定の表示を一切変えない＝退化を作らない）
  document.documentElement.style.zoom = scale === 100 ? '' : String(scale / 100);
}

// ─────────────────────────────────────────────────────────────
// 243: 画面右下の追従ボタンの表示設定（テーマ・文字サイズと同じくここで一元管理）
//
// 常時表示だと本文や操作ボタンに重なるため、3つを個別にon/offできるようにする。
// **既定は3つとも off**（院長の指示）。必要な人が設定画面で入れる。
// ─────────────────────────────────────────────────────────────
export type FloatingKey = 'assistant' | 'memo' | 'glossary';

/** 下から積む順。既存の並び（💬24 → 📝80 → 📖136）をそのまま維持する */
export const FLOATING_ORDER: FloatingKey[] = ['assistant', 'memo', 'glossary'];

export const FLOATING_BUTTONS: { key: FloatingKey; icon: string; label: string; hint: string }[] = [
  { key: 'glossary', icon: '📖', label: '用語解説', hint: '文章から専門用語を抽出して解説する小窓' },
  { key: 'memo', icon: '📝', label: 'メモ小窓', hint: '別ウィンドウ（ピクチャinピクチャ）で開くメモ' },
  { key: 'assistant', icon: '💬', label: 'xLUMINAアシスタント', hint: '画面の右下から呼び出すAIチャット' },
];

export const FLOATING_STORAGE_KEY = 'lumina_floating_buttons';
export type FloatingState = Record<FloatingKey, boolean>;
export const FLOATING_DEFAULT: FloatingState = { assistant: false, memo: false, glossary: false };

/** 追従ボタンの縦位置（下端からの段数）。セーフエリア分を足してiPhoneのホームバーに被らせない */
const FLOATING_BASE = 24;
const FLOATING_STEP = 56;
export function floatingBottom(slot: number): string {
  return `calc(${FLOATING_BASE + slot * FLOATING_STEP}px + env(safe-area-inset-bottom, 0px))`;
}

// ─────────────────────────────────────────────────────────────
// 251: サイドバーのメニュー名・アイコンの変更（テーマ・文字サイズ・追従ボタンと同じくここで一元管理）。
// 別Providerを作らず、既存の localStorage 機構に相乗りする。
// ─────────────────────────────────────────────────────────────

type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  font: Font;
  setFont: (font: Font) => void;
  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;
  floating: FloatingState;
  setFloating: (key: FloatingKey, on: boolean) => void;
  navLabels: NavLabelState;
  /** メニュー項目の表示名・アイコンを変える。空文字を渡すとその項目は既定に戻る */
  setNavItemLabel: (href: string, next: { label?: string; icon?: string }) => void;
  /** カテゴリ見出しを変える。空文字を渡すと既定に戻る */
  setNavCategoryLabel: (category: string, label: string) => void;
  /** 1項目だけ既定に戻す */
  resetNavItem: (href: string) => void;
  /** 全部まとめて既定に戻す */
  resetAllNavLabels: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  font: 'outfit',
  setFont: () => {},
  textScale: 100,
  setTextScale: () => {},
  floating: FLOATING_DEFAULT,
  setFloating: () => {},
  navLabels: NAV_LABELS_DEFAULT,
  setNavItemLabel: () => {},
  setNavCategoryLabel: () => {},
  resetNavItem: () => {},
  resetAllNavLabels: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [font, setFontState] = useState<Font>('outfit');
  const [textScale, setTextScaleState] = useState<TextScale>(100);
  const [floating, setFloatingState] = useState<FloatingState>(FLOATING_DEFAULT);
  const [navLabels, setNavLabelsState] = useState<NavLabelState>(NAV_LABELS_DEFAULT);

  useEffect(() => {
    const savedTheme = localStorage.getItem('lumina_theme') as Theme;
    const savedFont = localStorage.getItem('lumina_font') as Font;
    const savedScale = Number(localStorage.getItem(TEXT_SCALE_STORAGE_KEY));
    if (savedTheme) {
      setThemeState(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
    if (savedFont) {
      setFontState(savedFont);
      document.documentElement.setAttribute('data-font', savedFont);
    }
    // 不正値・未設定はすべて100%（既定）に倒す
    if (TEXT_SCALES.some((s) => s.value === savedScale)) {
      setTextScaleState(savedScale as TextScale);
      applyTextScale(savedScale as TextScale);
    }
    // 243: 壊れた値・未設定はすべて既定（全off）に倒す
    try {
      const raw = localStorage.getItem(FLOATING_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FloatingState>;
        setFloatingState({
          assistant: parsed.assistant === true,
          memo: parsed.memo === true,
          glossary: parsed.glossary === true,
        });
      }
    } catch {
      /* 壊れた保存値は既定のまま使う */
    }
    // 251: 壊れた値・未設定はすべて既定名に倒す（parseNavLabels が型ごと均す）
    try {
      const raw = localStorage.getItem(NAV_LABELS_STORAGE_KEY);
      if (raw) setNavLabelsState(parseNavLabels(JSON.parse(raw)));
    } catch {
      /* 壊れた保存値は既定名のまま使う */
    }
  }, []);

  // 251: 保存は1経路にまとめる（書き込み忘れ・キーの取り違えを作らない）
  const persistNavLabels = (next: NavLabelState) => {
    setNavLabelsState(next);
    try {
      localStorage.setItem(NAV_LABELS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 保存できなくても、この画面を開いている間の表示は変わる */
    }
  };

  const setNavItemLabel = (href: string, next: { label?: string; icon?: string }) => {
    setNavLabelsState((prev) => {
      const current = prev.items[href] ?? {};
      const label = next.label !== undefined ? normalizeNavLabel(next.label) : (current.label ?? null);
      const icon = next.icon !== undefined ? normalizeNavIcon(next.icon) : (current.icon ?? null);
      const items = { ...prev.items };
      if (label === null && icon === null) {
        // 中身が空になったら上書き自体を消す＝既定に戻る（空文字のラベルを残さない）
        delete items[href];
      } else {
        items[href] = { ...(label !== null ? { label } : {}), ...(icon !== null ? { icon } : {}) };
      }
      const state = { ...prev, items };
      try {
        localStorage.setItem(NAV_LABELS_STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* 保存できなくても表示は変わる */
      }
      return state;
    });
  };

  const setNavCategoryLabel = (category: string, label: string) => {
    setNavLabelsState((prev) => {
      const normalized = normalizeNavLabel(label);
      const categories = { ...prev.categories };
      if (normalized === null) delete categories[category];
      else categories[category] = normalized;
      const state = { ...prev, categories };
      try {
        localStorage.setItem(NAV_LABELS_STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* 保存できなくても表示は変わる */
      }
      return state;
    });
  };

  const resetNavItem = (href: string) => setNavItemLabel(href, { label: '', icon: '' });

  const resetAllNavLabels = () => persistNavLabels(NAV_LABELS_DEFAULT);

  const setFloating = (key: FloatingKey, on: boolean) => {
    setFloatingState((prev) => {
      const next = { ...prev, [key]: on };
      localStorage.setItem(FLOATING_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const setTextScale = (scale: TextScale) => {
    setTextScaleState(scale);
    applyTextScale(scale);
    localStorage.setItem(TEXT_SCALE_STORAGE_KEY, String(scale));
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('lumina_theme', newTheme);
  };

  const setFont = (newFont: Font) => {
    setFontState(newFont);
    document.documentElement.setAttribute('data-font', newFont);
    localStorage.setItem('lumina_font', newFont);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme, setTheme, font, setFont, textScale, setTextScale, floating, setFloating,
        navLabels, setNavItemLabel, setNavCategoryLabel, resetNavItem, resetAllNavLabels,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

/**
 * 243: 追従ボタンの縦位置を返す。**表示中のボタンだけを下から詰める**ので、
 * offにしたボタンの分が空席にならない。
 * 'backToTop' は常に一番上の段＝スクロールで出入りしても他のボタンが動かない。
 */
export function useFloatingSlot(key: FloatingKey | 'backToTop'): string {
  const { floating } = useTheme();
  const onCount = (list: FloatingKey[]) => list.filter((k) => floating[k]).length;
  if (key === 'backToTop') return floatingBottom(onCount(FLOATING_ORDER));
  return floatingBottom(onCount(FLOATING_ORDER.slice(0, FLOATING_ORDER.indexOf(key))));
}
