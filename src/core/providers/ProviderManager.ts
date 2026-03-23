import type { ClaudianSettings, ProviderId } from '../types';
import { PROVIDER_DESCRIPTORS, type ProviderDescriptor } from './types';

export class ProviderManager {
  getActiveProviderId(settings: Pick<ClaudianSettings, 'provider'>): ProviderId {
    return settings.provider ?? 'claude';
  }

  getDescriptor(providerId: ProviderId): ProviderDescriptor {
    return PROVIDER_DESCRIPTORS[providerId];
  }

  getActiveDescriptor(settings: Pick<ClaudianSettings, 'provider'>): ProviderDescriptor {
    return this.getDescriptor(this.getActiveProviderId(settings));
  }

  listProviders(): ProviderDescriptor[] {
    return Object.values(PROVIDER_DESCRIPTORS);
  }

  isExperimental(providerId: ProviderId): boolean {
    return this.getDescriptor(providerId).status === 'experimental';
  }
}
