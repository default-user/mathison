/**
 * Repo Root Resolution Utility
 * Resolves repository root in monorepo context
 * Fail-closed: throws if root cannot be determined
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve repository root by walking up from cwd
 * Priority:
 * 1. MATHISON_REPO_ROOT env var (if set)
 * 2. Walk upward to find pnpm-workspace.yaml (preferred marker)
 * 3. Walk upward to find .git directory
 * 4. Walk upward to find root package.json with "workspaces"
 *
 * Fail-closed: throws if no marker found
 */
export function resolveRepoRoot(): string {
  // 1. Check env var first
  if (process.env.MATHISON_REPO_ROOT) {
    const envRoot = path.resolve(process.env.MATHISON_REPO_ROOT);
    if (fs.existsSync(envRoot)) {
      return envRoot;
    }
    throw new Error(`MATHISON_REPO_ROOT set but path does not exist: ${envRoot}`);
  }

  // 2. Walk upward to find workspace markers
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    // Check for pnpm-workspace.yaml (most reliable for pnpm monorepos)
    const pnpmWorkspace = path.join(currentDir, 'pnpm-workspace.yaml');
    if (fs.existsSync(pnpmWorkspace)) {
      return currentDir;
    }

    // Check for .git directory
    const gitDir = path.join(currentDir, '.git');
    if (fs.existsSync(gitDir)) {
      return currentDir;
    }

    // Check for root package.json with workspaces field
    const pkgPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) {
          return currentDir;
        }
      } catch {
        // Ignore malformed package.json
      }
    }

    // Move up one level
    currentDir = path.dirname(currentDir);
  }

  // Fail-closed: could not find repo root
  throw new Error(
    'Could not resolve repository root. ' +
    'Set MATHISON_REPO_ROOT env var or run from within a git/pnpm workspace. ' +
    `Searched from: ${process.cwd()}`
  );
}

/**
 * Resolve a path relative to repo root
 * If path is absolute, returns it as-is
 * If path is relative, resolves from repo root
 */
export function resolveFromRepoRoot(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  const repoRoot = resolveRepoRoot();
  return path.join(repoRoot, relativePath);
}
