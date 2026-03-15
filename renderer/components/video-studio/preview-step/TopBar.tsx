import React from 'react';
import { FILMORA } from './constants';
import { Icons } from './Icons';

interface TopBarProps {
  onBackClick: () => void;
  onSaveClick: () => void;
  onContinue: () => void;
  onSave?: () => Promise<void> | void;
  isSaving: boolean;
}

// ========================================
// TOP BAR — Title + Actions
// ========================================
export function TopBar({ onBackClick, onSaveClick, onContinue, onSave, isSaving }: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: FILMORA.border, background: FILMORA.bgDark }}>
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold tracking-wide" style={{ color: FILMORA.text }}>
          Player
        </h2>
        <span className="text-xs px-2 py-0.5 rounded" style={{ color: FILMORA.textMuted, background: FILMORA.surface }}>
          Preview
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onBackClick}
          className="px-4 py-1.5 rounded text-xs font-medium transition-all hover:brightness-110"
          style={{ background: FILMORA.surface, color: FILMORA.textMuted, border: `1px solid ${FILMORA.border}` }}
        >
          ← Voltar
        </button>
        
        {onSave && (
          <button
            onClick={onSaveClick}
            disabled={isSaving}
            className="px-4 py-1.5 rounded text-xs font-medium transition-all hover:brightness-110 flex items-center gap-1.5"
            style={{ background: FILMORA.surface, color: FILMORA.text, border: `1px solid ${FILMORA.borderLight}`, opacity: isSaving ? 0.7 : 1 }}
          >
            <span className="opacity-80">💾</span> {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        )}

        <button
          onClick={onContinue}
          className="px-5 py-1.5 rounded text-xs font-bold transition-all hover:brightness-110 flex items-center gap-1.5"
          style={{ background: FILMORA.accent, color: '#000' }}
        >
          {Icons.render}
          Exportar
        </button>
      </div>
    </div>
  );
}
