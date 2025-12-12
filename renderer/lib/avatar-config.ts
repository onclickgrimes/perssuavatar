
export type AvatarMood = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'embarrassed' | 'cry' | 'excited' | 'yandere';
export type AvatarGesture = 'idle' | 'wave' | 'nod' | 'shake_head' | 'clap' | 'think' | 'look_around' | 'tilt_head_left' | 'tilt_head_right' | 'ears_twitch' | 'tongue_out' | 'cheek_puff' | 'ahoge_bounce';

interface Live2DModelConfig {
  moods: Record<AvatarMood, ModelAction>;
  gestures: Record<AvatarGesture, ModelAction>;
}

type ModelAction = 
  | { type: 'motion', group: string, index: number }
  | { type: 'expression', name: string }
  | { type: 'parameter', id: string, value: number | number[], duration?: number };

export const AVATAR_CONFIG: Record<string, Live2DModelConfig> = {
  'Haru': {
    moods: {
      neutral: { type: 'expression', name: 'F01' },
      happy: { type: 'expression', name: 'F01' },
      sad: { type: 'expression', name: 'F02' },
      angry: { type: 'expression', name: 'F03' },
      surprised: { type: 'expression', name: 'F04' },
      embarrassed: { type: 'expression', name: 'F05' },
      cry: { type: 'expression', name: 'F02' },
      excited: { type: 'expression', name: 'F01' },
      yandere: { type: 'expression', name: 'F03' }, // Placeholder
    },
    gestures: {
      idle: { type: 'motion', group: 'Idle', index: 0 },
      wave: { type: 'motion', group: 'TapBody', index: 0 },
      nod: { type: 'motion', group: 'TapBody', index: 1 },
      shake_head: { type: 'motion', group: 'TapBody', index: 2 },
      clap: { type: 'motion', group: 'TapBody', index: 3 },
      think: { type: 'motion', group: 'TapBody', index: 0 },
      look_around: { type: 'motion', group: 'TapBody', index: 0 },
      tilt_head_left: { type: 'motion', group: 'TapBody', index: 0 },
      tilt_head_right: { type: 'motion', group: 'TapBody', index: 0 },
      ears_twitch: { type: 'expression', name: 'F01' }, // Placeholder
      tongue_out: { type: 'expression', name: 'F01' }, // Placeholder 
      cheek_puff: { type: 'expression', name: 'F01' }, // Placeholder
      ahoge_bounce: { type: 'expression', name: 'F01' }, // Placeholder
    }
  },
  'Yuki': {
    moods: {
      neutral: { type: 'parameter', id: 'BlackFace', value: 0 },
      happy: { type: 'parameter', id: 'HeartEye', value: 1 },
      sad: { type: 'parameter', id: 'Cry', value: 1 },
      angry: { type: 'parameter', id: 'BlackFace', value: 1 },
      surprised: { type: 'parameter', id: 'ParamEyeExpression1', value: 1 },
      embarrassed: { type: 'parameter', id: 'Corar', value: 1 },
      cry: { type: 'parameter', id: 'Cry', value: 1 },
      excited: { type: 'parameter', id: 'ParamEyeExpression2', value: 1 },
      yandere: { type: 'parameter', id: 'BlackFace', value: 1 },
    },
    gestures: {
      idle: { type: 'parameter', id: 'ParamCheekPuff', value: 0 },
      wave: { type: 'parameter', id: 'ParamBodyAngleZ', value: [0, 10, -10, 10, 0], duration: 1500 }, 
      nod: { type: 'parameter', id: 'ParamAngleY', value: [0, 20, 0, 20, 0], duration: 1000 },
      shake_head: { type: 'parameter', id: 'ParamAngleX', value: [0, 20, -20, 20, -20, 0], duration: 1000 },
      clap: { type: 'parameter', id: 'MouthPucker', value: [0, 1, 0, 1], duration: 500 },
      think: { type: 'parameter', id: 'ParamCheekPuff', value: [0, 1, 1, 1, 0], duration: 2000 },
      look_around: { type: 'parameter', id: 'ParamAngleX', value: [0, 15, -15, 0], duration: 2000 },
      tilt_head_left: { type: 'parameter', id: 'ParamAngleZ', value: [0, -15, 0], duration: 1000 },
      tilt_head_right: { type: 'parameter', id: 'ParamAngleZ', value: [0, 15, 0], duration: 1000 },
      ears_twitch: { type: 'parameter', id: 'ParamAngleZ', value: 0 }, // No-op
      tongue_out: { type: 'parameter', id: 'ParamAngleZ', value: 0 }, // No-op
      cheek_puff: { type: 'parameter', id: 'ParamCheekPuff', value: 1 }, 
      ahoge_bounce: { type: 'parameter', id: 'ParamAngleY', value: [0, 10, 0], duration: 500 }, // Head bounce instead
    }
  },
  'DevilYuki': {
    moods: {
      neutral: { type: 'parameter', id: 'ParamSwitch4', value: 0 },
      happy: { type: 'expression', name: 'HeartEyes' },
      sad: { type: 'expression', name: 'Tears' },
      angry: { type: 'expression', name: 'Angry' },
      surprised: { type: 'expression', name: 'WhiteEyes' },
      embarrassed: { type: 'expression', name: 'Blush' },
      cry: { type: 'expression', name: 'Tears' },
      excited: { type: 'expression', name: 'StarEyes' },
      yandere: { type: 'expression', name: 'BlackFace' }, // Often accompanied by Blood expression manually if needed
    },
    gestures: {
      idle: { type: 'parameter', id: 'ParamCheekPuff', value: 0 },
      // Wave uses Right Hand Switch (ParamSwitch10) + Body Swing
      wave: { type: 'parameter', id: 'ParamSwitch10', value: [0, 1, 1, 1, 0], duration: 2000 }, 
      nod: { type: 'parameter', id: 'ParamAngleY', value: [0, 20, 0, 20, 0], duration: 1000 },
      shake_head: { type: 'parameter', id: 'ParamAngleX', value: [0, 20, -20, 20, -20, 0], duration: 1000 },
      clap: { type: 'parameter', id: 'ParamSwitch10', value: [0, 1, 0, 1], duration: 500 },
      think: { type: 'parameter', id: 'ParamMouthX2', value: [0, 1, 1, 1, 0], duration: 2000 },
      look_around: { type: 'parameter', id: 'ParamAngleX', value: [0, 30, -30, 0], duration: 2000 },
      tilt_head_left: { type: 'parameter', id: 'ParamAngleZ', value: [0, -20, 0], duration: 1000 },
      tilt_head_right: { type: 'parameter', id: 'ParamAngleZ', value: [0, 20, 0], duration: 1000 },
      ears_twitch: { type: 'parameter', id: 'Ear_SR1', value: [0, 1, -1, 1, 0], duration: 800 },
      tongue_out: { type: 'parameter', id: 'ParamTongueOut', value: [0, 1, 1, 0], duration: 2000 },
      cheek_puff: { type: 'parameter', id: 'ParamCheekPuff', value: [0, 1, 1, 0], duration: 2000 },
      ahoge_bounce: { type: 'parameter', id: 'SillyHair_SY1', value: [0, 1, -1, 0], duration: 600 }
    }
  }
};
