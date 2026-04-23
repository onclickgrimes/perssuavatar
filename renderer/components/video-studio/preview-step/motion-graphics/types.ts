import type {
  MotionGraphicsReferenceImage,
  MotionGraphicsSegmentData,
} from '../../../../shared/utils/project-converter';

export type MediaPanelTab = 'pexels' | 'remotion' | 'library';

export const MOTION_GRAPHICS_ASSET_TYPE = 'remotion_graphic';

export interface MotionGraphicsChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: number;
  provider?: string;
  model?: string;
  attachedImages?: MotionGraphicsReferenceImage[];
  skillsUsed?: string[];
}

export interface MotionGraphicsClipSummary {
  id: number;
  track: number;
  start: number;
  end: number;
  label: string;
  hasCode: boolean;
  messageCount: number;
  updatedAt?: number;
}

export const isMotionGraphicsAssetType = (value: unknown): boolean => {
  return String(value || '').trim().toLowerCase() === MOTION_GRAPHICS_ASSET_TYPE;
};

export const isMotionGraphicsSegment = (segment: {
  assetType?: string;
  asset_type?: string;
} | null | undefined): boolean => {
  return isMotionGraphicsAssetType(segment?.assetType || segment?.asset_type);
};

export const getMotionGraphicsData = (segment: {
  motionGraphics?: MotionGraphicsSegmentData | null;
} | null | undefined): MotionGraphicsSegmentData | null => {
  return segment?.motionGraphics || null;
};

export const getMotionGraphicsSegmentLabel = (segment: {
  id?: number | string;
  fileName?: string;
  motionGraphics?: MotionGraphicsSegmentData | null;
} | null | undefined): string => {
  const explicitTitle = String(segment?.motionGraphics?.title || '').trim();
  if (explicitTitle) {
    return explicitTitle;
  }

  const fileName = String(segment?.fileName || '').trim();
  if (fileName) {
    return fileName;
  }

  return `Remotion ${segment?.id ?? ''}`.trim();
};
