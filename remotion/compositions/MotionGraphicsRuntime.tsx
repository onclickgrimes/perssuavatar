import React from 'react';
import { AbsoluteFill } from 'remotion';
import { z } from 'zod';
import { compileMotionGraphicsCode } from '../utils/motion-graphics-compiler';

export const motionGraphicsRuntimeSchema = z.object({
  code: z.string(),
});

type MotionGraphicsRuntimeProps = z.infer<typeof motionGraphicsRuntimeSchema>;

export const MotionGraphicsRuntime: React.FC<MotionGraphicsRuntimeProps> = ({ code }) => {
  const compilation = React.useMemo(() => compileMotionGraphicsCode(code), [code]);

  if (compilation.error || !compilation.Component) {
    return compilation.error ? (
      <AbsoluteFill
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          color: '#fecaca',
          background: 'rgba(127,29,29,0.35)',
          textAlign: 'center',
          fontSize: 28,
        }}
      >
        {compilation.error}
      </AbsoluteFill>
    ) : null;
  }

  const Component = compilation.Component;

  return (
    <AbsoluteFill style={{ backgroundColor: 'transparent' }}>
      <Component __motionGraphicsRuntimeErrorMode="none" />
    </AbsoluteFill>
  );
};
