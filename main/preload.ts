import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const handler = {
  send(channel: string, value: unknown) {
    ipcRenderer.send(channel, value)
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)

    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  // Audio
  sendAudioData: (buffer: ArrayBuffer) => ipcRenderer.send('audio-data', buffer),
  
  // Window Control
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => 
    ipcRenderer.send('set-ignore-mouse-events', ignore, options),

  // Events
  onTranscription: (callback: (text: string) => void) => {
    const subscription = (_: any, text: string) => callback(text);
    ipcRenderer.on('transcription', subscription);
    return () => ipcRenderer.removeListener('transcription', subscription);
  },
  onPlayAudio: (callback: (buffer: ArrayBuffer) => void) => {
    const subscription = (_: any, buffer: ArrayBuffer) => callback(buffer);
    ipcRenderer.on('play-audio', subscription);
    return () => ipcRenderer.removeListener('play-audio', subscription);
  },
  onShowCode: (callback: (code: string) => void) => {
    const subscription = (_: any, code: string) => callback(code);
    ipcRenderer.on('show-code', subscription);
    return () => ipcRenderer.removeListener('show-code', subscription);
  },
  onAiResponse: (callback: (text: string) => void) => {
    const subscription = (_: any, text: string) => callback(text);
    ipcRenderer.on('ai-response', subscription);
    return () => ipcRenderer.removeListener('ai-response', subscription);
  },
  onGlobalMouseMove: (callback: (coords: { x: number, y: number }) => void) => {
    const subscription = (_: any, coords: { x: number, y: number }) => callback(coords);
    ipcRenderer.on('global-mouse-move', subscription);
    return () => ipcRenderer.removeListener('global-mouse-move', subscription);
  },
  resizeWindow: (width: number, height: number) => ipcRenderer.send('resize-window', width, height),
  openSettings: () => ipcRenderer.send('open-settings'),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  analyzeVideo: (buffer: ArrayBuffer) => ipcRenderer.send('analyze-video', buffer),
}

contextBridge.exposeInMainWorld('electron', handler)

export type IpcHandler = typeof handler
