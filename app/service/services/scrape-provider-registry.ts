import {
  ScrapeProviderDescriptor,
  ScrapeProviderKind,
} from "./scrape-contract";

export class ScrapeProviderRegistry {
  private readonly _providersByKind = new Map<
    ScrapeProviderKind,
    ScrapeProviderDescriptor[]
  >();

  register(provider: ScrapeProviderDescriptor): void {
    const existingProviders = this._providersByKind.get(provider.kind) || [];
    const providersWithoutCurrent = existingProviders.filter(
      (existingProvider) => existingProvider.id !== provider.id
    );

    providersWithoutCurrent.push(provider);
    providersWithoutCurrent.sort((left, right) => {
      const priorityDelta = (left.priority || 0) - (right.priority || 0);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return left.id.localeCompare(right.id);
    });

    this._providersByKind.set(provider.kind, providersWithoutCurrent);
  }

  list(
    kind: ScrapeProviderKind,
    requestedProviderIds: string[] = []
  ): ScrapeProviderDescriptor[] {
    const providers = [...(this._providersByKind.get(kind) || [])];
    if (requestedProviderIds.length === 0) {
      return providers;
    }

    const normalizedRequestedProviderIds = requestedProviderIds.map((providerId) =>
      providerId.toLowerCase()
    );

    return providers.filter((provider) => {
      if (provider.id.startsWith("hook:")) {
        return true;
      }

      const providerNames = [provider.id, ...(provider.aliases || [])].map(
        (providerName) => providerName.toLowerCase()
      );

      return providerNames.some((providerName) =>
        normalizedRequestedProviderIds.includes(providerName)
      );
    });
  }

  get(
    kind: ScrapeProviderKind,
    providerId: string
  ): ScrapeProviderDescriptor | undefined {
    return this._providersByKind
      .get(kind)
      ?.find((provider) => provider.id === providerId);
  }
}
