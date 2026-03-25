'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'midnight' | 'light' | 'nature';
type Font = 'outfit' | 'noto' | 'inter' | 'zen';

type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  font: Font;
  setFont: (font: Font) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  font: 'outfit',
  setFont: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [font, setFontState] = useState<Font>('outfit');

  useEffect(() => {
    const savedTheme = localStorage.getItem('lumina_theme') as Theme;
    const savedFont = localStorage.getItem('lumina_font') as Font;
    if (savedTheme) {
      setThemeState(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
    if (savedFont) {
      setFontState(savedFont);
      document.documentElement.setAttribute('data-font', savedFont);
    }
  }, []);

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
    <ThemeContext.Provider value={{ theme, setTheme, font, setFont }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
