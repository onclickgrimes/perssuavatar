
import React from 'react';
import { 
  BarChart2, 
  Calendar, 
  Folder, 
  Inbox, 
  Layers, 
  Link as LinkIcon, 
  LogOut, 
  Settings, 
  TrendingUp,
  LucideIcon,
  ChevronDown
} from 'lucide-react';
import { ViewState } from './types';

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: string;
}

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  isActive, 
  onClick, 
  badge 
}: SidebarItemProps) => (
  <div 
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      padding: '10px 16px',
      margin: '4px 12px',
      borderRadius: '8px',
      cursor: 'pointer',
      backgroundColor: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
      color: isActive ? '#818cf8' : '#a1a1aa',
      transition: 'all 0.2s ease',
      fontSize: '14px',
      fontWeight: isActive ? 500 : 400,
    }}
    onMouseEnter={(e) => {
      if (!isActive) {
        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
        e.currentTarget.style.color = '#e4e4e7';
      }
    }}
    onMouseLeave={(e) => {
      if (!isActive) {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = '#a1a1aa';
      }
    }}
  >
    <Icon size={18} style={{ marginRight: '12px' }} />
    <span style={{ flex: 1 }}>{label}</span>
    {badge && (
      <span style={{
        backgroundColor: '#ef4444',
        color: 'white',
        fontSize: '10px',
        padding: '2px 6px',
        borderRadius: '10px',
        fontWeight: 700
      }}>
        {badge}
      </span>
    )}
  </div>
);

export const Sidebar = ({ 
  currentView, 
  setView,
  workspaces,
  currentWorkspace,
  onWorkspaceChange
}: { 
  currentView: ViewState, 
  setView: (v: ViewState) => void,
  workspaces: any[],
  currentWorkspace: any,
  onWorkspaceChange: (id: string) => void
}) => {
  return (
    <div style={{
      width: '260px',
      backgroundColor: '#121212',
      borderRight: '1px solid #27272a',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      paddingTop: '20px'
    }}>
      {/* Workspace Selector */}
      <div style={{ padding: '0 16px 24px 16px' }}>
        <div style={{ position: 'relative' }}>
          <div 
            className="group"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              cursor: 'pointer',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: '#18181b',
              border: '1px solid #27272a',
              transition: 'background 0.2s',
              width: '100%'
            }}
          >
              <div style={{ 
                width: '24px', 
                height: '24px', 
                backgroundColor: '#3f3f46', 
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
                color: 'white',
                flexShrink: 0
              }}>
                {currentWorkspace.name.substring(0, 1)}
              </div>
              <span style={{ color: 'white', fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                {currentWorkspace.name} 
              </span>
              <div style={{ flexShrink: 0 }}>
                 <ChevronDown size={14} color="#71717a" />
              </div>
              
              {/* Select Input Overlay */}
              <select 
                style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  width: '100%', 
                  height: '100%', 
                  opacity: 0,
                  cursor: 'pointer' 
                }}
                value={currentWorkspace.id}
                onChange={(e) => onWorkspaceChange(e.target.value)}
              >
                {workspaces.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '0 12px', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#52525b', paddingLeft: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Geral</span>
        </div>
        <SidebarItem icon={BarChart2} label="Visão Geral" isActive={currentView === 'overview'} onClick={() => setView('overview')} />
        <SidebarItem icon={Inbox} label="Inbox Único" isActive={currentView === 'inbox'} onClick={() => setView('inbox')} badge="23" />
        <SidebarItem icon={Calendar} label="Calendário" isActive={currentView === 'calendar'} onClick={() => setView('calendar')} />
        <SidebarItem icon={TrendingUp} label="Analytics" isActive={currentView === 'analytics'} onClick={() => setView('analytics')} />
        
        <div style={{ padding: '20px 12px 8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#52525b', paddingLeft: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gerenciamento</span>
        </div>
        <SidebarItem icon={Folder} label="Ativos / Mídia" isActive={currentView === 'assets'} onClick={() => setView('assets')} />
        <SidebarItem icon={LinkIcon} label="Contas Conectadas" isActive={currentView === 'channels'} onClick={() => setView('channels')} />
        
        <div style={{ padding: '20px 12px 8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#52525b', paddingLeft: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Configuração</span>
        </div>
        <SidebarItem icon={Settings} label="Config. Workspace" isActive={currentView === 'settings'} onClick={() => setView('settings')} />
      </div>

      <div style={{ padding: '16px', borderTop: '1px solid #27272a' }}>
        <SidebarItem icon={LogOut} label="Sair" isActive={false} onClick={() => {}} />
      </div>
    </div>
  );
};
