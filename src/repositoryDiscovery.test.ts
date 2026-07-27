import * as fs from 'fs';
import * as path from 'path';
import { discoverRepository, RepositoryIndex } from './repositoryDiscovery';

describe('Repository Discovery', () => {
  const testRoot = path.join(__dirname, 'testRepo');

  beforeAll(() => {
    // Setup a fake local repo structure
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot);
    }
    fs.writeFileSync(path.join(testRoot, 'package.json'), '{}');
    fs.mkdirSync(path.join(testRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testRoot, 'src', 'orchestrator.ts'), '');
    fs.writeFileSync(path.join(testRoot, 'src', 'tool.ts'), '');
    fs.mkdirSync(path.join(testRoot, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(testRoot, 'node_modules', 'ignored.js'), '');
  });

  afterAll(() => {
    // Cleanup
    function rmDir(dir: string) {
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir)) {
          const curPath = path.join(dir, file);
          if (fs.lstatSync(curPath).isDirectory()) {
            rmDir(curPath);
          } else {
            fs.unlinkSync(curPath);
          }
        }
        fs.rmdirSync(dir);
      }
    }
    rmDir(testRoot);
  });

  test('GitHub search succeeds', async () => {
    const result = await discoverRepository(true);
    expect(result.blocked).toBe(false);
    expect(result.diagnostics).toContain('GitHub search available');
  });

  test('GitHub search fails and local repo exists', async () => {
    // Temporarily change cwd to testRoot
    const originalCwd = process.cwd();
    process.chdir(testRoot);
    const result = await discoverRepository(false, new Error('GitHub API search handler is not configured'));
    expect(result.blocked).toBe(false);
    expect(result.diagnostics).toContain('GitHub search failed');
    expect(result.diagnostics).toContain('Local repository detected');
    expect(result.index).toBeDefined();
    expect(result.index?.orchestrators.length).toBeGreaterThan(0);
    expect(result.index?.tools.length).toBeGreaterThan(0);
    process.chdir(originalCwd);
  });

  test('GitHub search fails and no local repo exists', async () => {
    const originalCwd = process.cwd();
    process.chdir('/tmp');
    const result = await discoverRepository(false, new Error('GitHub API search handler is not configured'));
    expect(result.blocked).toBe(true);
    expect(result.diagnostics).toContain('GitHub search failed');
    expect(result.diagnostics).toContain('No local repository detected');
    process.chdir(originalCwd);
  });

  test('Ignored folders are skipped', async () => {
    const originalCwd = process.cwd();
    process.chdir(testRoot);
    const result = await discoverRepository(false, new Error('GitHub API search handler is not configured'));
    expect(result.index).toBeDefined();
    expect(result.index?.indexedFileCount).toBeGreaterThan(0);
    // node_modules should be ignored
    expect(result.index?.tools.some(f => f.includes('node_modules'))).toBe(false);
    process.chdir(originalCwd);
  });

  test('Key files categorized correctly', async () => {
    const originalCwd = process.cwd();
    process.chdir(testRoot);
    const result = await discoverRepository(false, new Error('GitHub API search handler is not configured'));
    expect(result.index).toBeDefined();
    expect(result.index?.orchestrators.some(f => f.includes('orchestrator.ts'))).toBe(true);
    expect(result.index?.tools.some(f => f.includes('tool.ts'))).toBe(true);
    process.chdir(originalCwd);
  });
});
