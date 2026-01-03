
import React, { useState, useRef, useEffect } from 'react';
import { 
  Instagram, 
  Youtube, 
  Video, 
  Image, 
  X, 
  Upload, 
  Calendar, 
  Clock,
  ChevronDown,
  Sparkles,
  Send,
  FileVideo,
  ImagePlus,
  Loader2,
  CheckCircle,
  AlertCircle,
  Square,
  RectangleVertical,
  RectangleHorizontal
} from 'lucide-react';
import { TikTokIcon } from './icons/TikTokIcon';
import { SocialPlatform, PLATFORM_CONFIG, Channel } from './types';

interface NewPostProps {
  channels: Channel[];
  workspaceId: string;
  onBack?: () => void;
}

interface UploadStatus {
  platform: SocialPlatform;
  status: 'pending' | 'uploading' | 'success' | 'error';
  message?: string;
}

// Tipo de orientação da mídia
type MediaOrientation = 'square' | 'portrait' | 'landscape';

const ORIENTATION_OPTIONS: { value: MediaOrientation; label: string; icon: typeof Square }[] = [
  { value: 'square', label: 'Quadrado (1:1)', icon: Square },
  { value: 'portrait', label: 'Retrato (9:16)', icon: RectangleVertical },
  { value: 'landscape', label: 'Paisagem (16:9)', icon: RectangleHorizontal },
];

const PLATFORM_ICONS: Record<SocialPlatform, typeof Instagram> = {
  instagram: Instagram,
  tiktok: Video,
  youtube: Youtube
};

export const NewPost = ({ channels, workspaceId, onBack }: NewPostProps) => {
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [title, setTitle] = useState('');
  const [mediaPath, setMediaPath] = useState<string>('');
  const [mediaFileName, setMediaFileName] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [mediaOrientation, setMediaOrientation] = useState<MediaOrientation>('portrait');
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [scheduleTime, setScheduleTime] = useState<string>('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Setup IPC listeners para upload
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.socialMedia) return;

    const unsubscribeStatus = window.electron.socialMedia.onUploadStatus?.((data: any) => {
      if (data.workspaceId === workspaceId) {
        setUploadStatuses(prev => prev.map(s => 
          s.platform === data.platform 
            ? { ...s, status: 'uploading', message: data.message }
            : s
        ));
      }
    });

    const unsubscribeSuccess = window.electron.socialMedia.onUploadSuccess?.((data: any) => {
      if (data.workspaceId === workspaceId) {
        console.log(`✅ Upload para ${data.platform} concluído`);
        setUploadStatuses(prev => prev.map(s => 
          s.platform === data.platform 
            ? { ...s, status: 'success', message: data.message }
            : s
        ));
      }
    });

    const unsubscribeError = window.electron.socialMedia.onUploadError?.((data: any) => {
      if (data.workspaceId === workspaceId) {
        console.error(`❌ Erro no upload para ${data.platform}:`, data.error);
        setUploadStatuses(prev => prev.map(s => 
          s.platform === data.platform 
            ? { ...s, status: 'error', message: data.error }
            : s
        ));
      }
    });

    return () => {
      unsubscribeStatus?.();
      unsubscribeSuccess?.();
      unsubscribeError?.();
    };
  }, [workspaceId]);

  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev => 
      prev.includes(channelId) 
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  // Seleciona arquivo usando o dialog do sistema (para obter o caminho correto)
  const handleSelectMedia = async () => {
    if (!window.electron?.socialMedia?.selectMedia) {
      console.error('selectMedia não disponível');
      return;
    }

    const result = await window.electron.socialMedia.selectMedia();
    
    if (result.success && result.filePath) {
      console.log('📁 Arquivo selecionado:', result);
      setMediaPath(result.filePath);
      setMediaFileName(result.fileName || 'Arquivo');
      
      // Para preview, usa file:// protocol
      const fileUrl = `file://${result.filePath}`;
      setPreviewUrl(fileUrl);
      
      // Detecta orientação da mídia automaticamente
      detectMediaOrientation(fileUrl, result.fileName || '');
    } else if (!result.canceled) {
      console.error('Erro ao selecionar arquivo:', result.error);
    }
  };

  // Detecta a orientação da mídia (vídeo ou imagem) pelas dimensões
  const detectMediaOrientation = (fileUrl: string, fileName: string) => {
    const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(fileName);
    
    if (isVideo) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        const orientation = calculateOrientation(width, height);
        console.log(`📐 Vídeo: ${width}x${height} → ${orientation}`);
        setMediaOrientation(orientation);
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => {
        console.warn('Não foi possível obter dimensões do vídeo');
        setMediaOrientation('portrait'); // Default
      };
      video.src = fileUrl;
    } else {
      const img = new window.Image();
      img.onload = () => {
        const width = img.width;
        const height = img.height;
        const orientation = calculateOrientation(width, height);
        console.log(`📐 Imagem: ${width}x${height} → ${orientation}`);
        setMediaOrientation(orientation);
      };
      img.onerror = () => {
        console.warn('Não foi possível obter dimensões da imagem');
        setMediaOrientation('portrait'); // Default
      };
      img.src = fileUrl;
    }
  };

  // Calcula a orientação baseada nas dimensões
  const calculateOrientation = (width: number, height: number): MediaOrientation => {
    const ratio = width / height;
    
    if (ratio > 1.2) {
      return 'landscape'; // Mais largo que alto
    } else if (ratio < 0.8) {
      return 'portrait'; // Mais alto que largo
    } else {
      return 'square'; // Aproximadamente quadrado
    }
  };

  const removeMedia = () => {
    setMediaPath('');
    setMediaFileName('');
    setPreviewUrl('');
    setMediaOrientation('portrait');
  };

  const handlePost = async () => {
    if (!window.electron?.socialMedia || !mediaPath || selectedChannels.length === 0) {
      console.error('Condições não atendidas para upload');
      return;
    }

    setIsUploading(true);

    // Prepara os status iniciais
    const selectedPlatforms = channels
      .filter(c => selectedChannels.includes(c.id))
      .map(c => c.platform);
    
    setUploadStatuses(selectedPlatforms.map(platform => ({
      platform,
      status: 'pending'
    })));

    console.log('📤 Iniciando uploads...', {
      channels: selectedChannels,
      title,
      caption,
      mediaPath,
      orientation: mediaOrientation,
      scheduled: isScheduled ? { date: scheduleDate, time: scheduleTime } : null
    });

    // Faz upload para cada plataforma selecionada
    for (const channel of channels.filter(c => selectedChannels.includes(c.id))) {
      const platform = channel.platform;
      
      setUploadStatuses(prev => prev.map(s => 
        s.platform === platform 
          ? { ...s, status: 'uploading', message: 'Iniciando...' }
          : s
      ));

      try {
        const result = await window.electron.socialMedia.uploadMedia(
          workspaceId,
          platform as 'instagram' | 'tiktok' | 'youtube',
          {
            mediaPath,
            title: title || caption.substring(0, 100),
            description: caption,
            orientation: mediaOrientation
          }
        );

        if (result.success) {
          setUploadStatuses(prev => prev.map(s => 
            s.platform === platform 
              ? { ...s, status: 'success', message: 'Publicado!' }
              : s
          ));
        } else {
          setUploadStatuses(prev => prev.map(s => 
            s.platform === platform 
              ? { ...s, status: 'error', message: result.error || 'Erro' }
              : s
          ));
        }
      } catch (error: any) {
        setUploadStatuses(prev => prev.map(s => 
          s.platform === platform 
            ? { ...s, status: 'error', message: error.message || 'Erro' }
            : s
        ));
      }
    }

    setIsUploading(false);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      maxWidth: '900px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '32px' 
      }}>
        <div>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: 700, 
            color: 'white', 
            marginBottom: '8px' 
          }}>
            Novo Post
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: '14px' }}>
            Crie e publique conteúdo em múltiplas plataformas
          </p>
        </div>
        
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: 'transparent',
              border: '1px solid #3f3f46',
              borderRadius: '8px',
              padding: '8px 16px',
              color: '#a1a1aa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <X size={16} />
            Cancelar
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '24px', flex: 1 }}>
        {/* Coluna Esquerda - Mídia e Caption */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Upload de Mídia */}
          <div style={{
            backgroundColor: '#18181b',
            border: '2px dashed #3f3f46',
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={handleSelectMedia}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#3f3f46';
            e.currentTarget.style.backgroundColor = '#18181b';
          }}
          >
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <ImagePlus size={32} color="#6366f1" />
            </div>
            <p style={{ color: 'white', fontWeight: 600, marginBottom: '4px' }}>
              Clique para selecionar um arquivo
            </p>
            <p style={{ color: '#71717a', fontSize: '13px' }}>
              Suporta imagens e vídeos (MP4, MOV, JPG, PNG)
            </p>
          </div>

          {/* Preview de Mídia */}
          {mediaPath && (
            <>
            <div style={{
              position: 'relative',
              borderRadius: '12px',
              overflow: 'hidden',
              backgroundColor: '#27272a',
              border: '1px solid #3f3f46'
            }}>
              <div style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '8px',
                  backgroundColor: '#3f3f46',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {mediaPath.match(/\.(mp4|mov|avi|mkv|webm)$/i) ? (
                    <FileVideo size={24} color="#a1a1aa" />
                  ) : (
                    <Image size={24} color="#a1a1aa" />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>
                    {mediaFileName}
                  </p>
                  <p style={{ color: '#71717a', fontSize: '12px' }}>
                    {mediaPath.match(/\.(mp4|mov|avi|mkv|webm)$/i) ? 'Vídeo' : 'Imagem'}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeMedia(); }}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Seletor de Orientação */}
            <div style={{
              marginTop: '12px',
              padding: '12px',
              backgroundColor: '#27272a',
              borderRadius: '8px',
              border: '1px solid #3f3f46'
            }}>
              <span style={{ color: '#a1a1aa', fontSize: '12px', display: 'block', marginBottom: '8px' }}>
                Orientação (para Instagram)
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {ORIENTATION_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const isSelected = mediaOrientation === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={(e) => { e.stopPropagation(); setMediaOrientation(opt.value); }}
                      style={{
                        flex: 1,
                        padding: '8px',
                        backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.2)' : '#18181b',
                        border: isSelected ? '1px solid #6366f1' : '1px solid #3f3f46',
                        borderRadius: '6px',
                        color: isSelected ? '#818cf8' : '#a1a1aa',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column' as const,
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Icon size={20} />
                      <span style={{ fontSize: '10px' }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            </>
          )}

          {/* Caption/Legenda */}
          <div style={{
            backgroundColor: '#18181b',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #27272a'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '12px'
            }}>
              <span style={{ color: '#a1a1aa', fontSize: '13px', fontWeight: 500 }}>
                Legenda
              </span>
              <button style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                color: 'white',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Sparkles size={14} />
                Gerar com IA
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Escreva uma legenda para seu post..."
              style={{
                width: '100%',
                minHeight: '120px',
                backgroundColor: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '14px',
                lineHeight: '1.6',
                resize: 'vertical',
                outline: 'none'
              }}
            />
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end',
              marginTop: '8px' 
            }}>
              <span style={{ color: '#71717a', fontSize: '12px' }}>
                {caption.length} / 2200 caracteres
              </span>
            </div>
          </div>
        </div>

        {/* Coluna Direita - Seleção de Canais e Agendamento */}
        <div style={{ 
          width: '300px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '20px' 
        }}>
          {/* Seleção de Canais */}
          <div style={{
            backgroundColor: '#18181b',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #27272a'
          }}>
            <h3 style={{ 
              color: 'white', 
              fontSize: '14px', 
              fontWeight: 600, 
              marginBottom: '12px' 
            }}>
              Publicar em
            </h3>
            
            {channels.length === 0 ? (
              <p style={{ color: '#71717a', fontSize: '13px' }}>
                Nenhum canal conectado
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {channels.map(channel => {
                  const config = PLATFORM_CONFIG[channel.platform];
                  const Icon = PLATFORM_ICONS[channel.platform];
                  const isSelected = selectedChannels.includes(channel.id);
                  
                  return (
                    <div
                      key={channel.id}
                      onClick={() => toggleChannel(channel.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 12px',
                        backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.1)' : '#27272a',
                        border: `1px solid ${isSelected ? '#6366f1' : 'transparent'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: config.color + '20',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {channel.platform === 'tiktok' ? (
                          <TikTokIcon size={16} />
                        ) : (
                          <Icon size={16} color={config.color} />
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ 
                          color: 'white', 
                          fontSize: '13px', 
                          fontWeight: 500 
                        }}>
                          {channel.name}
                        </p>
                        <p style={{ color: '#71717a', fontSize: '11px' }}>
                          {config.label}
                        </p>
                      </div>
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: isSelected ? 'none' : '2px solid #52525b',
                        backgroundColor: isSelected ? '#6366f1' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Agendamento */}
          <div style={{
            backgroundColor: '#18181b',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #27272a'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '12px'
            }}>
              <h3 style={{ color: 'white', fontSize: '14px', fontWeight: 600 }}>
                Agendar
              </h3>
              <label style={{
                position: 'relative',
                display: 'inline-block',
                width: '40px',
                height: '22px'
              }}>
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: isScheduled ? '#6366f1' : '#3f3f46',
                  borderRadius: '11px',
                  transition: '0.3s'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '',
                    height: '18px',
                    width: '18px',
                    left: isScheduled ? '20px' : '2px',
                    bottom: '2px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.3s'
                  }} />
                </span>
              </label>
            </div>
            
            {isScheduled && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    color: '#71717a',
                    fontSize: '12px',
                    marginBottom: '6px'
                  }}>
                    <Calendar size={14} />
                    Data
                  </label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#27272a',
                      border: '1px solid #3f3f46',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '13px'
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    color: '#71717a',
                    fontSize: '12px',
                    marginBottom: '6px'
                  }}>
                    <Clock size={14} />
                    Hora
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#27272a',
                      border: '1px solid #3f3f46',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Botão de Publicar */}
          <button
            onClick={handlePost}
            disabled={selectedChannels.length === 0}
            style={{
              width: '100%',
              padding: '14px 20px',
              background: selectedChannels.length > 0 
                ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                : '#3f3f46',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: selectedChannels.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: selectedChannels.length > 0 
                ? '0 4px 16px rgba(99, 102, 241, 0.3)' 
                : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Send size={18} />
            {isScheduled ? 'Agendar Post' : 'Publicar Agora'}
          </button>
        </div>
      </div>
    </div>
  );
};
