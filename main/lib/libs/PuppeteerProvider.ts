/**
 * Puppeteer Provider Manager
 * 
 * Gerenciador central para providers de IA via Puppeteer.
 * Coordena múltiplas instâncias de GeminiProvider, OpenAIProvider e QwenProvider.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { GeminiProvider, createGeminiProvider } from './GeminiProvider';
import { OpenAIProvider, createOpenAIProvider } from './OpenAIProvider';
import { QwenProvider, createQwenProvider } from './QwenProvider';

// ========================================
// TYPES E INTERFACES
// ========================================

export type ProviderPlatform = 'gemini' | 'openai' | 'qwen';

export interface ProviderConfig {
  id: string;
  name: string;
  platform: ProviderPlatform;
  createdAt: string;
  lastUsed?: string;
  isLoggedIn?: boolean;
}

interface StoredProviderData {
  providers: ProviderConfig[];
}

// Union type para os providers
type ProviderInstance = GeminiProvider | OpenAIProvider | QwenProvider;

// ========================================
// PROVIDER MANAGER
// ========================================

export class ProviderManager {
  private providersFile: string;
  private activeProviders: Map<string, ProviderInstance> = new Map();

  constructor() {
    // Usa o mesmo padrão de caminho do TikTok/Instagram
    const cookiesDir = path.join(app.getPath('userData'), 'provider-cookies');
    if (!fs.existsSync(cookiesDir)) {
      fs.mkdirSync(cookiesDir, { recursive: true });
    }
    this.providersFile = path.join(cookiesDir, 'providers.json');
    this.ensureProvidersFile();
  }

  private ensureProvidersFile(): void {
    if (!fs.existsSync(this.providersFile)) {
      const initialData: StoredProviderData = { providers: [] };
      fs.writeFileSync(this.providersFile, JSON.stringify(initialData, null, 2));
    }
  }

  private loadProviders(): ProviderConfig[] {
    try {
      const data = fs.readFileSync(this.providersFile, 'utf-8');
      const parsed: StoredProviderData = JSON.parse(data);
      return parsed.providers || [];
    } catch (error) {
      console.error('❌ Erro ao carregar providers:', error);
      return [];
    }
  }

  private saveProviders(providers: ProviderConfig[]): void {
    try {
      const data: StoredProviderData = { providers };
      fs.writeFileSync(this.providersFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Erro ao salvar providers:', error);
    }
  }

  /**
   * Cria a instância correta do provider baseado na plataforma
   */
  private createProviderInstance(config: ProviderConfig): ProviderInstance {
    switch (config.platform) {
      case 'gemini':
        return createGeminiProvider(config.id, config.name);
      case 'openai':
        return createOpenAIProvider(config.id, config.name);
      case 'qwen':
        return createQwenProvider(config.id, config.name);
      default:
        throw new Error(`Plataforma desconhecida: ${config.platform}`);
    }
  }

  /**
   * Lista todos os providers salvos
   */
  listProviders(): ProviderConfig[] {
    return this.loadProviders();
  }

  /**
   * Lista providers de uma plataforma específica
   */
  listProvidersByPlatform(platform: ProviderPlatform): ProviderConfig[] {
    return this.loadProviders().filter(p => p.platform === platform);
  }

  /**
   * Cria um novo provider
   */
  createProvider(name: string, platform: ProviderPlatform): ProviderConfig {
    const providers = this.loadProviders();
    
    // Verifica se já existe um provider com o mesmo nome
    if (providers.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Já existe um provider com o nome "${name}"`);
    }

    // Gera ID único
    const id = `${platform}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newProvider: ProviderConfig = {
      id,
      name,
      platform,
      createdAt: new Date().toISOString(),
      isLoggedIn: false
    };

    providers.push(newProvider);
    this.saveProviders(providers);

    console.log(`✅ Provider criado: ${name} (${platform})`);
    return newProvider;
  }

  /**
   * Remove um provider
   */
  deleteProvider(id: string): boolean {
    const providers = this.loadProviders();
    const index = providers.findIndex(p => p.id === id);
    
    if (index === -1) {
      return false;
    }

    // Fecha o navegador se estiver ativo
    const activeProvider = this.activeProviders.get(id);
    if (activeProvider) {
      activeProvider.close();
      this.activeProviders.delete(id);
    }

    // Remove o diretório de cookies (mesmo padrão do TikTok/Instagram)
    const cookiesDir = path.join(app.getPath('userData'), 'provider-cookies', 'profiles', id);
    if (fs.existsSync(cookiesDir)) {
      fs.rmSync(cookiesDir, { recursive: true, force: true });
    }

    providers.splice(index, 1);
    this.saveProviders(providers);

    console.log(`🗑️ Provider removido: ${id}`);
    return true;
  }

  /**
   * Renomeia um provider
   */
  renameProvider(id: string, newName: string): boolean {
    const providers = this.loadProviders();
    const provider = providers.find(p => p.id === id);
    
    if (!provider) {
      return false;
    }

    // Verifica se já existe outro provider com o mesmo nome
    if (providers.some(p => p.id !== id && p.name.toLowerCase() === newName.toLowerCase())) {
      throw new Error(`Já existe um provider com o nome "${newName}"`);
    }

    provider.name = newName;
    this.saveProviders(providers);

    console.log(`✏️ Provider renomeado: ${newName}`);
    return true;
  }

  /**
   * Abre o navegador para login
   */
  async openForLogin(id: string): Promise<{ success: boolean; isLoggedIn: boolean }> {
    const providers = this.loadProviders();
    const config = providers.find(p => p.id === id);
    
    if (!config) {
      throw new Error(`Provider não encontrado: ${id}`);
    }

    // Fecha instância existente se houver
    if (this.activeProviders.has(id)) {
      await this.activeProviders.get(id)!.close();
    }

    const provider = this.createProviderInstance(config);
    this.activeProviders.set(id, provider);

    try {
      await provider.init();
      
      let isLoggedIn = false;
      
      // Navega para a plataforma correspondente
      switch (config.platform) {
        case 'gemini':
          isLoggedIn = await (provider as GeminiProvider).goToGemini();
          break;
        case 'openai':
          isLoggedIn = await (provider as OpenAIProvider).goToChatGPT();
          break;
        case 'qwen':
          isLoggedIn = await (provider as QwenProvider).goToQwen();
          break;
      }

      // Atualiza status de login
      config.isLoggedIn = isLoggedIn;
      config.lastUsed = new Date().toISOString();
      this.saveProviders(providers);

      return { success: true, isLoggedIn };
    } catch (error) {
      console.error(`❌ Erro ao abrir provider ${id}:`, error);
      await provider.close();
      this.activeProviders.delete(id);
      return { success: false, isLoggedIn: false };
    }
  }

  /**
   * Verifica status de login de um provider
   */
  async checkLoginStatus(id: string): Promise<boolean> {
    const provider = this.activeProviders.get(id);
    if (!provider) {
      return false;
    }

    const isLoggedIn = provider.isLoggedIn;

    // Atualiza status no arquivo
    const providers = this.loadProviders();
    const config = providers.find(p => p.id === id);
    if (config) {
      config.isLoggedIn = isLoggedIn;
      config.lastUsed = new Date().toISOString();
      this.saveProviders(providers);
    }

    return isLoggedIn;
  }

  /**
   * Fecha o navegador de um provider
   */
  async closeProvider(id: string): Promise<void> {
    const provider = this.activeProviders.get(id);
    if (provider) {
      await provider.close();
      this.activeProviders.delete(id);
    }
  }

  /**
   * Fecha todos os navegadores ativos
   */
  async closeAll(): Promise<void> {
    for (const [id, provider] of this.activeProviders) {
      await provider.close();
    }
    this.activeProviders.clear();
  }

  /**
   * Obtém um provider ativo
   */
  getActiveProvider(id: string): ProviderInstance | undefined {
    return this.activeProviders.get(id);
  }

  /**
   * Obtém um GeminiProvider ativo
   */
  getGeminiProvider(id: string): GeminiProvider | undefined {
    const provider = this.activeProviders.get(id);
    if (provider && this.getProviderPlatform(id) === 'gemini') {
      return provider as GeminiProvider;
    }
    return undefined;
  }

  /**
   * Obtém um OpenAIProvider ativo
   */
  getOpenAIProvider(id: string): OpenAIProvider | undefined {
    const provider = this.activeProviders.get(id);
    if (provider && this.getProviderPlatform(id) === 'openai') {
      return provider as OpenAIProvider;
    }
    return undefined;
  }

  /**
   * Obtém um QwenProvider ativo
   */
  getQwenProvider(id: string): QwenProvider | undefined {
    const provider = this.activeProviders.get(id);
    if (provider && this.getProviderPlatform(id) === 'qwen') {
      return provider as QwenProvider;
    }
    return undefined;
  }

  /**
   * Obtém a plataforma de um provider
   */
  private getProviderPlatform(id: string): ProviderPlatform | undefined {
    const providers = this.loadProviders();
    const config = providers.find(p => p.id === id);
    return config?.platform;
  }
}

// Singleton do manager
let providerManagerInstance: ProviderManager | null = null;

export function getProviderManager(): ProviderManager {
  if (!providerManagerInstance) {
    providerManagerInstance = new ProviderManager();
  }
  return providerManagerInstance;
}

// Re-exportar tipos e funções úteis
export { GeminiProvider, createGeminiProvider } from './GeminiProvider';
export { OpenAIProvider, createOpenAIProvider } from './OpenAIProvider';
export { QwenProvider, createQwenProvider } from './QwenProvider';
