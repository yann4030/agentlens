import type { FileNode } from '../common/types';
import { nowMs } from '../common/utils';

export class FileGraph {
  private nodes: Map<string, FileNode> = new Map();

  recordEdit(filePath: string): void {
    if (!filePath) return;
    const normalized = normalizePath(filePath);
    const existing = this.nodes.get(normalized);
    if (existing) {
      existing.editCount++;
      existing.lastEditedAt = nowMs();
    } else {
      this.nodes.set(normalized, {
        path: normalized,
        rawPath: filePath,
        editCount: 1,
        lastEditedAt: nowMs(),
        relatedFiles: [],
      });
    }
  }

  recordRead(filePath: string): void {
    if (!filePath) return;
    const normalized = normalizePath(filePath);
    if (!this.nodes.has(normalized)) {
      this.nodes.set(normalized, {
        path: normalized,
        rawPath: filePath,
        editCount: 0,
        lastEditedAt: nowMs(),
        relatedFiles: [],
      });
    }
  }

  addRelation(fileA: string, fileB: string): void {
    if (!fileA || !fileB) return;
    const a = normalizePath(fileA);
    const b = normalizePath(fileB);
    if (a === b) return;

    const nodeA = this.nodes.get(a);
    const nodeB = this.nodes.get(b);

    if (nodeA && !nodeA.relatedFiles.includes(b)) {
      nodeA.relatedFiles.push(b);
    }
    if (nodeB && !nodeB.relatedFiles.includes(a)) {
      nodeB.relatedFiles.push(a);
    }
  }

  getAllFiles(): FileNode[] {
    return Array.from(this.nodes.values()).sort((a, b) => b.editCount - a.editCount);
  }

  getFile(path: string): FileNode | undefined {
    return this.nodes.get(normalizePath(path));
  }

  reset(): void {
    this.nodes.clear();
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').toLowerCase();
}
