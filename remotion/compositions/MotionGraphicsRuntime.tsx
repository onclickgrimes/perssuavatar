import React from 'react';
import { AbsoluteFill } from 'remotion';
import { z } from 'zod';
import { compileMotionGraphicsCode } from '../utils/motion-graphics-compiler';

export const motionGraphicsRuntimeSchema = z.object({
  code: z.string(),
  durationInFrames: z.number().optional(),
  fps: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  segmentId: z.number().or(z.string()).optional(),
  segmentDurationInFrames: z.number().optional(),
  segmentDurationInSeconds: z.number().optional(),
});

type MotionGraphicsRuntimeProps = z.infer<typeof motionGraphicsRuntimeSchema>;

export const MotionGraphicsRuntime: React.FC<MotionGraphicsRuntimeProps> = (props) => {
  const { code } = props;
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
      <Component
        __motionGraphicsRuntimeErrorMode="none"
        segmentId={props.segmentId}
        segmentDurationInFrames={props.segmentDurationInFrames || props.durationInFrames}
        segmentDurationInSeconds={props.segmentDurationInSeconds}
      />
    </AbsoluteFill>
  );
};
