import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CLAUDE_PROJECTS_DIR } from '../common/constants';

const homeDir = os.homedir();
const claudeProjectBase = path.join(homeDir, CLAUDE_PROJECTS_DIR);

export function findLatestSessionFile(projectHash?: string): string | null {
  if (!fs.existsSync(claudeProjectBase)) return null;

  let targetDir: string;

  if (projectHash) {
    targetDir = path.join(claudeProjectBase, projectHash);
  } else {
    const dirs = fs
      .readdirSync(claudeProjectBase, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({
        name: d.name,
        mtime: fs.statSync(path.join(claudeProjectBase, d.name)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (dirs.length === 0) return null;
    targetDir = path.join(claudeProjectBase, dirs[0].name);
  }

  if (!fs.existsSync(targetDir)) return null;

  const jsonlFiles = fs
    .readdirSync(targetDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(targetDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return jsonlFiles.length > 0 ? path.join(targetDir, jsonlFiles[0].name) : null;
}

export function getProjectNameFromPath(sessionPath: string): string {
  const parts = sessionPath.split(path.sep);
  const projectsIdx = parts.lastIndexOf('projects');
  if (projectsIdx >= 0 && projectsIdx < parts.length - 1) {
    return parts[projectsIdx + 1];
  }
  return 'unknown';
}

export function listAllSessionFiles(): string[] {
  if (!fs.existsSync(claudeProjectBase)) return [];

  const results: string[] = [];
  const projectDirs = fs
    .readdirSync(claudeProjectBase, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of projectDirs) {
    const projectPath = path.join(claudeProjectBase, dir.name);
    const jsonlFiles = fs
      .readdirSync(projectPath)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(projectPath, f));

    results.push(...jsonlFiles);
  }

  return results.sort((a, b) => {
    try {
      return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
    } catch {
      return 0;
    }
  });
}
