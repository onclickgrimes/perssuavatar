import React, { useState, useEffect } from 'react';

interface AudioSource {
  id: string;
  name: string;
  thumbnail: string;
  category?: 'browser' | 'media' | 'meeting' | 'game' | 'other';
}

interface AudioSourceSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentSourceId?: string;
  onSourceSelect: (sourceId: string | null) => void;
}

const KNOWN_APPS = {
  // Navegadores
  'Chrome': 'browser',
  'Firefox': 'browser',
  'Edge': 'browser',
  'Safari': 'browser',
  'Opera': 'browser',
  'Brave': 'browser',
  
  // Media Players
  'Spotify': 'media',
  'VLC': 'media',
  'Windows Media Player': 'media',
  'iTunes': 'media',
  'YouTube': 'media',
  
  // Reuniões
  'Zoom': 'meeting',
  'Teams': 'meeting',
  'Skype': 'meeting',
  'Discord': 'meeting',
  'Slack': 'meeting',
  'Google Meet': 'meeting',
  
  // Jogos
  'League of Legends': 'game',
  'Valorant': 'game',
  'CS:GO': 'game',
  'Dota': 'game',
};

const CATEGORY_ICONS = {
  browser: '🌐',
  media: '🎵',
  meeting: '💼',
  game: '🎮',
  other: '📱',
  screen: '🖥️'
};

const CATEGORY_NAMES = {
  browser: 'Navegadores',
  media: 'Media Players',
  meeting: 'Reuniões',
  game: 'Jogos',
  other: 'Outros',
  screen: 'Tela Inteira'
};

export default function AudioSourceSelector({ 
  isOpen, 
  onClose, 
  currentSourceId,
  onSourceSelect 
}: AudioSourceSelectorProps) {
  const [sources, setSources] = useState<AudioSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(currentSourceId || null);

  useEffect(() => {
    if (isOpen) {
      loadSources();
    }
  }, [isOpen]);

  const loadSources = async () => {
    setLoading(true);
    try {
      const screenSources = await window.electron.getScreenSources();
      
      const categorizedSources: AudioSource[] = screenSources.map((source: any) => {
        let category: AudioSource['category'] = 'other';
        
        // Detectar categoria baseado no nome
        for (const [appName, appCategory] of Object.entries(KNOWN_APPS)) {
          if (source.name.includes(appName)) {
            category = appCategory as AudioSource['category'];
            break;
          }
        }
        
        // Telas inteiras têm categoria especial
        if (source.name.includes('Entire Screen') || source.name.includes('Screen')) {
          category = undefined; // Será mostrado separadamente
        }
        
        return {
          id: source.id,
          name: source.name,
          thumbnail: source.thumbnail,
          category
        };
      });
      
      setSources(categorizedSources);
    } catch (error) {
      console.error('Erro ao carregar fontes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (sourceId: string | null) => {
    setSelectedId(sourceId);
    onSourceSelect(sourceId);
    onClose();
  };

  const filteredSources = sources.filter(source => {
    if (filter === 'all') return true;
    if (filter === 'screen') return !source.category;
    return source.category === filter;
  });

  const categories = ['all', 'screen', 'browser', 'media', 'meeting', 'game', 'other'];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-[#0a0a0a] rounded-xl border border-[#222] w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-[#222] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Selecionar Fonte de Áudio</h2>
            <p className="text-xs text-gray-400 mt-0.5">Escolha qual janela/programa deseja transcrever</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1a1a1a] text-gray-400 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Category Filter */}
        <div className="p-4 border-b border-[#222] overflow-x-auto" style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#1a1a1a #0a0a0a'
        }}>
          <div className="flex gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  filter === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#1a1a1a] text-gray-400 hover:text-white hover:bg-[#252525]'
                }`}
              >
                <span className="mr-1.5">{cat === 'all' ? '📋' : CATEGORY_ICONS[cat as keyof typeof CATEGORY_ICONS]}</span>
                {cat === 'all' ? 'Todos' : CATEGORY_NAMES[cat as keyof typeof CATEGORY_NAMES]}
              </button>
            ))}
          </div>
        </div>

        {/* Sources List */}
        <div className="flex-1 overflow-y-auto p-4" style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#1a1a1a #0a0a0a'
        }}>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-gray-400">Carregando fontes...</div>
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <div className="text-4xl mb-2">🔍</div>
              <div className="text-gray-400">Nenhuma fonte encontrada</div>
              <button
                onClick={loadSources}
                className="mt-3 px-4 py-2 bg-[#1a1a1a] text-gray-300 rounded-lg text-xs hover:bg-[#252525] transition-colors"
              >
                Recarregar
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Opção: Sistema Inteiro (padrão) */}
              <button
                onClick={() => handleSelect(null)}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  selectedId === null
                    ? 'border-blue-600 bg-blue-600/10'
                    : 'border-[#222] bg-[#0f0f0f] hover:border-[#333] hover:bg-[#1a1a1a]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-20 h-14 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded flex items-center justify-center text-2xl flex-shrink-0">
                    🖥️
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white mb-0.5">Sistema Inteiro</div>
                    <div className="text-xs text-gray-400">Todo o áudio do computador</div>
                    {selectedId === null && (
                      <div className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                        Selecionado
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {/* Fontes Disponíveis */}
              {filteredSources.map(source => (
                <button
                  key={source.id}
                  onClick={() => handleSelect(source.id)}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    selectedId === source.id
                      ? 'border-blue-600 bg-blue-600/10'
                      : 'border-[#222] bg-[#0f0f0f] hover:border-[#333] hover:bg-[#1a1a1a]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={source.thumbnail}
                      alt={source.name}
                      className="w-20 h-14 object-cover rounded flex-shrink-0 bg-[#1a1a1a]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-1.5 mb-0.5">
                        <span className="text-base">
                          {source.category ? CATEGORY_ICONS[source.category] : '🖥️'}
                        </span>
                        <div className="text-sm font-medium text-white truncate flex-1">
                          {source.name}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {source.category ? CATEGORY_NAMES[source.category] : 'Tela'}
                      </div>
                      {selectedId === source.id && (
                        <div className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                          Selecionado
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#222] flex justify-between items-center">
          <div className="text-xs text-gray-400">
            💡 <strong>Dica:</strong> Selecione uma janela específica para evitar capturar áudio indesejado
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#1a1a1a] text-gray-300 rounded-lg text-sm hover:bg-[#252525] transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
