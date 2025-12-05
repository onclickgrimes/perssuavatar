import { ChatCompletionTool } from "openai/resources/chat/completions";

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