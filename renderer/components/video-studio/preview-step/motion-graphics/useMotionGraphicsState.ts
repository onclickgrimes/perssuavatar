import { useCallback, useEffect, useState } from 'react';
import {
  compileMotionGraphicsCode,
  type MotionGraphicsCompilationResult,
} from './compiler';

export interface MotionGraphicsState {
  code: string;
  Component: React.ComponentType | null;
  error: string | null;
  isCompiling: boolean;
}

export function useMotionGraphicsState(initialCode: string = '') {
  const [state, setState] = useState<MotionGraphicsState>({
    code: initialCode,
    Component: null,
    error: null,
    isCompiling: false,
  });

  const compileCode = useCallback((code: string) => {
    setState((previous) => ({
      ...previous,
      isCompiling: true,
      code,
    }));

    const result: MotionGraphicsCompilationResult = compileMotionGraphicsCode(code);

    setState((previous) => ({
      ...previous,
      code,
      Component: result.Component,
      error: result.error,
      isCompiling: false,
    }));
  }, []);

  const setCode = useCallback((code: string) => {
    setState((previous) => ({
      ...previous,
      code,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      code: '',
      Component: null,
      error: null,
      isCompiling: false,
    });
  }, []);

  useEffect(() => {
    if (initialCode) {
      compileCode(initialCode);
    }
  }, [compileCode, initialCode]);

  return {
    ...state,
    setCode,
    compileCode,
    reset,
  };
}
