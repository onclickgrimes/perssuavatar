import {
  ApiCredential,
  ApiCredentialService,
  getActiveApiCredential,
  getApiCredentials,
  hasApiCredential,
} from './database';

type RoundRobinState = Partial<Record<ApiCredentialService, number>>;

const roundRobinIndex: RoundRobinState = {};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map(v => v.trim()).filter(Boolean)));
}

function extractApiKeyFromCredential(credential: ApiCredential): string | null {
  return credential.apiKey?.trim() || null;
}

export function getApiKeys(service: ApiCredentialService): string[] {
  return unique(
    getApiCredentials(service)
    .map(extractApiKeyFromCredential)
    .filter((key): key is string => Boolean(key))
  );
}

export function getPrimaryApiKey(service: ApiCredentialService): string | null {
  const active = getActiveApiCredential(service);
  const activeKey = active ? extractApiKeyFromCredential(active) : null;
  if (activeKey) return activeKey;

  const keys = getApiKeys(service);
  return keys[0] || null;
}

export function getNextApiKey(service: ApiCredentialService): string | null {
  const keys = getApiKeys(service);
  if (keys.length === 0) return null;

  const currentIndex = roundRobinIndex[service] ?? 0;
  const selected = keys[currentIndex % keys.length];
  console.log(`[CREDENTIALS ${service}] API Key selecionada----------------: ${selected}`);
  roundRobinIndex[service] = (currentIndex + 1) % keys.length;
  return selected;
}

export function hasCredential(service: ApiCredentialService): boolean {
  return hasApiCredential(service);
}

export interface PollyCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export function getPollyCredentials(): PollyCredentials | null {
  const dbCredential = getActiveApiCredential('aws_polly') || getApiCredentials('aws_polly')[0];

  if (dbCredential?.accessKeyId?.trim() && dbCredential.secretAccessKey?.trim()) {
    return {
      accessKeyId: dbCredential.accessKeyId.trim(),
      secretAccessKey: dbCredential.secretAccessKey.trim(),
      region: dbCredential.region?.trim() || 'sa-east-1',
    };
  }

  return null;
}

export function getElevenLabsVoiceId(): string {
  const active = getActiveApiCredential('elevenlabs');
  if (active?.voiceId?.trim()) return active.voiceId.trim();

  const anyWithVoice = getApiCredentials('elevenlabs').find(c => c.voiceId?.trim());
  if (anyWithVoice?.voiceId?.trim()) return anyWithVoice.voiceId.trim();

  return 'EXAVITQu4vr4xnSDxMaL';
}
