import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_GOOGLE_CLOUD_LOCATION,
  getUserSettings,
} from '../database';
import { getNextApiKey, getPrimaryApiKey } from '../credentials';

export type VideoGenAIBackend = 'vertex' | 'gemini';
export type ApiKeySelectionMode = 'primary' | 'next';

export interface StoredGenAIConfig {
  backend: VideoGenAIBackend;
  vertexProject?: string;
  location: string;
  vertexCredentialsPath?: string;
}

function normalizeBackend(value: unknown): VideoGenAIBackend {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'gemini' ? 'gemini' : 'vertex';
}

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

export function getStoredGenAIConfig(): StoredGenAIConfig {
  const settings = (getUserSettings() || {}) as Record<string, unknown>;
  const backend = normalizeBackend(settings.genaiBackend);
  const vertexProject = normalizeString(settings.vertexProject) || undefined;
  const location =
    normalizeString(settings.googleCloudLocation) || DEFAULT_GOOGLE_CLOUD_LOCATION;
  const vertexCredentialsPath =
    normalizeString(settings.vertexCredentialsPath).replace(/^"|"$/g, '') || undefined;

  return { backend, vertexProject, location, vertexCredentialsPath };
}

export function resolveVideoGenAIBackend(): VideoGenAIBackend {
  return getStoredGenAIConfig().backend;
}

function resolveStoredApiKey(
  service: 'vertex' | 'gemini',
  selectionMode: ApiKeySelectionMode
): string | null {
  return selectionMode === 'next'
    ? getNextApiKey(service)
    : getPrimaryApiKey(service);
}

export function createVideoGenAIClient(
  apiKey: string | null = null,
  selectionMode: ApiKeySelectionMode = 'primary'
): {
  ai: GoogleGenAI;
  backend: VideoGenAIBackend;
  project?: string;
  location?: string;
  apiKey?: string | null;
  vertexCredentialsPath?: string | null;
  vertexAuthMode?: 'adc' | 'service-account-file' | 'env-service-account-file';
} {
  const { backend, vertexProject, location, vertexCredentialsPath } = getStoredGenAIConfig();
  const overrideApiKey = normalizeString(apiKey) || null;

  if (backend === 'vertex') {
    if (!vertexProject) {
      throw new Error(
        'Projeto do Vertex não configurado. Ajuste em Configurações > API e Modelos.'
      );
    }

    // Vertex AI no SDK @google/genai deve ser inicializado sem apiKey
    // (project/location e apiKey são mutuamente exclusivos).
    if (overrideApiKey) {
      console.warn(
        '[GenAI] apiKey recebida para backend Vertex foi ignorada (Vertex usa autenticação Google Cloud/ADC).'
      );
    }

    const normalizeCredentialPath = (rawPath: string): string => {
      const clean = rawPath.trim().replace(/^"|"$/g, '');
      const resolved = path.isAbsolute(clean) ? clean : path.resolve(clean);
      if (!fs.existsSync(resolved)) {
        throw new Error(
          `Arquivo de credencial do Vertex não encontrado: ${resolved}. Configure um JSON de Service Account válido em Configurações > API e Modelos.`
        );
      }
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        throw new Error(
          `Caminho de credencial do Vertex não é um arquivo: ${resolved}.`
        );
      }
      return resolved;
    };

    let resolvedCredentialsPath: string | null = null;
    let vertexAuthMode: 'adc' | 'service-account-file' | 'env-service-account-file' = 'adc';

    if (vertexCredentialsPath) {
      resolvedCredentialsPath = normalizeCredentialPath(vertexCredentialsPath);
      vertexAuthMode = 'service-account-file';
    } else if (normalizeString(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      resolvedCredentialsPath = normalizeCredentialPath(
        String(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      );
      vertexAuthMode = 'env-service-account-file';
    }

    const vertexOptions: any = {
      vertexai: true,
      project: vertexProject,
      location,
    };

    if (resolvedCredentialsPath) {
      vertexOptions.googleAuthOptions = { keyFilename: resolvedCredentialsPath };
    }

    return {
      backend,
      project: vertexProject,
      location,
      apiKey: null,
      vertexCredentialsPath: resolvedCredentialsPath,
      vertexAuthMode,
      ai: new GoogleGenAI(vertexOptions),
    };
  }

  const geminiApiKey = overrideApiKey || resolveStoredApiKey('gemini', selectionMode);
  if (!geminiApiKey) {
    throw new Error(
      'Chave do Gemini não configurada. Cadastre em Configurações > API e Modelos.'
    );
  }

  return {
    backend,
    apiKey: geminiApiKey,
    ai: new GoogleGenAI({ apiKey: geminiApiKey }),
  };
}

export function getVertexVideoProjectConfig(): {
  project?: string;
  location: string;
} {
  const { vertexProject, location } = getStoredGenAIConfig();
  return {
    project: vertexProject,
    location,
  };
}

export function buildVertexVideoModelResource(
  model: string,
  project?: string,
  location: string = getStoredGenAIConfig().location
): string {
  const raw = model.trim();
  if (raw.startsWith('projects/')) return raw;

  let modelPath = raw;
  if (raw.startsWith('models/')) {
    modelPath = `publishers/google/${raw}`;
  } else if (raw.startsWith('publishers/')) {
    modelPath = raw;
  } else if (raw.includes('/')) {
    const [publisher, modelId] = raw.split('/', 2);
    modelPath = `publishers/${publisher}/models/${modelId}`;
  } else {
    modelPath = `publishers/google/models/${raw}`;
  }

  if (!project) return modelPath;
  return `projects/${project}/locations/${location}/${modelPath}`;
}

export function buildVideoDownloadUrl(
  videoUri: string,
  apiKey: string | null
): string {
  if (!apiKey) return videoUri;
  if (videoUri.includes('key=')) return videoUri;

  const joiner = videoUri.includes('?') ? '&' : '?';
  return `${videoUri}${joiner}key=${apiKey}`;
}
