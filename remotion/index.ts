/**
 * Remotion Entry Point
 * 
 * Este é o ponto de entrada do Remotion.
 * Registra todas as composições disponíveis para renderização.
 * 
 * Para iniciar o Remotion Studio: npx remotion studio remotion/index.ts
 * Para renderizar: npx remotion render remotion/index.ts <CompositionId> output.mp4
 */
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
