
import React from 'react';
import { 
  PieChart, 
  MessageSquare, 
  Inbox, 
  Calendar, 
  Instagram, 
  Layers, 
  Video, 
  Globe 
} from 'lucide-react';
import { StatCard } from './StatCard';

export const Dashboard = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      
      {/* Header Stats */}
      <h2 style={{ fontSize: '14px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a1a1aa' }}>
        Visão Geral do Workspace (Últimos 30 dias)
      </h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <StatCard icon={PieChart} label="Alcance" value="1.2M" trend="up" />
        <StatCard icon={MessageSquare} label="Engajamento" value="45.3K" trend="up" />
        <StatCard icon={Inbox} label="Inbox" value="23" trend="up" />
        <StatCard icon={Calendar} label="Agendados" value="15" trend="up" />
      </div>

      {/* Channel Summary */}
      <div>
        <h2 style={{ fontSize: '14px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a1a1aa', marginBottom: '16px' }}>
          Resumo por Canal
        </h2>
        <div style={{ display: 'flex', gap: '16px' }}>
          {[
            { name: 'Instagram', status: 'Bom', color: '#E1306C', icon: Instagram },
            { name: 'LinkedIn', status: 'Médio', color: '#0077b5', icon: Layers }, // Placeholder icon
            { name: 'TikTok', status: 'Ótimo', color: '#00f2ea', icon: Video },
            { name: 'Facebook', status: 'Baixo', color: '#1877F2', icon: Globe }
          ].map((c) => (
            <div key={c.name} style={{
              flex: 1,
              backgroundColor: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <c.icon size={18} color={c.color} />
              <span style={{ color: 'white', fontWeight: 500, fontSize: '14px' }}>{c.name}</span>
              <span style={{ 
                marginLeft: 'auto', 
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: '10px',
                backgroundColor: c.status === 'Ótimo' || c.status === 'Bom' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                color: c.status === 'Ótimo' || c.status === 'Bom' ? '#4ade80' : '#fbbf24'
              }}>
                {c.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid: Graph + Inbox */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '24px' }}>
        
        {/* Growth Graph Container */}
        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
            <h3 style={{ color: 'white', fontWeight: 600 }}>Crescimento de Audiência</h3>
            <select style={{ backgroundColor: '#27272a', border: 'none', color: '#a1a1aa', padding: '4px 8px', borderRadius: '6px', fontSize: '12px' }}>
              <option>Últimos 30 dias</option>
            </select>
          </div>
          
          {/* Mock Graph using SVG */}
          <div style={{ width: '100%', height: '200px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: '20px', borderBottom: '1px solid #27272a' }}>
             {/* Simple visual representation of a graph */}
             <svg width="100%" height="100%" viewBox="0 0 500 150" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{stopColor:'#6366f1', stopOpacity:0.5}} />
                    <stop offset="100%" style={{stopColor:'#6366f1', stopOpacity:0}} />
                  </linearGradient>
                </defs>
                <path d="M0,150 Q50,100 100,120 T200,80 T300,60 T400,90 T500,40 V150 H0 Z" fill="url(#grad1)" />
                <path d="M0,150 Q50,100 100,120 T200,80 T300,60 T400,90 T500,40" stroke="#6366f1" strokeWidth="3" fill="none" />
             </svg>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', color: '#52525b', fontSize: '12px' }}>
            <span>01 Jan</span>
            <span>15 Jan</span>
            <span>30 Jan</span>
          </div>
        </div>

        {/* Priority Inbox & Upcoming */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Inbox Box */}
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a', padding: '24px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
               <h3 style={{ color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <Inbox size={16} /> Inbox Prioritário
               </h3>
               <span style={{ fontSize: '12px', color: '#6366f1', cursor: 'pointer' }}>Ver tudo</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { user: '@carlos_silva', msg: 'Quanto custa esse serviço?', time: '2m', platform: Instagram, color: '#E1306C' },
                { user: 'Julia M.', msg: 'Parceria?', time: '1h', platform: Layers, color: '#0077b5' }
              ].map((i, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px', borderRadius: '8px', backgroundColor: '#27272a' }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#3f3f46' }} />
                    <div style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: '#18181b', borderRadius: '50%', padding: '2px' }}>
                      <i.platform size={10} color={i.color} />
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: 'white', fontSize: '13px', fontWeight: 500, margin: 0 }}>{i.user}</p>
                    <p style={{ color: '#a1a1aa', fontSize: '12px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.msg}</p>
                  </div>
                  <span style={{ color: '#52525b', fontSize: '11px' }}>{i.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Posts Box */}
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a', padding: '24px', flex: 1 }}>
            <h3 style={{ color: 'white', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={16} /> Próximos Posts
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '3px solid #E1306C', paddingLeft: '12px' }}>
                <div><span style={{ color: 'white', fontWeight: 700, fontSize: '13px' }}>14:00</span></div>
                <div>
                   <p style={{ color: 'white', fontSize: '13px', margin: 0 }}>Promoção Relâmpago</p>
                   <p style={{ color: '#a1a1aa', fontSize: '11px', margin: 0 }}>Instagram • Stories</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '3px solid #0077b5', paddingLeft: '12px' }}>
                <div><span style={{ color: 'white', fontWeight: 700, fontSize: '13px' }}>Amanhã</span></div>
                <div>
                   <p style={{ color: 'white', fontSize: '13px', margin: 0 }}>Artigo Técnico</p>
                   <p style={{ color: '#a1a1aa', fontSize: '11px', margin: 0 }}>LinkedIn • Article</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
