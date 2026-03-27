import { shell } from 'electron';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { getUserSettings } from '../database';
import { refreshAppSession } from './app-auth-service';
import {
  getObfuscatedBackendBaseUrl,
  getObfuscatedSupabaseAnonKey,
  getObfuscatedSupabaseUrl,
} from './obfuscated-config';

export type BillingModuleCode = 'video-editor' | 'social-media' | 'meeting-assistance';
export type BillingModuleStatus = 'active' | 'locked' | 'pending_payment' | 'blocked';

export interface BillingModuleAccessResponse {
  success: boolean;
  access: Record<BillingModuleCode, BillingModuleStatus>;
  error?: string;
  source?: string;
}

export interface BillingCheckoutResponse {
  success: boolean;
  checkoutUrl?: string;
  fallback?: boolean;
  error?: string;
}

type ModuleAccessUpdateListener = (payload: BillingModuleAccessResponse) => void;

interface BillingSettings {
  baseUrl: string;
  authToken?: string;
  userId?: string;
  authAccessToken?: string;
  authRefreshToken?: string;
  authUserId?: string;
  authExpiresAt?: number;
}

interface RequestJsonResult {
  ok: boolean;
  status: number;
  data?: any;
  error?: string;
}

const MODULE_CODES: BillingModuleCode[] = ['video-editor', 'social-media', 'meeting-assistance'];
const DEFAULT_BASE_URL = getObfuscatedBackendBaseUrl();
const DEFAULT_ACCESS: Record<BillingModuleCode, BillingModuleStatus> = {
  'video-editor': 'locked',
  'social-media': 'locked',
  'meeting-assistance': 'locked',
};

let moduleAccessUpdateListener: ModuleAccessUpdateListener | null = null;
let realtimeClient: ReturnType<typeof getRealtimeClient> | null = null;
let realtimeChannel: any | null = null;
let realtimeUserId: string | null = null;
let realtimeSyncTimer: NodeJS.Timeout | null = null;
let realtimeReconnectTimer: NodeJS.Timeout | null = null;
let realtimeReconnectInFlight = false;
let realtimeReconnectAttempt = 0;

function readBillingSettings(): BillingSettings {
  const settings = (getUserSettings() || {}) as any;
  return {
    baseUrl: getObfuscatedBackendBaseUrl(),
    authToken:
      settings.billingAuthToken ||
      settings.authAccessToken ||
      process.env.BILLING_AUTH_TOKEN,
    userId:
      settings.billingUserId ||
      settings.authUserId ||
      process.env.BILLING_USER_ID,
    authAccessToken: settings.authAccessToken,
    authRefreshToken: settings.authRefreshToken,
    authUserId: settings.authUserId,
    authExpiresAt: settings.authExpiresAt,
  };
}

function getRealtimeClient() {
  return createClient(getObfuscatedSupabaseUrl(), getObfuscatedSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      transport: WebSocket as any,
      timeout: 20_000,
    },
  });
}

function emitModuleAccessUpdate(payload: BillingModuleAccessResponse) {
  if (!moduleAccessUpdateListener) return;
  try {
    moduleAccessUpdateListener(payload);
  } catch {
    // Evita quebrar o fluxo principal por erro no listener.
  }
}

function clearRealtimeSyncTimer() {
  if (!realtimeSyncTimer) return;
  clearTimeout(realtimeSyncTimer);
  realtimeSyncTimer = null;
}

function clearRealtimeReconnectTimer() {
  if (!realtimeReconnectTimer) return;
  clearTimeout(realtimeReconnectTimer);
  realtimeReconnectTimer = null;
}

function resetRealtimeReconnectState() {
  clearRealtimeReconnectTimer();
  realtimeReconnectInFlight = false;
  realtimeReconnectAttempt = 0;
}

function logRealtimePayload(payload: any) {
  const next = (payload?.new || {}) as Record<string, any>;
  const prev = (payload?.old || {}) as Record<string, any>;
  const eventType = payload?.eventType || 'UNKNOWN';
  const table = payload?.table || 'unknown_table';
  const userId = next.user_id || prev.user_id || '-';
  const moduleId = next.module_id || prev.module_id || '-';
  const status =
    next.status ||
    next.pixgo_status ||
    prev.status ||
    prev.pixgo_status ||
    '-';

  console.log(
    `[BillingRealtime] Change received: event=${eventType} table=${table} user_id=${userId} module_id=${moduleId} status=${status}`
  );
}

async function triggerRealtimeSync() {
  const response = await getModuleAccess();
  emitModuleAccessUpdate(response);
}

function scheduleRealtimeSync(delayMs = 350) {
  clearRealtimeSyncTimer();
  realtimeSyncTimer = setTimeout(() => {
    triggerRealtimeSync().catch(() => {
      // Mantém assinatura viva mesmo se sincronização pontual falhar.
    });
  }, delayMs);
}

function scheduleRealtimeReconnect() {
  if (realtimeReconnectTimer || realtimeReconnectInFlight) {
    return;
  }

  const nextAttempt = Math.min(realtimeReconnectAttempt + 1, 10);
  const delayMs = Math.min(60_000, 1_000 * Math.pow(2, nextAttempt - 1));
  realtimeReconnectAttempt = nextAttempt;
  console.warn(`[BillingRealtime] Reconnect attempt ${nextAttempt} in ${delayMs}ms`);

  realtimeReconnectTimer = setTimeout(() => {
    realtimeReconnectTimer = null;
    realtimeReconnectInFlight = true;

    startModuleAccessRealtime(true)
      .catch(() => {
        // Próxima queda agenda nova tentativa.
      })
      .finally(() => {
        realtimeReconnectInFlight = false;
      });
  }, delayMs);
}

async function cleanupRealtime(options?: { resetReconnectState?: boolean }) {
  clearRealtimeSyncTimer();
  clearRealtimeReconnectTimer();

  const channelToClose = realtimeChannel;
  const clientToClose = realtimeClient;

  // Nulamos antes de fechar para ignorar eventos tardios (ex.: CLOSED do canal antigo).
  realtimeChannel = null;
  realtimeClient = null;
  realtimeUserId = null;
  realtimeReconnectInFlight = false;

  if (channelToClose && clientToClose) {
    try {
      await channelToClose.unsubscribe();
    } catch {
      // Sem impacto funcional.
    }
    try {
      clientToClose.removeChannel(channelToClose);
    } catch {
      // Sem impacto funcional.
    }
  }

  if (clientToClose) {
    try {
      clientToClose.removeAllChannels();
    } catch {
      // Sem impacto funcional.
    }
  }

  if (options?.resetReconnectState) {
    resetRealtimeReconnectState();
  }
}

async function resolveBillingSettings(): Promise<BillingSettings> {
  let settings = readBillingSettings();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresSoon =
    typeof settings.authExpiresAt === 'number' &&
    settings.authExpiresAt <= nowSeconds + 60;

  if (settings.authRefreshToken && expiresSoon) {
    try {
      await refreshAppSession();
      settings = readBillingSettings();
    } catch {
      // Se não conseguir renovar, seguimos com o token atual/fallback.
    }
  }

  return settings;
}

function normalizeBaseUrl(baseUrl?: string): string {
  const source = typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : DEFAULT_BASE_URL;
  return source.replace(/\/+$/, '');
}

function withUserId(url: string, userId?: string): string {
  if (!userId) return url;
  const parsed = new URL(url);
  parsed.searchParams.set('userId', userId);
  return parsed.toString();
}

function buildHeaders(authToken?: string, userId?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  if (userId) {
    headers['x-user-id'] = userId;
  }

  return headers;
}

async function requestJson(url: string, init: RequestInit): Promise<RequestJsonResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    const rawText = await response.text();
    let data: any = null;

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      error: error?.message || 'Falha ao conectar com backend',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeModuleCode(raw: string): BillingModuleCode | null {
  const normalized = raw.trim().toLowerCase().replace(/_/g, '-');
  if (normalized === 'video-editor') return 'video-editor';
  if (normalized === 'social-media') return 'social-media';
  if (normalized === 'meeting-assistance') return 'meeting-assistance';
  return null;
}

function normalizeStatus(raw: any): BillingModuleStatus {
  const value = String(raw || '').trim().toLowerCase();

  if (['active', 'unlocked', 'enabled', 'granted', 'paid', 'completed'].includes(value)) {
    return 'active';
  }
  if (['pending', 'pending_payment', 'pending-payment', 'awaiting_payment', 'processing'].includes(value)) {
    return 'pending_payment';
  }
  if (['blocked', 'disabled', 'revoked', 'suspended'].includes(value)) {
    return 'blocked';
  }
  return 'locked';
}

function ensureAllModules(partial: Partial<Record<BillingModuleCode, BillingModuleStatus>>): Record<BillingModuleCode, BillingModuleStatus> {
  return {
    'video-editor': partial['video-editor'] || DEFAULT_ACCESS['video-editor'],
    'social-media': partial['social-media'] || DEFAULT_ACCESS['social-media'],
    'meeting-assistance': partial['meeting-assistance'] || DEFAULT_ACCESS['meeting-assistance'],
  };
}

function extractFromObjectMap(candidate: any): Partial<Record<BillingModuleCode, BillingModuleStatus>> {
  const next: Partial<Record<BillingModuleCode, BillingModuleStatus>> = {};
  const entries = Object.entries(candidate || {});

  for (const [rawKey, rawValue] of entries) {
    const moduleCode = normalizeModuleCode(rawKey);
    if (!moduleCode) continue;

    let rawStatus = rawValue;
    if (rawValue && typeof rawValue === 'object') {
      rawStatus =
        (rawValue as any).status ??
        (rawValue as any).access ??
        (rawValue as any).state ??
        (rawValue as any).access_status ??
        rawValue;
    }

    next[moduleCode] = normalizeStatus(rawStatus);
  }

  return next;
}

function extractFromArray(candidate: any[]): Partial<Record<BillingModuleCode, BillingModuleStatus>> {
  const next: Partial<Record<BillingModuleCode, BillingModuleStatus>> = {};

  for (const item of candidate) {
    if (!item || typeof item !== 'object') continue;

    const nestedModule = item.module || item.modules || item.module_ref || item.module_data;
    const nestedCode =
      (nestedModule && typeof nestedModule === 'object'
        ? nestedModule.code || nestedModule.module_code || nestedModule.slug || nestedModule.moduleCode
        : undefined) ||
      (typeof nestedModule === 'string' ? nestedModule : undefined);

    const rawCode =
      item.moduleCode ||
      item.module_code ||
      item.code ||
      item.module ||
      item.moduleId ||
      item.module_id ||
      item.moduleSlug ||
      item.module_slug ||
      nestedCode;

    const moduleCode = typeof rawCode === 'string' ? normalizeModuleCode(rawCode) : null;
    if (!moduleCode) continue;

    const rawStatus = item.status ?? item.access ?? item.state ?? item.access_status;
    next[moduleCode] = normalizeStatus(rawStatus);
  }

  return next;
}

function parseAccessPayload(payload: any): Partial<Record<BillingModuleCode, BillingModuleStatus>> | null {
  const candidates = [
    payload?.access,
    payload?.data?.access,
    payload?.data,
    payload?.modules,
    payload?.data?.modules,
    payload,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (Array.isArray(candidate)) {
      const parsed = extractFromArray(candidate);
      if (Object.keys(parsed).length > 0) return parsed;
      continue;
    }

    if (typeof candidate === 'object') {
      const parsed = extractFromObjectMap(candidate);
      if (Object.keys(parsed).length > 0) return parsed;
    }
  }

  return null;
}

function extractCheckoutUrl(payload: any): string | null {
  const candidates = [
    payload?.checkoutUrl,
    payload?.checkout_url,
    payload?.url,
    payload?.data?.checkoutUrl,
    payload?.data?.checkout_url,
    payload?.data?.url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function getCheckoutFallbackUrl(baseUrl: string, moduleCode: BillingModuleCode): string {
  const url = new URL('/dashboard', baseUrl);
  url.searchParams.set('module', moduleCode);
  return url.toString();
}

export async function getModuleAccess(): Promise<BillingModuleAccessResponse> {
  const settings = await resolveBillingSettings();
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const headers = buildHeaders(settings.authToken, settings.userId);

  const endpoints = [
    withUserId(`${baseUrl}/api/modules/access`, settings.userId),
    withUserId(`${baseUrl}/api/billing/modules/access`, settings.userId),
  ];

  let lastError = '';

  for (const endpoint of endpoints) {
    const result = await requestJson(endpoint, {
      method: 'GET',
      headers,
    });

    if (result.ok) {
      const parsed = parseAccessPayload(result.data);
      if (parsed) {
        return {
          success: true,
          access: ensureAllModules(parsed),
          source: endpoint,
        };
      }
      lastError = 'Payload de acesso inválido';
      continue;
    }

    lastError = result.error || `Falha ao consultar acesso em ${endpoint}`;
  }

  return {
    success: false,
    access: { ...DEFAULT_ACCESS },
    error: lastError || 'Não foi possível sincronizar acesso aos módulos',
  };
}

export async function createCheckout(moduleCode: BillingModuleCode): Promise<BillingCheckoutResponse> {
  if (!MODULE_CODES.includes(moduleCode)) {
    return { success: false, error: `Módulo inválido: ${moduleCode}` };
  }

  const settings = await resolveBillingSettings();
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const headers = buildHeaders(settings.authToken, settings.userId);
  const fallbackUrl = getCheckoutFallbackUrl(baseUrl, moduleCode);

  const endpoints = [
    `${baseUrl}/api/modules/checkout-session`,
    `${baseUrl}/api/billing/checkout-session`,
    `${baseUrl}/api/modules/checkout`,
  ];

  let lastError = '';

  for (const endpoint of endpoints) {
    const result = await requestJson(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        moduleCode,
        userId: settings.userId,
      }),
    });

    if (result.ok) {
      const checkoutUrl = extractCheckoutUrl(result.data);
      if (checkoutUrl) {
        return { success: true, checkoutUrl };
      }
      return { success: true, checkoutUrl: fallbackUrl, fallback: true };
    }

    lastError = result.error || `Falha ao criar checkout em ${endpoint}`;
  }

  return {
    success: true,
    checkoutUrl: fallbackUrl,
    fallback: true,
    error: lastError || 'Usando fallback para checkout web',
  };
}

export async function openCheckout(moduleCode: BillingModuleCode): Promise<BillingCheckoutResponse> {
  const checkout = await createCheckout(moduleCode);
  if (!checkout.success || !checkout.checkoutUrl) {
    return checkout;
  }

  try {
    await shell.openExternal(checkout.checkoutUrl);
    return checkout;
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Falha ao abrir checkout no navegador',
    };
  }
}

export function setModuleAccessUpdateListener(listener: ModuleAccessUpdateListener | null) {
  moduleAccessUpdateListener = listener;
}

export async function startModuleAccessRealtime(force = false): Promise<{ success: boolean; reason?: string }> {
  const settings = await resolveBillingSettings();
  const userId = settings.userId?.trim();
  const authToken = settings.authToken?.trim();

  if (!userId || !authToken) {
    await cleanupRealtime({ resetReconnectState: true });
    return { success: false, reason: 'Usuário não autenticado para Realtime.' };
  }

  if (!force && realtimeChannel && realtimeUserId === userId) {
    return { success: true };
  }

  await cleanupRealtime({ resetReconnectState: false });

  try {
    realtimeClient = getRealtimeClient();
    realtimeUserId = userId;

    await realtimeClient.realtime.setAuth(authToken);

    const channel = realtimeClient
      .channel(`module-access-${userId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_module_access',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          logRealtimePayload(payload);
          scheduleRealtimeSync();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'module_orders',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          logRealtimePayload(payload);
          scheduleRealtimeSync();
        }
      );

    realtimeChannel = channel;

    channel.subscribe((status: string, err?: any) => {
      if (realtimeChannel !== channel) {
        return;
      }

      if (status === 'SUBSCRIBED') {
        scheduleRealtimeSync(120);
        resetRealtimeReconnectState();
        console.log(`[BillingRealtime] Subscribed for user ${userId}`);
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        const reason = err?.message || err?.error || '';
        console.warn(
          `[BillingRealtime] Channel status ${status}${reason ? ` (${reason})` : ''}. Reconnecting with backoff...`
        );
        scheduleRealtimeReconnect();
      }
    });

    return { success: true };
  } catch (error: any) {
    await cleanupRealtime({ resetReconnectState: false });
    scheduleRealtimeReconnect();
    return { success: false, reason: error?.message || 'Falha ao iniciar Realtime.' };
  }
}

export async function stopModuleAccessRealtime() {
  await cleanupRealtime({ resetReconnectState: true });
  console.log('[BillingRealtime] Stopped');
}
