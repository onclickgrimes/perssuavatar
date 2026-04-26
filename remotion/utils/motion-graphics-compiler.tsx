import * as Babel from '@babel/standalone';
import { Lottie } from '@remotion/lottie';
import * as turf from '@turf/turf';
import mapboxgl from 'mapbox-gl';
import * as RemotionShapes from '@remotion/shapes';
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from 'remotion';
import { ProjectConfigContext, useProjectConfig } from '../contexts/ProjectConfigContext';

export interface MotionGraphicsCompilationResult {
  Component: React.ComponentType<any> | null;
  error: string | null;
}

const compilationCache = new Map<string, MotionGraphicsCompilationResult>();

type MotionGraphicsRuntimeErrorMode = 'none' | 'full' | 'compact';

interface MotionGraphicsVideoConfigOverride {
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
}

const MotionGraphicsVideoConfigContext = React.createContext<MotionGraphicsVideoConfigOverride | null>(null);

const toPositiveFiniteNumber = (value: unknown): number | undefined => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
};

const useMotionGraphicsVideoConfig = () => {
  const config = useVideoConfig();
  const override = React.useContext(MotionGraphicsVideoConfigContext);

  if (!override) {
    return config;
  }

  return {
    ...config,
    ...(override.durationInFrames ? { durationInFrames: Math.max(1, Math.round(override.durationInFrames)) } : {}),
    ...(override.fps ? { fps: override.fps } : {}),
    ...(override.width ? { width: override.width } : {}),
    ...(override.height ? { height: override.height } : {}),
  };
};

interface MotionGraphicsRuntimeBoundaryProps {
  children: React.ReactNode;
  mode: MotionGraphicsRuntimeErrorMode;
}

interface MotionGraphicsRuntimeBoundaryState {
  error: Error | null;
}

class MotionGraphicsRuntimeBoundary extends React.Component<
  MotionGraphicsRuntimeBoundaryProps,
  MotionGraphicsRuntimeBoundaryState
> {
  public state: MotionGraphicsRuntimeBoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(error: Error): MotionGraphicsRuntimeBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error) {
    console.warn('[MotionGraphics] Runtime error in generated composition:', error);
  }

  public render() {
    if (!this.state.error) {
      return this.props.children;
    }

    if (this.props.mode === 'none') {
      return null;
    }

    const compact = this.props.mode === 'compact';

    return (
      <AbsoluteFill
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: compact ? 12 : 24,
          borderRadius: compact ? 10 : 0,
          background: compact ? 'rgba(127,29,29,0.82)' : 'rgba(0,0,0,0.92)',
          color: '#fecaca',
          textAlign: 'center',
          fontSize: compact ? 11 : 16,
          lineHeight: 1.4,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Erro em runtime no clip Remotion
          </div>
          <div style={{ opacity: 0.9 }}>
            {this.state.error.message || 'Falha ao renderizar a composição.'}
          </div>
        </div>
      </AbsoluteFill>
    );
  }
}

function createTransparentRootPlugin(babel: typeof Babel) {
  const t = (babel as any).packages?.types;

  if (!t) {
    return () => ({ visitor: {} });
  }

  const isRootStyleKey = (key: any, name: string): boolean => {
    return (
      t.isIdentifier(key, { name })
      || (t.isStringLiteral(key) && key.value === name)
    );
  };

  const sanitizeRootJsx = (jsxNode: any) => {
    if (!t.isJSXElement(jsxNode)) {
      return;
    }

    const openingElement = jsxNode.openingElement;
    if (!t.isJSXIdentifier(openingElement.name, { name: 'AbsoluteFill' })) {
      return;
    }

    const styleAttribute = openingElement.attributes.find((attribute: any) => (
      t.isJSXAttribute(attribute)
      && t.isJSXIdentifier(attribute.name, { name: 'style' })
    ));

    if (!styleAttribute || !t.isJSXExpressionContainer(styleAttribute.value)) {
      return;
    }

    const { expression } = styleAttribute.value;
    if (!t.isObjectExpression(expression)) {
      return;
    }

    expression.properties = expression.properties.filter((property: any) => {
      if (!t.isObjectProperty(property)) {
        return true;
      }

      return !(
        isRootStyleKey(property.key, 'backgroundColor')
        || isRootStyleKey(property.key, 'background')
      );
    });
  };

  const sanitizeFunctionBody = (body: any) => {
    if (t.isJSXElement(body)) {
      sanitizeRootJsx(body);
      return;
    }

    if (!t.isBlockStatement(body)) {
      return;
    }

    const returnStatement = body.body.find((statement: any) => t.isReturnStatement(statement));
    if (!returnStatement?.argument) {
      return;
    }

    sanitizeRootJsx(returnStatement.argument);
  };

  return () => ({
    visitor: {
      VariableDeclarator(path: any) {
        if (!t.isIdentifier(path.node.id, { name: 'MotionGraphicsScene' })) {
          return;
        }

        const init = path.node.init;
        if (!init || (!t.isArrowFunctionExpression(init) && !t.isFunctionExpression(init))) {
          return;
        }

        sanitizeFunctionBody(init.body);
      },
      FunctionDeclaration(path: any) {
        if (!t.isIdentifier(path.node.id, { name: 'MotionGraphicsScene' })) {
          return;
        }

        sanitizeFunctionBody(path.node.body);
      },
    },
  });
}

function extractComponentBody(code: string): string {
  let cleaned = code;

  cleaned = cleaned.replace(
    /import\s+type\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g,
    '',
  );
  cleaned = cleaned.replace(
    /import\s+\w+\s*,\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g,
    '',
  );
  cleaned = cleaned.replace(
    /import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g,
    '',
  );
  cleaned = cleaned.replace(
    /import\s+\*\s+as\s+\w+\s+from\s*["'][^"']+["'];?/g,
    '',
  );
  cleaned = cleaned.replace(/import\s+\w+\s+from\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.replace(/import\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.trim();

  const namedArrowMatch = cleaned.match(
    /^([\s\S]*?)export\s+const\s+\w+(?:\s*:\s*[^=]+)?\s*=\s*\(\s*\)\s*=>\s*\{([\s\S]*)\};?\s*$/,
  );
  if (namedArrowMatch) {
    const helpers = namedArrowMatch[1].trim();
    const body = namedArrowMatch[2].trim();
    return helpers ? `${helpers}\n\n${body}` : body;
  }

  const defaultFunctionMatch = cleaned.match(
    /^([\s\S]*?)export\s+default\s+function\s+\w*\s*\(\s*\)\s*\{([\s\S]*)\}\s*$/,
  );
  if (defaultFunctionMatch) {
    const helpers = defaultFunctionMatch[1].trim();
    const body = defaultFunctionMatch[2].trim();
    return helpers ? `${helpers}\n\n${body}` : body;
  }

  const namedFunctionMatch = cleaned.match(
    /^([\s\S]*?)export\s+function\s+\w+\s*\(\s*\)\s*\{([\s\S]*)\}\s*$/,
  );
  if (namedFunctionMatch) {
    const helpers = namedFunctionMatch[1].trim();
    const body = namedFunctionMatch[2].trim();
    return helpers ? `${helpers}\n\n${body}` : body;
  }

  return cleaned;
}

const UnsupportedThreeCanvas = () => {
  throw new Error('ThreeCanvas is not available in this build.');
};

const MIN_INTERPOLATE_RANGE_GAP = 1 / 1000;

const makeStrictlyIncreasingInputRange = (inputRange: readonly number[]): number[] | null => {
  if (inputRange.length < 2) {
    return null;
  }

  const normalized = inputRange.map(Number);
  if (normalized.some((value) => !Number.isFinite(value))) {
    return null;
  }

  let changed = false;
  for (let index = 1; index < normalized.length; index++) {
    if (normalized[index] > normalized[index - 1]) {
      continue;
    }

    changed = true;
    normalized[index - 1] = normalized[index] - MIN_INTERPOLATE_RANGE_GAP;

    for (let back = index - 1; back > 0 && normalized[back] <= normalized[back - 1]; back--) {
      normalized[back - 1] = normalized[back] - MIN_INTERPOLATE_RANGE_GAP;
    }
  }

  return changed ? normalized : null;
};

const safeInterpolate: typeof interpolate = ((input: number, inputRange: readonly number[], outputRange: readonly number[], options?: any) => {
  const normalizedInputRange = makeStrictlyIncreasingInputRange(inputRange);
  return interpolate(input, normalizedInputRange || inputRange, outputRange, options);
}) as typeof interpolate;

export function compileMotionGraphicsCode(code: string): MotionGraphicsCompilationResult {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) {
    return { Component: null, error: 'Nenhum código para compilar.' };
  }

  const cached = compilationCache.get(normalizedCode);
  if (cached) {
    return cached;
  }

  try {
    const componentBody = extractComponentBody(normalizedCode);
    const wrappedSource = `const MotionGraphicsScene = () => {\n${componentBody}\n};`;

    const transpiled = Babel.transform(wrappedSource, {
      presets: ['react', 'typescript'],
      plugins: [createTransparentRootPlugin(Babel)],
      filename: 'motion-graphics-scene.tsx',
    });

    if (!transpiled?.code) {
      const result = { Component: null, error: 'Falha ao transpilar a composição.' };
      compilationCache.set(normalizedCode, result);
      return result;
    }

    const wrappedCode = `${transpiled.code}\nreturn MotionGraphicsScene;`;
    const createComponent = new Function(
      'React',
      'AbsoluteFill',
      'Audio',
      'Img',
      'Sequence',
      'Easing',
      'interpolate',
      'spring',
      'useCurrentFrame',
      'useVideoConfig',
      'useDelayRender',
      'useState',
      'useEffect',
      'useMemo',
      'useRef',
      'useProjectConfig',
      'TransitionSeries',
      'linearTiming',
      'springTiming',
      'fade',
      'slide',
      'Lottie',
      'mapboxgl',
      'turf',
      'Rect',
      'Circle',
      'Triangle',
      'Star',
      'Ellipse',
      'Pie',
      'ThreeCanvas',
      wrappedCode,
    );

    const GeneratedComponent = createComponent(
      React,
      AbsoluteFill,
      Audio,
      Img,
      Sequence,
      Easing,
      safeInterpolate,
      spring,
      useCurrentFrame,
      useMotionGraphicsVideoConfig,
      useDelayRender,
      useState,
      useEffect,
      useMemo,
      useRef,
      useProjectConfig,
      TransitionSeries,
      linearTiming,
      springTiming,
      fade,
      slide,
      Lottie,
      mapboxgl,
      turf,
      (RemotionShapes as any).Rect,
      (RemotionShapes as any).Circle,
      (RemotionShapes as any).Triangle,
      (RemotionShapes as any).Star,
      (RemotionShapes as any).Ellipse,
      (RemotionShapes as any).Pie,
      UnsupportedThreeCanvas,
    );

    if (typeof GeneratedComponent !== 'function') {
      const result = {
        Component: null,
        error: 'O código retornado pela IA não exporta um componente válido.',
      };
      compilationCache.set(normalizedCode, result);
      return result;
    }

    const Component: React.FC<Record<string, unknown>> = (props) => {
      const {
        __motionGraphicsRuntimeErrorMode,
        ...componentProps
      } = props as Record<string, unknown> & {
        __motionGraphicsRuntimeErrorMode?: MotionGraphicsRuntimeErrorMode;
      };
      const durationOverride = toPositiveFiniteNumber(
        componentProps.segmentDurationInFrames ?? componentProps.durationInFrames,
      );
      const fpsOverride = toPositiveFiniteNumber(componentProps.fps);
      const widthOverride = toPositiveFiniteNumber(componentProps.width);
      const heightOverride = toPositiveFiniteNumber(componentProps.height);
      const videoConfigOverride = React.useMemo(() => ({
        durationInFrames: durationOverride,
        fps: fpsOverride,
        width: widthOverride,
        height: heightOverride,
      }), [durationOverride, fpsOverride, heightOverride, widthOverride]);
      const generated = <GeneratedComponent {...componentProps} />;
      const projectConfig = componentProps.projectConfig;

      return (
        <MotionGraphicsRuntimeBoundary mode={__motionGraphicsRuntimeErrorMode || 'none'}>
          <MotionGraphicsVideoConfigContext.Provider value={videoConfigOverride}>
            {projectConfig == null ? (
              generated
            ) : (
              <ProjectConfigContext.Provider value={projectConfig as any}>
                {generated}
              </ProjectConfigContext.Provider>
            )}
          </MotionGraphicsVideoConfigContext.Provider>
        </MotionGraphicsRuntimeBoundary>
      );
    };

    Component.displayName = 'SafeMotionGraphicsScene';

    const result = {
      Component,
      error: null,
    };
    compilationCache.set(normalizedCode, result);
    return result;
  } catch (error) {
    const result = {
      Component: null,
      error: error instanceof Error ? error.message : 'Erro desconhecido ao compilar a composição.',
    };
    compilationCache.set(normalizedCode, result);
    return result;
  }
}
