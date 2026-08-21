'use client';

// 251: 🎛表示設定の「サイドバーのメニュー名」セクション。
//
// 変えられるのは**サイドバーの表示だけ**（URL・ページ内の見出しは変わらない）。
// 保存はテーマ・文字サイズ・追従ボタンと同じ localStorage（ThemeProvider が一元管理）。
//
// カテゴリごとに折りたたむ。全カテゴリを開いた状態で並べると100項目を超えて
// 目的の1つに辿り着けないため、既定は全部閉じ、変更済みの件数だけ見出しに出す。

import { useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { navCategories } from '@/lib/nav-items';
import {
  countNavRenames,
  isNavItemRenamed,
  MAX_NAV_ICON_LENGTH,
  MAX_NAV_LABEL_LENGTH,
  navCategoryLabelOf,
  navIconOf,
  navLabelOf,
} from '@/lib/nav-labels';

export default function NavLabelSettings() {
  const {
    navLabels,
    setNavItemLabel,
    setNavCategoryLabel,
    resetNavItem,
    resetAllNavLabels,
  } = useTheme();
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const renamedTotal = countNavRenames(navLabels);

  const resetAll = () => {
    if (renamedTotal === 0) return;
    const ok = window.confirm(
      `変更した${renamedTotal}件のメニュー名をすべて既定に戻します。\n\n` +
        `メニューそのものは消えません（名前とアイコンが元に戻るだけです）。\n` +
        `よろしいですか？`,
    );
    if (ok) resetAllNavLabels();
  };

  return (
    <section
      data-nav-label-settings
      style={{
        marginTop: 16,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 4,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>🏷 サイドバーのメニュー名</h2>
        <button
          type="button"
          data-nav-reset-all
          onClick={resetAll}
          disabled={renamedTotal === 0}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: renamedTotal === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
            cursor: renamedTotal === 0 ? 'default' : 'pointer',
            opacity: renamedTotal === 0 ? 0.5 : 1,
          }}
        >
          ↩ すべて既定に戻す{renamedTotal > 0 ? `（${renamedTotal}件）` : ''}
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
        左のサイドバーに出る名前とアイコンを、好きなものに変えられます。
        変わるのは<strong>サイドバーの表示だけ</strong>で、ページの中の見出しやURLは元のままです
        （他の画面の案内文と食い違わないようにするため）。
        名前を空にすると既定に戻ります。設定はこのブラウザに保存されます。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {navCategories.map((cat) => {
          const open = openCategory === cat.category;
          const renamedInCat =
            cat.items.filter((i) => isNavItemRenamed(navLabels, i.href)).length +
            (navLabels.categories[cat.category] ? 1 : 0);
          return (
            <div
              key={cat.category}
              data-nav-category-block={cat.category}
              style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}
            >
              <button
                type="button"
                data-nav-category-toggle={cat.category}
                onClick={() => setOpenCategory(open ? null : cat.category)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '12px 14px',
                  border: 'none',
                  background: open ? 'rgba(108,99,255,0.08)' : 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{open ? '▼' : '▶'}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {navCategoryLabelOf(navLabels, cat.category)}
                </span>
                {renamedInCat > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(108,99,255,0.15)',
                      color: '#6c63ff',
                    }}
                  >
                    変更 {renamedInCat}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cat.items.length}項目</span>
              </button>

              {open && (
                <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* カテゴリ見出しそのものの名前 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                      marginBottom: 4,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 92 }}>
                      カテゴリ見出し
                    </span>
                    <input
                      data-nav-category-input={cat.category}
                      value={navLabels.categories[cat.category] ?? ''}
                      placeholder={cat.category}
                      maxLength={MAX_NAV_LABEL_LENGTH}
                      onChange={(e) => setNavCategoryLabel(cat.category, e.target.value)}
                      style={inputStyle(!!navLabels.categories[cat.category])}
                    />
                    {navLabels.categories[cat.category] && (
                      <button
                        type="button"
                        onClick={() => setNavCategoryLabel(cat.category, '')}
                        title={`既定名「${cat.category}」に戻す`}
                        style={resetBtnStyle}
                      >
                        ↩ 戻す
                      </button>
                    )}
                  </div>

                  {cat.items.map((item) => {
                    const renamed = isNavItemRenamed(navLabels, item.href);
                    return (
                      <div
                        key={item.href}
                        data-nav-row={item.href}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                      >
                        <input
                          data-nav-icon-input={item.href}
                          value={navLabels.items[item.href]?.icon ?? ''}
                          placeholder={item.icon}
                          maxLength={MAX_NAV_ICON_LENGTH}
                          onChange={(e) => setNavItemLabel(item.href, { icon: e.target.value })}
                          aria-label={`${item.label}のアイコン`}
                          style={{ ...inputStyle(!!navLabels.items[item.href]?.icon), width: 52, textAlign: 'center', flex: 'none' }}
                        />
                        <input
                          data-nav-label-input={item.href}
                          value={navLabels.items[item.href]?.label ?? ''}
                          placeholder={item.label}
                          maxLength={MAX_NAV_LABEL_LENGTH}
                          onChange={(e) => setNavItemLabel(item.href, { label: e.target.value })}
                          aria-label={`${item.label}の表示名`}
                          style={{ ...inputStyle(!!navLabels.items[item.href]?.label), flex: 1, minWidth: 140 }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            width: 120,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={`サイドバーでの表示: ${navIconOf(navLabels, item.href, item.icon)} ${navLabelOf(navLabels, item.href, item.label)}`}
                        >
                          {navIconOf(navLabels, item.href, item.icon)}{' '}
                          {navLabelOf(navLabels, item.href, item.label)}
                        </span>
                        <button
                          type="button"
                          data-nav-reset={item.href}
                          onClick={() => resetNavItem(item.href)}
                          disabled={!renamed}
                          title={`既定「${item.icon} ${item.label}」に戻す`}
                          style={{ ...resetBtnStyle, opacity: renamed ? 1 : 0.3, cursor: renamed ? 'pointer' : 'default' }}
                        >
                          ↩ 戻す
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.7 }}>
        名前は{MAX_NAV_LABEL_LENGTH}文字までです（サイドバーの幅で折り返さないため）。
        変更した項目は、サイドバーでマウスを乗せると既定の名前が出ます。
      </p>
    </section>
  );
}

function inputStyle(changed: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    fontSize: 13,
    borderRadius: 8,
    border: `1px solid ${changed ? 'var(--border-accent, #6c63ff)' : 'var(--border)'}`,
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    outline: 'none',
  };
}

const resetBtnStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '5px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flex: 'none',
};
