import React, { useState, useEffect, useRef } from 'react';

interface RadialMenuProps {
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onStartListening: () => void;
  onAsk: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: JSX.Element;
  color: string;
  hoverColor: string;
  angle: number;
  action: () => void;
}

export default function RadialMenu({
  onOpenSettings,
  onOpenHistory,
  onStartListening,
  onAsk,
}: RadialMenuProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);

  const HOLD_DURATION = 500; // 500ms para ativar o menu
  const MENU_RADIUS = 100; // Raio do menu radial
  const ITEM_SIZE = 50; // Tamanho dos itens

  const menuItems: MenuItem[] = [
    {
      id: 'settings',
      label: 'Configurações',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      ),
      color: '#8B5CF6',
      hoverColor: '#A78BFA',
      angle: 0,
      action: onOpenSettings,
    },
    {
      id: 'history',
      label: 'Histórico',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 8v4l3 3"></path>
          <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"></path>
        </svg>
      ),
      color: '#10B981',
      hoverColor: '#34D399',
      angle: 72,
      action: onOpenHistory,
    },
    {
      id: 'listen',
      label: 'Começar a Ouvir',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" x2="12" y1="19" y2="22"></line>
        </svg>
      ),
      color: '#0066FF',
      hoverColor: '#3B87FF',
      angle: 144,
      action: onStartListening,
    },
    {
      id: 'ask',
      label: 'Perguntar',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          <path d="M8 10h8"></path>
          <path d="M8 14h8"></path>
        </svg>
      ),
      color: '#F59E0B',
      hoverColor: '#FBBF24',
      angle: 216,
      action: onAsk,
    },
    {
      id: 'close',
      label: 'Fechar',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      ),
      color: '#EF4444',
      hoverColor: '#F87171',
      angle: 288,
      action: () => setIsVisible(false),
    },
  ];

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Verificar se o clique direito está sobre o avatar
      const target = e.target as HTMLElement;
      console.log('🖱️ Right-click detectado em:', target.tagName, target);
      
      if (target.tagName === 'CANVAS') {
        console.log('✅ Right-click no CANVAS - iniciando timer do menu radial');
        e.preventDefault();
        
        // Iniciar timer para segurar botão
        isHoldingRef.current = true;
        setIsHolding(true);
        setHoldProgress(0);
        setPosition({ x: e.clientX, y: e.clientY });

        // Animar progresso
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
        }, 16); // ~60fps

        holdTimerRef.current = setTimeout(() => {
          if (isHoldingRef.current) {
            setIsVisible(true);
            setIsHolding(false);
            setHoldProgress(0);
            console.log('🎯 Menu radial ativado');
          }
        }, HOLD_DURATION);
      } else {
        console.log('❌ Right-click fora do CANVAS - ignorando');
      }
    };

    const handleMouseUp = () => {
      // Cancelar timer se soltar antes do tempo
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
      // Fechar menu ao clicar fora
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

  const handleItemClick = (item: MenuItem) => {
    item.action();
    setIsVisible(false);
  };

  // Renderizar apenas o indicador de progresso durante o hold
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
        {/* Círculo de progresso */}
        <svg
          className="animate-in fade-in zoom-in duration-100"
          width="60"
          height="60"
          viewBox="0 0 60 60"
          style={{
            transform: 'rotate(-90deg)',
          }}
        >
          {/* Círculo de fundo */}
          <circle
            cx="30"
            cy="30"
            r="26"
            fill="rgba(0, 0, 0, 0.5)"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="2"
          />
          {/* Círculo de progresso */}
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
        {/* Texto de instrução */}
        <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/80 text-white text-xs rounded-lg backdrop-blur-sm border border-white/10 whitespace-nowrap">
          Segure para abrir menu...
        </div>
      </div>
    );
  }

  return (
    <div
      className="radial-menu fixed z-[9999] pointer-events-none"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Centro do menu (indicador visual) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white/20 rounded-full backdrop-blur-sm border border-white/30 pointer-events-none animate-pulse" />

      {/* Círculo de fundo */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 pointer-events-none animate-in fade-in zoom-in duration-200"
        style={{
          width: MENU_RADIUS * 2 + ITEM_SIZE,
          height: MENU_RADIUS * 2 + ITEM_SIZE,
        }}
      />

      {/* Itens do menu */}
      {menuItems.map((item) => {
        const angleRad = (item.angle * Math.PI) / 180;
        const x = Math.cos(angleRad) * MENU_RADIUS;
        const y = Math.sin(angleRad) * MENU_RADIUS;
        const isHovered = hoveredItem === item.id;

        return (
          <div
            key={item.id}
            className="absolute pointer-events-auto cursor-pointer animate-in fade-in zoom-in duration-300"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${isHovered ? 1.1 : 1})`,
              transition: 'transform 0.2s ease-out',
              animationDelay: `${menuItems.indexOf(item) * 50}ms`,
            }}
            onMouseEnter={() => setHoveredItem(item.id)}
            onMouseLeave={() => setHoveredItem(null)}
            onClick={() => handleItemClick(item)}
          >
            {/* Botão do item */}
            <div
              className="relative flex items-center justify-center rounded-full shadow-2xl transition-all duration-200"
              style={{
                width: ITEM_SIZE,
                height: ITEM_SIZE,
                backgroundColor: isHovered ? item.hoverColor : item.color,
                boxShadow: isHovered
                  ? `0 0 30px ${item.color}80, 0 0 60px ${item.color}40`
                  : `0 10px 30px rgba(0,0,0,0.5)`,
              }}
            >
              <div className="text-white">{item.icon}</div>
            </div>

            {/* Label (aparece ao hover) */}
            {isHovered && (
              <div
                className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/90 text-white text-xs rounded-lg shadow-lg whitespace-nowrap backdrop-blur-sm border border-white/10 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                {item.label}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-black/90" />
              </div>
            )}

            {/* Ripple effect ao hover */}
            {isHovered && (
              <div
                className="absolute inset-0 rounded-full animate-ping"
                style={{
                  backgroundColor: item.color,
                  opacity: 0.3,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
