import React, { useState, useEffect } from 'react';
import { CAMERA_MOVEMENTS_OPTIONS } from '../../../remotion/utils/camera-effects';
import { TRANSITION_OPTIONS } from '../../../remotion/utils/transitions';

// Interface para representar um nicho de canal
export interface ChannelNiche {
    id?: number;
    name: string;
    description?: string;
    icon?: string;
    ai_prompt: string;
    
    // Configurações de assets
    asset_types?: string[];
    emotions?: string[];
    use_image_prompts?: boolean;
    camera_movements?: string[];
    transitions?: string[];
    use_highlight_words?: boolean;
    entry_animations?: string[];
    exit_animations?: string[];
    
    // Stock footage
    use_stock_footage?: boolean;
    stock_categories?: string[];
    stock_rules?: string;
    
    // Visual
    default_colors?: string[];
    default_font?: string;
    components_allowed?: string[];
    
    created_at?: string;
    updated_at?: string;
}

// Opções disponíveis para seleção
const ASSET_TYPES = [
    { value: 'image_flux', label: 'Imagem (Flux)' },
    { value: 'video_stock', label: 'Vídeo (Stock)' },
    { value: 'video_kling', label: 'Vídeo (Kling)' },
    { value: 'solid_color', label: 'Cor Sólida' },
    { value: 'wavy_grid', label: 'WavyGrid' },
    { value: 'video_chromakey', label: 'Video Chroma Key' },
    { value: 'geometric_patterns', label: 'Padrões Geométricos' },
];

const EMOTIONS = [
    'calma', 'paz', 'reflexão', 'serenidade', 'contemplação',
    'empolgação', 'curiosidade', 'surpresa', 'urgência', 'inovação',
    'seriedade', 'nostalgia', 'admiração', 'mistério', 'alegria',
];

const ENTRY_ANIMATIONS = [
    { value: 'pop', label: 'Pop', description: 'Escala rápida com bounce.' },
    { value: 'bounce', label: 'Bounce', description: 'Múltiplos bounces ao aparecer.' },
    { value: 'explode', label: 'Explode', description: 'Explosão com rotação.' },
    { value: 'slide_up', label: 'Slide Up', description: 'Desliza de baixo para cima.' },
    { value: 'zoom_in', label: 'Zoom In', description: 'Aparece com zoom crescente.' },
    { value: 'fade', label: 'Fade', description: 'Aparece gradualmente.' },
    { value: 'wave', label: 'Wave', description: 'Efeito de onda na entrada.' },
];

const EXIT_ANIMATIONS = [
    { value: 'evaporate', label: 'Evaporate', description: 'Some como vapor para cima.' },
    { value: 'fade', label: 'Fade', description: 'Desaparece gradualmente.' },
    { value: 'implode', label: 'Implode', description: 'Colapsa para o centro.' },
    { value: 'slide_down', label: 'Slide Down', description: 'Desliza de cima para baixo.' },
    { value: 'dissolve', label: 'Dissolve', description: 'Dissolução gradual.' },
    { value: 'scatter', label: 'Scatter', description: 'Dispersa em pedaços.' },
    { value: 'wave', label: 'Wave', description: 'Efeito de onda na saída.' },
];

const REMOTION_COMPONENTS = [
    { value: 'Timeline3D', label: 'Timeline 3D', description: 'Linha do tempo 3D para história.' },
    { value: 'WavyGrid', label: 'Wavy Grid', description: 'Grade ondulada futurista.' },
    { value: 'GeometricPatterns', label: 'Padrões Geométricos', description: 'Background abstrato animado.' },
    { value: 'HighlightWord', label: 'Highlight Word', description: 'Palavras em destaque animadas.' },
    { value: 'ChromaKeyMedia', label: 'Chroma Key', description: 'Vídeo com fundo verde removido.' },
];

interface NicheModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (niche: ChannelNiche | null) => void;
    selectedNiche: ChannelNiche | null;
}

export function NicheModal({ isOpen, onClose, onSelect, selectedNiche }: NicheModalProps) {
    const [niches, setNiches] = useState<ChannelNiche[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingNiche, setEditingNiche] = useState<ChannelNiche | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [activeTab, setActiveTab] = useState<'select' | 'edit'>('select');

    // Estado do formulário
    const [formData, setFormData] = useState<Partial<ChannelNiche>>({
        name: '',
        description: '',
        icon: '📺',
        ai_prompt: '',
        asset_types: [],
        emotions: [],
        use_image_prompts: true,
        camera_movements: [],
        transitions: [],
        use_highlight_words: true,
        entry_animations: [],
        exit_animations: [],
        use_stock_footage: true,
        stock_categories: [],
        stock_rules: '',
        default_colors: [],
        default_font: '',
        components_allowed: [],
    });

    useEffect(() => {
        if (isOpen) {
            loadNiches();
        }
    }, [isOpen]);

    const loadNiches = async () => {
        setLoading(true);
        try {
            const data = await window.electron.niche.list();
            setNiches(data || []);
        } catch (error) {
            console.error('Erro ao carregar nichos:', error);
        }
        setLoading(false);
    };

    const handleSelectNiche = (niche: ChannelNiche) => {
        onSelect(niche);
        onClose();
    };

    const handleClearSelection = () => {
        onSelect(null);
        onClose();
    };

    const handleCreateNew = () => {
        setIsCreating(true);
        setEditingNiche(null);
        setFormData({
            name: '',
            description: '',
            icon: '📺',
            ai_prompt: '',
            asset_types: [],
            emotions: [],
            use_image_prompts: true,
            camera_movements: [],
            transitions: [],
            use_highlight_words: true,
            entry_animations: [],
            exit_animations: [],
            use_stock_footage: true,
            stock_categories: [],
            stock_rules: '',
            default_colors: [],
            default_font: '',
            components_allowed: [],
        });
        setActiveTab('edit');
    };

    const handleEditNiche = (niche: ChannelNiche) => {
        setIsCreating(false);
        setEditingNiche(niche);
        setFormData({ ...niche });
        setActiveTab('edit');
    };

    const handleDeleteNiche = async (id: number) => {
        if (!confirm('Tem certeza que deseja excluir este nicho?')) return;
        
        try {
            await window.electron.niche.delete(id);
            await loadNiches();
            if (selectedNiche?.id === id) {
                onSelect(null);
            }
        } catch (error) {
            console.error('Erro ao excluir nicho:', error);
        }
    };

    const handleSave = async () => {
        if (!formData.name || !formData.ai_prompt) {
            alert('Nome e Prompt da IA são obrigatórios!');
            return;
        }

        try {
            if (isCreating) {
                await window.electron.niche.create(formData as any);
            } else if (editingNiche?.id) {
                await window.electron.niche.update(editingNiche.id, formData);
            }
            await loadNiches();
            setActiveTab('select');
            setEditingNiche(null);
            setIsCreating(false);
        } catch (error) {
            console.error('Erro ao salvar nicho:', error);
            alert('Erro ao salvar nicho');
        }
    };

    const toggleArrayItem = (field: keyof ChannelNiche, value: string) => {
        const currentArray = (formData[field] as string[]) || [];
        const newArray = currentArray.includes(value)
            ? currentArray.filter(v => v !== value)
            : [...currentArray, value];
        setFormData({ ...formData, [field]: newArray });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-white/10 rounded-2xl w-[90vw] max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🎬</span>
                        <h2 className="text-xl font-semibold text-white">
                            {activeTab === 'select' ? 'Selecionar Nicho do Canal' : (isCreating ? 'Criar Novo Nicho' : 'Editar Nicho')}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 px-6 pt-4">
                    <button
                        onClick={() => setActiveTab('select')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === 'select'
                                ? 'bg-pink-500 text-white'
                                : 'bg-white/5 text-white/60 hover:bg-white/10'
                        }`}
                    >
                        Selecionar
                    </button>
                    {(editingNiche || isCreating) && (
                        <button
                            onClick={() => setActiveTab('edit')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                activeTab === 'edit'
                                    ? 'bg-pink-500 text-white'
                                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                            }`}
                        >
                            {isCreating ? 'Criar' : 'Editar'}
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(85vh-140px)]">
                    {activeTab === 'select' ? (
                        <>
                            {/* Lista de Nichos */}
                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Clear Selection */}
                                    <button
                                        onClick={handleClearSelection}
                                        className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                                            !selectedNiche
                                                ? 'border-pink-500 bg-pink-500/10'
                                                : 'border-white/10 bg-white/5 hover:border-white/30'
                                        }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <span className="text-3xl">🎯</span>
                                            <div>
                                                <h3 className="text-lg font-medium text-white">Sem Nicho (Padrão)</h3>
                                                <p className="text-sm text-white/60">Usar prompt padrão do sistema</p>
                                            </div>
                                        </div>
                                    </button>

                                    {niches.map((niche) => (
                                        <div
                                            key={niche.id}
                                            className={`p-4 rounded-xl border-2 transition-all ${
                                                selectedNiche?.id === niche.id
                                                    ? 'border-pink-500 bg-pink-500/10'
                                                    : 'border-white/10 bg-white/5 hover:border-white/30'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <button
                                                    onClick={() => handleSelectNiche(niche)}
                                                    className="flex items-center gap-4 text-left flex-1"
                                                >
                                                    <span className="text-3xl">{niche.icon || '📺'}</span>
                                                    <div>
                                                        <h3 className="text-lg font-medium text-white">{niche.name}</h3>
                                                        <p className="text-sm text-white/60">{niche.description}</p>
                                                        {niche.components_allowed && niche.components_allowed.length > 0 && (
                                                            <div className="flex gap-1 mt-2 flex-wrap">
                                                                {niche.components_allowed.map((comp) => (
                                                                    <span key={comp} className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded">
                                                                        {comp}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEditNiche(niche); }}
                                                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                                        title="Editar"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
                                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteNiche(niche.id!); }}
                                                        className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                                                        title="Excluir"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                                                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Botão Criar Novo */}
                                    <button
                                        onClick={handleCreateNew}
                                        className="w-full p-4 rounded-xl border-2 border-dashed border-white/20 bg-white/5 hover:border-pink-500/50 hover:bg-pink-500/10 transition-all flex items-center justify-center gap-3"
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-pink-400">
                                            <path d="M12 5v14M5 12h14" />
                                        </svg>
                                        <span className="text-white/80 font-medium">Criar Novo Nicho</span>
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        /* Formulário de Edição */
                        <div className="space-y-6">
                            {/* Informações Básicas */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-white/80 text-sm font-medium mb-2">Nome *</label>
                                    <input
                                        type="text"
                                        value={formData.name || ''}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:border-pink-500 focus:outline-none"
                                        placeholder="Ex: História Antiga"
                                    />
                                </div>
                                <div>
                                    <label className="block text-white/80 text-sm font-medium mb-2">Ícone</label>
                                    <input
                                        type="text"
                                        value={formData.icon || ''}
                                        onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                                        className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-2xl focus:border-pink-500 focus:outline-none"
                                        placeholder="📺"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-white/80 text-sm font-medium mb-2">Descrição</label>
                                <input
                                    type="text"
                                    value={formData.description || ''}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:border-pink-500 focus:outline-none"
                                    placeholder="Descrição breve do nicho"
                                />
                            </div>

                            {/* Prompt da IA */}
                            <div>
                                <label className="block text-white/80 text-sm font-medium mb-2">
                                    Prompt da IA * <span className="text-white/40">(Instruções para geração de vídeo)</span>
                                </label>
                                <textarea
                                    value={formData.ai_prompt || ''}
                                    onChange={(e) => setFormData({ ...formData, ai_prompt: e.target.value })}
                                    className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-lg text-white focus:border-pink-500 focus:outline-none resize-none h-40"
                                    placeholder="Descreva o estilo visual, emoções, regras de stock footage, etc..."
                                />
                            </div>

                            {/* Tipos de Assets */}
                            <div>
                                <label className="block text-white/80 text-sm font-medium mb-2">Tipos de Assets Permitidos</label>
                                <div className="flex flex-wrap gap-2">
                                    {ASSET_TYPES.map((asset) => (
                                        <button
                                            key={asset.value}
                                            onClick={() => toggleArrayItem('asset_types', asset.value)}
                                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                                                formData.asset_types?.includes(asset.value)
                                                    ? 'bg-pink-500 text-white'
                                                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                                            }`}
                                        >
                                            {asset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Emoções */}
                            <div>
                                <label className="block text-white/80 text-sm font-medium mb-2">Emoções Preferidas</label>
                                <div className="flex flex-wrap gap-2">
                                    {EMOTIONS.map((emotion) => (
                                        <button
                                            key={emotion}
                                            onClick={() => toggleArrayItem('emotions', emotion)}
                                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                                                formData.emotions?.includes(emotion)
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                                            }`}
                                        >
                                            {emotion}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Componentes Remotion */}
                            <div>
                                <label className="block text-white/80 text-sm font-medium mb-2">Componentes Remotion Permitidos</label>
                                <div className="flex flex-wrap gap-2">
                                    {REMOTION_COMPONENTS.map((comp) => (
                                        <button
                                            key={comp.value}
                                            onClick={() => toggleArrayItem('components_allowed', comp.value)}
                                            title={comp.description}
                                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                                                formData.components_allowed?.includes(comp.value)
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                                            }`}
                                        >
                                            {comp.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Movimentos de Câmera */}
                            <div>
                                <label className="block text-white/80 text-sm font-medium mb-2">Movimentos de Câmera</label>
                                <div className="flex flex-wrap gap-2">
                                    {CAMERA_MOVEMENTS_OPTIONS.map((cam) => (
                                        <button
                                            key={cam.value}
                                            onClick={() => toggleArrayItem('camera_movements', cam.value)}
                                            title={cam.description}
                                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                                                formData.camera_movements?.includes(cam.value)
                                                    ? 'bg-green-500 text-white'
                                                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                                            }`}
                                        >
                                            {cam.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Transições */}
                            <div>
                                <label className="block text-white/80 text-sm font-medium mb-2">Transições</label>
                                <div className="flex flex-wrap gap-2">
                                    {TRANSITION_OPTIONS.map((trans) => (
                                        <button
                                            key={trans.value}
                                            onClick={() => toggleArrayItem('transitions', trans.value)}
                                            title={trans.description}
                                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                                                formData.transitions?.includes(trans.value)
                                                    ? 'bg-yellow-500 text-black'
                                                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                                            }`}
                                        >
                                            {trans.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Animações de Entrada/Saída */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-white/80 text-sm font-medium mb-2">Animações de Entrada</label>
                                    <div className="flex flex-wrap gap-2">
                                        {ENTRY_ANIMATIONS.map((anim) => (
                                            <button
                                                key={anim.value}
                                                onClick={() => toggleArrayItem('entry_animations', anim.value)}
                                                title={anim.description}
                                                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                                                    formData.entry_animations?.includes(anim.value)
                                                        ? 'bg-cyan-500 text-black'
                                                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                                                }`}
                                            >
                                                {anim.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-white/80 text-sm font-medium mb-2">Animações de Saída</label>
                                    <div className="flex flex-wrap gap-2">
                                        {EXIT_ANIMATIONS.map((anim) => (
                                            <button
                                                key={anim.value}
                                                onClick={() => toggleArrayItem('exit_animations', anim.value)}
                                                title={anim.description}
                                                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                                                    formData.exit_animations?.includes(anim.value)
                                                        ? 'bg-orange-500 text-black'
                                                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                                                }`}
                                            >
                                                {anim.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Toggles */}
                            <div className="grid grid-cols-3 gap-4">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.use_image_prompts ?? true}
                                        onChange={(e) => setFormData({ ...formData, use_image_prompts: e.target.checked })}
                                        className="w-5 h-5 rounded bg-black/30 border-white/20 text-pink-500 focus:ring-pink-500"
                                    />
                                    <span className="text-white/80 text-sm">Gerar Image Prompts</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.use_highlight_words ?? true}
                                        onChange={(e) => setFormData({ ...formData, use_highlight_words: e.target.checked })}
                                        className="w-5 h-5 rounded bg-black/30 border-white/20 text-pink-500 focus:ring-pink-500"
                                    />
                                    <span className="text-white/80 text-sm">Usar Highlight Words</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.use_stock_footage ?? true}
                                        onChange={(e) => setFormData({ ...formData, use_stock_footage: e.target.checked })}
                                        className="w-5 h-5 rounded bg-black/30 border-white/20 text-pink-500 focus:ring-pink-500"
                                    />
                                    <span className="text-white/80 text-sm">Usar Stock Footage</span>
                                </label>
                            </div>

                            {/* Regras de Stock */}
                            {formData.use_stock_footage && (
                                <div>
                                    <label className="block text-white/80 text-sm font-medium mb-2">Regras de Stock Footage</label>
                                    <textarea
                                        value={formData.stock_rules || ''}
                                        onChange={(e) => setFormData({ ...formData, stock_rules: e.target.value })}
                                        className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-lg text-white focus:border-pink-500 focus:outline-none resize-none h-24"
                                        placeholder="Ex: Priorize vídeos sem pessoas. Duração mínima de 5 segundos..."
                                    />
                                </div>
                            )}

                            {/* Botões de Ação */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                                <button
                                    onClick={() => { setActiveTab('select'); setEditingNiche(null); setIsCreating(false); }}
                                    className="px-6 py-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="px-6 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium hover:opacity-90 transition-opacity"
                                >
                                    {isCreating ? 'Criar Nicho' : 'Salvar Alterações'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
