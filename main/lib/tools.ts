import { ChatCompletionTool } from "openai/resources/chat/completions";
import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

/**
 * ========================================
 * FORMATO UNIFICADO DE TOOLS
 * ========================================
 * Define todas as tools em um único lugar.
 * Os conversores abaixo transformam automaticamente
 * para o formato específico de cada provedor.
 */

// Tipos do formato unificado
export type UnifiedPropertyType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface UnifiedProperty {
  type: UnifiedPropertyType;
  description?: string;
  enum?: string[];
  items?: UnifiedProperty; // Para arrays
  properties?: Record<string, UnifiedProperty>; // Para objetos aninhados
  required?: string[]; // Para objetos aninhados
}

export interface UnifiedTool {
  name: string;
  description: string;
  parameters: {
    properties: Record<string, UnifiedProperty>;
    required?: string[];
  };
}

/**
 * ========================================
 * DEFINIÇÃO ÚNICA DE TODAS AS TOOLS
 * ========================================
 * Adicione ou modifique tools APENAS aqui!
 */
export const UNIFIED_TOOLS: UnifiedTool[] = [
  {
    name: "get_horoscope",
    description: "Get today's horoscope for an astrological sign.",
    parameters: {
      properties: {
        sign: {
          type: "string",
          description: "An astrological sign like Taurus or Aquarius",
        },
      },
      required: ["sign"],
    },
  },
  {
    name: "save_screen_recording",
    description: "Save a screen recording of the last X seconds or minutes. The screen is being continuously recorded in the background, and this function saves a clip of the specified duration. Use when the user asks to 'save the last 30 seconds', 'record/gravar the last 5 minutes', 'save what just happened', etc. WAIT for the function response before confirming to the user that you saved it.",
    parameters: {
      properties: {
        duration_seconds: {
          type: "number",
          description: "The number of seconds to save from the recording buffer. For example: 30 for 30 seconds, 60 for 1 minute, 300 for 5 minutes. Maximum is 600 seconds (10 minutes).",
        },
      },
      required: ["duration_seconds"],
    },
  },
  {
    name: "take_screenshot",
    description: "Take a static SCREENSHOT (image) of the current screen. Use this when the user asks to 'look at the screen', 'what is on the screen', 'analyze this image', 'tira print da tela', 'take a print', 'take a print of the screen', 'take a screenshot' or simply 'look'. IMPORTANT: You MUST call this function first and WAIT for the function response with the screenshot analysis before confirming or describing anything to the user. Do NOT say you took the screenshot until you receive the analysis result.",
    parameters: {
      properties: {},
      required: [],
    },
  },
  {
    name: "share_screenshot",
    description: "Share or send the most recent screenshot to one or more platforms: WhatsApp, Email, or Google Drive. Use this when the user asks to 'send this to WhatsApp', 'email this screenshot', 'save to Drive', 'send to WhatsApp and Drive', or similar sharing requests. You CAN send to MULTIPLE platforms at once by providing an array with multiple values. WAIT for the function response before confirming the share was successful.",
    parameters: {
      properties: {
        platforms: {
          type: "array",
          items: {
            type: "string",
            enum: ["whatsapp", "email", "drive"],
          },
          description: "Array of platforms to share the screenshot to. Can include one or multiple: 'whatsapp' for WhatsApp Web, 'email' for default email client, 'drive' for Google Drive. Example: ['drive', 'whatsapp'] to send to both.",
        },
        recipient: {
          type: "string",
          description: "Optional. The recipient's contact (phone number for WhatsApp, email address for email). Not needed for Drive.",
        },
        message: {
          type: "string",
          description: "Optional. A message to include with the screenshot.",
        },
      },
      required: ["platforms"],
    },
  },
];

/**
 * Tools específicas do Gemini Live
 * (mantidas separadas pois têm funcionalidades únicas do modo Live)
 */
export const UNIFIED_LIVE_TOOLS: UnifiedTool[] = [
  {
    name: "control_screen_share",
    description: "Start or stop REAL-TIME SCREEN SHARING so you can see the user's screen continuously. Use 'start' when the user asks you to 'look at the screen', 'watch', 'observe', 'see what I'm doing', or wants you to have continuous visual access. Use 'stop' when they want you to stop watching. WAIT for the function response before confirming the action to the user.",
    parameters: {
      properties: {
        action: {
          type: "string",
          enum: ["start", "stop"],
          description: "The action to perform: 'start' to begin watching the screen in real-time, 'stop' to stop watching.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "save_screen_recording",
    description: "Save a screen recording of the last X seconds or minutes. The screen is being continuously recorded in the background, and this function saves a clip of the specified duration. Use when the user asks to 'save the last 30 seconds', 'record/gravar the last 5 minutes', 'save what just happened', etc. WAIT for the function response before confirming to the user that you saved it.",
    parameters: {
      properties: {
        duration_seconds: {
          type: "number",
          description: "The number of seconds to save from the recording buffer. For example: 30 for 30 seconds, 60 for 1 minute, 300 for 5 minutes. Maximum is 600 seconds (10 minutes).",
        },
      },
      required: ["duration_seconds"],
    },
  },
  {
    name: "take_screenshot",
    description: "Take a static SCREENSHOT (image) of the current screen. Use this when the user asks to 'analyze this image', 'take a print', 'tira um print da tela', 'take a print of the screen', 'take a screenshot' or simply 'look'. IMPORTANT: You MUST call this function first and WAIT for the function response with the screenshot data before confirming or describing anything to the user. Do NOT say you took the screenshot until you receive the function response with success status.",
    parameters: {
      properties: {},
      required: [],
    },
  },
  {
    name: "share_screenshot",
    description: "Share or send the most recent screenshot to one or more platforms: WhatsApp, Email, or Google Drive. Use this when the user asks to 'send this to WhatsApp', 'email this screenshot', 'save to Drive', 'send to WhatsApp and Drive', or similar sharing requests. You CAN send to MULTIPLE platforms at once by providing an array with multiple values. WAIT for the function response before confirming the share was successful.",
    parameters: {
      properties: {
        platforms: {
          type: "array",
          items: {
            type: "string",
            enum: ["whatsapp", "email", "drive"],
          },
          description: "Array of platforms to share the screenshot to. Can include one or multiple: 'whatsapp' for WhatsApp Web, 'email' for default email client, 'drive' for Google Drive. Example: ['drive', 'whatsapp'] to send to both.",
        },
        recipient: {
          type: "string",
          description: "Optional. The recipient's contact (phone number for WhatsApp, email address for email). Not needed for Drive.",
        },
        message: {
          type: "string",
          description: "Optional. A message to include with the screenshot.",
        },
      },
      required: ["platforms"],
    },
  },
];

/**
 * ========================================
 * CONVERSORES AUTOMÁTICOS
 * ========================================
 */

/**
 * Converte uma propriedade unificada para o formato OpenAI
 */
function convertPropertyToOpenAI(prop: UnifiedProperty): any {
  const result: any = {
    type: prop.type,
  };

  if (prop.description) {
    result.description = prop.description;
  }

  if (prop.enum) {
    result.enum = prop.enum;
  }

  if (prop.items) {
    result.items = convertPropertyToOpenAI(prop.items);
  }

  if (prop.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(prop.properties)) {
      result.properties[key] = convertPropertyToOpenAI(value);
    }
  }

  if (prop.required) {
    result.required = prop.required;
  }

  return result;
}

/**
 * Converte uma tool unificada para o formato OpenAI
 */
function convertToOpenAI(tool: UnifiedTool): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(tool.parameters.properties).map(([key, prop]) => [
            key,
            convertPropertyToOpenAI(prop),
          ])
        ),
        required: tool.parameters.required || [],
      },
    },
  };
}

/**
 * Converte um tipo unificado para SchemaType do Gemini
 */
function convertTypeToGemini(type: UnifiedPropertyType): SchemaType {
  const typeMap: Record<UnifiedPropertyType, SchemaType> = {
    string: SchemaType.STRING,
    number: SchemaType.NUMBER,
    boolean: SchemaType.BOOLEAN,
    object: SchemaType.OBJECT,
    array: SchemaType.ARRAY,
  };
  return typeMap[type];
}

/**
 * Converte uma propriedade unificada para o formato Gemini SDK
 */
function convertPropertyToGemini(prop: UnifiedProperty): any {
  const result: any = {
    type: convertTypeToGemini(prop.type),
  };

  if (prop.description) {
    result.description = prop.description;
  }

  if (prop.enum) {
    result.format = 'enum';
    result.enum = prop.enum;
  }

  if (prop.items) {
    result.items = convertPropertyToGemini(prop.items);
  }

  if (prop.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(prop.properties)) {
      result.properties[key] = convertPropertyToGemini(value);
    }
  }

  if (prop.required) {
    result.required = prop.required;
  }

  return result;
}

/**
 * Converte uma tool unificada para o formato Gemini SDK
 */
function convertToGemini(tool: UnifiedTool): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: Object.fromEntries(
        Object.entries(tool.parameters.properties).map(([key, prop]) => [
          key,
          convertPropertyToGemini(prop),
        ])
      ),
      required: tool.parameters.required || [],
    },
  };
}

/**
 * Converte uma propriedade unificada para o formato Gemini Live API
 */
function convertPropertyToGeminiLive(prop: UnifiedProperty): any {
  const result: any = {
    type: prop.type.toUpperCase(),
  };

  if (prop.description) {
    result.description = prop.description;
  }

  if (prop.enum) {
    result.enum = prop.enum;
  }

  if (prop.items) {
    result.items = convertPropertyToGeminiLive(prop.items);
  }

  if (prop.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(prop.properties)) {
      result.properties[key] = convertPropertyToGeminiLive(value);
    }
  }

  if (prop.required) {
    result.required = prop.required;
  }

  return result;
}

/**
 * Converte uma tool unificada para o formato Gemini Live API
 */
function convertToGeminiLive(tool: UnifiedTool): any {
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: "OBJECT",
      properties: Object.fromEntries(
        Object.entries(tool.parameters.properties).map(([key, prop]) => [
          key,
          convertPropertyToGeminiLive(prop),
        ])
      ),
      required: tool.parameters.required || [],
    },
  };
}

/**
 * ========================================
 * EXPORTS PARA CADA PROVEDOR
 * ========================================
 */

// OpenAI format
export const tools: ChatCompletionTool[] = UNIFIED_TOOLS.map(convertToOpenAI);

// Gemini SDK format
export const geminiTools: FunctionDeclaration[] = UNIFIED_TOOLS.map(convertToGemini);

// Gemini Live API format
export const geminiLiveTools = {
  functionDeclarations: UNIFIED_LIVE_TOOLS.map(convertToGeminiLive),
};