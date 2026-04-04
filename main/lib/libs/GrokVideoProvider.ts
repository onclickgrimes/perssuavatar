import puppeteer, { Browser, Page } from 'puppeteer';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import https from 'https';
import http from 'http';

export interface GrokVideoConfig {
  headless?: boolean;
  outputDir?: string;
  generationTimeoutMs?: number;
  geminiProviderId?: string;
}

export interface GrokGenerationResult {
  success: boolean;
  videoPath?: string;
  error?: string;
  durationMs?: number;
}

export type GrokProgressCallback = (progress: {
  stage: 'opening' | 'navigating' | 'submitting' | 'generating' | 'downloading' | 'complete' | 'error';
  message: string;
  percent?: number;
}) => void;

export class GrokVideoProvider {
  // Compartilhamos o mesmo browser entre instâncias, usando abas diferentes
  private static sharedBrowser: Browser | null = null;
  private config: GrokVideoConfig;
  private outputDir: string;
  private usingSharedBrowser: boolean = false;

  private static readonly GROK_URL = 'https://grok.com/imagine';
  private static readonly MAX_CONCURRENT = 1;
  private static readonly REMOTE_DEBUGGING_PORT = 9224;

  /** Processo do Chrome iniciado por este provider */
  private ownedChromeProcess: ChildProcess | null = null;

  private static activeCount = 0;
  private static activeQueue: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

  static cancelQueue(): void {
    const err = new Error('CANCELLED');
    console.log(`⏹️ [Grok/Cancel] Cancelando fila: ${GrokVideoProvider.activeQueue.length} slots`);
    const aq = GrokVideoProvider.activeQueue.splice(0);
    aq.forEach(w => w.reject(err));
  }

  private static async acquireConcurrencySlot(): Promise<void> {
    if (GrokVideoProvider.activeCount < GrokVideoProvider.MAX_CONCURRENT) {
      GrokVideoProvider.activeCount++;
      return;
    }
    await new Promise<void>((resolve, reject) => { GrokVideoProvider.activeQueue.push({ resolve, reject }); });
    GrokVideoProvider.activeCount++;
  }

  private static releaseConcurrencySlot(): void {
    GrokVideoProvider.activeCount = Math.max(0, GrokVideoProvider.activeCount - 1);
    const next = GrokVideoProvider.activeQueue.shift();
    if (next) next.resolve();
  }

  constructor(config: GrokVideoConfig = {}) {
    this.config = {
      headless: config.headless ?? false,
      generationTimeoutMs: config.generationTimeoutMs ?? 600000, // 10 min
      ...config,
    };

    this.outputDir = this.config.outputDir ||
      path.join(app.getPath('userData'), 'video-projects', 'grok-videos');

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private findChromePath(): string | undefined {
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ];

    for (const chromePath of possiblePaths) {
      if (chromePath && fs.existsSync(chromePath)) {
        return chromePath;
      }
    }
    return undefined;
  }

  private getChromeExecutablePath(chromePath?: string): string {
    if (chromePath) return chromePath;

    const bundledPath = puppeteer.executablePath?.();
    if (bundledPath && fs.existsSync(bundledPath)) {
      return bundledPath;
    }

    throw new Error(
      'Chrome/Chromium não encontrado para iniciar em modo remoto. Instale o Google Chrome ou garanta o Chromium do Puppeteer.'
    );
  }

  private async isRemoteDebugEndpointReady(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const req = http.get(`http://127.0.0.1:${port}/json/version`, res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }
          try {
            const payload = JSON.parse(body);
            resolve(Boolean(payload?.webSocketDebuggerUrl));
          } catch {
            resolve(false);
          }
        });
      });

      req.setTimeout(800, () => {
        req.destroy();
        resolve(false);
      });

      req.on('error', () => resolve(false));
    });
  }

  private async waitForRemoteDebugEndpoint(
    port: number,
    timeoutMs: number,
    spawnedProcess?: ChildProcess
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (spawnedProcess && spawnedProcess.exitCode !== null) {
        throw new Error(`Chrome remoto finalizou antes da conexão DevTools (exitCode=${spawnedProcess.exitCode})`);
      }

      if (await this.isRemoteDebugEndpointReady(port)) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 250));
    }

    throw new Error(`Timeout aguardando endpoint de depuração remota na porta ${port}`);
  }

  private async launchChromeWithRemoteDebugging(userDataDir: string, chromePath?: string): Promise<void> {
    const executablePath = this.getChromeExecutablePath(chromePath);
    const args = [
      `--remote-debugging-port=${GrokVideoProvider.REMOTE_DEBUGGING_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--window-size=1366,768',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--lang=en-US',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--new-window',
    ];

    if (this.config.headless) {
      args.push('--headless=new', '--disable-gpu');
    } else {
      args.push('--start-maximized');
    }

    const child = spawn(executablePath, args, {
      detached: false,
      stdio: 'ignore',
      windowsHide: !!this.config.headless,
    });

    this.ownedChromeProcess = child;
    await this.waitForRemoteDebugEndpoint(GrokVideoProvider.REMOTE_DEBUGGING_PORT, 20000, child);
  }

  private async connectToRemoteChrome(): Promise<Browser> {
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${GrokVideoProvider.REMOTE_DEBUGGING_PORT}`,
      defaultViewport: null,
    });
    return browser;
  }

  private async randomDelay(min: number = 500, max: number = 1500): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  public isBrowserAlive(): boolean {
    if (!GrokVideoProvider.sharedBrowser) return false;
    return GrokVideoProvider.sharedBrowser.isConnected();
  }

  private findGeminiUserDataDir(): { userDataDir: string; providerId: string } | null {
    try {
      const { getProviderManager } = require('./PuppeteerProvider');
      const manager = getProviderManager();

      const geminiProviders = manager.listProvidersByPlatform('gemini');

      if (geminiProviders.length === 0) {
        return null;
      }

      let targetProvider = geminiProviders[0];

      if (this.config.geminiProviderId) {
        const specific = geminiProviders.find((p: any) => p.id === this.config.geminiProviderId);
        if (specific) targetProvider = specific;
      } else {
        const loggedIn = geminiProviders.find((p: any) => p.isLoggedIn);
        if (loggedIn) targetProvider = loggedIn;
      }

      const userDataDir = path.join(
        app.getPath('userData'),
        'provider-cookies',
        'profiles',
        targetProvider.id
      );

      return { userDataDir, providerId: targetProvider.id };
    } catch (err: any) {
      console.error('❌ [Grok] Erro ao buscar provider Gemini:', err.message);
      return null;
    }
  }

  private tryReuseGeminiBrowser(): boolean {
    try {
      const { getProviderManager } = require('./PuppeteerProvider');
      const manager = getProviderManager();

      const geminiProviders = manager.listProvidersByPlatform('gemini');

      for (const config of geminiProviders) {
        const providerId = this.config.geminiProviderId || config.id;
        const activeProvider = manager.getGeminiProvider(providerId);

        if (activeProvider) {
          const existingBrowser = activeProvider.getBrowser?.();

          if (existingBrowser && existingBrowser.isConnected()) {
            GrokVideoProvider.sharedBrowser = existingBrowser;
            this.usingSharedBrowser = true;
            return true;
          }
        }
      }
      return false;
    } catch (err: any) {
      return false;
    }
  }

  async initBrowser(): Promise<Browser> {
    if (this.isBrowserAlive()) {
      return GrokVideoProvider.sharedBrowser!;
    }

    console.log(`🚀 [Grok] Inicializando navegador...`);

    if (!GrokVideoProvider.sharedBrowser) {
      const reused = this.tryReuseGeminiBrowser();
      if (reused && GrokVideoProvider.sharedBrowser) {
        console.log(`✅ [Grok] Reutilizando browser do Gemini`);
        return GrokVideoProvider.sharedBrowser;
      }
    }

    const geminiData = this.findGeminiUserDataDir();
    const chromePath = this.findChromePath();
    const userDataDir = geminiData?.userDataDir || path.join(app.getPath('userData'), 'provider-cookies', 'profiles', 'gemini-default');

    console.log(`🔍 [Grok] Chrome path: ${chromePath || 'using bundled Chromium'}`);
    console.log(`📁 [Grok] User data dir: ${userDataDir}`);
    console.log(`🧭 [Grok] Modo navegador: ${this.config.headless ? 'headless' : 'visível'}`);

    // Se existir processo próprio antigo, encerra antes de subir outro na mesma porta
    if (this.ownedChromeProcess && this.ownedChromeProcess.exitCode === null) {
      try { this.ownedChromeProcess.kill(); } catch { }
    }
    this.ownedChromeProcess = null;

    await this.launchChromeWithRemoteDebugging(userDataDir, chromePath);
    GrokVideoProvider.sharedBrowser = await this.connectToRemoteChrome();
    this.usingSharedBrowser = false;

    console.log(`✅ [Grok] Novo navegador inicializado via remote debugging`);
    return GrokVideoProvider.sharedBrowser;
  }

  async generateVideo(
    prompt: string,
    onProgress?: GrokProgressCallback,
    referenceImagePaths?: string[]
  ): Promise<GrokGenerationResult> {
    const startTime = Date.now();

    const emitProgress = (stage: any, message: string, percent?: number) => {
      console.log(`🎬 [Grok] ${message}`);
      onProgress?.({ stage, message, percent });
    };

    emitProgress('submitting', 'Aguardando slot de geração disponível...');
    await GrokVideoProvider.acquireConcurrencySlot();
    let slotReleased = false;
    const releaseSlot = () => {
      if (!slotReleased) { slotReleased = true; GrokVideoProvider.releaseConcurrencySlot(); }
    };

    let page: Page | null = null;

    try {
      const browser = await this.initBrowser();

      emitProgress('opening', 'Abrindo nova aba para geração...');
      page = await browser.newPage();

      emitProgress('navigating', 'Navegando para o Grok...');
      await page.goto(GrokVideoProvider.GROK_URL, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      await this.randomDelay(2000, 4000);

      // Verify if logged in by checking if the input bar exists
      const isLoggedOut = await page.$('a[href*="/login"]');
      if (isLoggedOut) {
         throw new Error('Usuário não está logado no Grok. Faça login manualmente primeiro.');
      }

      emitProgress('submitting', 'Configurando geração de vídeo...');

      try { await page.bringToFront(); } catch(e){}

      // Setup Video Mode
      await page.evaluate(`(function() {
        var radios = document.querySelectorAll('button[role="radio"]');
        for (var i = 0; i < radios.length; i++) {
          var btn = radios[i];
          var textContent = btn.textContent || '';
          var text = '';
          for (var j = 0; j < textContent.length; j++) {
            if (textContent.charCodeAt(j) > 32) {
              text += textContent.charAt(j).toLowerCase();
            }
          }
          if (text === 'vídeo' || text === 'video' || textContent.indexOf('Video') !== -1 || textContent.indexOf('Vídeo') !== -1) {
            btn.click();
            break;
          }
        }
      })()`);
      await this.randomDelay(1000, 1500);

      // Upload Image (Only 1 allowed by Grok)
      if (referenceImagePaths && referenceImagePaths.length > 0) {
        emitProgress('submitting', `Configurando imagem de referência...`);
        const imageToUpload = referenceImagePaths[0]; // Grok só aceita uma imagem!
        const uploaded = await this.uploadReferenceImage(page, imageToUpload);
        if (uploaded) {
           await this.randomDelay(2000, 3000);
        } else {
           console.warn(`⚠️ [Grok] Falha ao enviar a imagem referência. Prosseguindo sem.`)
        }
      }

      // Input Prompt
      emitProgress('submitting', 'Inserindo o prompt...');
      let promptInput: any = await page.$('div[contenteditable="true"]');
      if (!promptInput) {
         promptInput = await page.$('textarea');
      }

      if (!promptInput) {
        throw new Error('Campo de prompt não encontrado no Grok.');
      }

      await promptInput.click();
      await this.randomDelay(300, 500);
      
      const { clipboard } = require('electron');
      clipboard.writeText(prompt);
      await page.keyboard.down('Control');
      await page.keyboard.press('V');
      await page.keyboard.up('Control');
      
      // Emitir um espaço extra para garantir que o editor "perceba" a alteração!
      await page.keyboard.press('Space');
      await this.randomDelay(1000, 1500);

      // Submit
      emitProgress('submitting', 'Enviando prompt...');
      const submitted = await page.evaluate(`(function() {
        var submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
          return true;
        }
        return false;
      })()`);

      if (!submitted) {
         // Fallback: pressionar Enter
         await page.keyboard.press('Enter');
         await this.randomDelay(500, 1000);
      }

      emitProgress('generating', 'Aguardando redirecionamento para o vídeo...', 10);

      // Poll for finished generation
      // Mudar a busca para o video específico por IDs (sd-video / hd-video)
      const maxWait = this.config.generationTimeoutMs!;
      const startWait = Date.now();
      let finalVideoUrl: string | null = null;
      let lastUrl = page.url();
      let sdVideoMatched = false;
      let upscaleRequested = false;

      while (Date.now() - startWait < maxWait) {
        try {
          const currentUrl = page.url();
          if (currentUrl !== lastUrl) {
            console.log(`🔄 [Grok] Página redirecionada para: ${currentUrl}`);
            lastUrl = currentUrl;
          }

          if (!sdVideoMatched) {
            // Passo 1: Esperar pelo vídeo SD
            let sdUrl = await page.evaluate(`(function() {
              var sd = document.getElementById('sd-video');
              if (sd) {
                 var src = sd.getAttribute('src');
                 if (src && src.indexOf('blob:') !== 0 && src !== '') return src;
                 var source = sd.querySelector('source');
                 if (source && source.getAttribute('src')) return source.getAttribute('src');
              }
              return null;
            })()`) as string | null;

            if (sdUrl) {
               console.log('✅ [Grok] Vídeo Base (SD) gerado. Solicitando Upscale HD...');
               emitProgress('generating', 'Vídeo base gerado. Solicitando Upscale...', 60);
               sdVideoMatched = true;

               // Solicitar Upscale
               // Componentes RadixUI precisam de delay de estabilização e PointerEvents reais
               await this.randomDelay(1500, 2500);

               let menuOpened = false;
               try {
                  const selector = 'button[aria-label="Mais opções"], button[aria-label="More options"]';
                  const btn = await page.$(selector);
                  if (btn) {
                     await btn.click(); // Click real mouse simulado pelo Chromedriver
                     menuOpened = true;
                  }
               } catch (e) {}

               if (!menuOpened) {
                  // Fallback para emulação pesada (dispara click sintético na DOM)
                  menuOpened = await page.evaluate(`(function() {
                     var btn = document.querySelector('button[aria-label="Mais opções"], button[aria-label="More options"]');
                     if (!btn) return false;
                     try { btn.click(); } catch(e){}
                     btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                     btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
                     btn.dispatchEvent(new PointerEvent('click', { bubbles: true, cancelable: true }));
                     return true;
                  })()`) as boolean;
               }

               if (menuOpened) {
                  await this.randomDelay(1000, 1500); // Aguardar Radix dropdown open anims
                  
                  let clickedUpscale = false;
                  try {
                     const upscaleHandle = await page.evaluateHandle(`(function() {
                        // Tenta achar com role=menuitem primeiro
                        var items = document.querySelectorAll('[role="menuitem"]');
                        for (var i = 0; i < items.length; i++) {
                           if (items[i].textContent && items[i].textContent.toLowerCase().indexOf('upscale') !== -1) {
                              var r = items[i].getBoundingClientRect();
                              if (r.width > 0 && r.height > 0) return items[i];
                           }
                        }
                        // Fallback: varre todas as divs de trás pra frente (pega os nós mais profundos / filhos)
                        var divs = document.querySelectorAll('div, span');
                        for (var j = divs.length - 1; j >= 0; j--) {
                           var text = (divs[j].textContent || '').toLowerCase().trim();
                           if (text.indexOf('upscale') !== -1 && text.length < 30) {
                              var rect = divs[j].getBoundingClientRect();
                              // Garante que a div está visível na tela
                              if (rect.width > 0 && rect.height > 0) {
                                 return divs[j];
                              }
                           }
                        }
                        return null;
                     })()`);

                     if (upscaleHandle && upscaleHandle.asElement()) {
                        const el = upscaleHandle.asElement() as any;
                        await el.click();
                        clickedUpscale = true;
                     }
                  } catch (e) {
                     console.log('🔄 [Grok] Erro ao tentar mouse click real no upscale:', e);
                  }

                  if (!clickedUpscale) {
                     // Em última instância, tenta injetar .click() na força bruta
                     clickedUpscale = await page.evaluate(`(function() {
                        var divs = document.querySelectorAll('div, span');
                        for (var j = divs.length - 1; j >= 0; j--) {
                           var text = (divs[j].textContent || '').toLowerCase().trim();
                           if (text.indexOf('upscale') !== -1 && text.length < 30) {
                              divs[j].click();
                              return true;
                           }
                        }
                        return false;
                     })()`) as boolean;
                  }

                  if (clickedUpscale) {
                     upscaleRequested = true;
                     emitProgress('generating', 'Upscale HD solicitado. Aguardando processamento da alta resolução...', 70);
                     // Delay pesado pro servidor reconhecer e disparar a re-renderização!
                     await this.randomDelay(3000, 5000);
                  } else {
                     console.warn('⚠️ [Grok] Botão Upscale não encontrado no menu dropdown. Fornecendo SD...');
                     finalVideoUrl = sdUrl;
                     break;
                  }
               } else {
                  console.warn('⚠️ [Grok] Botão "Mais opções" não encontrado. Fornecendo SD...');
                  finalVideoUrl = sdUrl;
                  break;
               }
            }
          } else if (upscaleRequested) {
             // Passo 2: Esperar pelo vídeo HD pós-upscale 
             // O vídeo HD costuma trocar visibility: hidden para visible quando fica pronto
             finalVideoUrl = await page.evaluate(`(function() {
                var hd = document.getElementById('hd-video');
                if (hd && document.defaultView.getComputedStyle(hd).visibility !== 'hidden') {
                   var src = hd.getAttribute('src');
                   if (src && src.indexOf('blob:') !== 0 && src !== '') return src;
                   var source = hd.querySelector('source');
                   if (source && source.getAttribute('src')) return source.getAttribute('src');
                }
                return null;
             })()`) as string | null;

             if (finalVideoUrl) {
                console.log('✅ [Grok] Vídeo HD concluído!');
                break;
             }
          }
        } catch (evalErr: any) {
          if (evalErr.message.includes('Execution context was destroyed') || evalErr.message.includes('Target closed') || evalErr.message.includes('Session closed')) {
            console.log('🔄 [Grok] Página redirecionando ou recarregando contexto, aguardando...');
            await this.randomDelay(2000, 4000);
            continue;
          }
          throw evalErr;
        }

        if (finalVideoUrl) {
          break;
        }

        await new Promise(r => setTimeout(r, 5000));
        
        const secWaiting = Math.round((Date.now() - startWait) / 1000);
        
        // Polling de % apenas se o upscale não tiver começado (a % só aparece pro base mode geralmente)
        if (!upscaleRequested) {
           const pUrl = page.url();
           if (pUrl.includes('/imagine/post/')) {
              const percentStr = await page.evaluate(`(function() {
                var spans = document.querySelectorAll('span');
                for(var i = 0; i < spans.length; i++) {
                   if(spans[i].textContent && spans[i].textContent.indexOf('%') !== -1) {
                      return spans[i].textContent;
                   }
                }
                return '';
              })()`) as string;
              
              if(percentStr) {
                 const numMatch = percentStr.match(/(\d+)/);
                 const numVal = numMatch ? parseInt(numMatch[1], 10) : 50;
                 emitProgress('generating', `Geração em andamento no Grok... (${percentStr})  [${secWaiting}s]`, numVal);
              } else {
                 emitProgress('generating', `Geração em andamento no Grok... (${secWaiting}s)`, 50);
              }
           } else {
              emitProgress('generating', `Aguardando redirecionamento para a página do vídeo... (${secWaiting}s)`, 10);
           }
        } else {
           emitProgress('generating', `Formatando e convertendo para Upscale HD... (${secWaiting}s)`, 85);
        }
      }

      if (!finalVideoUrl) {
        throw new Error('Timeout: O vídeo não foi gerado no tempo limite.');
      }

      emitProgress('downloading', 'Baixando vídeo gerado...', 90);

      const outputFileName = `grok-${Date.now()}.mp4`;
      const outputPath = path.join(this.outputDir, outputFileName);

      const pageCookies = await page.cookies();
      const cookieStr = pageCookies.map(c => `${c.name}=${c.value}`).join('; ');

      await this.downloadVideo(finalVideoUrl, outputPath, cookieStr);

      const durationMs = Date.now() - startTime;
      emitProgress('complete', `Vídeo gerado com sucesso! (${Math.round(durationMs / 1000)}s)`, 100);

      // Não fechar a aba como o usuário pediu
      // await page.close();
      releaseSlot();

      return {
        success: true,
        videoPath: outputPath,
        durationMs,
      };

    } catch (error: any) {
      // Não fechar a aba em erro para que o usuário possa visualizar
      // if (page && !page.isClosed()) {
      //   await page.close().catch(() => {});
      // }
      const durationMs = Date.now() - startTime;
      releaseSlot();
      emitProgress('error', `Erro: ${error.message}`);
      console.error(`❌ [Grok] Erro na geração:`, error);
      return { success: false, error: error.message, durationMs };
    }
  }

  private async uploadReferenceImage(page: Page, imagePath: string): Promise<boolean> {
    if (!page) return false;

    try {
      console.log(`🖼️ [Grok] Iniciando processamento de imagem de referência: ${imagePath}`);

      let absPath = imagePath;
      const pathModule = require('path');
      const fs = require('fs');

      if (absPath.startsWith('http://') || absPath.startsWith('https://')) {
        console.log(`🖼️ [Grok] URL detectada, baixando temporariamente para upload...`);
        let baseName = '';
        try {
          const urlObj = new URL(absPath);
          baseName = pathModule.basename(urlObj.pathname);
        } catch {
          baseName = pathModule.basename(absPath.split('?')[0]);
        }
        if (!baseName || baseName === '/' || baseName.trim() === '') {
          baseName = `temp_ref_${Buffer.from(absPath).toString('base64').substring(0, 10)}.jpg`;
        }
        
        const tempFilename = `grok_temp_${baseName}`;
        const tempPath = pathModule.join(this.outputDir, tempFilename);

        if (!fs.existsSync(tempPath)) {
          await new Promise((resolve, reject) => {
            const client = absPath.startsWith('https') ? require('https') : require('http');
            client.get(absPath, (response: any) => {
              if (response.statusCode === 200) {
                const fileStream = fs.createWriteStream(tempPath);
                response.pipe(fileStream);
                fileStream.on('finish', () => { fileStream.close(); resolve(true); });
              } else {
                reject(new Error(`Falha no download da referência: Status ${response.statusCode}`));
              }
            }).on('error', (err: any) => reject(err));
          });
        }
        absPath = tempPath;
      } else if (absPath.startsWith('file:///')) {
        absPath = absPath.replace('file:///', '');
      }

      absPath = pathModule.resolve(absPath);
      console.log(`🖼️ [Grok] Caminho absoluto da imagem preparado: ${absPath}`);

      if(!fs.existsSync(absPath)) {
        console.warn(`⚠️ [Grok] Arquivo de imagem não encontrado no destino final: ${absPath}`);
        return false;
      }

      // Clica no botão de anexar para garantir que o input file de imagens esteja no dom ou ativado
      await page.evaluate(`(function() {
        var attachBtn = document.querySelector('button[aria-label="Anexar"], button[aria-label="Attach"]');
        if (attachBtn) attachBtn.click();
      })()`);
      await this.randomDelay(500, 1000);

      const fileInput = await page.$('input[type="file"][accept*="image"], input[type="file"]');
      if (fileInput) {
        await fileInput.uploadFile(absPath);
        return true;
      } else {
         console.warn(`⚠️ [Grok] Não conseguimos achar o campo de upload de arquivo visual na interface do Grok`);
         return false;
      }

    } catch (err: any) {
      console.error(`❌ [Grok] Erro ao fazer upload da imagem de referência:`, err);
      return false;
    }
  }

  private async downloadVideo(url: string, destPath: string, cookieStr?: string): Promise<void> {
    const fsRef = require('fs');
    
    if (url.startsWith('blob:')) {
        throw new Error('Não é possível baixar URLs blob: diretamente via Node.');
    }

    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const client = isHttps ? https : http;
      
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      };
      if (cookieStr) headers['Cookie'] = cookieStr;

      client.get(url, { headers }, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
           client.get(response.headers.location, { headers }, (res2) => {
              if (res2.statusCode !== 200) {
                 reject(new Error(`Falha no download redirecionado: Status ${res2.statusCode}`));
                 return;
              }
              const file2 = fsRef.createWriteStream(destPath);
              res2.pipe(file2);
              file2.on('finish', () => { file2.close(); resolve(); });
              file2.on('error', (err: any) => { fsRef.unlink(destPath, () => {}); reject(err); });
           }).on('error', reject);
           return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Falha no download: Status ${response.statusCode}`));
          return;
        }
        const file = fsRef.createWriteStream(destPath);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        file.on('error', (err: any) => {
          fsRef.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  }
}

let grokVideoProviderInstance: GrokVideoProvider | null = null;

export function getGrokVideoProvider(config?: GrokVideoConfig): GrokVideoProvider {
  if (!grokVideoProviderInstance) {
    grokVideoProviderInstance = new GrokVideoProvider(config);
  }
  return grokVideoProviderInstance;
}

export function cancelGrokQueue(): void {
  GrokVideoProvider.cancelQueue();
}
