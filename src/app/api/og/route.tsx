import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#faf9f7',
          display: 'flex',
          position: 'relative',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{
          position: 'absolute', left: 0, top: 0,
          width: '10px', height: '630px',
          background: '#6c63ff',
          borderRadius: '3px 0 0 3px',
        }} />

        <div style={{
          position: 'absolute', right: '-40px', top: '-40px',
          width: '320px', height: '320px',
          borderRadius: '50%',
          background: '#f3f0ff',
          opacity: 0.8,
        }} />
        <div style={{
          position: 'absolute', right: '20px', top: '20px',
          width: '200px', height: '200px',
          borderRadius: '50%',
          background: '#ede9fe',
          opacity: 0.6,
        }} />

        <div style={{
          position: 'absolute', left: '60px', bottom: '-40px',
          width: '200px', height: '200px',
          borderRadius: '50%',
          background: '#fce7f3',
          opacity: 0.4,
        }} />

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '60px 80px',
          width: '100%',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
            <div style={{
              width: '64px', height: '64px',
              background: '#6c63ff',
              borderRadius: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '32px', fontWeight: '700', color: 'white',
            }}>L</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a2e', letterSpacing: '3px' }}>xLUMINA</span>
              <span style={{ fontSize: '14px', color: '#6c63ff', letterSpacing: '1px', marginTop: '2px' }}>クリニックスタッフ成長支援</span>
            </div>
          </div>

          <div style={{ width: '600px', height: '2px', background: '#e8e4ff', marginBottom: '40px' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px' }}>
            <span style={{ fontSize: '56px', fontWeight: '700', color: '#1a1a2e', lineHeight: 1.2 }}>
              スタッフの成長を、
            </span>
            <span style={{ fontSize: '56px', fontWeight: '700', color: '#6c63ff', lineHeight: 1.2 }}>
              AIが支える。
            </span>
          </div>

          <div style={{ fontSize: '20px', color: '#6b7280', marginBottom: '40px' }}>
            評価・1on1・採用・等級制度をひとつのプラットフォームで
          </div>

          <div style={{ width: '800px', height: '1px', background: '#e5e7eb', marginBottom: '28px' }} />

          <div style={{ display: 'flex', gap: '12px' }}>
            {[
              { label: 'スタッフ評価', bg: '#ede9fe', color: '#6c63ff' },
              { label: '1on1管理', bg: '#fce7f3', color: '#db2777' },
              { label: '採用AI分析', bg: '#ecfdf5', color: '#059669' },
              { label: '等級制度', bg: '#fffbeb', color: '#d97706' },
            ].map(tag => (
              <div key={tag.label} style={{
                padding: '8px 20px',
                background: tag.bg,
                color: tag.color,
                borderRadius: '20px',
                fontSize: '16px',
                fontWeight: '500',
              }}>{tag.label}</div>
            ))}
          </div>
        </div>

        <div style={{
          position: 'absolute', right: '60px', bottom: '40px',
          fontSize: '18px', color: '#9ca3af',
        }}>xlumina.jp</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
