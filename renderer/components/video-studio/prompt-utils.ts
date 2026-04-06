import { ASSET_DEFINITIONS, type AssetType } from '../../../remotion/types/project';

export const getAssetTypeInfo = (assetType: string) => {
  const info = ASSET_DEFINITIONS[assetType as AssetType];
  if (info) {
    return {
      label: info.label,
      color: info.badgeColor,
      icon: info.icon,
    };
  }
  return {
    label: assetType || 'Desconhecido',
    color: 'bg-zinc-800 text-zinc-100',
    icon: '❓',
  };
};

export const normalizeCharactersField = (raw: unknown): string | undefined => {
  if (raw == null) return undefined;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? String(raw) : undefined;
  }

  if (Array.isArray(raw)) {
    const ids = raw
      .map(v => typeof v === 'number' ? v : parseInt(String(v).replace(/\D/g, ''), 10))
      .filter(v => !isNaN(v));
    if (ids.length > 0) return ids.join(', ');
    return undefined;
  }

  const value = typeof raw === 'string' ? raw : String(raw);

  const bracketMatches = [...value.matchAll(/\[([\d\s,]+)\]/g)];
  if (bracketMatches.length > 0) {
    const ids = bracketMatches
      .map(m => m[1])
      .join(',')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n));
    if (ids.length > 0) return ids.join(', ');
  }

  const digits = value
    .split(',')
    .map(s => parseInt(s.replace(/\D/g, ''), 10))
    .filter(n => !isNaN(n));
  if (digits.length > 0) return digits.join(', ');

  const cleaned = value.replace(/[\[\]"]/g, '').trim();
  return cleaned || undefined;
};

export const normalizeSceneReferenceIds = (raw: unknown): string | undefined =>
  normalizeCharactersField(raw);

export const stripCharactersFromPrompt = (prompt: unknown): {
  cleanedPrompt: unknown;
  extractedCharacters?: string;
  extractedLocation?: string;
  didStrip: boolean;
} => {
  if (prompt == null) {
    return { cleanedPrompt: prompt, didStrip: false };
  }

  if (typeof prompt === 'string') {
    try {
      const parsed = JSON.parse(prompt);
      const parsedResult = stripCharactersFromPrompt(parsed);

      if (!parsedResult.didStrip) {
        return {
          cleanedPrompt: prompt,
          extractedCharacters: parsedResult.extractedCharacters,
          extractedLocation: parsedResult.extractedLocation,
          didStrip: false,
        };
      }

      if (parsedResult.cleanedPrompt != null && typeof parsedResult.cleanedPrompt === 'object') {
        return {
          cleanedPrompt: JSON.stringify(parsedResult.cleanedPrompt, null, 2),
          extractedCharacters: parsedResult.extractedCharacters,
          extractedLocation: parsedResult.extractedLocation,
          didStrip: true,
        };
      }
    } catch {
      // prompt não é JSON: manter como está
    }

    return { cleanedPrompt: prompt, didStrip: false };
  }

  if (typeof prompt !== 'object' || Array.isArray(prompt)) {
    return { cleanedPrompt: prompt, didStrip: false };
  }

  const rootPrompt = { ...(prompt as Record<string, any>) };
  let extractedCharacters = normalizeCharactersField(rootPrompt.IdOfTheCharactersInTheScene);
  let extractedLocation = normalizeSceneReferenceIds(rootPrompt.IdOfTheLocationInTheScene);
  let didStrip = false;

  if ('IdOfTheCharactersInTheScene' in rootPrompt) {
    delete rootPrompt.IdOfTheCharactersInTheScene;
    didStrip = true;
  }
  if ('IdOfTheLocationInTheScene' in rootPrompt) {
    delete rootPrompt.IdOfTheLocationInTheScene;
    didStrip = true;
  }

  if (
    rootPrompt.video_generation_prompt &&
    typeof rootPrompt.video_generation_prompt === 'object' &&
    !Array.isArray(rootPrompt.video_generation_prompt)
  ) {
    const generationPrompt = { ...(rootPrompt.video_generation_prompt as Record<string, any>) };
    if (extractedCharacters == null) {
      extractedCharacters = normalizeCharactersField(generationPrompt.IdOfTheCharactersInTheScene);
    }
    if (extractedLocation == null) {
      extractedLocation = normalizeSceneReferenceIds(generationPrompt.IdOfTheLocationInTheScene);
    }
    if ('IdOfTheCharactersInTheScene' in generationPrompt) {
      delete generationPrompt.IdOfTheCharactersInTheScene;
      didStrip = true;
    }
    if ('IdOfTheLocationInTheScene' in generationPrompt) {
      delete generationPrompt.IdOfTheLocationInTheScene;
      didStrip = true;
    }
    rootPrompt.video_generation_prompt = generationPrompt;
  }

  return {
    cleanedPrompt: didStrip ? rootPrompt : prompt,
    extractedCharacters,
    extractedLocation,
    didStrip,
  };
};
