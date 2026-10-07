/* The claude.ai artifact runtime, present only when the prototype is viewed on claude.ai. */
interface ClaudeDownloads {
  save(file: { filename: string; data: string }): Promise<void>;
}
interface Window {
  claude?: { use?: (capability: 'downloads') => Promise<ClaudeDownloads> };
}
