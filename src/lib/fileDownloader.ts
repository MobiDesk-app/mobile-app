import { File, FileMode, Paths, type FileHandle } from "expo-file-system";

/**
 * Writes an in-flight download's chunks straight to disk via a FileHandle
 * instead of buffering the whole file in memory — matters for anything
 * bigger than a few MB, and the agent already streams in 16KB pieces for
 * the same reason (see agent/electron/downloadManager.ts).
 */
export class ActiveDownload {
  private handle: FileHandle;
  receivedBytes = 0;

  constructor(
    readonly requestId: string,
    readonly file: File,
    readonly totalBytes: number
  ) {
    file.create({ overwrite: true });
    this.handle = file.open(FileMode.WriteOnly);
  }

  static begin(requestId: string, name: string, totalBytes: number): ActiveDownload {
    const file = new File(Paths.document, name);
    return new ActiveDownload(requestId, file, totalBytes);
  }

  writeChunk(chunk: Uint8Array): void {
    this.handle.writeBytes(chunk);
    this.receivedBytes += chunk.byteLength;
  }

  get progress(): number {
    return this.totalBytes > 0 ? this.receivedBytes / this.totalBytes : 0;
  }

  finish(): void {
    this.handle.close();
  }

  abort(): void {
    this.handle.close();
    if (this.file.exists) this.file.delete();
  }
}
