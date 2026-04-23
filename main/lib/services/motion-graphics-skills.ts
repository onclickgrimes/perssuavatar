import fs from 'fs';
import path from 'path';

export type MotionGraphicsSkillName =
  | 'charts'
  | 'typography'
  | 'social-media'
  | 'messaging'
  | '3d'
  | 'transitions'
  | 'sequencing'
  | 'spring-physics'
  | 'example-histogram'
  | 'example-progress-bar'
  | 'example-text-rotation'
  | 'example-falling-spheres'
  | 'example-animated-shapes'
  | 'example-lottie'
  | 'example-gold-price-chart'
  | 'example-typewriter-highlight'
  | 'example-word-carousel';

type MotionGraphicsSkillKind = 'guidance' | 'example';

interface MotionGraphicsSkillDefinition {
  id: MotionGraphicsSkillName;
  kind: MotionGraphicsSkillKind;
  title: string;
  templateRelativePath: string;
  keywords: string[];
}

interface HeuristicSkillCandidate {
  skill: MotionGraphicsSkillName;
  score: number;
}

const SKILL_DEFINITIONS: Record<MotionGraphicsSkillName, MotionGraphicsSkillDefinition> = {
  charts: {
    id: 'charts',
    kind: 'guidance',
    title: 'Charts',
    templateRelativePath: 'src/skills/charts.md',
    keywords: ['chart', 'graph', 'histogram', 'bar chart', 'pie chart', 'data', 'metric', 'analytics', 'progress'],
  },
  typography: {
    id: 'typography',
    kind: 'guidance',
    title: 'Typography',
    templateRelativePath: 'src/skills/typography.md',
    keywords: ['typewriter', 'typography', 'text animation', 'headline', 'title', 'kinetic text', 'word', 'caption'],
  },
  'social-media': {
    id: 'social-media',
    kind: 'guidance',
    title: 'Social Media',
    templateRelativePath: 'src/skills/social-media.md',
    keywords: ['instagram', 'story', 'stories', 'reels', 'tiktok', 'shorts', 'social media', 'vertical video', 'post'],
  },
  messaging: {
    id: 'messaging',
    kind: 'guidance',
    title: 'Messaging',
    templateRelativePath: 'src/skills/messaging.md',
    keywords: ['chat', 'message', 'whatsapp', 'imessage', 'messenger', 'dm', 'bubble', 'conversation'],
  },
  '3d': {
    id: '3d',
    kind: 'guidance',
    title: '3D',
    templateRelativePath: 'src/skills/3d.md',
    keywords: ['3d', 'three', 'cube', 'sphere', 'spatial', 'depth'],
  },
  transitions: {
    id: 'transitions',
    kind: 'guidance',
    title: 'Transitions',
    templateRelativePath: 'src/skills/transitions.md',
    keywords: ['transition', 'scene change', 'crossfade', 'wipe', 'fade between', 'slide between'],
  },
  sequencing: {
    id: 'sequencing',
    kind: 'guidance',
    title: 'Sequencing',
    templateRelativePath: 'src/skills/sequencing.md',
    keywords: ['sequence', 'stagger', 'step by step', 'phase', 'one by one', 'timeline'],
  },
  'spring-physics': {
    id: 'spring-physics',
    kind: 'guidance',
    title: 'Spring Physics',
    templateRelativePath: 'src/skills/spring-physics.md',
    keywords: ['spring', 'bouncy', 'bounce', 'elastic', 'organic motion', 'overshoot'],
  },
  'example-histogram': {
    id: 'example-histogram',
    kind: 'example',
    title: 'Example Histogram',
    templateRelativePath: 'src/examples/code/histogram.ts',
    keywords: ['histogram', 'bar chart', 'bars', 'data'],
  },
  'example-progress-bar': {
    id: 'example-progress-bar',
    kind: 'example',
    title: 'Example Progress Bar',
    templateRelativePath: 'src/examples/code/progress-bar.ts',
    keywords: ['progress', 'loading', 'loader', 'percentage'],
  },
  'example-text-rotation': {
    id: 'example-text-rotation',
    kind: 'example',
    title: 'Example Text Rotation',
    templateRelativePath: 'src/examples/code/text-rotation.ts',
    keywords: ['rotating words', 'word rotation', 'headline', 'text rotation'],
  },
  'example-falling-spheres': {
    id: 'example-falling-spheres',
    kind: 'example',
    title: 'Example Falling Spheres',
    templateRelativePath: 'src/examples/code/falling-spheres.ts',
    keywords: ['sphere', '3d', 'physics', 'floating', 'depth'],
  },
  'example-animated-shapes': {
    id: 'example-animated-shapes',
    kind: 'example',
    title: 'Example Animated Shapes',
    templateRelativePath: 'src/examples/code/animated-shapes.ts',
    keywords: ['shape', 'circle', 'triangle', 'star', 'abstract'],
  },
  'example-lottie': {
    id: 'example-lottie',
    kind: 'example',
    title: 'Example Lottie',
    templateRelativePath: 'src/examples/code/lottie-animation.ts',
    keywords: ['lottie', 'json animation'],
  },
  'example-gold-price-chart': {
    id: 'example-gold-price-chart',
    kind: 'example',
    title: 'Example Gold Price Chart',
    templateRelativePath: 'src/examples/code/gold-price-chart.ts',
    keywords: ['price chart', 'finance', 'axis', 'metrics', 'data'],
  },
  'example-typewriter-highlight': {
    id: 'example-typewriter-highlight',
    kind: 'example',
    title: 'Example Typewriter Highlight',
    templateRelativePath: 'src/examples/code/typewriter-highlight.ts',
    keywords: ['typewriter', 'cursor', 'highlight', 'text'],
  },
  'example-word-carousel': {
    id: 'example-word-carousel',
    kind: 'example',
    title: 'Example Word Carousel',
    templateRelativePath: 'src/examples/code/word-carousel.ts',
    keywords: ['carousel', 'word', 'rotating text', 'crossfade'],
  },
};

const GUIDANCE_SKILL_ORDER: MotionGraphicsSkillName[] = [
  'charts',
  'typography',
  'social-media',
  'messaging',
  '3d',
  'transitions',
  'sequencing',
  'spring-physics',
];

const EXAMPLE_SKILL_ORDER: MotionGraphicsSkillName[] = [
  'example-histogram',
  'example-progress-bar',
  'example-text-rotation',
  'example-falling-spheres',
  'example-animated-shapes',
  'example-lottie',
  'example-gold-price-chart',
  'example-typewriter-highlight',
  'example-word-carousel',
];

const skillContentCache = new Map<string, string>();

export const MOTION_GRAPHICS_SKILL_NAMES = [
  ...GUIDANCE_SKILL_ORDER,
  ...EXAMPLE_SKILL_ORDER,
] as MotionGraphicsSkillName[];

export const MOTION_GRAPHICS_SKILL_DETECTION_PROMPT = `Classify the motion graphics request into all applicable skill names.
Return JSON only as {"skills":["skill-name"]}.
Only use these names:
- charts
- typography
- social-media
- messaging
- 3d
- transitions
- sequencing
- spring-physics
- example-histogram
- example-progress-bar
- example-text-rotation
- example-falling-spheres
- example-animated-shapes
- example-lottie
- example-gold-price-chart
- example-typewriter-highlight
- example-word-carousel

Rules:
- A request may match multiple skills.
- Prefer guidance skills for broad domains and example skills for specific patterns.
- If the request is a small follow-up edit, infer the domain from CURRENT_CODE when useful.
- Return an empty array if nothing is clearly relevant.`;

const normalizeExampleCode = (value: string): string => {
  return value
    .replace(/\\`/g, '`')
    .replace(/\\\$\{/g, '${')
    .trim();
};

const extractTemplateLiteral = (fileContent: string): string => {
  const equalIndex = fileContent.indexOf('=`');
  const fallbackEqualIndex = equalIndex >= 0 ? equalIndex : fileContent.indexOf('= `');
  const startTick = fallbackEqualIndex >= 0
    ? fileContent.indexOf('`', fallbackEqualIndex)
    : -1;

  if (startTick < 0) {
    return '';
  }

  let cursor = startTick + 1;
  let escaped = false;
  let output = '';

  while (cursor < fileContent.length) {
    const char = fileContent[cursor];

    if (escaped) {
      output += char;
      escaped = false;
      cursor += 1;
      continue;
    }

    if (char === '\\') {
      output += char;
      escaped = true;
      cursor += 1;
      continue;
    }

    if (char === '`') {
      return normalizeExampleCode(output);
    }

    output += char;
    cursor += 1;
  }

  return '';
};

const makeCacheKey = (templateRoot: string, skill: MotionGraphicsSkillName) => {
  return `${path.resolve(templateRoot)}::${skill}`;
};

export const normalizeMotionGraphicsSkillSelection = (
  candidateSkills: unknown[],
): MotionGraphicsSkillName[] => {
  const orderedCandidates = Array.isArray(candidateSkills) ? candidateSkills : [];
  const normalized = orderedCandidates
    .map((skill) => String(skill || '').trim() as MotionGraphicsSkillName)
    .filter((skill): skill is MotionGraphicsSkillName => MOTION_GRAPHICS_SKILL_NAMES.includes(skill));

  const unique = Array.from(new Set(normalized));
  const guidance = GUIDANCE_SKILL_ORDER.filter((skill) => unique.includes(skill)).slice(0, 4);
  const examples = EXAMPLE_SKILL_ORDER.filter((skill) => unique.includes(skill)).slice(0, 2);
  return [...guidance, ...examples];
};

export const getMotionGraphicsSkillDisplayName = (skill: MotionGraphicsSkillName): string => {
  return SKILL_DEFINITIONS[skill]?.title || skill;
};

export const loadMotionGraphicsSkillContent = (
  templateRoot: string,
  skills: MotionGraphicsSkillName[],
): string => {
  const normalizedSkills = normalizeMotionGraphicsSkillSelection(skills);
  if (!normalizedSkills.length) {
    return '';
  }

  const sections = normalizedSkills
    .map((skill) => {
      const cacheKey = makeCacheKey(templateRoot, skill);
      const cached = skillContentCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      const definition = SKILL_DEFINITIONS[skill];
      const absolutePath = path.resolve(templateRoot, definition.templateRelativePath);
      let section = '';

      if (fs.existsSync(absolutePath)) {
        const fileContent = fs.readFileSync(absolutePath, 'utf8');
        if (definition.kind === 'guidance') {
          section = fileContent.trim();
        } else {
          const exampleCode = extractTemplateLiteral(fileContent);
          section = exampleCode
            ? `## ${definition.title}\n\n\`\`\`tsx\n${exampleCode}\n\`\`\``
            : '';
        }
      }

      skillContentCache.set(cacheKey, section);
      return section;
    })
    .filter((content) => content.length > 0);

  return sections.join('\n\n---\n\n');
};

export const detectMotionGraphicsSkillsHeuristically = (input: {
  prompt: string;
  currentCode?: string;
  selectedRatio?: string;
}): MotionGraphicsSkillName[] => {
  const prompt = String(input.prompt || '').toLowerCase();
  const currentCode = String(input.currentCode || '').toLowerCase();
  const selectedRatio = String(input.selectedRatio || '').trim();
  const haystack = `${prompt}\n${currentCode}`;
  const candidates: HeuristicSkillCandidate[] = [];

  const scoreSkill = (skill: MotionGraphicsSkillName, extraScore: number = 0) => {
    const definition = SKILL_DEFINITIONS[skill];
    let score = extraScore;

    definition.keywords.forEach((keyword) => {
      if (haystack.includes(keyword)) {
        score += 2;
      }
    });

    if (score > 0) {
      candidates.push({ skill, score });
    }
  };

  GUIDANCE_SKILL_ORDER.forEach((skill) => scoreSkill(skill));
  EXAMPLE_SKILL_ORDER.forEach((skill) => scoreSkill(skill, skill.startsWith('example-') ? -1 : 0));

  if (selectedRatio === '9:16' || selectedRatio === '4:5' || selectedRatio === '3:4') {
    scoreSkill('social-media', 1);
  }

  if (haystack.includes('progress') || haystack.includes('loading')) {
    scoreSkill('example-progress-bar', 3);
  }
  if (haystack.includes('typewriter')) {
    scoreSkill('example-typewriter-highlight', 3);
  }
  if (haystack.includes('carousel') || haystack.includes('rotating word')) {
    scoreSkill('example-word-carousel', 3);
  }
  if (haystack.includes('histogram')) {
    scoreSkill('example-histogram', 3);
  }
  if (haystack.includes('gold') || haystack.includes('finance') || haystack.includes('axis')) {
    scoreSkill('example-gold-price-chart', 2);
  }
  if (haystack.includes('lottie')) {
    scoreSkill('example-lottie', 3);
  }
  if (haystack.includes('shape') || haystack.includes('circle') || haystack.includes('triangle')) {
    scoreSkill('example-animated-shapes', 2);
  }
  if (haystack.includes('sphere') || haystack.includes('depth')) {
    scoreSkill('example-falling-spheres', 2);
  }

  const ranked = candidates
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.skill);

  return normalizeMotionGraphicsSkillSelection(ranked);
};
