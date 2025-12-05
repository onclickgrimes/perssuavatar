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
        description: "Start or stop the screen recording based on user request. Use this when the user asks to see the screen, record the screen, stop recording, or analyze the screen.",
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
];