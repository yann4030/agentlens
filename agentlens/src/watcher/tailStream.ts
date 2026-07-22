import * as fs from 'fs';
import { FSWatcher, watch } from 'chokidar';
import { EventEmitter } from 'events';

export interface TailStreamEvents {
  line: (line: string) => void;
  error: (err: Error) => void;
  ready: () => void;
}

export class TailStream extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private filePath: string;
  private lastSize: number = 0;
  private fd: number | null = null;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }

  start(): void {
    if (!fs.existsSync(this.filePath)) {
      this.emit('error', new Error(`File not found: ${this.filePath}`));
      return;
    }

    const stat = fs.statSync(this.filePath);
    this.lastSize = stat.size;

    this.watcher = watch(this.filePath, {
      persistent: true,
      usePolling: true,
      interval: 500,
    });

    this.watcher.on('change', () => {
      this.readTail();
    });

    this.watcher.on('ready', () => {
      this.emit('ready');
    });

    this.watcher.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  private readTail(): void {
    try {
      const stat = fs.statSync(this.filePath);
      if (stat.size <= this.lastSize) return;

      if (this.fd === null) {
        this.fd = fs.openSync(this.filePath, 'r');
      }

      const newBytes = stat.size - this.lastSize;
      const buffer = Buffer.alloc(newBytes);
      fs.readSync(this.fd, buffer, 0, newBytes, this.lastSize);

      this.lastSize = stat.size;

      const content = buffer.toString('utf-8');
      const lines = content.split('\n').filter((l) => l.trim());

      for (const line of lines) {
        this.emit('line', line);
      }
    } catch (err) {
      this.emit('error', err as Error);
    }
  }

  switchFile(newPath: string): void {
    this.stop();
    this.filePath = newPath;
    this.lastSize = 0;
    this.fd = null;
    this.start();
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }

  override on<E extends keyof TailStreamEvents>(event: E, listener: TailStreamEvents[E]): this {
    return super.on(event, listener);
  }

  override emit<E extends keyof TailStreamEvents>(event: E, ...args: Parameters<TailStreamEvents[E]>): boolean {
    return super.emit(event, ...args);
  }
}
