import { mergeMetadata } from "@/base/metadata";
import { Entity } from "@/models/entity";

import { ScrapeMergeContext, ScrapeProviderResult } from "./scrape-contract";

export interface MetadataMergePolicy {
  merge(
    origin: Entity,
    draft: Entity,
    result: ScrapeProviderResult<Entity>,
    mergePriorityLevel: { [key: string]: number },
    context: ScrapeMergeContext
  ): ReturnType<typeof mergeMetadata>;
}

export class DefaultMetadataMergePolicy implements MetadataMergePolicy {
  merge(
    origin: Entity,
    draft: Entity,
    result: ScrapeProviderResult<Entity>,
    mergePriorityLevel: { [key: string]: number },
    context: ScrapeMergeContext
  ) {
    const scrapedEntity = result.data instanceof Entity ? result.data : new Entity(result.data);
    const effectivePriorityIndex = context.force ? Number.NEGATIVE_INFINITY : context.providerIndex;

    return mergeMetadata(origin as any, draft as any, scrapedEntity as any, mergePriorityLevel, effectivePriorityIndex);
  }
}
