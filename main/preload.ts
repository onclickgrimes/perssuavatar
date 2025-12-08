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
  onAudioChunk: (callback: (chunk: ArrayBuffer) => void) => {
      const subscription = (_: any, chunk: ArrayBuffer) => callback(chunk);
      ipcRenderer.on('audio-chunk', subscription);
      return () => ipcRenderer.removeListener('audio-chunk', subscription);
  },
  onAudioEnd: (callback: () => void) => {
      const subscription = () => callback();
      ipcRenderer.on('audio-end', subscription);
      return () => ipcRenderer.removeListener('audio-end', subscription);
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
  onControlRecording: (callback: (action: 'start' | 'stop') => void) => {
    const subscription = (_: any, action: 'start' | 'stop') => callback(action);
    ipcRenderer.on('control-recording', subscription);
    return () => {
        ipcRenderer.removeListener('control-recording', subscription);
    };
  },
  onAvatarAction: (callback: (action: { type: 'mood' | 'gesture', value: string }) => void) => {
      const subscription = (_: any, action: { type: 'mood' | 'gesture', value: string }) => callback(action);
      ipcRenderer.on('avatar-action', subscription);
      return () => ipcRenderer.removeListener('avatar-action', subscription);
  },
  findModelFile: (modelName: string) => ipcRenderer.invoke('find-model-file', modelName),
  setAssistantMode: (mode: 'classic' | 'live') => ipcRenderer.send('set-assistant-mode', mode),
  onAudioInterrupted: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on('audio-interrupted', subscription);
    return () => ipcRenderer.removeListener('audio-interrupted', subscription);
  },
  onControlScreenShare: (callback: (action: 'start' | 'stop') => void) => {
    const subscription = (_: any, action: 'start' | 'stop') => callback(action);
    ipcRenderer.on('control-screen-share', subscription);
    return () => { ipcRenderer.removeListener('control-screen-share', subscription); };
  },
  sendScreenFrame: (base64Image: string) => ipcRenderer.send('screen-frame', base64Image),
}

contextBridge.exposeInMainWorld('electron', handler)

export type IpcHandler = typeof handler
