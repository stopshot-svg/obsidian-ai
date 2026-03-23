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
    description: 'Upcoming alternate runtime with matching Obsidian UI.',
    capabilities: {
      inlineEdit: false,
      instructionRefine: true,
      mcp: false,
      persistentConversation: false,
      slashCommands: false,
      titleGeneration: true,
    },
  },
};
