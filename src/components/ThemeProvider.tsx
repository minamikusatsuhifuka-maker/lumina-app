'use client';
import { createContext, useContext, useEffect, useState } from 'react';

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

type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  font: Font;
  setFont: (font: Font) => void;
  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  font: 'outfit',
  setFont: () => {},
  textScale: 100,
  setTextScale: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [font, setFontState] = useState<Font>('outfit');
  const [textScale, setTextScaleState] = useState<TextScale>(100);

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
  }, []);

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
    <ThemeContext.Provider value={{ theme, setTheme, font, setFont, textScale, setTextScale }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
