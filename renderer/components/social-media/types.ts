
import { LucideIcon } from 'lucide-react';

export type ViewState = 'overview' | 'inbox' | 'calendar' | 'analytics' | 'assets' | 'channels' | 'settings' | 'new-post';
export type SocialPlatform = 'instagram' | 'tiktok' | 'youtube';

// Estado de conexão de uma plataforma
export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface Workspace {
  id: string;
  name: string;
  channels: Channel[];
}

export interface Channel {
  id: string;
  platform: SocialPlatform;
  name: string;
  followers: number;
  status: 'good' | 'medium' | 'low';
  needsRelogin?: boolean;   // Se o login expirou
  isVerifying?: boolean;    // Se está verificando o login
  avatarUrl?: string;       // URL do avatar
}

// URLs de login para cada plataforma
export const PLATFORM_LOGIN_URLS: Record<SocialPlatform, string> = {
  instagram: 'https://www.instagram.com/accounts/login/',
  tiktok: 'https://www.tiktok.com/tiktokstudio/upload?from=webapp',
  youtube: 'https://accounts.google.com/ServiceLogin?service=youtube'
};

// Configurações visuais das plataformas
export const PLATFORM_CONFIG: Record<SocialPlatform, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: '#E1306C' },
  tiktok: { label: 'TikTok', color: '#00f2ea' },
  youtube: { label: 'YouTube', color: '#FF0000' }
};
