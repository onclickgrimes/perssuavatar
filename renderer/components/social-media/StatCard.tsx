
import React from 'react';
import { MoreHorizontal, LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: 'up' | 'down';
  trendValue?: string;
}

export const StatCard = ({ icon: Icon, label, value, trend, trendValue = '12%' }: StatCardProps) => (
  <div style={{
    backgroundColor: '#18181b',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid #27272a',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '14px' }}>
        <Icon size={16} />
        <span>{label}</span>
      </div>
      <MoreHorizontal size={16} color="#52525b" style={{ cursor: 'pointer' }} />
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
      <span style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>{value}</span>
      <span style={{ 
        fontSize: '12px', 
        color: trend === 'up' ? '#4ade80' : '#f87171',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        backgroundColor: trend === 'up' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
        padding: '2px 6px',
        borderRadius: '4px'
      }}>
        {trend === 'up' ? '↑' : '↓'} {trendValue}
      </span>
    </div>
  </div>
);
