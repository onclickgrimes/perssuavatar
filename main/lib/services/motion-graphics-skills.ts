import fs from 'fs';
import path from 'path';

export type MotionGraphicsSkillId = string;
export type MotionGraphicsSkillKind = 'skill';
export type MotionGraphicsSkillSource = 'builtin' | 'imported';

export interface MotionGraphicsSkillLibraryRoots {
  builtInPackagesDir: string;
  importedPackagesDir: string;
}

export interface MotionGraphicsSkillListItem {
  id: MotionGraphicsSkillId;
  slug: string;
  title: string;
  description?: string;
  kind: MotionGraphicsSkillKind;
  packageId: string;
  packageName: string;
  source: MotionGraphicsSkillSource;
  tags: string[];
  hasAssets: boolean;
}

export interface MotionGraphicsSkillImportResult {
  success: boolean;
  packageId?: string;
  packageName?: string;
  importedFileCount?: number;
  importedSkillCount?: number;
  skills?: MotionGraphicsSkillListItem[];
  error?: string;
}

interface MotionGraphicsSkillManifestEntry {
  id: string;
  title: string;
  description?: string;
  kind: MotionGraphicsSkillKind;
  entryFile: string;
  tags?: string[];
}

interface MotionGraphicsSkillPackageManifest {
  packageId: string;
  packageName: string;
  skills: MotionGraphicsSkillManifestEntry[];
}

interface MotionGraphicsResolvedSkill extends MotionGraphicsSkillListItem {
  entryFilePath: string;
  entryRelativePath: string;
  packageDir: string;
  keywords: string[];
}

const MAX_SELECTED_SKILLS = 6;
const MANIFEST_FILE_NAME = 'manifest.json';

const TEXT_FILE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.scss',
  '.less',
  '.svg',
  '.html',
]);

const SCAN_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.github',
  '.idea',
  '.vscode',
  'node_modules',
  'dist',
  'build',
  '.next',
]);

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const sanitizeSlug = (value: string): string => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
};

const prettifyLabel = (value: string): string => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return 'Skill';
  }

  return normalized
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_/]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const stripQuotes = (value: string): string => value.replace(/^['"]|['"]$/g, '').trim();

const ensureDirectory = (directoryPath: string): void => {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
};

const isDirectoryInsideRoot = (rootDir: string, candidateDir: string): boolean => {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedCandidate = path.resolve(candidateDir);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
};

const resolveRelativePathWithin = (baseDir: string, relativePath: string): string | null => {
  const resolved = path.resolve(baseDir, relativePath);
  return isDirectoryInsideRoot(baseDir, resolved) ? resolved : null;
};

const getFilesRecursive = (directoryPath: string, predicate: (absolutePath: string) => boolean): string[] => {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  const queue = [path.resolve(directoryPath)];
  const files: string[] = [];

  while (queue.length > 0) {
    const currentPath = queue.shift() as string;
    let entries: fs.Dirent[] = [];

    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.forEach((entry) => {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!SCAN_EXCLUDED_DIRECTORIES.has(entry.name)) {
          queue.push(absolutePath);
        }
        return;
      }

      if (predicate(absolutePath)) {
        files.push(absolutePath);
      }
    });
  }

  return files;
};

const extractFrontmatter = (content: string): { frontmatter: string; body: string } => {
  const normalized = String(content || '');
  if (!normalized.startsWith('---')) {
    return { frontmatter: '', body: normalized };
  }

  const matched = normalized.match(/^---\s*[\r\n]+([\s\S]*?)\r?\n---\s*[\r\n]?([\s\S]*)$/);
  if (!matched) {
    return { frontmatter: '', body: normalized };
  }

  return {
    frontmatter: matched[1].trim(),
    body: matched[2],
  };
};

const parseFrontmatter = (content: string): { name?: string; description?: string; tags: string[] } => {
  const { frontmatter } = extractFrontmatter(content);
  if (!frontmatter) {
    return { tags: [] };
  }

  const lines = frontmatter.split(/\r?\n/);
  let name: string | undefined;
  let description: string | undefined;
  const tags = new Set<string>();

  const collectInlineTags = (value: string) => {
    value
      .split(',')
      .map((item) => sanitizeSlug(stripQuotes(item)))
      .filter(Boolean)
      .forEach((tag) => tags.add(tag));
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmedLine = rawLine.trim();

    if (!trimmedLine) {
      continue;
    }

    if (!name && trimmedLine.startsWith('name:')) {
      name = stripQuotes(trimmedLine.slice('name:'.length));
      continue;
    }

    if (!description && trimmedLine.startsWith('description:')) {
      description = stripQuotes(trimmedLine.slice('description:'.length));
      continue;
    }

    if (trimmedLine.startsWith('tags:')) {
      const inlineValue = stripQuotes(trimmedLine.slice('tags:'.length));
      if (inlineValue) {
        collectInlineTags(inlineValue);
      } else {
        while (index + 1 < lines.length) {
          const nextLine = lines[index + 1];
          const nextTrimmed = nextLine.trim();
          if (!nextTrimmed.startsWith('- ')) {
            break;
          }
          tags.add(sanitizeSlug(stripQuotes(nextTrimmed.slice(2))));
          index += 1;
        }
      }
      continue;
    }
  }

  return {
    name: name ? normalizeWhitespace(name) : undefined,
    description: description ? normalizeWhitespace(description) : undefined,
    tags: Array.from(tags).filter(Boolean),
  };
};

const extractReferencedRelativeFiles = (markdownBody: string): string[] => {
  const references = new Set<string>();
  const normalized = String(markdownBody || '');

  for (const match of normalized.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
    const candidate = String(match[1] || '').trim();
    if (
      candidate
      && !candidate.startsWith('http://')
      && !candidate.startsWith('https://')
      && !candidate.startsWith('#')
      && !candidate.startsWith('mailto:')
    ) {
      references.add(candidate);
    }
  }

  return Array.from(references);
};

const fileHasAssets = (packageDir: string, entryFilePath: string): boolean => {
  const extension = path.extname(entryFilePath).toLowerCase();
  if (extension !== '.md' || !fs.existsSync(entryFilePath)) {
    return false;
  }

  const markdown = fs.readFileSync(entryFilePath, 'utf8');
  const { body } = extractFrontmatter(markdown);
  return extractReferencedRelativeFiles(body)
    .some((relativePath) => {
      const resolved = resolveRelativePathWithin(packageDir, relativePath);
      return Boolean(resolved && fs.existsSync(resolved));
    });
};

const buildUniqueSkillId = (packageId: string, rawSkillId: string): MotionGraphicsSkillId => {
  const normalizedSkillId = sanitizeSlug(rawSkillId) || 'skill';
  return packageId === 'defaults'
    ? normalizedSkillId
    : `${packageId}/${normalizedSkillId}`;
};

const deriveKeywords = (skill: {
  slug: string;
  title: string;
  description?: string;
  tags: string[];
}): string[] => {
  const tokens = new Set<string>();
  const addToken = (value: string) => {
    String(value || '')
      .split(/[\s,./:_-]+/)
      .map((part) => sanitizeSlug(part))
      .filter(Boolean)
      .forEach((part) => tokens.add(part));
  };

  addToken(skill.slug);
  addToken(skill.title);
  addToken(skill.description || '');
  skill.tags.forEach(addToken);

  return Array.from(tokens);
};

const toResolvedSkill = (
  packageDir: string,
  source: MotionGraphicsSkillSource,
  manifest: MotionGraphicsSkillPackageManifest,
  entry: MotionGraphicsSkillManifestEntry,
): MotionGraphicsResolvedSkill | null => {
  const packageId = sanitizeSlug(manifest.packageId) || sanitizeSlug(path.basename(packageDir)) || 'package';
  const slug = sanitizeSlug(entry.id) || sanitizeSlug(entry.title) || 'skill';
  const entryRelativePath = String(entry.entryFile || '').trim();
  if (!entryRelativePath) {
    return null;
  }

  const entryFilePath = resolveRelativePathWithin(packageDir, entryRelativePath);
  if (!entryFilePath || !fs.existsSync(entryFilePath)) {
    return null;
  }

  if (path.extname(entryFilePath).toLowerCase() !== '.md') {
    return null;
  }

  const tags = Array.from(new Set((entry.tags || []).map((tag) => sanitizeSlug(tag)).filter(Boolean)));
  const title = normalizeWhitespace(String(entry.title || '').trim() || prettifyLabel(slug));
  const description = String(entry.description || '').trim() || undefined;

  return {
    id: buildUniqueSkillId(packageId, slug),
    slug,
    title,
    description,
    kind: 'skill',
    packageId,
    packageName: normalizeWhitespace(String(manifest.packageName || '').trim() || prettifyLabel(packageId)),
    source,
    tags,
    hasAssets: fileHasAssets(packageDir, entryFilePath),
    entryFilePath,
    entryRelativePath,
    packageDir,
    keywords: deriveKeywords({
      slug,
      title,
      description,
      tags,
    }),
  };
};

const readManifest = (packageDir: string): MotionGraphicsSkillPackageManifest | null => {
  const manifestPath = path.join(packageDir, MANIFEST_FILE_NAME);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as MotionGraphicsSkillPackageManifest;
    if (!Array.isArray(parsed?.skills) || parsed.skills.length === 0) {
      return null;
    }

    const normalizedSkills: MotionGraphicsSkillManifestEntry[] = parsed.skills
      .map((entry): MotionGraphicsSkillManifestEntry => ({
        id: String(entry?.id || '').trim(),
        title: String(entry?.title || '').trim(),
        description: String(entry?.description || '').trim() || undefined,
        kind: 'skill',
        entryFile: String(entry?.entryFile || '').trim(),
        tags: Array.isArray(entry?.tags) ? entry.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [],
      }))
      .filter((entry) => entry.id && entry.title && entry.entryFile && path.extname(entry.entryFile).toLowerCase() === '.md');

    return {
      packageId: String(parsed.packageId || '').trim() || sanitizeSlug(path.basename(packageDir)),
      packageName: String(parsed.packageName || '').trim() || prettifyLabel(path.basename(packageDir)),
      skills: normalizedSkills,
    };
  } catch {
    return null;
  }
};

const generateManifestFromDirectory = (packageDir: string): MotionGraphicsSkillPackageManifest | null => {
  const markdownFiles = getFilesRecursive(
    packageDir,
    (absolutePath) => {
      const extension = path.extname(absolutePath).toLowerCase();
      const baseName = path.basename(absolutePath).toLowerCase();
      return extension === '.md'
        && path.basename(absolutePath) !== MANIFEST_FILE_NAME
        && baseName !== 'readme.md'
        && baseName !== 'skill.md';
    },
  );

  const markdownSkills: MotionGraphicsSkillManifestEntry[] = markdownFiles
    .map((absolutePath): MotionGraphicsSkillManifestEntry | null => {
      const relativePath = path.relative(packageDir, absolutePath).replace(/\\/g, '/');
      const content = fs.readFileSync(absolutePath, 'utf8');
      const frontmatter = parseFrontmatter(content);
      const relativeWithoutExtension = relativePath.replace(/\.[^.]+$/, '');
      const slug = sanitizeSlug(frontmatter.name || path.basename(relativeWithoutExtension));
      if (!slug) {
        return null;
      }

      return {
        id: slug,
        title: frontmatter.name || prettifyLabel(path.basename(relativeWithoutExtension)),
        description: frontmatter.description,
        kind: 'skill',
        entryFile: relativePath,
        tags: frontmatter.tags,
      };
    })
    .filter((entry): entry is MotionGraphicsSkillManifestEntry => entry !== null);

  if (markdownSkills.length > 0) {
    return {
      packageId: sanitizeSlug(path.basename(packageDir)) || 'package',
      packageName: prettifyLabel(path.basename(packageDir)),
      skills: markdownSkills,
    };
  }

  return null;
};

const loadPackageSkills = (
  packageDir: string,
  source: MotionGraphicsSkillSource,
): MotionGraphicsResolvedSkill[] => {
  const manifest = readManifest(packageDir) || generateManifestFromDirectory(packageDir);
  if (!manifest) {
    return [];
  }

  return manifest.skills
    .map((entry) => toResolvedSkill(packageDir, source, manifest, entry))
    .filter((skill): skill is MotionGraphicsResolvedSkill => Boolean(skill));
};

const listPackageDirectories = (packagesDir: string): string[] => {
  if (!fs.existsSync(packagesDir)) {
    return [];
  }

  try {
    return fs.readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !SCAN_EXCLUDED_DIRECTORIES.has(entry.name))
      .map((entry) => path.join(packagesDir, entry.name));
  } catch {
    return [];
  }
};

const getResolvedSkillCatalog = (roots: MotionGraphicsSkillLibraryRoots): MotionGraphicsResolvedSkill[] => {
  const builtInSkills = listPackageDirectories(roots.builtInPackagesDir)
    .flatMap((packageDir) => loadPackageSkills(packageDir, 'builtin'));
  const importedSkills = listPackageDirectories(roots.importedPackagesDir)
    .flatMap((packageDir) => loadPackageSkills(packageDir, 'imported'));

  return [...builtInSkills, ...importedSkills]
    .sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === 'builtin' ? -1 : 1;
      }
      if (left.packageName !== right.packageName) {
        return left.packageName.localeCompare(right.packageName, 'pt-BR');
      }
      if (left.kind !== right.kind) {
        return left.kind === 'guidance' ? -1 : 1;
      }
      return left.title.localeCompare(right.title, 'pt-BR');
    });
};

const getCatalogMap = (skills: MotionGraphicsResolvedSkill[]): Map<string, MotionGraphicsResolvedSkill> => {
  return new Map(skills.map((skill) => [skill.id, skill]));
};

const isTextFile = (filePath: string): boolean => TEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());

const wrapAssetContent = (relativePath: string, content: string): string => {
  const extension = path.extname(relativePath).toLowerCase();
  const languageByExtension: Record<string, string> = {
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.js': 'js',
    '.jsx': 'jsx',
    '.json': 'json',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.md': 'md',
    '.svg': 'svg',
    '.html': 'html',
  };
  const language = languageByExtension[extension] || '';

  return [
    `### Asset: ${relativePath.replace(/\\/g, '/')}`,
    '',
    language ? `\`\`\`${language}` : '```',
    content.trim(),
    '```',
  ].join('\n');
};

const loadSkillSection = (skill: MotionGraphicsResolvedSkill): string => {
  if (!fs.existsSync(skill.entryFilePath)) {
    return '';
  }

  const fileContent = fs.readFileSync(skill.entryFilePath, 'utf8');
  const { body } = extractFrontmatter(fileContent);
  const markdownBody = String(body || '').trim();
  if (!markdownBody) {
    return '';
  }

  const assetSections = extractReferencedRelativeFiles(markdownBody)
    .map((relativePath) => {
      const resolved = resolveRelativePathWithin(skill.packageDir, relativePath);
      if (!resolved || !fs.existsSync(resolved) || !isTextFile(resolved)) {
        return '';
      }

      try {
        const assetContent = fs.readFileSync(resolved, 'utf8');
        return wrapAssetContent(relativePath, assetContent);
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  return [
    markdownBody,
    ...assetSections,
  ].filter(Boolean).join('\n\n');
};

const toPublicSkillListItem = (skill: MotionGraphicsResolvedSkill): MotionGraphicsSkillListItem => ({
  id: skill.id,
  slug: skill.slug,
  title: skill.title,
  description: skill.description,
  kind: skill.kind,
  packageId: skill.packageId,
  packageName: skill.packageName,
  source: skill.source,
  tags: skill.tags,
  hasAssets: skill.hasAssets,
});

const countFilesRecursive = (directoryPath: string): number => {
  return getFilesRecursive(directoryPath, () => true).length;
};

const buildImportManifest = (
  sourceDir: string,
  packageId: string,
  packageName: string,
): MotionGraphicsSkillPackageManifest | null => {
  const manifest = readManifest(sourceDir) || generateManifestFromDirectory(sourceDir);
  if (!manifest) {
    return null;
  }

  const normalizedSkills: MotionGraphicsSkillManifestEntry[] = manifest.skills
    .map((skill): MotionGraphicsSkillManifestEntry => ({
      id: sanitizeSlug(skill.id) || sanitizeSlug(skill.title) || 'skill',
      title: normalizeWhitespace(String(skill.title || '').trim() || prettifyLabel(skill.id)),
      description: String(skill.description || '').trim() || undefined,
      kind: 'skill',
      entryFile: String(skill.entryFile || '').trim().replace(/\\/g, '/'),
      tags: Array.isArray(skill.tags) ? skill.tags.map((tag) => sanitizeSlug(tag)).filter(Boolean) : [],
    }))
    .filter((skill) => skill.id && skill.entryFile && path.extname(skill.entryFile).toLowerCase() === '.md');

  return {
    packageId,
    packageName,
    skills: normalizedSkills,
  };
};

export const listMotionGraphicsSkills = (
  roots: MotionGraphicsSkillLibraryRoots,
): MotionGraphicsSkillListItem[] => {
  return getResolvedSkillCatalog(roots).map(toPublicSkillListItem);
};

export const buildMotionGraphicsSkillDetectionPrompt = (
  skills: MotionGraphicsSkillListItem[],
): string => {
  if (!Array.isArray(skills) || skills.length === 0) {
    return [
      'Classify the motion graphics request into all applicable skill ids.',
      'Return JSON only as {"skills":[]}.',
      'No skill catalog is available, so always return an empty array.',
    ].join('\n');
  }

  const catalogLines = skills.map((skill) => {
    const tags = skill.tags.slice(0, 10).join(', ');
    const description = String(skill.description || '').trim();
    return [
      `- ${skill.id}`,
      `title: ${skill.title}`,
      `kind: ${skill.kind}`,
      description ? `description: ${description}` : '',
      tags ? `tags: ${tags}` : '',
    ].filter(Boolean).join(' | ');
  });

  return [
    'Classify the motion graphics request into all applicable skill ids.',
    'Return JSON only as {"skills":["skill-id"]}.',
    'Only use ids from this catalog:',
    ...catalogLines,
    '',
    'Rules:',
    '- A request may match multiple skills.',
    '- If the request is a follow-up edit, infer the domain from CURRENT_CODE when useful.',
    '- Return an empty array if nothing is clearly relevant.',
  ].join('\n');
};

export const normalizeMotionGraphicsSkillSelection = (
  candidateSkills: unknown[],
  availableSkills: MotionGraphicsSkillListItem[],
): MotionGraphicsSkillId[] => {
  const allowedIds = new Set((availableSkills || []).map((skill) => skill.id));
  const skillKindById = new Map((availableSkills || []).map((skill) => [skill.id, skill.kind]));
  const orderedCandidates = Array.isArray(candidateSkills) ? candidateSkills : [];
  const normalizedIds = orderedCandidates
    .map((skill) => String(skill || '').trim())
    .filter((skill) => allowedIds.has(skill));

  const uniqueIds = Array.from(new Set(normalizedIds))
    .filter((skillId) => skillKindById.get(skillId) === 'skill')
    .slice(0, MAX_SELECTED_SKILLS);

  return uniqueIds;
};

export const getMotionGraphicsSkillDisplayName = (
  skillId: MotionGraphicsSkillId,
  availableSkills?: MotionGraphicsSkillListItem[],
): string => {
  const matchedSkill = (availableSkills || []).find((skill) => skill.id === skillId);
  if (matchedSkill) {
    return matchedSkill.title;
  }

  const fallbackId = String(skillId || '').split('/').pop() || String(skillId || '');
  return prettifyLabel(fallbackId);
};

export const loadMotionGraphicsSkillContent = (
  roots: MotionGraphicsSkillLibraryRoots,
  skills: MotionGraphicsSkillId[],
): string => {
  const catalog = getResolvedSkillCatalog(roots);
  const normalizedSkills = normalizeMotionGraphicsSkillSelection(skills, catalog.map(toPublicSkillListItem));
  if (normalizedSkills.length === 0) {
    return '';
  }

  const catalogMap = getCatalogMap(catalog);
  return normalizedSkills
    .map((skillId) => loadSkillSection(catalogMap.get(skillId) as MotionGraphicsResolvedSkill))
    .filter((section) => section.length > 0)
    .join('\n\n---\n\n');
};

export const detectMotionGraphicsSkillsHeuristically = (
  input: {
    prompt: string;
    currentCode?: string;
    selectedRatio?: string;
  },
  availableSkills: MotionGraphicsSkillListItem[],
): MotionGraphicsSkillId[] => {
  const prompt = String(input.prompt || '').toLowerCase();
  const currentCode = String(input.currentCode || '').toLowerCase();
  const selectedRatio = String(input.selectedRatio || '').trim();
  const haystack = `${prompt}\n${currentCode}`;

  const rankedSkills = availableSkills
    .map((skill) => {
      let score = 0;
      const keywords = Array.from(new Set([
        skill.slug,
        ...skill.tags,
        ...skill.title.toLowerCase().split(/[\s/-]+/),
      ].map((value) => sanitizeSlug(value)).filter(Boolean)));

      keywords.forEach((keyword) => {
        if (haystack.includes(keyword)) {
          score += keyword.length > 5 ? 2 : 1;
        }
      });

      if (skill.description && haystack.includes(String(skill.description).toLowerCase().slice(0, 24))) {
        score += 1;
      }

      if ((selectedRatio === '9:16' || selectedRatio === '4:5' || selectedRatio === '3:4')) {
        if (skill.tags.some((tag) => ['social-media', 'social', 'vertical', 'story', 'stories', 'reels', 'tiktok', 'shorts'].includes(tag))) {
          score += 1;
        }
      }

      return { skillId: skill.id, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.skillId);

  return normalizeMotionGraphicsSkillSelection(rankedSkills, availableSkills);
};

export const importMotionGraphicsSkillPackage = (
  roots: MotionGraphicsSkillLibraryRoots,
  sourceDirectoryPath: string,
): MotionGraphicsSkillImportResult => {
  const sourceDir = path.resolve(String(sourceDirectoryPath || '').trim());
  if (!sourceDir || !fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    return {
      success: false,
      error: 'Diretório de skill inválido.',
    };
  }

  ensureDirectory(roots.importedPackagesDir);

  const sourceManifest = readManifest(sourceDir) || generateManifestFromDirectory(sourceDir);
  if (!sourceManifest || !Array.isArray(sourceManifest.skills) || sourceManifest.skills.length === 0) {
    return {
      success: false,
      error: 'Nenhuma skill compatível foi encontrada na pasta selecionada.',
    };
  }

  let packageId = sanitizeSlug(sourceManifest.packageId) || sanitizeSlug(path.basename(sourceDir)) || `imported-skill-${Date.now()}`;
  if (packageId === 'defaults') {
    packageId = `imported-${packageId}`;
  }
  const packageName = normalizeWhitespace(String(sourceManifest.packageName || '').trim() || prettifyLabel(packageId));

  const destinationDir = path.join(roots.importedPackagesDir, packageId);
  if (!isDirectoryInsideRoot(roots.importedPackagesDir, destinationDir)) {
    return {
      success: false,
      error: 'Destino da importação inválido.',
    };
  }

  if (fs.existsSync(destinationDir)) {
    fs.rmSync(destinationDir, { recursive: true, force: true });
  }

  fs.cpSync(sourceDir, destinationDir, {
    recursive: true,
    force: true,
    filter: (src) => {
      const baseName = path.basename(src);
      return !SCAN_EXCLUDED_DIRECTORIES.has(baseName);
    },
  });

  const importManifest = buildImportManifest(destinationDir, packageId, packageName);
  if (!importManifest) {
    return {
      success: false,
      error: 'A pasta importada não gerou um catálogo de skills válido.',
    };
  }

  fs.writeFileSync(
    path.join(destinationDir, MANIFEST_FILE_NAME),
    JSON.stringify(importManifest, null, 2),
  );

  const importedSkills = loadPackageSkills(destinationDir, 'imported').map(toPublicSkillListItem);

  return {
    success: true,
    packageId,
    packageName,
    importedFileCount: countFilesRecursive(destinationDir),
    importedSkillCount: importedSkills.length,
    skills: importedSkills,
  };
};
