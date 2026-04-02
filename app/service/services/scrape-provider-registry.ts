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

  list(kind: ScrapeProviderKind): ScrapeProviderDescriptor[] {
    return [...(this._providersByKind.get(kind) || [])];
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
