
import React from 'react';
import { Plus, Instagram, Youtube, Video } from 'lucide-react';
import { SocialPlatform, PLATFORM_CONFIG } from './types';

interface EmptyStateProps {
  onSelectPlatform: (platform: SocialPlatform) => void;
}

export const EmptyState = ({ onSelectPlatform }: EmptyStateProps) => {
  const platforms: Array<{ id: SocialPlatform; icon: typeof Instagram }> = [
    { id: 'instagram', icon: Instagram },
    { id: 'tiktok', icon: Video },
    { id: 'youtube', icon: Youtube }
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      width: '100%',
      padding: '40px',
      textAlign: 'center'
    }}>
      <div style={{ 
        width: '80px', 
        height: '80px', 
        borderRadius: '50%', 
        backgroundColor: '#27272a', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        marginBottom: '24px',
        border: '1px dashed #52525b'
      }}>
        <Plus size={32} color="#a1a1aa" />
      </div>
      
      <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>
        Este Workspace está vazio
      </h2>
      <p style={{ color: '#a1a1aa', marginBottom: '40px', maxWidth: '400px', lineHeight: '1.5' }}>
        Conecte suas redes sociais para começar a gerenciar seu conteúdo, analisar métricas e agendar publicações.
      </p>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {platforms.map((p) => {
          const config = PLATFORM_CONFIG[p.id];
          const Icon = p.icon;
          
          return (
            <button
              key={p.id}
              onClick={() => onSelectPlatform(p.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                padding: '24px',
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '16px',
                width: '140px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = config.color;
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#27272a';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ 
                width: '48px', 
                height: '48px', 
                borderRadius: '12px', 
                backgroundColor: 'rgba(255,255,255,0.05)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Icon color={config.color} size={24} />
              </div>
              <span style={{ color: 'white', fontWeight: 600 }}>{config.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
