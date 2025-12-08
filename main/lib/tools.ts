import { ChatCompletionTool } from "openai/resources/chat/completions";
import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

// OpenAI format tools
export const tools: ChatCompletionTool[] = [
  {
      type: "function",
      function: {
        name: "get_horoscope",
        description: "Get today's horoscope for an astrological sign.",
        parameters: {
            type: "object",
            properties: {
                sign: {
                    type: "string",
                    description: "An astrological sign like Taurus or Aquarius",
                },
            },
            required: ["sign"],
        },
      }
  },
  {
      type: "function",
      function: {
        name: "control_screen_recording",
        description: "Start or stop the SCREEN RECORDING (video) based on user request. Use this when the user asks to record a video of the screen, stop recording, or analyze a VIDEO of the screen action over time.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["start", "stop"],
                    description: "The action to perform: 'start' to begin recording/analyzing, 'stop' to end recording.",
                },
            },
            required: ["action"],
        },
      }
  },
  {
      type: "function",
      function: {
        name: "take_screenshot",
        description: "Take a static SCREENSHOT (image) of the current screen. Use this when the user asks to 'look at the screen', 'what is on the screen', 'analyze this image', or simply 'look'.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
      }
  },
];

// Gemini format tools (FunctionDeclaration)
export const geminiTools: FunctionDeclaration[] = [
  {
    name: "get_horoscope",
    description: "Get today's horoscope for an astrological sign.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        sign: {
          type: SchemaType.STRING,
          description: "An astrological sign like Taurus or Aquarius",
        },
      },
      required: ["sign"],
    },
  },
  {
    name: "control_screen_recording",
    description: "Start or stop the SCREEN RECORDING (video) based on user request. Use this when the user asks to record a video of the screen, stop recording, or analyze a VIDEO of the screen action over time.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        action: {
          type: SchemaType.STRING,
          format: 'enum',
          enum: ["start", "stop"],
          description: "The action to perform: 'start' to begin recording/analyzing, 'stop' to end recording.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "take_screenshot",
    description: "Take a static SCREENSHOT (image) of the current screen. Use this when the user asks to 'look at the screen', 'what is on the screen', 'analyze this image', or simply 'look'.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
];

// Gemini Live API format tools (for WebSocket session configuration)
// This format is slightly different from the standard SDK format
export const geminiLiveTools = {
  functionDeclarations: [
    {
      name: "control_screen_share",
      description: "Start or stop REAL-TIME SCREEN SHARING so you can see the user's screen continuously. Use 'start' when the user asks you to 'look at the screen', 'watch', 'observe', 'see what I'm doing', or wants you to have continuous visual access. Use 'stop' when they want you to stop watching.",
      parameters: {
        type: "OBJECT",
        properties: {
          action: {
            type: "STRING",
            enum: ["start", "stop"],
            description: "The action to perform: 'start' to begin watching the screen in real-time, 'stop' to stop watching.",
          },
        },
        required: ["action"],
      },
    },
    {
      name: "control_screen_recording",
      description: "Start or stop SCREEN RECORDING (video) to record what happens on screen over time. Use this when the user explicitly asks to RECORD or GRAVAR the screen.",
      parameters: {
        type: "OBJECT",
        properties: {
          action: {
            type: "STRING",
            enum: ["start", "stop"],
            description: "The action to perform: 'start' to begin recording, 'stop' to end recording.",
          },
        },
        required: ["action"],
      },
    },
    {
      name: "take_screenshot",
      description: "Take a static SCREENSHOT (image) of the current screen. Use this when the user asks to 'look at the screen', 'what is on the screen', 'analyze this image', or simply 'look'.",
      parameters: {
        type: "OBJECT",
        properties: {},
        required: [],
      },
    },
  ],
};