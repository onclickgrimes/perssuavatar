import React, { useEffect, useState } from 'react';

export default function CodePopup() {
  const [code, setCode] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleShowCode = (newCode: string) => {
      setCode(newCode);
      setIsVisible(true);
      // Enable mouse events when popup is shown
      window.electron.setIgnoreMouseEvents(false);
    };

    const unsubscribe = window.electron.onShowCode(handleShowCode);
    return () => { unsubscribe(); };
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    // Disable mouse events (pass through) when popup is closed
    // Note: Avatar component might override this on pointerover, which is fine.
    window.electron.setIgnoreMouseEvents(true, { forward: true });
  };

  const handleCopy = () => {
    if (code) {
      navigator.clipboard.writeText(code);
    }
  };

  if (!isVisible || !code) return null;

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      onMouseEnter={() => window.electron.setIgnoreMouseEvents(false)}
      onMouseLeave={() => window.electron.setIgnoreMouseEvents(false)} // Keep capturing if inside the area? No, usually we want to capture.
    >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose}></div>
        
        {/* Modal */}
        <div 
            className="relative bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl border border-gray-700 flex flex-col max-h-[80vh] pointer-events-auto no-drag"
        >
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h3 className="text-white font-semibold">Código Detectado</h3>
            <button onClick={handleClose} className="text-gray-400 hover:text-white">
                ✕
            </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
            <pre className="bg-black text-green-400 p-4 rounded font-mono text-sm whitespace-pre-wrap">
                {code}
            </pre>
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
                <button onClick={handleCopy} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">
                    Copiar
                </button>
                <button onClick={handleClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors">
                    Fechar
                </button>
            </div>
        </div>
    </div>
  );
}