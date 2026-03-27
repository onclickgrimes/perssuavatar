import { createClient } from '@supabase/supabase-js';
import { getUserSettings, setUserSettings } from '../database';
import { getObfuscatedSupabaseAnonKey, getObfuscatedSupabaseUrl } from './obfuscated-config';

export interface AppIdentity {
  isAuthenticated: boolean;
  email: string | null;
  userId: string | null;
  accessToken: string | null;
  expiresAt: number | null;
  hasSupabaseConfig: boolean;
}

export interface AuthResult {
  success: boolean;
  identity: AppIdentity;
  error?: string;
}

interface AuthSettings {
  authEmail?: string;
  authUserId?: string;
  authAccessToken?: string;
  authRefreshToken?: string;
  authExpiresAt?: number;
}

function readAuthSettings(): AuthSettings {
  return (getUserSettings() || {}) as any;
}

function hasSupabaseConfig(): boolean {
  return Boolean(getObfuscatedSupabaseUrl() && getObfuscatedSupabaseAnonKey());
}

function buildIdentityFromSettings(settings: AuthSettings): AppIdentity {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = typeof settings.authExpiresAt === 'number' ? settings.authExpiresAt : null;
  const hasValidToken =
    Boolean(settings.authAccessToken) &&
    Boolean(settings.authUserId) &&
    Boolean(expiresAt && expiresAt > nowSeconds + 30);

  return {
    isAuthenticated: hasValidToken,
    email: settings.authEmail || null,
    userId: settings.authUserId || null,
    accessToken: settings.authAccessToken || null,
    expiresAt,
    hasSupabaseConfig: hasSupabaseConfig(),
  };
}

function getSupabaseClient() {
  const supabaseUrl = getObfuscatedSupabaseUrl();
  const supabasePublishKey = getObfuscatedSupabaseAnonKey();

  return createClient(supabaseUrl, supabasePublishKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function saveSession(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string | null };
}) {
  setUserSettings({
    authEmail: session.user.email || undefined,
    authUserId: session.user.id,
    authAccessToken: session.access_token,
    authRefreshToken: session.refresh_token,
    authExpiresAt: session.expires_at,
    billingUserId: session.user.id,
    billingAuthToken: session.access_token,
  });
}

function clearSessionPreservingConfig() {
  setUserSettings({
    authEmail: undefined,
    authUserId: undefined,
    authAccessToken: undefined,
    authRefreshToken: undefined,
    authExpiresAt: undefined,
    billingUserId: undefined,
    billingAuthToken: undefined,
  });
}

export function getAppIdentity(): AppIdentity {
  const settings = readAuthSettings();
  return buildIdentityFromSettings(settings);
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  try {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return { success: false, identity: getAppIdentity(), error: 'E-mail é obrigatório.' };
    }

    if (!password.trim()) {
      return { success: false, identity: getAppIdentity(), error: 'Senha é obrigatória.' };
    }

    const client = getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      return { success: false, identity: getAppIdentity(), error: error.message };
    }

    if (!data?.session || !data?.user) {
      return { success: false, identity: getAppIdentity(), error: 'Sessão inválida retornada pelo Supabase.' };
    }

    saveSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });

    return { success: true, identity: getAppIdentity() };
  } catch (error: any) {
    return { success: false, identity: getAppIdentity(), error: error?.message || 'Falha ao autenticar usuário.' };
  }
}

export async function refreshAppSession(): Promise<AuthResult> {
  try {
    const settings = readAuthSettings();
    const refreshToken = settings.authRefreshToken?.trim();

    if (!refreshToken) {
      return { success: false, identity: getAppIdentity(), error: 'Nenhuma sessão para renovar.' };
    }

    const client = getSupabaseClient();
    const { data, error } = await client.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      clearSessionPreservingConfig();
      return { success: false, identity: getAppIdentity(), error: error.message };
    }

    if (!data?.session || !data?.user) {
      clearSessionPreservingConfig();
      return { success: false, identity: getAppIdentity(), error: 'Sessão expirada. Faça login novamente.' };
    }

    saveSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });

    return { success: true, identity: getAppIdentity() };
  } catch (error: any) {
    clearSessionPreservingConfig();
    return { success: false, identity: getAppIdentity(), error: error?.message || 'Falha ao renovar sessão.' };
  }
}

export async function signOutApp(): Promise<AuthResult> {
  try {
    const settings = readAuthSettings();
    const accessToken = settings.authAccessToken?.trim();
    const refreshToken = settings.authRefreshToken?.trim();

    if (accessToken && refreshToken) {
      try {
        const client = getSupabaseClient();
        await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        await client.auth.signOut();
      } catch {
        // Mesmo que falhe no Supabase remoto, limpar sessão local.
      }
    }

    clearSessionPreservingConfig();
    return { success: true, identity: getAppIdentity() };
  } catch (error: any) {
    clearSessionPreservingConfig();
    return { success: true, identity: getAppIdentity(), error: error?.message };
  }
}
