
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { Search, Plus, Loader2 } from 'lucide-react';
import { Sidebar } from '../components/social-media/Sidebar';
import { EmptyState } from '../components/social-media/EmptyState';
import { Dashboard } from '../components/social-media/Dashboard';
import { Workspace, ViewState, SocialPlatform, ConnectionState, PLATFORM_CONFIG } from '../components/social-media/types';

// ========================================
// MOCK DATA
// ========================================

const INITIAL_WORKSPACES: Workspace[] = [
  { 
    id: 'ws-1', 
    name: 'Histórias da Bíblia', 
    channels: []
  },
  { 
    id: 'ws-2', 
    name: 'Marketing Pessoal', 
    channels: [
      { id: 'c-1', platform: 'instagram', name: '@eu.marketer', followers: 12500, status: 'good' }
    ] 
  }
];

// ========================================
// PAGE COMPONENT
// ========================================

export default function SocialMediaPage() {
  const [currentView, setCurrentView] = useState<ViewState>('overview');
  const [workspaces, setWorkspaces] = useState<Workspace[]>(INITIAL_WORKSPACES);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(INITIAL_WORKSPACES[0].id);
  
  // Estado de conexão
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connectingPlatform, setConnectingPlatform] = useState<SocialPlatform | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('');
  
  // Computed
  const currentWorkspace = workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0];
  const hasChannels = currentWorkspace.channels.length > 0;

  // Setup IPC listeners
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.socialMedia) return;

    const unsubscribeStatus = window.electron.socialMedia.onConnectionStatus((data: any) => {
      if (data.workspaceId === selectedWorkspaceId) {
        setConnectionStatus(data.status);
      }
    });

    const unsubscribeSuccess = window.electron.socialMedia.onConnectionSuccess((data: any) => {
      if (data.workspaceId === selectedWorkspaceId) {
        console.log(`✅ Conectado ao ${data.platform} como ${data.username}`);
        
        // Adiciona o canal ao workspace atual
        setWorkspaces(prev => prev.map(ws => {
          if (ws.id === selectedWorkspaceId) {
            return {
              ...ws,
              channels: [
                ...ws.channels,
                {
                  id: `${data.platform}-${Date.now()}`,
                  platform: data.platform as SocialPlatform,
                  name: data.username,
                  followers: 0,
                  status: 'good' as const
                }
              ]
            };
          }
          return ws;
        }));
        
        setConnectingPlatform(null);
        setConnectionState('connected');
        setConnectionStatus('');
      }
    });

    const unsubscribeError = window.electron.socialMedia.onConnectionError((data: any) => {
      if (data.workspaceId === selectedWorkspaceId) {
        console.error(`❌ Erro ao conectar ${data.platform}:`, data.error);
        setConnectingPlatform(null);
        setConnectionState('disconnected');
        setConnectionStatus('');
      }
    });

    return () => {
      unsubscribeStatus?.();
      unsubscribeSuccess?.();
      unsubscribeError?.();
    };
  }, [selectedWorkspaceId]);

  // Handlers
  const handleSelectPlatform = async (platform: SocialPlatform) => {
    if (typeof window === 'undefined' || !window.electron?.socialMedia) {
      console.error('Electron IPC não disponível');
      return;
    }

    console.log(`🔌 Iniciando conexão com ${platform}...`);
    setConnectingPlatform(platform);
    setConnectionState('connecting');
    setConnectionStatus('launching');

    try {
      await window.electron.socialMedia.connectPlatform(selectedWorkspaceId, platform);
    } catch (error) {
      console.error('Erro ao conectar:', error);
      setConnectingPlatform(null);
      setConnectionState('disconnected');
    }
  };

  const handleCancelConnection = async () => {
    if (connectingPlatform && window.electron?.socialMedia) {
      await window.electron.socialMedia.cancelConnection(selectedWorkspaceId, connectingPlatform);
    }
    setConnectingPlatform(null);
    setConnectionState('disconnected');
    setConnectionStatus('');
  };

  // Renderiza status de conexão enquanto Puppeteer está aberto
  const renderConnectionStatus = () => {
    if (!connectingPlatform) return null;
    
    const config = PLATFORM_CONFIG[connectingPlatform];
    
    const statusMessages: Record<string, string> = {
      'launching': 'Iniciando navegador...',
      'navigating': 'Navegando para a página de login...',
      'waiting_login': 'Aguardando você fazer login no navegador...',
      'saving_cookies': 'Salvando credenciais...',
    };

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
          backgroundColor: 'rgba(99, 102, 241, 0.1)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          marginBottom: '24px',
          border: `2px solid ${config.color}`
        }}>
          <Loader2 
            size={32} 
            color={config.color} 
            style={{ animation: 'spin 1s linear infinite' }} 
          />
        </div>
        
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>
          Conectando {config.label}
        </h2>
        <p style={{ color: '#a1a1aa', marginBottom: '24px', maxWidth: '400px', lineHeight: '1.5' }}>
          {statusMessages[connectionStatus] || 'Processando...'}
        </p>
        
        <p style={{ color: '#71717a', fontSize: '13px', marginBottom: '32px', maxWidth: '450px' }}>
          Uma janela do navegador foi aberta. Faça login na sua conta e ela será fechada automaticamente quando detectarmos o login.
        </p>

        <button
          onClick={handleCancelConnection}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            backgroundColor: 'transparent',
            border: '1px solid #3f3f46',
            color: 'white',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Cancelar
        </button>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  };

  // Renderiza o conteúdo principal baseado no estado
  const renderMainContent = () => {
    // Se está conectando, mostra status
    if (connectionState === 'connecting' && connectingPlatform) {
      return renderConnectionStatus();
    }
    
    // Se tem canais, mostra dashboard
    if (hasChannels) {
      return <Dashboard />;
    }
    
    // Senão, mostra empty state
    return <EmptyState onSelectPlatform={handleSelectPlatform} />;
  };

  return (
    <>
      <Head>
        <title>Social Media | Avatar AI</title>
      </Head>
      <div style={{ 
        display: 'flex', 
        height: '100vh', 
        width: '100%', 
        backgroundColor: '#09090b', 
        fontFamily: 'Inter, sans-serif',
        overflow: 'hidden'
      }}>
        
        {/* Sidebar */}
        <Sidebar 
          currentView={currentView} 
          setView={setCurrentView} 
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
          onWorkspaceChange={setSelectedWorkspaceId}
        />

        {/* Main Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Top Bar - Esconde durante conexão */}
          {connectionState !== 'connecting' && (
            <header style={{
              height: '70px',
              borderBottom: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: '0 32px',
              backgroundColor: '#121212'
            }}>
              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                   <Search size={18} color="#a1a1aa" style={{ position: 'absolute', left: '12px' }} />
                   <input 
                      placeholder="Buscar..." 
                      style={{ 
                        backgroundColor: '#18181b', 
                        border: '1px solid #27272a', 
                        borderRadius: '20px', 
                        padding: '8px 12px 8px 36px',
                        color: 'white',
                        fontSize: '13px',
                        width: '200px',
                        outline: 'none'
                      }}
                   />
                </div>

                <button style={{
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                }}>
                  <Plus size={16} />
                  Novo Post
                </button>
              </div>
            </header>
          )}

          {/* Page Content */}
          <main style={{ 
            flex: 1, 
            overflow: 'hidden',
            padding: '32px',
            backgroundColor: '#09090b'
          }}>
            {renderMainContent()}
          </main>

        </div>
      </div>
    </>
  );
}
