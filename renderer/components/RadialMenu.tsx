import React, { useState, useEffect, useRef } from 'react';

interface RadialMenuProps {
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onStartListening: () => void;
  onAsk: () => void;
  onOpenVideoStudio?: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: JSX.Element;
  action: () => void;
}

export default function RadialMenu({
  onOpenSettings,
  onOpenHistory,
  onStartListening,
  onAsk,
  onOpenVideoStudio,
}: RadialMenuProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);

  const HOLD_DURATION = 500; // 500ms para ativar o menu
  const OUTER_RADIUS = 140; // Raio externo do anel
  const INNER_RADIUS = 55;  // Raio interno do anel (início do anel)
  const CENTER_RADIUS = 45; // Raio do círculo central
  const GAP_ANGLE = 0.05;   // Gap entre segmentos em radianos (~3 graus)

  // 6 itens no menu (sem o item "fechar" que agora é o centro)
  const menuItems: MenuItem[] = [
    {
      id: 'listen',
      label: 'Começar a Ouvir',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" x2="12" y1="19" y2="22"></line>
        </svg>
      ),
      action: onStartListening,
    },
    {
      id: 'ask',
      label: 'Perguntar',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          <path d="M8 10h8"></path>
          <path d="M8 14h8"></path>
        </svg>
      ),
      action: onAsk,
    },
    {
      id: 'reset',
      label: 'Nova Conversa',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
        </svg>
      ),
      action: async () => {
        await window.electron.resetLiveSession();
      },
    },
    {
      id: 'video-studio',
      label: 'Video Studio',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m22 8-6 4 6 4V8Z"></path>
          <rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect>
        </svg>
      ),
      action: () => {
        if (onOpenVideoStudio) {
          onOpenVideoStudio();
        }
      },
    },
    {
      id: 'settings',
      label: 'Configurações',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      ),
      action: onOpenSettings,
    },
    {
      id: 'history',
      label: 'Histórico',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 8v4l3 3"></path>
          <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"></path>
        </svg>
      ),
      action: onOpenHistory,
    },
  ];

  // Função para criar o path de um segmento (arco)
  const createSegmentPath = (index: number, total: number): string => {
    const anglePerSegment = (2 * Math.PI) / total;
    const startAngle = index * anglePerSegment - Math.PI / 2 + GAP_ANGLE / 2; // Adicionar metade do gap no início
    const endAngle = startAngle + anglePerSegment - GAP_ANGLE; // Subtrair gap completo do ângulo

    // Pontos do arco externo
    const outerStartX = OUTER_RADIUS * Math.cos(startAngle);
    const outerStartY = OUTER_RADIUS * Math.sin(startAngle);
    const outerEndX = OUTER_RADIUS * Math.cos(endAngle);
    const outerEndY = OUTER_RADIUS * Math.sin(endAngle);

    // Pontos do arco interno
    const innerStartX = INNER_RADIUS * Math.cos(startAngle);
    const innerStartY = INNER_RADIUS * Math.sin(startAngle);
    const innerEndX = INNER_RADIUS * Math.cos(endAngle);
    const innerEndY = INNER_RADIUS * Math.sin(endAngle);

    // Criar path do segmento (forma de "fatia" do anel)
    return `
      M ${innerStartX} ${innerStartY}
      L ${outerStartX} ${outerStartY}
      A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${outerEndX} ${outerEndY}
      L ${innerEndX} ${innerEndY}
      A ${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${innerStartX} ${innerStartY}
      Z
    `;
  };

  // Função para calcular a posição do ícone no centro do segmento
  const getIconPosition = (index: number, total: number) => {
    const anglePerSegment = (2 * Math.PI) / total;
    const angle = index * anglePerSegment + anglePerSegment / 2 - Math.PI / 2;
    const radius = (OUTER_RADIUS + INNER_RADIUS) / 2; // Meio do anel

    return {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    };
  };

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      if (target.tagName === 'CANVAS') {
        console.log('✅ Right-click no CANVAS - iniciando timer do menu radial');
        e.preventDefault();
        
        isHoldingRef.current = true;
        setIsHolding(true);
        setHoldProgress(0);
        setPosition({ x: e.clientX, y: e.clientY });

        const startTime = Date.now();
        progressIntervalRef.current = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
          setHoldProgress(progress);
          
          if (progress >= 100) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
          }
        }, 16);

        holdTimerRef.current = setTimeout(() => {
          if (isHoldingRef.current) {
            setIsVisible(true);
            setIsHolding(false);
            setHoldProgress(0);
            console.log('🎯 Menu radial ativado');
          }
        }, HOLD_DURATION);
      }
    };

    const handleMouseUp = () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      isHoldingRef.current = false;
      setIsHolding(false);
      setHoldProgress(0);
    };

    const handleClick = (e: MouseEvent) => {
      if (isVisible) {
        const target = e.target as HTMLElement;
        if (!target.closest('.radial-menu')) {
          setIsVisible(false);
        }
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        setIsVisible(false);
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleEscape);
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isVisible]);

  if (!isVisible && !isHolding) return null;

  const handleSegmentClick = (index: number) => {
    menuItems[index].action();
    setIsVisible(false);
  };

  const handleCenterClick = () => {
    setIsVisible(false);
  };

  // Renderizar indicador de progresso durante o hold
  if (isHolding && !isVisible) {
    return (
      <div
        className="fixed z-[9999] pointer-events-none"
        style={{
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <svg
          className="animate-in fade-in zoom-in duration-100"
          width="60"
          height="60"
          viewBox="0 0 60 60"
          style={{
            transform: 'rotate(-90deg)',
          }}
        >
          <circle
            cx="30"
            cy="30"
            r="26"
            fill="rgba(0, 0, 0, 0.5)"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="2"
          />
          <circle
            cx="30"
            cy="30"
            r="26"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 26}`}
            strokeDashoffset={`${2 * Math.PI * 26 * (1 - holdProgress / 100)}`}
            style={{
              transition: 'stroke-dashoffset 0.016s linear',
            }}
          />
        </svg>
        <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/80 text-white text-xs rounded-lg backdrop-blur-sm border border-white/10 whitespace-nowrap">
          Segure para abrir menu...
        </div>
      </div>
    );
  }

  const svgSize = OUTER_RADIUS * 2 + 40; // Adicionar margem
  const center = svgSize / 2;

  return (
    <div
      className="radial-menu fixed z-[9999]"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        className="animate-in fade-in zoom-in duration-200"
      >
        <g transform={`translate(${center}, ${center})`}>
          {/* Segmentos do anel externo */}
          {menuItems.map((item, index) => {
            const isHovered = hoveredSegment === index;
            
            return (
              <g key={item.id}>
                {/* Segmento (fatia do anel) */}
                <path
                  d={createSegmentPath(index, menuItems.length)}
                  fill={isHovered ? '#22c55e' : 'rgba(30, 30, 30, 0.85)'}
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredSegment(index)}
                  onMouseLeave={() => setHoveredSegment(null)}
                  onClick={() => handleSegmentClick(index)}
                  style={{
                    pointerEvents: 'auto',
                  }}
                />
              </g>
            );
          })}



          {/* Círculo central (fechar menu) */}
          <circle
            cx="0"
            cy="0"
            r={CENTER_RADIUS}
            fill="rgba(30, 30, 30, 0.85)"
            className="cursor-pointer transition-all duration-200 hover:fill-[#ef4444]"
            onClick={handleCenterClick}
            style={{
              pointerEvents: 'auto',
            }}
          />

          {/* Ícone X no centro */}
          <g
            className="pointer-events-none"
            transform="translate(0, 0)"
          >
            <line
              x1="-12"
              y1="-12"
              x2="12"
              y2="12"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <line
              x1="12"
              y1="-12"
              x2="-12"
              y2="12"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>

          {/* Ícones nos segmentos */}
          {menuItems.map((item, index) => {
            const pos = getIconPosition(index, menuItems.length);
            return (
              <g
                key={`icon-${item.id}`}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="pointer-events-none"
              >
                <foreignObject
                  x="-16"
                  y="-16"
                  width="32"
                  height="32"
                  className="overflow-visible"
                >
                  <div className="flex items-center justify-center text-white w-full h-full">
                    {item.icon}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Labels aparecem ao hover */}
      {hoveredSegment !== null && (
        <div
          className="absolute pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150"
          style={{
            left: '50%',
            top: '100%',
            transform: 'translateX(-50%)',
            marginTop: '10px',
          }}
        >
          <div className="px-4 py-2 bg-black/90 text-white text-sm rounded-lg shadow-lg whitespace-nowrap backdrop-blur-sm border border-white/20">
            {menuItems[hoveredSegment].label}
          </div>
        </div>
      )}
    </div>
  );
}
