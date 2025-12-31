
import React, { useState, useRef } from 'react';
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
  ImagePlus
} from 'lucide-react';
import { TikTokIcon } from './icons/TikTokIcon';
import { SocialPlatform, PLATFORM_CONFIG, Channel } from './types';

interface NewPostProps {
  channels: Channel[];
  onBack?: () => void;
}

const PLATFORM_ICONS: Record<SocialPlatform, typeof Instagram> = {
  instagram: Instagram,
  tiktok: Video,
  youtube: Youtube
};

export const NewPost = ({ channels, onBack }: NewPostProps) => {
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [scheduleTime, setScheduleTime] = useState<string>('');
  const [isScheduled, setIsScheduled] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev => 
      prev.includes(channelId) 
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setMediaFiles(prev => [...prev, ...files]);
    
    // Criar URLs de preview
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      setPreviewUrls(prev => [...prev, url]);
    });
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    URL.revokeObjectURL(previewUrls[index]);
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handlePost = () => {
    console.log('Posting...', {
      channels: selectedChannels,
      caption,
      mediaFiles,
      scheduled: isScheduled ? { date: scheduleDate, time: scheduleTime } : null
    });
    // TODO: Implementar lógica de postagem
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
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#3f3f46';
            e.currentTarget.style.backgroundColor = '#18181b';
          }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
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
              Arraste arquivos ou clique para fazer upload
            </p>
            <p style={{ color: '#71717a', fontSize: '13px' }}>
              Suporta imagens e vídeos (MP4, MOV, JPG, PNG)
            </p>
          </div>

          {/* Preview de Mídia */}
          {previewUrls.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '12px'
            }}>
              {previewUrls.map((url, index) => (
                <div key={index} style={{
                  position: 'relative',
                  aspectRatio: '1',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: '#27272a'
                }}>
                  {mediaFiles[index]?.type.startsWith('video/') ? (
                    <video 
                      src={url} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <img 
                      src={url} 
                      alt="" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeMedia(index); }}
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
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
