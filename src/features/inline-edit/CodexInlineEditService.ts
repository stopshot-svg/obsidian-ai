import type ClaudianPlugin from '../../main';
import type { InlineEditRequest, InlineEditResult } from './InlineEditService';

/**
 * Placeholder Codex inline edit service.
 *
 * Inline edit remains disabled in Codex mode for now, but this service gives us
 * a clear integration seam so the next iteration can swap in a full Codex-based
 * implementation without reworking the modal/controller contracts again.
 */
export class CodexInlineEditService {
  constructor(private readonly plugin: ClaudianPlugin) {}

  resetConversation(): void {
    // No-op placeholder for interface parity.
  }

  cancel(): void {
    // No-op placeholder for interface parity.
  }

  async editText(_request: InlineEditRequest): Promise<InlineEditResult> {
    return {
      success: false,
      error: `${this.plugin.providerManager.getDescriptor('codex').label} inline edit is not wired yet.`,
    };
  }

  async continueConversation(_message: string, _contextFiles?: string[]): Promise<InlineEditResult> {
    return {
      success: false,
      error: `${this.plugin.providerManager.getDescriptor('codex').label} inline edit is not wired yet.`,
    };
  }
}
