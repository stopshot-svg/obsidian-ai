import type { ProviderId } from '../types';

export interface ProviderCapabilities {
  inlineEdit: boolean;
  instructionRefine: boolean;
  mcp: boolean;
  persistentConversation: boolean;
  slashCommands: boolean;
  titleGeneration: boolean;
}

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  status: 'stable' | 'experimental';
  description: string;
  capabilities: ProviderCapabilities;
}

export const PROVIDER_DESCRIPTORS: Record<ProviderId, ProviderDescriptor> = {
  claude: {
    id: 'claude',
    label: 'Claude',
    status: 'stable',
    description: 'Current default runtime powered by Claude Code.',
    capabilities: {
      inlineEdit: true,
      instructionRefine: true,
      mcp: true,
      persistentConversation: true,
      slashCommands: true,
      titleGeneration: true,
    },
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    status: 'experimental',
    description: 'OpenAI/Codex runtime using the same Obsidian UI, with Ask/Auto approvals and optional Codex CLI-managed model selection.',
    capabilities: {
      inlineEdit: true,
      instructionRefine: true,
      mcp: true,
      persistentConversation: false,
      slashCommands: false,
      titleGeneration: true,
    },
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    status: 'experimental',
    description: 'Google Gemini CLI runtime using the shared Obsidian UI, with Ask/Auto approvals and optional Gemini CLI-managed model selection.',
    capabilities: {
      inlineEdit: false,
      instructionRefine: false,
      mcp: true,
      persistentConversation: true,
      slashCommands: false,
      titleGeneration: false,
    },
  },
};
