/**
 * S07 Dashboard — Simulated CRM UI (10s / 300 frames)
 *
 * Browser chrome → Sidebar slides in → KPI cards stagger → Chart draws
 * → Cursor navigates → Notification pops
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer } from '../../../utils/layout';
import {
  fadeIn,
  fadeOut,
  slideInLeft,
  springIn,
  staggerDelay,
  drawLine,
} from '../../../utils/animations';
import { COLORS, FONTS } from '../../../theme';

// Simulated KPI data
const KPIS = [
  { label: 'Toplam Çağrı', value: '1,247', change: '+12%', color: COLORS.primary },
  { label: 'Yanıtlanan', value: '1,185', change: '%95', color: COLORS.success },
  { label: 'Randevular', value: '89', change: '+23%', color: COLORS.teal },
  { label: 'Memnuniyet', value: '4.8/5', change: '★', color: COLORS.warning },
];

// Sidebar menu items
const MENU_ITEMS = [
  { icon: '📊', label: 'Dashboard', active: true },
  { icon: '📞', label: 'Çağrılar', active: false },
  { icon: '📅', label: 'Randevular', active: false },
  { icon: '📋', label: 'Şikayetler', active: false },
  { icon: '👥', label: 'Müşteriler', active: false },
  { icon: '⚙️', label: 'Ayarlar', active: false },
];

export const S07_Dashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Browser chrome
  const browserOpacity = fadeIn(frame, 5, 15);

  // Sidebar
  const sidebarSlide = slideInLeft(frame, 15, 20, 250);
  const sidebarOpacity = fadeIn(frame, 15, 15);

  // Chart draw
  const chartProgress = drawLine(frame, 120, 60);

  // Notification
  const notifProgress = springIn({
    fps,
    frame,
    delay: 220,
    config: { damping: 12, mass: 0.4, stiffness: 120 },
  });

  // Exit
  const exitOpacity = fadeOut(frame, 270, 30);

  return (
    <SceneContainer>
      <div
        style={{
          width: 1680,
          height: 920,
          borderRadius: 16,
          overflow: 'hidden',
          opacity: browserOpacity * exitOpacity,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          position: 'relative',
        }}
      >
        {/* Browser chrome top bar */}
        <div
          style={{
            height: 44,
            background: '#1a1a2e',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: 8,
            borderBottom: `1px solid ${COLORS.borderColor}`,
          }}
        >
          {/* Window buttons */}
          {['#ff5f57', '#ffbd2e', '#28c940'].map((color, i) => (
            <div
              key={i}
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: color,
              }}
            />
          ))}
          {/* URL bar */}
          <div
            style={{
              flex: 1,
              marginLeft: 16,
              height: 28,
              borderRadius: 6,
              background: COLORS.bgDark,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              fontSize: 13,
              color: COLORS.textMuted,
            }}
          >
            🔒 app.callception.com/dashboard
          </div>
        </div>

        {/* App body */}
        <div style={{ display: 'flex', height: 'calc(100% - 44px)' }}>
          {/* Sidebar */}
          <div
            style={{
              width: 240,
              background: COLORS.bgSurface,
              borderRight: `1px solid ${COLORS.borderColor}`,
              padding: '20px 0',
              opacity: sidebarOpacity,
              transform: `translateX(${sidebarSlide}px)`,
            }}
          >
            {/* Logo */}
            <div
              style={{
                padding: '0 20px 20px',
                fontFamily: FONTS.display,
                fontSize: 18,
                fontWeight: 700,
                color: COLORS.primary,
                borderBottom: `1px solid ${COLORS.borderColor}`,
                marginBottom: 16,
              }}
            >
              CALLCEPTION
            </div>

            {/* Menu items */}
            {MENU_ITEMS.map((item, i) => {
              const menuDelay = 30 + staggerDelay(i, 6);
              const menuOpacity = fadeIn(frame, menuDelay, 12);

              return (
                <div
                  key={i}
                  style={{
                    padding: '12px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: 15,
                    color: item.active ? COLORS.textPrimary : COLORS.textSecondary,
                    background: item.active ? `${COLORS.primary}15` : 'transparent',
                    borderLeft: item.active ? `3px solid ${COLORS.primary}` : '3px solid transparent',
                    opacity: menuOpacity,
                  }}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>

          {/* Main content */}
          <div
            style={{
              flex: 1,
              background: COLORS.bgDark,
              padding: 32,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                marginBottom: 28,
                opacity: fadeIn(frame, 30, 15),
              }}
            >
              <h1
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 28,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  margin: 0,
                }}
              >
                Dashboard
              </h1>
              <p
                style={{
                  fontSize: 14,
                  color: COLORS.textMuted,
                  marginTop: 4,
                }}
              >
                Son 30 gün performans özeti
              </p>
            </div>

            {/* KPI Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 20,
                marginBottom: 28,
              }}
            >
              {KPIS.map((kpi, i) => {
                const kpiDelay = 50 + staggerDelay(i, 10);
                const kpiProgress = springIn({
                  fps,
                  frame,
                  delay: kpiDelay,
                  config: { damping: 14, mass: 0.4, stiffness: 100 },
                });

                return (
                  <div
                    key={i}
                    style={{
                      background: COLORS.bgCard,
                      border: `1px solid ${COLORS.borderColor}`,
                      borderRadius: 12,
                      padding: '20px 24px',
                      opacity: kpiProgress,
                      transform: `translateY(${(1 - kpiProgress) * 20}px)`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        color: COLORS.textMuted,
                        marginBottom: 8,
                      }}
                    >
                      {kpi.label}
                    </div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 700,
                        color: COLORS.textPrimary,
                        fontFamily: FONTS.display,
                      }}
                    >
                      {kpi.value}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: kpi.color,
                        marginTop: 4,
                        fontWeight: 600,
                      }}
                    >
                      {kpi.change}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chart area */}
            <div
              style={{
                background: COLORS.bgCard,
                border: `1px solid ${COLORS.borderColor}`,
                borderRadius: 12,
                padding: 28,
                height: 320,
                position: 'relative',
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: COLORS.textPrimary,
                  marginBottom: 24,
                }}
              >
                Çağrı Analizi
              </div>

              {/* SVG Chart */}
              <svg
                width="100%"
                height="240"
                viewBox="0 0 1100 240"
                style={{ overflow: 'visible' }}
              >
                {/* Grid lines */}
                {[0, 60, 120, 180, 240].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    y1={y}
                    x2="1100"
                    y2={y}
                    stroke={COLORS.borderColor}
                    strokeWidth="1"
                    opacity="0.3"
                  />
                ))}

                {/* Chart line */}
                <polyline
                  points="0,180 100,150 200,160 300,120 400,100 500,110 600,70 700,80 800,50 900,60 1000,30 1100,40"
                  fill="none"
                  stroke={COLORS.primary}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="2000"
                  strokeDashoffset={2000 * (1 - chartProgress)}
                />

                {/* Area fill */}
                <polygon
                  points="0,180 100,150 200,160 300,120 400,100 500,110 600,70 700,80 800,50 900,60 1000,30 1100,40 1100,240 0,240"
                  fill={`${COLORS.primary}10`}
                  opacity={chartProgress}
                />

                {/* Second line (teal) */}
                <polyline
                  points="0,200 100,190 200,185 300,170 400,160 500,165 600,140 700,145 800,130 900,135 1000,120 1100,125"
                  fill="none"
                  stroke={COLORS.teal}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="2000"
                  strokeDashoffset={2000 * (1 - Math.max(0, chartProgress - 0.1) / 0.9)}
                  opacity="0.8"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Notification popup */}
        {frame >= 220 && (
          <div
            style={{
              position: 'absolute',
              top: 60,
              right: 20,
              width: 340,
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.teal}40`,
              borderRadius: 12,
              padding: 16,
              boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${COLORS.glowTeal}`,
              opacity: notifProgress,
              transform: `translateX(${(1 - notifProgress) * 50}px)`,
              zIndex: 50,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: `${COLORS.teal}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                📅
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>
                  Yeni Randevu Oluşturuldu
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                  AI asistan tarafından otomatik • 2 dk önce
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </SceneContainer>
  );
};
