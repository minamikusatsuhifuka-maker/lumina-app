'use client';

const CIRCLES = [
  { level: 5, label: 'G5 地域・業界', color: '#8b5cf6', radius: 160 },
  { level: 4, label: 'G4 患者さん',   color: '#06b6d4', radius: 126 },
  { level: 3, label: 'G3 クリニック', color: '#4ade80', radius: 94  },
  { level: 2, label: 'G2 チーム',    color: '#60a5fa', radius: 64  },
  { level: 1, label: 'G1 自分',      color: '#94a3b8', radius: 36  },
];

export function ConcentricCircleChart({ selectedLevel = 0 }: { selectedLevel?: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 10 }}>
      <svg width="340" height="340" viewBox="0 0 340 340">
        {CIRCLES.map(circle => (
          <g key={circle.level}>
            <circle
              cx={170} cy={170}
              r={circle.radius}
              fill={`${circle.color}${circle.level <= selectedLevel ? '20' : '08'}`}
              stroke={circle.color}
              strokeWidth={circle.level <= selectedLevel ? 2.5 : 1}
              strokeDasharray={circle.level > selectedLevel ? '4,4' : 'none'}
              strokeOpacity={circle.level <= selectedLevel ? 0.6 : 0.2}
            />
            {circle.level >= 2 && (
              <text
                x={170}
                y={170 - circle.radius + 15}
                textAnchor="middle"
                fontSize={10}
                fill={circle.level <= selectedLevel ? circle.color : '#94a3b8'}
                fontWeight={circle.level <= selectedLevel ? 700 : 400}
              >
                {circle.label}
              </text>
            )}
          </g>
        ))}
        <text x={170} y={168} textAnchor="middle" fontSize={11} fill="#94a3b8" fontWeight={700}>G1</text>
        <text x={170} y={182} textAnchor="middle" fontSize={9} fill="#94a3b8">自分自身</text>
      </svg>
    </div>
  );
}
