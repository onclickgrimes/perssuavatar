import React from 'react';
import { useDesktopAudioTranscriber } from '../hooks/useDesktopAudioTranscriber';

/**
 * Exemplo de componente que usa transcrição de áudio do desktop em tempo real
 * 
 * Este componente demonstra como:
 * 1. Capturar áudio do desktop (sistema operacional)
 * 2. Enviar em tempo real para o Deepgram via websocket
 * 3. Receber transcrições em tempo real
 */
export const DesktopAudioTranscriptionExample: React.FC = () => {
    const [transcriptions, setTranscriptions] = React.useState<string[]>([]);

    const { isTranscribing, status, startTranscribing, stopTranscribing } = useDesktopAudioTranscriber({
        onTranscription: (text, isFinal) => {
            if (isFinal) {
                console.log('[Transcrição Final]:', text);
                setTranscriptions(prev => [...prev, text]);
            } else {
                console.log('[Transcrição Parcial]:', text);
            }
        },
        onError: (error) => {
            console.error('[Erro na Transcrição]:', error);
        },
        chunkIntervalMs: 100 // 100ms = 10 chunks/segundo (realtime)
    });

    return (
        <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
            <h2>Transcrição de Áudio do Desktop</h2>
            
            <div style={{ marginBottom: '20px' }}>
                <p><strong>Status:</strong> {status}</p>
                <p><strong>Transcrevendo:</strong> {isTranscribing ? 'Sim' : 'Não'}</p>
            </div>

            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
                <button
                    onClick={startTranscribing}
                    disabled={isTranscribing}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: isTranscribing ? '#ccc' : '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: isTranscribing ? 'not-allowed' : 'pointer'
                    }}
                >
                    Iniciar Transcrição
                </button>

                <button
                    onClick={stopTranscribing}
                    disabled={!isTranscribing}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: !isTranscribing ? '#ccc' : '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: !isTranscribing ? 'not-allowed' : 'pointer'
                    }}
                >
                    Parar Transcrição
                </button>

                <button
                    onClick={() => setTranscriptions([])}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#ff9800',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                    }}
                >
                    Limpar
                </button>
            </div>

            <div
                style={{
                    backgroundColor: '#f5f5f5',
                    padding: '15px',
                    borderRadius: '5px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    border: '1px solid #ddd'
                }}
            >
                <h3>Transcrições:</h3>
                {transcriptions.length === 0 ? (
                    <p style={{ color: '#999' }}>Nenhuma transcrição ainda...</p>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {transcriptions.map((text, index) => (
                            <li
                                key={index}
                                style={{
                                    padding: '8px',
                                    marginBottom: '8px',
                                    backgroundColor: 'white',
                                    borderRadius: '3px',
                                    borderLeft: '3px solid #4CAF50'
                                }}
                            >
                                {text}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '5px' }}>
                <h4>ℹ️ Como funciona:</h4>
                <ol>
                    <li>Clique em "Iniciar Transcrição"</li>
                    <li>O áudio do seu sistema será capturado em tempo real</li>
                    <li>Os chunks de áudio (~100ms) serão enviados para o Deepgram via websocket</li>
                    <li>As transcrições aparecerão aqui em tempo real</li>
                    <li>Clique em "Parar Transcrição" quando terminar</li>
                </ol>
                <p><strong>Nota:</strong> Certifique-se de ter uma credencial ativa do Deepgram na aba API e Modelos</p>
            </div>
        </div>
    );
};
