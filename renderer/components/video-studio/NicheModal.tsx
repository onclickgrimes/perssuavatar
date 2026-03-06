import React, { useState, useEffect } from 'react';
import { 
    ASSET_DEFINITIONS,
    CAMERA_MOVEMENT_LIST,
    TRANSITION_LIST,
    EMOTION_LIST,
    ENTRY_ANIMATION_LIST,
    EXIT_ANIMATION_LIST,
    REMOTION_COMPONENT_LIST,
    type AssetType,
} from '../../../remotion/types/project';

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
    entry_animations?: string[];
    exit_animations?: string[];
    
    // Stock footage
    stock_categories?: string[];
    stock_rules?: string;
    
    // Visual
    default_colors?: string[];
    default_font?: string;
    components_allowed?: string[];
    
    // Vozes e TTS
    tts_provider?: string;
    voice_id?: string;
    voice_styles?: string[];
    
    created_at?: string;
    updated_at?: string;
}

const GEMINI_VOICES = [
    { id: 'Achernar', gender: 'Feminino', description: 'Suave, Tom mais agudo' },
    { id: 'Achird', gender: 'Masculino', description: 'Amigável, Tom médio-grave' },
    { id: 'Algenib', gender: 'Masculino', description: 'Rouca, Tom mais grave' },
    { id: 'Algieba', gender: 'Masculino', description: 'Suave, Tom mais grave' },
    { id: 'Alnilam', gender: 'Masculino', description: 'Firme, Tom médio-grave' },
    { id: 'Aoede', gender: 'Feminino', description: 'Leve, Tom médio' },
    { id: 'Autonoe', gender: 'Feminino', description: 'Vibrante, Tom médio' },
    { id: 'Callirrhoe', gender: 'Feminino', description: 'Descontraída, Tom médio' },
    { id: 'Charon', gender: 'Masculino', description: 'Informativa, Tom mais grave' },
    { id: 'Despina', gender: 'Feminino', description: 'Suave, Tom médio' },
    { id: 'Enceladus', gender: 'Masculino', description: 'Sussurrada, Tom mais grave' },
    { id: 'Erinome', gender: 'Feminino', description: 'Clara, Tom médio' },
    { id: 'Fenrir', gender: 'Masculino', description: 'Empolgada, Tom médio-grave' },
    { id: 'Gacrux', gender: 'Feminino', description: 'Madura, Tom médio' },
    { id: 'Iapetus', gender: 'Masculino', description: 'Clara, Tom médio-grave' },
    { id: 'Kore', gender: 'Feminino', description: 'Firme, Tom médio' },
    { id: 'Laomedeia', gender: 'Feminino', description: 'Alegre, Tom mais agudo' },
    { id: 'Leda', gender: 'Feminino', description: 'Jovem, Tom mais agudo' },
    { id: 'Orus', gender: 'Masculino', description: 'Firme, Tom médio-grave' },
    { id: 'Puck', gender: 'Masculino', description: 'Alegre, Tom médio' },
    { id: 'Pulcherrima', gender: 'Feminino', description: 'Direta, Tom médio' },
    { id: 'Rasalgethi', gender: 'Masculino', description: 'Informativa, Tom médio' },
    { id: 'Sadachbia', gender: 'Masculino', description: 'Animada, Tom mais grave' },
    { id: 'Sadaltager', gender: 'Masculino', description: 'Sábia, Tom médio' },
    { id: 'Schedar', gender: 'Masculino', description: 'Uniforme, Tom médio-grave' },
    { id: 'Sulafat', gender: 'Feminino', description: 'Calorosa, Tom médio' },
    { id: 'Umbriel', gender: 'Masculino', description: 'Descontraída, Tom médio-grave' },
    { id: 'Vindemiatrix', gender: 'Feminino', description: 'Gentil, Tom médio' },
    { id: 'Zephyr', gender: 'Feminino', description: 'Vibrante, Tom mais agudo' },
    { id: 'Zubenelgenubi', gender: 'Masculino', description: 'Casual, Tom médio-grave' }
];

// Gerar lista de asset types a partir de TODAS as opções disponíveis
const ASSET_TYPES = (Object.keys(ASSET_DEFINITIONS) as AssetType[]).map((value) => ({
    value,
    label: ASSET_DEFINITIONS[value].label,
    icon: ASSET_DEFINITIONS[value].icon,
    description: ASSET_DEFINITIONS[value].description,
    badgeColor: ASSET_DEFINITIONS[value].badgeColor,
}));

// Usar EMOTION_LIST diretamente
const EMOTIONS = EMOTION_LIST;

// Usar listas centralizadas
const ENTRY_ANIMATIONS = ENTRY_ANIMATION_LIST;
const EXIT_ANIMATIONS = EXIT_ANIMATION_LIST;
const REMOTION_COMPONENTS = REMOTION_COMPONENT_LIST;

// Lista de fontes populares para vídeos
const FONT_OPTIONS = [
    // Sans-Serif - Modernas e limpas
    { value: 'Inter', label: 'Inter', category: 'Sans-Serif', description: 'Fonte moderna e versátil' },
    { value: 'Roboto', label: 'Roboto', category: 'Sans-Serif', description: 'Fonte Google popular e legível' },
    { value: 'Poppins', label: 'Poppins', category: 'Sans-Serif', description: 'Geométrica e amigável' },
    { value: 'Montserrat', label: 'Montserrat', category: 'Sans-Serif', description: 'Elegante e profissional' },
    { value: 'Open Sans', label: 'Open Sans', category: 'Sans-Serif', description: 'Humanista e clara' },
    { value: 'Lato', label: 'Lato', category: 'Sans-Serif', description: 'Semi-arredondada e equilibrada' },
    { value: 'Nunito', label: 'Nunito', category: 'Sans-Serif', description: 'Arredondada e amigável' },
    { value: 'Outfit', label: 'Outfit', category: 'Sans-Serif', description: 'Moderna e geométrica' },
    { value: 'DM Sans', label: 'DM Sans', category: 'Sans-Serif', description: 'Minimalista e clean' },
    { value: 'Space Grotesk', label: 'Space Grotesk', category: 'Sans-Serif', description: 'Futurista e tecnológica' },
    
    // Serif - Clássicas e elegantes
    { value: 'Playfair Display', label: 'Playfair Display', category: 'Serif', description: 'Clássica e sofisticada' },
    { value: 'Merriweather', label: 'Merriweather', category: 'Serif', description: 'Legível e tradicional' },
    { value: 'Lora', label: 'Lora', category: 'Serif', description: 'Contemporânea e equilibrada' },
    { value: 'Crimson Text', label: 'Crimson Text', category: 'Serif', description: 'Elegante para textos longos' },
    { value: 'Libre Baskerville', label: 'Libre Baskerville', category: 'Serif', description: 'Clássica otimizada para web' },
    
    // Display - Impactantes para títulos
    { value: 'Bebas Neue', label: 'Bebas Neue', category: 'Display', description: 'Bold e impactante' },
    { value: 'Oswald', label: 'Oswald', category: 'Display', description: 'Condensada e moderna' },
    { value: 'Raleway', label: 'Raleway', category: 'Display', description: 'Elegante e fina' },
    { value: 'Anton', label: 'Anton', category: 'Display', description: 'Poderosa para títulos' },
    { value: 'Righteous', label: 'Righteous', category: 'Display', description: 'Retro e divertida' },
    { value: 'Bangers', label: 'Bangers', category: 'Display', description: 'Estilo quadrinhos' },
    { value: 'Permanent Marker', label: 'Permanent Marker', category: 'Display', description: 'Estilo marcador' },
    
    // Handwriting - Manuscritas
    { value: 'Dancing Script', label: 'Dancing Script', category: 'Handwriting', description: 'Cursiva elegante' },
    { value: 'Pacifico', label: 'Pacifico', category: 'Handwriting', description: 'Surfista e descontraída' },
    { value: 'Caveat', label: 'Caveat', category: 'Handwriting', description: 'Natural e espontânea' },
    { value: 'Great Vibes', label: 'Great Vibes', category: 'Handwriting', description: 'Caligráfica luxuosa' },
    
    // Monospace - Código/Tech
    { value: 'Fira Code', label: 'Fira Code', category: 'Monospace', description: 'Código com ligaduras' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono', category: 'Monospace', description: 'Ideal para programação' },
    { value: 'Source Code Pro', label: 'Source Code Pro', category: 'Monospace', description: 'Limpa e legível' },
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
        entry_animations: [],
        exit_animations: [],
        stock_categories: [],
        stock_rules: '',
        default_colors: [],
        default_font: '',
        components_allowed: [],
        tts_provider: 'gemini',
        voice_id: '',
        voice_styles: [],
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
            entry_animations: [],
            exit_animations: [],
            stock_categories: [],
            stock_rules: '',
            default_colors: [],
            default_font: '',
            components_allowed: [],
            tts_provider: 'gemini',
            voice_id: '',
            voice_styles: [],
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

    const handleAddVoiceStyle = () => {
        setFormData({
            ...formData,
            voice_styles: [...(formData.voice_styles || []), 'Read aloud in a warm and friendly tone: ']
        });
    };

    const handleUpdateVoiceStyle = (index: number, value: string) => {
        const newStyles = [...(formData.voice_styles || [])];
        newStyles[index] = value;
        setFormData({ ...formData, voice_styles: newStyles });
    };

    const handleRemoveVoiceStyle = (index: number) => {
        const newStyles = [...(formData.voice_styles || [])];
        newStyles.splice(index, 1);
        setFormData({ ...formData, voice_styles: newStyles });
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
                                            title={asset.description}
                                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                                                formData.asset_types?.includes(asset.value)
                                                    ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/30'
                                                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                                            }`}
                                        >
                                            <span className="mr-1">{asset.icon}</span>
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
                                    {CAMERA_MOVEMENT_LIST.map((cam) => (
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
                                    {TRANSITION_LIST.map((trans) => (
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
                                                       ? 'bg-orange-500 text-black'
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
                            </div>

                            {/* Regras de Stock (mostra quando video_stock está em asset_types) */}
                            {formData.asset_types?.includes('video_stock') && (
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

                            {/* Fonte Padrão */}
                            <div>
                                <label className="block text-white/80 text-sm font-medium mb-2">
                                    Fonte Padrão <span className="text-white/40">(Google Fonts)</span>
                                </label>
                                <div className="space-y-3">
                                    {/* Dropdown de seleção */}
                                    <select
                                        value={formData.default_font || ''}
                                        onChange={(e) => setFormData({ ...formData, default_font: e.target.value })}
                                        className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:border-pink-500 focus:outline-none appearance-none cursor-pointer"
                                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.5em 1.5em' }}
                                    >
                                        <option value="" className="bg-gray-900 text-white">Selecione uma fonte...</option>
                                        {/* Sans-Serif */}
                                        <optgroup label="Sans-Serif - Modernas e Limpas" className="bg-gray-900 text-white">
                                            {FONT_OPTIONS.filter(f => f.category === 'Sans-Serif').map(font => (
                                                <option key={font.value} value={font.value} className="bg-gray-900 text-white">
                                                    {font.label}
                                                </option>
                                            ))}
                                        </optgroup>
                                        {/* Serif */}
                                        <optgroup label="Serif - Clássicas e Elegantes" className="bg-gray-900 text-white">
                                            {FONT_OPTIONS.filter(f => f.category === 'Serif').map(font => (
                                                <option key={font.value} value={font.value} className="bg-gray-900 text-white">
                                                    {font.label}
                                                </option>
                                            ))}
                                        </optgroup>
                                        {/* Display */}
                                        <optgroup label="Display - Para Títulos" className="bg-gray-900 text-white">
                                            {FONT_OPTIONS.filter(f => f.category === 'Display').map(font => (
                                                <option key={font.value} value={font.value} className="bg-gray-900 text-white">
                                                    {font.label}
                                                </option>
                                            ))}
                                        </optgroup>
                                        {/* Handwriting */}
                                        <optgroup label="Handwriting - Manuscritas" className="bg-gray-900 text-white">
                                            {FONT_OPTIONS.filter(f => f.category === 'Handwriting').map(font => (
                                                <option key={font.value} value={font.value} className="bg-gray-900 text-white">
                                                    {font.label}
                                                </option>
                                            ))}
                                        </optgroup>
                                        {/* Monospace */}
                                        <optgroup label="Monospace - Código/Tech" className="bg-gray-900 text-white">
                                            {FONT_OPTIONS.filter(f => f.category === 'Monospace').map(font => (
                                                <option key={font.value} value={font.value} className="bg-gray-900 text-white">
                                                    {font.label}
                                                </option>
                                            ))}
                                        </optgroup>
                                    </select>
                                    
                                    {/* Preview da fonte selecionada */}
                                    {formData.default_font && (
                                        <div className="p-4 bg-black/20 border border-white/10 rounded-lg">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-white/60 text-xs uppercase tracking-wider">Preview</span>
                                                <button
                                                    onClick={() => setFormData({ ...formData, default_font: '' })}
                                                    className="text-red-400 text-xs hover:text-red-300 transition-colors"
                                                >
                                                    Limpar
                                                </button>
                                            </div>
                                            <link 
                                                href={`https://fonts.googleapis.com/css2?family=${formData.default_font.replace(/ /g, '+')}&display=swap`} 
                                                rel="stylesheet" 
                                            />
                                            <p 
                                                style={{ fontFamily: `"${formData.default_font}", sans-serif` }}
                                                className="text-2xl text-white"
                                            >
                                                {formData.default_font}
                                            </p>
                                            <p 
                                                style={{ fontFamily: `"${formData.default_font}", sans-serif` }}
                                                className="text-sm text-white/60 mt-1"
                                            >
                                                ABCDEFGHIJKLM abcdefghijklm 0123456789
                                            </p>
                                            <p className="text-xs text-white/40 mt-2">
                                                {FONT_OPTIONS.find(f => f.value === formData.default_font)?.description}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Configurações de Voz (TTS) */}
                            <div className="border-t border-white/10 pt-6 mt-6">
                                <h3 className="text-lg font-medium text-white mb-4">Vozes e Narração</h3>
                                
                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="flex-1 max-w-[200px]">
                                            <label className="block text-white/80 text-sm font-medium mb-2">Provedor TTS</label>
                                            <select
                                                value={formData.tts_provider || 'gemini'}
                                                onChange={(e) => setFormData({ ...formData, tts_provider: e.target.value })}
                                                className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:border-pink-500 focus:outline-none appearance-none cursor-pointer"
                                                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.5em 1.5em' }}
                                            >
                                                <option value="gemini" className="bg-gray-900 text-white">Google Gemini</option>
                                            </select>
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-white/80 text-sm font-medium mb-2">Voz do Narrador</label>
                                            <select
                                                value={formData.voice_id || ''}
                                                onChange={(e) => setFormData({ ...formData, voice_id: e.target.value })}
                                                className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:border-pink-500 focus:outline-none appearance-none cursor-pointer"
                                                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.5em 1.5em' }}
                                            >
                                                <option value="" className="bg-gray-900 text-white">Selecione uma voz...</option>
                                                {GEMINI_VOICES.map(voice => (
                                                    <option key={voice.id} value={voice.id} className="bg-gray-900 text-white">
                                                        {voice.id} - {voice.gender} ({voice.description})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-2 mt-4">
                                            <label className="text-white/80 text-sm font-medium">Estilos de Voz Disponíveis</label>
                                            <button
                                                type="button"
                                                onClick={handleAddVoiceStyle}
                                                className="text-sm bg-pink-500 hover:bg-pink-400 text-white px-4 py-2 font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(236,72,153,0.3)]"
                                            >
                                                + Adicionar Estilo
                                            </button>
                                        </div>
                                        
                                        <div className="space-y-3">
                                            {(formData.voice_styles || []).map((style, idx) => (
                                                <div key={idx} className="flex gap-3 items-center bg-black/30 p-4 rounded-xl border border-white/10 relative group">
                                                    <div className="flex-1">
                                                        <input
                                                            type="text"
                                                            value={typeof style === 'string' ? style : (style as any).name || ''}
                                                            onChange={(e) => handleUpdateVoiceStyle(idx, e.target.value)}
                                                            placeholder="Descreva em inglês o estilo do narrador, por exemplo: 'Read this in a dramatic whisper:'"
                                                            className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-lg text-white text-sm focus:border-pink-500 focus:outline-none"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveVoiceStyle(idx)}
                                                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white mt-1 transition-all group-hover:opacity-100 opacity-50"
                                                        title="Remover estilo de voz"
                                                    >
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                            {(!formData.voice_styles || formData.voice_styles.length === 0) && (
                                                <div className="flex flex-col items-center justify-center p-6 border-2 border-white/10 border-dashed rounded-xl ">
                                                    <span className="text-white/40 text-sm mb-2">Nenhum estilo de voz criado para este nicho.</span>
                                                    <span className="text-white/30 text-xs text-center max-w-[300px]">Adicione um estilo (ex: Read aloud in a warm tone) para dar instrução descritiva à API TTS do Gemini.</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>



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
