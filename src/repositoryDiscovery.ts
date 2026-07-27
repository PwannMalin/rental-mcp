import * as fs from 'fs';
import * as path from 'path';

export interface RepositoryIndex {
  orchestrators: string[];
  tools: string[];
  memoryStores: string[];
  prompts: string[];
  searchHandlers: string[];
  azureConfig: string[];
  githubActionsWorkflows: string[];
  apiIntegrations: string[];
  packageConfigFiles: string[];
  indexedFileCount: number;
}

const IGNORE_FOLDERS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  'logs'
]);

const REPO_ROOT_MARKERS = [
  '.git',
  'package.json',
  'src',
  'Dockerfile',
  'azure.yaml',
  '.github'
];

function isRepoRoot(dir: string): boolean {
  try {
    for (const marker of REPO_ROOT_MARKERS) {
      if (fs.existsSync(path.join(dir, marker))) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function shouldIgnoreFolder(folderName: string): boolean {
  return IGNORE_FOLDERS.has(folderName);
}

function readFilesRecursively(dir: string, files: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (shouldIgnoreFolder(entry.name)) {
          continue;
        }
        readFilesRecursively(path.join(dir, entry.name), files);
      } else if (entry.isFile()) {
        files.push(path.join(dir, entry.name));
      }
    }
  } catch {
    // ignore errors
  }
  return files;
}

function categorizeFile(filePath: string): keyof RepositoryIndex | null {
  const lower = filePath.toLowerCase();
  if (lower.includes('orchestrator')) return 'orchestrators';
  if (lower.includes('tool')) return 'tools';
  if (lower.includes('memorystore')) return 'memoryStores';
  if (lower.includes('prompt')) return 'prompts';
  if (lower.includes('searchhandler')) return 'searchHandlers';
  if (lower.includes('azure') && (lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.json'))) return 'azureConfig';
  if (lower.includes('.github/workflows')) return 'githubActionsWorkflows';
  if (lower.includes('api') && (lower.endsWith('.ts') || lower.endsWith('.js') || lower.endsWith('.json'))) return 'apiIntegrations';
  if (['package.json', 'package-lock.json', 'tsconfig.json', 'azure.yaml', 'dockerfile'].some(f => lower.endsWith(f))) return 'packageConfigFiles';
  return null;
}

export async function discoverRepository(
  githubSearchAvailable: boolean,
  githubSearchError?: Error
): Promise<{ index?: RepositoryIndex; blocked: boolean; diagnostics: string[] }> {
  const diagnostics: string[] = [];

  if (githubSearchAvailable) {
    diagnostics.push('GitHub search available');
    // Here we would call GitHub search normally (omitted for brevity)
    // Simulate success with empty index for this example
    return { index: {
      orchestrators: [],
      tools: [],
      memoryStores: [],
      prompts: [],
      searchHandlers: [],
      azureConfig: [],
      githubActionsWorkflows: [],
      apiIntegrations: [],
      packageConfigFiles: [],
      indexedFileCount: 0
    }, blocked: false, diagnostics };
  }

  diagnostics.push('GitHub search failed');

  // Check if error is a GitHub API search handler not configured or other GitHub access/search error
  if (githubSearchError) {
    diagnostics.push(`GitHub search error: ${githubSearchError.message}`);
  }

  // Check local repository
  const cwd = process.cwd();
  diagnostics.push(`Checking local repository in ${cwd}`);
  if (!isRepoRoot(cwd)) {
    diagnostics.push('No local repository detected');
    return { blocked: true, diagnostics };
  }

  diagnostics.push('Local repository detected');

  // Recursively index files
  const allFiles = readFilesRecursively(cwd);
  diagnostics.push(`Indexed file count: ${allFiles.length}`);

  const index: RepositoryIndex = {
    orchestrators: [],
    tools: [],
    memoryStores: [],
    prompts: [],
    searchHandlers: [],
    azureConfig: [],
    githubActionsWorkflows: [],
    apiIntegrations: [],
    packageConfigFiles: [],
    indexedFileCount: allFiles.length
  };

  for (const file of allFiles) {
    const category = categorizeFile(file);
    if (category) {
      index[category].push(file);
    }
  }

  diagnostics.push('Architectural review continuing from local files');

  return { index, blocked: false, diagnostics };
}
