
import React, { useState } from 'react';
import Head from 'next/head';
import { Search, Plus } from 'lucide-react';
import { Sidebar } from '../components/social-media/Sidebar';
import { EmptyState } from '../components/social-media/EmptyState';
import { Dashboard } from '../components/social-media/Dashboard';
import { LoginWebview } from '../components/social-media/LoginWebview';
import { Workspace, ViewState, SocialPlatform, ConnectionState } from '../components/social-media/types';

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
  
  // Computed
  const currentWorkspace = workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0];
  const hasChannels = currentWorkspace.channels.length > 0;

  // Handlers
  const handleSelectPlatform = (platform: SocialPlatform) => {
    console.log(`🔌 Iniciando conexão com ${platform}...`);
    setConnectingPlatform(platform);
    setConnectionState('connecting');
  };

  const handleCancelConnection = () => {
    console.log('❌ Conexão cancelada');
    setConnectingPlatform(null);
    setConnectionState('disconnected');
  };

  const handleConnectionSuccess = (platform: SocialPlatform, username: string) => {
    console.log(`✅ Conectado ao ${platform} como ${username}`);
    
    // Adiciona o canal ao workspace atual
    setWorkspaces(prev => prev.map(ws => {
      if (ws.id === selectedWorkspaceId) {
        return {
          ...ws,
          channels: [
            ...ws.channels,
            {
              id: `${platform}-${Date.now()}`,
              platform,
              name: username,
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
  };

  // Renderiza o conteúdo principal baseado no estado
  const renderMainContent = () => {
    // Se está conectando, mostra o webview
    if (connectionState === 'connecting' && connectingPlatform) {
      return (
        <LoginWebview
          platform={connectingPlatform}
          workspaceId={selectedWorkspaceId}
          onCancel={handleCancelConnection}
          onSuccess={handleConnectionSuccess}
        />
      );
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
            padding: connectionState === 'connecting' ? '0' : '32px',
            backgroundColor: '#09090b'
          }}>
            {renderMainContent()}
          </main>

        </div>
      </div>
    </>
  );
}
