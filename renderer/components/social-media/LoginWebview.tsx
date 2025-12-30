
import React from 'react';
import { X, ArrowLeft, RotateCcw, Loader2 } from 'lucide-react';
import { SocialPlatform, PLATFORM_CONFIG, PLATFORM_LOGIN_URLS } from './types';

interface LoginWebviewProps {
  platform: SocialPlatform;
  workspaceId: string;
  onCancel: () => void;
  onSuccess: (platform: SocialPlatform, username: string) => void;
}

/**
 * Componente que renderiza um webview para login na plataforma selecionada.
 * Usa o <webview> tag do Electron para embeber o site externo.
 */
export const LoginWebview = ({ platform, workspaceId, onCancel, onSuccess }: LoginWebviewProps) => {
  const webviewRef = React.useRef<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [currentUrl, setCurrentUrl] = React.useState('');
  
  const config = PLATFORM_CONFIG[platform];
  const loginUrl = PLATFORM_LOGIN_URLS[platform];

  React.useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleLoadStart = () => setIsLoading(true);
    const handleLoadStop = () => {
      setIsLoading(false);
      setCurrentUrl(webview.getURL?.() || '');
    };

    const handleDidNavigate = (event: any) => {
      const url = event.url || webview.getURL?.() || '';
      setCurrentUrl(url);
      
      // Detectar login bem-sucedido baseado na URL
      // Instagram: redireciona para / ou /feed após login
      if (platform === 'instagram') {
        if (url === 'https://www.instagram.com/' || 
            url.includes('instagram.com/feed') ||
            (url.includes('instagram.com') && !url.includes('/login') && !url.includes('/accounts/login'))) {
          // Provavelmente logado - pegar username
          setTimeout(() => {
            checkInstagramLogin(webview);
          }, 2000);
        }
      }
      
      // TikTok: redireciona para /foryou ou perfil após login
      if (platform === 'tiktok') {
        if (url.includes('tiktok.com/foryou') || 
            (url.includes('tiktok.com/@') && !url.includes('/login'))) {
          setTimeout(() => {
            onSuccess(platform, '@tiktok_user');
          }, 1000);
        }
      }
      
      // YouTube: redireciona para youtube.com após login
      if (platform === 'youtube') {
        if (url === 'https://www.youtube.com/' || url.includes('youtube.com/feed')) {
          setTimeout(() => {
            onSuccess(platform, 'YouTube Channel');
          }, 1000);
        }
      }
    };

    webview.addEventListener('did-start-loading', handleLoadStart);
    webview.addEventListener('did-stop-loading', handleLoadStop);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigate);

    return () => {
      webview.removeEventListener('did-start-loading', handleLoadStart);
      webview.removeEventListener('did-stop-loading', handleLoadStop);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
    };
  }, [platform, onSuccess]);

  const checkInstagramLogin = async (webview: any) => {
    try {
      // Tenta extrair o username do Instagram pela página
      const username = await webview.executeJavaScript(`
        (function() {
          // Tenta pegar da meta tag
          const meta = document.querySelector('meta[property="al:ios:url"]');
          if (meta) {
            const content = meta.getAttribute('content') || '';
            const match = content.match(/user\\?username=([^&]+)/);
            if (match) return '@' + match[1];
          }
          
          // Tenta pegar do link do perfil
          const profileLink = document.querySelector('a[href*="/' + '"]')?.getAttribute('href');
          if (profileLink && profileLink.startsWith('/') && profileLink.length > 1) {
            const username = profileLink.split('/')[1];
            if (username && !['explore', 'reels', 'direct', 'accounts'].includes(username)) {
              return '@' + username;
            }
          }
          
          return null;
        })()
      `);
      
      if (username) {
        onSuccess(platform, username);
      } else {
        // Se não conseguiu pegar o username, tenta novamente ou usa default
        onSuccess(platform, '@instagram_user');
      }
    } catch (error) {
      console.error('Error checking Instagram login:', error);
      onSuccess(platform, '@instagram_user');
    }
  };

  const handleBack = () => {
    if (webviewRef.current?.canGoBack?.()) {
      webviewRef.current.goBack();
    }
  };

  const handleReload = () => {
    webviewRef.current?.reload?.();
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      backgroundColor: '#09090b'
    }}>
      {/* Header com controles */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: '#121212',
        borderBottom: '1px solid #27272a'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleBack}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Voltar"
          >
            <ArrowLeft size={18} color="#a1a1aa" />
          </button>
          
          <button
            onClick={handleReload}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Recarregar"
          >
            <RotateCcw size={16} color="#a1a1aa" />
          </button>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            backgroundColor: '#18181b',
            borderRadius: '20px',
            flex: 1,
            maxWidth: '400px'
          }}>
            {isLoading && <Loader2 size={14} color={config.color} style={{ animation: 'spin 1s linear infinite' }} />}
            <span style={{ 
              color: '#a1a1aa', 
              fontSize: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {currentUrl || loginUrl}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: config.color, fontWeight: 600, fontSize: '14px' }}>
            Conectar {config.label}
          </span>
          
          <button
            onClick={onCancel}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: '1px solid #3f3f46',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Cancelar"
          >
            <X size={18} color="#a1a1aa" />
          </button>
        </div>
      </div>

      {/* Webview container */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* @ts-ignore - webview is an Electron-specific tag */}
        <webview
          ref={webviewRef}
          src={loginUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none'
          }}
          partition={`persist:workspace-${workspaceId}`}
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          // @ts-ignore - Electron webview attribute
          webpreferences="enableBlinkFeatures=, disableBlinkFeatures=WebAuthentication"
        />
        
        {/* Loading overlay */}
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(9, 9, 11, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px'
            }}>
              <Loader2 size={32} color={config.color} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ color: '#a1a1aa', fontSize: '14px' }}>Carregando {config.label}...</span>
            </div>
          </div>
        )}
      </div>

      {/* Estilos para animação */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
