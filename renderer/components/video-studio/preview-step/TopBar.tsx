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

export function TopBar({ onBackClick, onSaveClick, onContinue, onSave, isSaving }: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-b" style={{ borderColor: FILMORA.border, background: FILMORA.bgDark }}>
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold tracking-wide" style={{ color: FILMORA.text }}>
          Editor de Vídeo
        </h2>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ color: FILMORA.textMuted, background: FILMORA.surface }}>
          Preview
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onBackClick}
          className="px-4 py-1.5 rounded-md text-[13px] font-medium transition-all hover:bg-opacity-80"
          style={{ background: FILMORA.surface, color: FILMORA.text, border: `1px solid ${FILMORA.border}` }}
        >
          Voltar
        </button>
        
        {onSave && (
          <button
            onClick={onSaveClick}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-md text-[13px] font-medium transition-all hover:bg-opacity-80 flex items-center gap-2"
            style={{ background: FILMORA.surface, color: FILMORA.text, border: `1px solid ${FILMORA.borderLight}`, opacity: isSaving ? 0.7 : 1 }}
          >
            <span className="opacity-80">💾</span> {isSaving ? 'Salvando...' : 'Salvar Projeto'}
          </button>
        )}

        <button
          onClick={onContinue}
          className="px-6 py-1.5 rounded-md text-[13px] font-semibold transition-all hover:brightness-110 flex items-center gap-2 shadow-sm"
          style={{ background: FILMORA.accent, color: '#000' }}
        >
          {Icons.render}
          Exportar
        </button>
      </div>
    </div>
  );
}
