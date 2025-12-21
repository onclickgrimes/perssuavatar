import React from 'react';

export function ProcessingStep({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-16 h-16 mb-6 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
      <p className="text-xl text-white/80">{message}</p>
    </div>
  );
}
