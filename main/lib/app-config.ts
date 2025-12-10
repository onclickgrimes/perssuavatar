import { app } from 'electron';

/**
 * Configuração centralizada do aplicativo
 */

const isProd = process.env.NODE_ENV === 'production';

/**
 * Obtém o nome dinâmico da pasta de desenvolvimento
 */
export const getDevFolderName = (): string => {
  return `${app.getName()} (development)`;
};

/**
 * Obtém o caminho userData configurado para o ambiente atual
 */
export const getUserDataPath = (): string => {
  if (isProd) {
    return app.getPath('userData');
  } else {
    return `${app.getPath('userData')}(development)`;
  }
};

export { isProd };
