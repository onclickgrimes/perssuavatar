
import React from 'react';
import { Instagram, Youtube, Video, Check, X, Loader2, Trash2, ExternalLink, AlertCircle } from 'lucide-react';
import { TikTokIcon } from './icons/TikTokIcon';
import { SocialPlatform, PLATFORM_CONFIG, Channel } from './types';

interface ConnectedAccountsProps {
  channels: Channel[];
  onConnect: (platform: SocialPlatform) => void;
  onDisconnect: (platform: SocialPlatform) => void;
  onOpenBrowser: (platform: SocialPlatform) => void;
  connectingPlatform: SocialPlatform | null;
}

const PLATFORMS: Array<{ id: SocialPlatform; icon: typeof Instagram }> = [
  { id: 'instagram', icon: Instagram },
  { id: 'tiktok', icon: Video },
  { id: 'youtube', icon: Youtube }
];

export const ConnectedAccounts = ({ 
  channels, 
  onConnect, 
  onDisconnect,
  onOpenBrowser,
  connectingPlatform 
}: ConnectedAccountsProps) => {
  
  // Verifica se uma plataforma está conectada
  const getConnectedChannel = (platform: SocialPlatform): Channel | undefined => {
    return channels.find(c => c.platform === platform);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      maxWidth: '800px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ 
          fontSize: '28px', 
          fontWeight: 700, 
          color: 'white', 
          marginBottom: '8px' 
        }}>
          Contas Conectadas
        </h1>
        <p style={{ color: '#a1a1aa', fontSize: '14px', lineHeight: '1.5' }}>
          Gerencie suas contas de redes sociais conectadas a este workspace.
        </p>
      </div>

      {/* Lista de Plataformas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {PLATFORMS.map((platform) => {
          const config = PLATFORM_CONFIG[platform.id];
          const connectedChannel = getConnectedChannel(platform.id);
          const isConnected = !!connectedChannel;
          const isConnecting = connectingPlatform === platform.id;
          const Icon = platform.icon;

          return (
            <div
              key={platform.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px 24px',
                backgroundColor: '#18181b',
                border: `1px solid ${isConnected ? config.color + '40' : '#27272a'}`,
                borderRadius: '12px',
                transition: 'all 0.2s ease'
              }}
            >
              {/* Info da Plataforma */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: isConnected ? config.color + '20' : '#27272a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}>
                  {platform.id === 'tiktok' ? (
                    <TikTokIcon size={24} color={isConnected ? undefined : '#71717a'} />
                  ) : (
                    <Icon size={24} color={isConnected ? config.color : '#71717a'} />
                  )}
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ 
                      color: 'white', 
                      fontWeight: 600, 
                      fontSize: '16px' 
                    }}>
                      {config.label}
                    </span>
                    
                    {/* Badge de Status */}
                    {isConnected && (
                      connectedChannel.needsRelogin ? (
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          backgroundColor: 'rgba(234, 179, 8, 0.1)',
                          color: '#eab308',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '20px',
                          border: '1px solid rgba(234, 179, 8, 0.2)'
                        }}>
                          <AlertCircle size={12} />
                          Reconectar
                        </span>
                      ) : (
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          color: '#22c55e',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '20px',
                          border: '1px solid rgba(34, 197, 94, 0.2)'
                        }}>
                          <Check size={12} />
                          Conectado
                        </span>
                      )
                    )}
                  </div>
                  
                  <span style={{ 
                    color: '#71717a', 
                    fontSize: '13px',
                    marginTop: '2px',
                    display: 'block'
                  }}>
                    {isConnected 
                      ? connectedChannel.name 
                      : 'Não conectado'
                    }
                  </span>
                </div>
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isConnecting ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    color: config.color
                  }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: '13px' }}>Conectando...</span>
                  </div>
                ) : isConnected ? (
                  <>
                    {/* Botão Ver Conta */}
                    <button
                      onClick={() => onOpenBrowser(platform.id)}
                      title="Ver conta no navegador"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '36px',
                        height: '36px',
                        padding: '0',
                        backgroundColor: 'transparent',
                        border: '1px solid #3f3f46',
                        borderRadius: '8px',
                        color: '#a1a1aa',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = config.color;
                        e.currentTarget.style.color = config.color;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#3f3f46';
                        e.currentTarget.style.color = '#a1a1aa';
                      }}
                    >
                      <ExternalLink size={16} />
                    </button>
                    
                    {/* Botão Desconectar */}
                    <button
                      onClick={() => onDisconnect(platform.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        backgroundColor: 'transparent',
                        border: '1px solid #3f3f46',
                        borderRadius: '8px',
                        color: '#a1a1aa',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#ef4444';
                        e.currentTarget.style.color = '#ef4444';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#3f3f46';
                        e.currentTarget.style.color = '#a1a1aa';
                      }}
                    >
                      <Trash2 size={14} />
                      Desconectar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onConnect(platform.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      backgroundColor: config.color,
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: `0 4px 12px ${config.color}30`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = `0 6px 16px ${config.color}40`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${config.color}30`;
                    }}
                  >
                    Conectar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info adicional */}
      <div style={{
        marginTop: '32px',
        padding: '16px 20px',
        backgroundColor: 'rgba(99, 102, 241, 0.05)',
        border: '1px solid rgba(99, 102, 241, 0.1)',
        borderRadius: '10px'
      }}>
        <p style={{ 
          color: '#a1a1aa', 
          fontSize: '13px', 
          lineHeight: '1.6',
          margin: 0 
        }}>
          💡 Ao conectar uma conta, um navegador será aberto para você fazer login de forma segura. 
          Suas credenciais são armazenadas localmente neste workspace.
        </p>
      </div>

      {/* Estilos para animação */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
