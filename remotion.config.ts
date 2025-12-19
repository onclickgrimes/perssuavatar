import { Config } from '@remotion/cli/config';

// Define o diretório público para ser o mesmo do Next.js (renderer/public)
// Isso permite que o Remotion encontre as fontes e outros assets
Config.setPublicDir('./renderer/public');
