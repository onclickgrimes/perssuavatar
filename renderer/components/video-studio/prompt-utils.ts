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
