/**
 * S07 Dashboard — Simulated Mobile CRM UI (Mobile 9:16)
 * Phone mockup with mobile layout: top nav, 2-col KPIs, chart, bottom nav
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneContainer } from '../../../utils/layout';
import { fadeIn, fadeOut, slideUp, springIn, staggerDelay, drawLine } from '../../../utils/animations';
import { COLORS, FONTS } from '../../../theme-en';

const KPIS = [
  { label: 'Total Calls', value: '1,247', change: '+12%', color: COLORS.primary },
  { label: 'Answered', value: '1,185', change: '95%', color: COLORS.success },
  { label: 'Appointments', value: '89', change: '+23%', color: COLORS.teal },
  { label: 'Satisfaction', value: '4.8/5', change: '★', color: COLORS.warning },
];

const NAV_ITEMS = [
  { icon: '📊', label: 'Home', active: true },
  { icon: '📞', label: 'Calls', active: false },
  { icon: '📅', label: 'Calendar', active: false },
  { icon: '⚙️', label: 'Settings', active: false },
];

export const S07_Dashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phoneOpacity = fadeIn(frame, 5, 15);
  const contentOpacity = fadeIn(frame, 20, 15);
  const chartProgress = drawLine(frame, 100, 50);
  const notifProgress = springIn({ fps, frame, delay: 200, config: { damping: 12, mass: 0.4, stiffness: 120 } });
  const exitOpacity = fadeOut(frame, 270, 30);

  return (
    <SceneContainer>
      {/* Phone frame */}
      <div style={{
        width: 680, height: 1380, borderRadius: 48, overflow: 'hidden',
        opacity: phoneOpacity * exitOpacity,
        boxShadow: '0 20px 80px rgba(0,0,0,0.6), 0 0 0 3px #333',
        position: 'relative',
        background: COLORS.bgDark,
      }}>
        {/* Status bar */}
        <div style={{
          height: 50, padding: '0 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 14, fontWeight: 600, color: COLORS.textPrimary,
        }}>
          <span>9:41</span>
          <div style={{
            width: 120, height: 28, borderRadius: 14,
            background: '#000', position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          }} />
          <span style={{ fontSize: 13 }}>📶 🔋</span>
        </div>

        {/* App header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${COLORS.borderColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          opacity: contentOpacity,
        }}>
          <div>
            <div style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 700, color: COLORS.primary }}>CALLCEPTION</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>Dashboard</div>
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: 18,
            background: `${COLORS.primary}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>👤</div>
        </div>

        {/* Scrollable content */}
        <div style={{ padding: '20px 20px 100px', overflow: 'hidden' }}>
          {/* Period label */}
          <div style={{
            fontSize: 13, color: COLORS.textMuted, marginBottom: 16,
            opacity: fadeIn(frame, 30, 12),
          }}>
            Last 30 days
          </div>

          {/* KPIs — 2×2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            {KPIS.map((kpi, i) => {
              const kpiProgress = springIn({ fps, frame, delay: 40 + staggerDelay(i, 8), config: { damping: 14, mass: 0.4, stiffness: 100 } });
              return (
                <div key={i} style={{
                  background: COLORS.bgCard, border: `1px solid ${COLORS.borderColor}`,
                  borderRadius: 12, padding: '16px 14px',
                  opacity: kpiProgress, transform: `translateY(${(1 - kpiProgress) * 15}px)`,
                }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>{kpi.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, fontFamily: FONTS.display }}>{kpi.value}</div>
                  <div style={{ fontSize: 12, color: kpi.color, marginTop: 4, fontWeight: 600 }}>{kpi.change}</div>
                </div>
              );
            })}
          </div>

          {/* Chart */}
          <div style={{
            background: COLORS.bgCard, border: `1px solid ${COLORS.borderColor}`,
            borderRadius: 12, padding: 20, marginBottom: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 16 }}>Call Analytics</div>
            <svg width="100%" height="180" viewBox="0 0 600 180" style={{ overflow: 'visible' }}>
              {[0, 45, 90, 135, 180].map((y) => (
                <line key={y} x1="0" y1={y} x2="600" y2={y} stroke={COLORS.borderColor} strokeWidth="1" opacity="0.3" />
              ))}
              <polyline
                points="0,140 60,110 120,120 180,90 240,75 300,80 360,55 420,60 480,40 540,45 600,30"
                fill="none" stroke={COLORS.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="1500" strokeDashoffset={1500 * (1 - chartProgress)}
              />
              <polygon
                points="0,140 60,110 120,120 180,90 240,75 300,80 360,55 420,60 480,40 540,45 600,30 600,180 0,180"
                fill={`${COLORS.primary}10`} opacity={chartProgress}
              />
              <polyline
                points="0,155 60,145 120,140 180,125 240,120 300,122 360,105 420,108 480,95 540,100 600,90"
                fill="none" stroke={COLORS.teal} strokeWidth="1.5" strokeLinecap="round"
                strokeDasharray="1500" strokeDashoffset={1500 * (1 - Math.max(0, chartProgress - 0.1) / 0.9)} opacity="0.8"
              />
            </svg>
          </div>

          {/* Recent activity */}
          <div style={{
            background: COLORS.bgCard, border: `1px solid ${COLORS.borderColor}`,
            borderRadius: 12, padding: 16,
            opacity: fadeIn(frame, 140, 15),
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 12 }}>Recent Activity</div>
            {['Incoming call answered • 2m ago', 'Appointment created • 5m ago', 'Complaint resolved • 12m ago'].map((item, i) => (
              <div key={i} style={{
                fontSize: 13, color: COLORS.textSecondary, padding: '8px 0',
                borderBottom: i < 2 ? `1px solid ${COLORS.borderColor}40` : 'none',
                opacity: fadeIn(frame, 150 + staggerDelay(i, 8), 10),
              }}>
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom navigation */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
          background: COLORS.bgSurface, borderTop: `1px solid ${COLORS.borderColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          padding: '0 16px 12px',
        }}>
          {NAV_ITEMS.map((item, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              opacity: fadeIn(frame, 25 + staggerDelay(i, 5), 10),
            }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{
                fontSize: 10, fontWeight: 500,
                color: item.active ? COLORS.primary : COLORS.textMuted,
              }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Notification popup */}
        {frame >= 200 && (
          <div style={{
            position: 'absolute', top: 60, left: 20, right: 20,
            background: COLORS.bgCard, border: `1px solid ${COLORS.teal}40`,
            borderRadius: 14, padding: 14,
            boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${COLORS.glowTeal}`,
            opacity: notifProgress, transform: `translateY(${(1 - notifProgress) * -30}px)`, zIndex: 50,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${COLORS.teal}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>📅</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>New Appointment</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>Auto-created by AI • 2 min ago</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </SceneContainer>
  );
};
