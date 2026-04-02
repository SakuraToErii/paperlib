import { errorcatching } from "@/base/error";
import { Eventable } from "@/base/event";
import { createDecorator } from "@/base/injection/injection";
import { Process } from "@/base/process-id";
import { ILogService, LogService } from "@/common/services/log-service";
import { ProcessingKey, processing } from "@/common/utils/processing";
import { Entity, IEntityCollection } from "@/models/entity";

import { HookService, IHookService } from "./hook-service";
import {
  ScrapeEntryDraftGroup,
  ScrapeEntryRequest,
  ScrapeFuzzyRequest,
  ScrapeMergeContext,
  ScrapeMetadataProviderExecution,
  ScrapeMetadataRequest,
  ScrapeProviderDescriptor,
  ScrapeProviderKind,
  ScrapeProviderResult,
  ScrapeSeed,
} from "./scrape-contract";
import {
  DefaultMetadataMergePolicy,
  MetadataMergePolicy,
} from "./scrape-merge-policy";
import { ScrapeProviderRegistry } from "./scrape-provider-registry";
import {
  createStableEntryProviders,
  StableEntryProvider,
} from "./scrape-stable-entry-providers";
import {
  createStableMetadataProviders,
  StableMetadataProvider,
} from "./scrape-stable-metadata-providers";
import {
  DefaultScrapeInputResolver,
  PaperEntityInputResolver,
  PaperEntityPayload,
  ScrapeInputResolverRegistry,
} from "./scrape-resolver";

export const IScrapeService = createDecorator("scrapeService");

/**
 * ScrapeService transforms a data source, such as a local file, web page, etc., into a PaperEntity with fullfilled metadata.
 *
 * Scrapers can be categorized into two types:
 *   1. Entry scraper: transforms a data source into a PaperEntity
 *   2. Metadata scraper: fullfill the metadata of a PaperEntity into
 *
 * Scraping pipeline:
 * | ----------------
 * | 1. Entry scraper transforms a data source, such as the following object, into a PaperEntity.
 * |     payload { // processed by different entry scrapers
 * |     . url: string  // an example payload consists of a url
 * |     }
 * |     NOTE: Entry scrapers also support type of "PaperEntity", which is a bypass for extensions
 * |           to parse a data source in themselve and get the metadata from here.
 * | ----------------
 * | 2. Metadata scraper fullfills the metadata of a PaperEntity.
 * | ----------------
 */
export class ScrapeService extends Eventable<{}> {
  private readonly _inputResolverRegistry: ScrapeInputResolverRegistry;
  private readonly _providerRegistry: ScrapeProviderRegistry;
  private readonly _metadataMergePolicy: MetadataMergePolicy;
  private readonly _stableEntryProviders: Map<string, StableEntryProvider>;
  private readonly _stableMetadataProviders: Map<string, StableMetadataProvider>;

  private _isPaperEntityPayload(
    payload: unknown
  ): payload is PaperEntityPayload {
    return this._resolvePayload(payload).kind === "entity-draft";
  }

  private _resolvePayload(payload: unknown) {
    return this._inputResolverRegistry.resolve(payload);
  }

  protected _resolveSeeds(payloads: unknown[]): ScrapeSeed[] {
    return payloads.map((payload) => this._resolvePayload(payload));
  }

  protected _listProviders(
    kind: ScrapeProviderKind,
    requestedProviderIds: string[] = []
  ): ScrapeProviderDescriptor[] {
    const providers = this._providerRegistry.list(kind, requestedProviderIds);
    if (providers.length === 0) {
      throw new Error(`No scrape provider registered for ${kind}.`);
    }
    return providers;
  }

  protected _selectProvider(
    kind: ScrapeProviderKind
  ): ScrapeProviderDescriptor {
    return this._listProviders(kind)[0];
  }

  protected _createMergeContext(
    provider: ScrapeProviderDescriptor,
    providerIndex: number,
    force: boolean
  ): ScrapeMergeContext {
    return {
      providerId: provider.id,
      providerIndex,
      force,
    };
  }

  protected _executeEntryProvider(
    provider: ScrapeProviderDescriptor,
    request: ScrapeEntryRequest
  ): Promise<ScrapeProviderResult<ScrapeEntryDraftGroup[]>> {
    const stableEntryProvider = this._stableEntryProviders.get(provider.id);
    if (stableEntryProvider) {
      return stableEntryProvider.scrape(request.payloads);
    }

    if (provider.id === "hook:entry") {
      return this._executeHookEntryProvider(provider, request);
    }

    return Promise.resolve(
      this._createSkippedProviderResult(provider, "payload", [])
    );
  }

  protected _executeMetadataProvider(
    provider: ScrapeProviderDescriptor,
    request: ScrapeMetadataRequest
  ): Promise<ScrapeMetadataProviderExecution> {
    const stableMetadataProvider = this._stableMetadataProviders.get(provider.id);
    if (stableMetadataProvider) {
      return stableMetadataProvider.scrape(request.drafts).then((result) => ({
        result,
        request: {
          drafts: request.drafts.map((draft) => new Entity(draft)),
          scrapers: [...request.scrapers],
          force: request.force,
        },
      }));
    }

    if (provider.id === "hook:metadata") {
      return this._executeHookMetadataProvider(provider, request);
    }

    return Promise.resolve({
      result: this._createSkippedProviderResult(
        provider,
        request.drafts.some((draft) => !!draft.doi)
          ? "doi"
          : request.drafts.some((draft) => !!draft.arxiv)
          ? "arxiv"
          : "paper-entity",
        request.drafts.map((draft) => new Entity(draft))
      ),
      request: {
        drafts: request.drafts.map((draft) => new Entity(draft)),
        scrapers: [...request.scrapers],
        force: request.force,
      },
    });
  }

  protected _executeFuzzyProvider(
    provider: ScrapeProviderDescriptor,
    request: ScrapeFuzzyRequest
  ): Promise<ScrapeProviderResult<Entity[][]>> {
    switch (provider.id) {
      case "hook:fuzzy":
        return this._executeHookFuzzyProvider(provider, request);
      default:
        return Promise.resolve(
          this._createSkippedProviderResult(provider, "paper-entity", [])
        );
    }
  }

  protected _applyMetadataMergePolicy(
    origin: Entity,
    draft: Entity,
    result: ScrapeProviderResult<Entity>,
    mergePriorityLevel: { [key: string]: number },
    context: ScrapeMergeContext
  ) {
    return this._metadataMergePolicy.merge(
      origin,
      draft,
      result,
      mergePriorityLevel,
      context
    );
  }

  private _getPaperEntityDraftsFromPayloads(
    payloads: unknown[]
  ): Entity[] | null {
    if (payloads.length === 0) {
      return null;
    }

    const resolvedPayloads = this._resolveSeeds(payloads);
    if (
      !resolvedPayloads.every(
        (resolvedPayload) => resolvedPayload.kind === "entity-draft"
      )
    ) {
      return null;
    }

    return resolvedPayloads.map(
      (resolvedPayload) => new Entity(resolvedPayload.entity)
    );
  }

  constructor(
    @IHookService private readonly _hookService: HookService,
    @ILogService private readonly _logService: LogService
  ) {
    super("scrapeService", {});
    this._inputResolverRegistry = new ScrapeInputResolverRegistry([
      new PaperEntityInputResolver(),
      new DefaultScrapeInputResolver(),
    ]);
    this._providerRegistry = new ScrapeProviderRegistry();
    this._stableEntryProviders = new Map(
      createStableEntryProviders().map((provider) => [
        provider.descriptor.id,
        provider,
      ])
    );
    this._stableMetadataProviders = new Map(
      createStableMetadataProviders().map((provider) => [
        provider.descriptor.id,
        provider,
      ])
    );
    this._metadataMergePolicy = new DefaultMetadataMergePolicy();
    this._registerBuiltinProviders();
  }

  private _registerBuiltinProviders() {
    for (const provider of this._stableEntryProviders.values()) {
      this._providerRegistry.register(provider.descriptor);
    }
    for (const provider of this._stableMetadataProviders.values()) {
      this._providerRegistry.register(provider.descriptor);
    }
    this._providerRegistry.register({
      id: "hook:entry",
      kind: "entry",
      label: "Hook scrape entry provider",
      priority: 100,
    });
    this._providerRegistry.register({
      id: "hook:metadata",
      kind: "metadata",
      label: "Hook scrape metadata provider",
      priority: 100,
    });
    this._providerRegistry.register({
      id: "hook:fuzzy",
      kind: "fuzzy",
      label: "Hook fuzzy scrape provider",
      priority: 100,
    });
  }

  private _wrapProviderResult<TData>(
    provider: ScrapeProviderDescriptor,
    basis: ScrapeProviderResult<TData>["basis"],
    data: TData,
    complete = true
  ): ScrapeProviderResult<TData> {
    return {
      provider,
      status: "matched",
      basis,
      data,
      complete,
      warnings: [],
    };
  }

  private _createSkippedProviderResult<TData>(
    provider: ScrapeProviderDescriptor,
    basis: ScrapeProviderResult<TData>["basis"],
    data: TData
  ): ScrapeProviderResult<TData> {
    return {
      provider,
      status: "skipped",
      basis,
      data,
      complete: false,
      warnings: [],
    };
  }

  private async _executeHookEntryProvider(
    provider: ScrapeProviderDescriptor,
    request: ScrapeEntryRequest
  ): Promise<ScrapeProviderResult<ScrapeEntryDraftGroup[]>> {
    let paperEntityDrafts: Entity[] = [];

    if (this._hookService.hasHook("scrapeEntry")) {
      const extensionReady = await this._scrapeExtensionReady();
      if (!extensionReady) {
        return this._createSkippedProviderResult(provider, "payload", []);
      }

      const hookedPaperEntityDrafts =
        await this._hookService.transformhookPoint<any[], object[]>(
          "scrapeEntry",
          600000,
          request.payloads
        );
      paperEntityDrafts = hookedPaperEntityDrafts.map((paperEntityDraft) => {
        return new Entity(paperEntityDraft);
      });
    }

    if (paperEntityDrafts.length === 0) {
      return this._createSkippedProviderResult(provider, "payload", []);
    }

    const groupedDrafts: Entity[][] = request.payloads.map(() => []);

    if (request.payloads.length <= 1) {
      groupedDrafts[0] = paperEntityDrafts;
    } else {
      paperEntityDrafts.forEach((draft, index) => {
        const targetIndex = Math.min(index, request.payloads.length - 1);
        groupedDrafts[targetIndex].push(new Entity(draft));
      });
    }

    return this._wrapProviderResult(
      provider,
      "payload",
      groupedDrafts
        .map((drafts, payloadIndex) => ({
          payloadIndex,
          drafts,
        }))
        .filter((group) => group.drafts.length > 0)
    );
  }

  private async _executeHookMetadataProvider(
    provider: ScrapeProviderDescriptor,
    request: ScrapeMetadataRequest
  ): Promise<ScrapeMetadataProviderExecution> {
    let scrapedPaperEntityDrafts = request.drafts.map(
      (draft) => new Entity(draft)
    );
    let nextScrapers = [...request.scrapers];
    let nextForce = request.force;

    if (this._hookService.hasHook("scrapeMetadata")) {
      const metadataHookResult = await this._hookService.modifyHookPoint(
        "scrapeMetadata",
        60000,
        request.drafts,
        request.scrapers,
        request.force
      );
      scrapedPaperEntityDrafts = metadataHookResult[0].map(
        (draft: Entity) => new Entity(draft)
      );
      [, nextScrapers, nextForce] = metadataHookResult;
    }

    return {
      result: this._hookService.hasHook("scrapeMetadata")
        ? this._wrapProviderResult(
            provider,
            "paper-entity",
            scrapedPaperEntityDrafts
          )
        : this._createSkippedProviderResult(
            provider,
            "paper-entity",
            scrapedPaperEntityDrafts
          ),
      request: {
        drafts: scrapedPaperEntityDrafts,
        scrapers: nextScrapers,
        force: nextForce,
      },
    };
  }

  private async _executeHookFuzzyProvider(
    provider: ScrapeProviderDescriptor,
    request: ScrapeFuzzyRequest
  ): Promise<ScrapeProviderResult<Entity[][]>> {
    let paperEntityDraftCandidates: Entity[][] = [];

    if (this._hookService.hasHook("fuzzyScrapeMetadata")) {
      const hookedCandidates = await this._hookService.transformhookPoint<
        any[],
        object[]
      >("fuzzyScrapeMetadata", 600000, request.paperEntities);
      paperEntityDraftCandidates = hookedCandidates.map(
        (candidateGroup: object[]) =>
          candidateGroup.map((candidate) => new Entity(candidate))
      );
    }

    if (paperEntityDraftCandidates.length === 0) {
      return this._createSkippedProviderResult(provider, "paper-entity", []);
    }

    return this._wrapProviderResult(
      provider,
      "paper-entity",
      paperEntityDraftCandidates
    );
  }

  private _createMergePriorityLevel(draft: Entity) {
    return Object.keys(draft as unknown as Record<string, unknown>).reduce(
      (acc, key) => {
        acc[key] = Number.POSITIVE_INFINITY;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  private async _executeEntryProviderChain(payloads: unknown[]) {
    let pendingPayloads = payloads.map((payload, originalIndex) => ({
      payload,
      originalIndex,
    }));
    const resolvedDrafts = new Map<number, Entity[]>();

    for (const provider of this._listProviders("entry")) {
      if (pendingPayloads.length === 0) {
        break;
      }

      const result = await this._executeEntryProvider(provider, {
        payloads: pendingPayloads.map((pendingPayload) => pendingPayload.payload),
      });

      if (result.status !== "matched" || result.data.length === 0) {
        continue;
      }

      const matchedPendingIndexes = new Set<number>();
      for (const group of result.data) {
        const pendingPayload = pendingPayloads[group.payloadIndex];
        if (!pendingPayload || group.drafts.length === 0) {
          continue;
        }

        matchedPendingIndexes.add(group.payloadIndex);
        const nextDrafts = resolvedDrafts.get(pendingPayload.originalIndex) || [];
        nextDrafts.push(...group.drafts.map((draft) => new Entity(draft)));
        resolvedDrafts.set(pendingPayload.originalIndex, nextDrafts);
      }

      pendingPayloads = pendingPayloads.filter(
        (_payload, index) => !matchedPendingIndexes.has(index)
      );
    }

    return [...resolvedDrafts.entries()]
      .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
      .flatMap(([, drafts]) => drafts.map((draft) => new Entity(draft)));
  }

  private _mergeMetadataProviderResult(
    origin: Entity,
    draft: Entity,
    result: ScrapeProviderResult<Entity>,
    mergePriorityLevel: Record<string, number>,
    context: ScrapeMergeContext
  ) {
    return this._applyMetadataMergePolicy(
      origin,
      draft,
      result,
      mergePriorityLevel,
      context
    );
  }

  private _mergeMetadataProviderDrafts(
    origins: Entity[],
    drafts: Entity[],
    result: ScrapeProviderResult<Entity[]>,
    mergePriorityLevels: Record<string, number>[],
    context: ScrapeMergeContext
  ) {
    if (result.data.length !== drafts.length) {
      this._logService.warn(
        `Provider ${result.provider.id} returned ${result.data.length} draft(s) for ${drafts.length} request draft(s); skipping merge.`,
        "",
        true,
        "ScrapeService"
      );
      return drafts.map((draft) => new Entity(draft));
    }

    return drafts.map((draft, index) => {
      const merged = this._mergeMetadataProviderResult(
        origins[index],
        new Entity(draft),
        {
          ...result,
          data: new Entity(result.data[index]),
        },
        mergePriorityLevels[index],
        context
      );
      mergePriorityLevels[index] = merged.mergePriorityLevel;
      return new Entity(merged.paperEntityDraft);
    });
  }

  private async _executeMetadataProviderChain(request: ScrapeMetadataRequest) {
    const origins = request.drafts.map((draft) => new Entity(draft));
    const mergePriorityLevels = origins.map((draft) =>
      this._createMergePriorityLevel(draft)
    );
    let currentRequest: ScrapeMetadataRequest = {
      drafts: request.drafts.map((draft) => new Entity(draft)),
      scrapers: [...request.scrapers],
      force: request.force,
    };

    for (const [providerIndex, provider] of this._listProviders(
      "metadata",
      request.scrapers
    ).entries()) {
      const execution = await this._executeMetadataProvider(
        provider,
        currentRequest
      );
      const nextRequest = {
        drafts: execution.request.drafts.map((draft) => new Entity(draft)),
        scrapers: [...execution.request.scrapers],
        force: execution.request.force,
      };

      if (execution.result.status === "matched") {
        nextRequest.drafts = this._mergeMetadataProviderDrafts(
          origins,
          currentRequest.drafts,
          execution.result,
          mergePriorityLevels,
          this._createMergeContext(
            provider,
            providerIndex,
            execution.request.force
          )
        );
      }

      currentRequest = nextRequest;
    }

    return {
      drafts: currentRequest.drafts.map((draft) => new Entity(draft)),
      scrapers: [...currentRequest.scrapers],
      force: currentRequest.force,
    };
  }

  private async _scrapeExtensionReady() {
    if (
      !globalThis.PLAPILocal?.serviceRPCService?.waitForAPI ||
      !globalThis.PLExtAPI?.extensionManagementService
    ) {
      return true;
    }

    const extensionAPIExposed = await PLAPILocal.serviceRPCService.waitForAPI(
      Process.extension,
      "PLExtAPI",
      5000
    );

    if (!extensionAPIExposed) {
      this._logService.warn(
        "Official scrape extension is not installed yet.",
        "",
        true,
        "ScrapeService"
      );
      return false;
    } else {
      let status =
        await PLExtAPI.extensionManagementService.isOfficialScrapeExtensionInstalled();

      if (status === "loaded") {
        return true;
      } else if (status === "unloaded") {
        for (let i = 0; i < 15; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          status =
            await PLExtAPI.extensionManagementService.isOfficialScrapeExtensionInstalled();

          if (status === "loaded") {
            break;
          }
        }
        return true;
      }

      if (status !== "loaded") {
        this._logService.warn(
          "Official scrape extension is not installed yet.",
          "",
          true,
          "ScrapeService"
        );
        return false;
      } else {
        return true;
      }
    }
  }

  /**
   * Scrape a data source's metadata.
   * @param payloads - data source payloads.
   * @param specificScrapers - list of metadata scrapers.
   * @param force - force scraping metadata.
   * @returns List of paper entities. */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to scrape data source.", true, "ScrapeService", [])
  async scrape(
    payloads: any[],
    specificScrapers: string[],
    force: boolean = false
  ): Promise<Entity[]> {
    const resolvedPayloads = this._resolveSeeds(payloads);
    const directPaperEntityDrafts = resolvedPayloads
      .filter((resolvedPayload) => resolvedPayload.kind === "entity-draft")
      .map((resolvedPayload) => new Entity(resolvedPayload.entity));

    const entryPayloads = resolvedPayloads
      .filter((resolvedPayload) => resolvedPayload.kind === "entry-payload")
      .map((resolvedPayload) => resolvedPayload.payload);

    if (entryPayloads.length === 0) {
      return this.scrapeMetadata(
        directPaperEntityDrafts,
        specificScrapers,
        force
      );
    }

    const jobID = Math.random().toString(36).substring(7);
    const results: Entity[] = [...directPaperEntityDrafts];
    for (let i = 0; i < entryPayloads.length; i += 10) {
      if (entryPayloads.length >= 20) {
        this._logService.progress(
          `Processing ${i} / ${entryPayloads.length}...`,
          (i / entryPayloads.length) * 100,
          true,
          "ScrapeService",
          jobID
        );
      }
      try {
        const payloadChunk = entryPayloads.slice(i, i + 10);

        const paperEntityDrafts =
          this._getPaperEntityDraftsFromPayloads(payloadChunk) ||
          (await this.scrapeEntry(payloadChunk));

        if (paperEntityDrafts.length === 0) {
          this._logService.warn(
            "The data source yields no PaperEntity.",
            "",
            true,
            "ScrapeService"
          );
          return [];
        }

        const scrapedPaperEntityDrafts = await this.scrapeMetadata(
          paperEntityDrafts,
          specificScrapers,
          force
        );

        results.push(...scrapedPaperEntityDrafts);
      } catch (e) {
        this._logService.error(
          "Failed to scrape data source.",
          `${(e as Error).message} ${(e as Error).stack}`,
          true,
          "ScrapeService"
        );
      }
    }

    if (payloads.length >= 20) {
      this._logService.progress(`Done!`, 100, true, "ScrapeService", jobID);
    }

    return results;
  }

  /**
   * Scrape all entry scrapers to transform data source payloads into a PaperEntity list.
   * @param payloads - data source payloads.
   * @returns List of paper entities. */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to scrape entry.", true, "ScrapeService", [])
  async scrapeEntry(payloads: any[]) {
    if (this._hookService.hasHook("beforeScrapeEntry")) {
      [payloads] = await this._hookService.modifyHookPoint(
        "beforeScrapeEntry",
        5000,
        payloads
      );
    }

    let paperEntityDrafts = await this._executeEntryProviderChain(payloads);

    if (this._hookService.hasHook("afterScrapeEntry")) {
      [paperEntityDrafts] = await this._hookService.modifyHookPoint(
        "afterScrapeEntry",
        5000,
        paperEntityDrafts
      );
      paperEntityDrafts = paperEntityDrafts.map((p) => {
        return new Entity(p);
      });
    }

    return paperEntityDrafts;
  }

  /**
   * Scrape all metadata scrapers to complete the metadata of PaperEntitys.
   * @param paperEntityDrafts - list of paper entities.
   * @param scrapers - list of metadata scrapers.
   * @param force - force scraping metadata.
   * @returns List of paper entities. */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to scrape metadata.", true, "ScrapeService", [])
  async scrapeMetadata(
    paperEntityDrafts: Entity[],
    scrapers: string[],
    force: boolean = false
  ) {
    const rehydrateEntities = (drafts: Entity[]) =>
      drafts.map((draft) => new Entity(draft));

    if (this._hookService.hasHook("beforeScrapeMetadata")) {
      [paperEntityDrafts, scrapers, force] =
        await this._hookService.modifyHookPoint(
          "beforeScrapeMetadata",
          5000,
          paperEntityDrafts,
          scrapers,
          force
        );
      paperEntityDrafts = rehydrateEntities(paperEntityDrafts);
    }

    const metadataRequest = await this._executeMetadataProviderChain({
      drafts: paperEntityDrafts,
      scrapers,
      force,
    });
    let scrapedPaperEntityDrafts = metadataRequest.drafts;
    scrapers = metadataRequest.scrapers;
    force = metadataRequest.force;

    if (this._hookService.hasHook("afterScrapeMetadata")) {
      [scrapedPaperEntityDrafts, scrapers, force] =
        await this._hookService.modifyHookPoint(
          "afterScrapeMetadata",
          5000,
          scrapedPaperEntityDrafts,
          scrapers,
          force
        );
      scrapedPaperEntityDrafts = rehydrateEntities(scrapedPaperEntityDrafts);
    }

    return scrapedPaperEntityDrafts;
  }

  /**
   * Scrape a data source's metadata.
   * @param payloads - data source payloads.
   * @returns List of paper entities' candidates. */
  @processing(ProcessingKey.General)
  @errorcatching(
    "Failed to fuzzily scrape data source.",
    true,
    "ScrapeService",
    []
  )
  async fuzzyScrape(
    paperEntities: IEntityCollection
  ): Promise<Record<string, Entity[]>> {
    await this._scrapeExtensionReady();

    const jobID = Math.random().toString(36).substring(7);
    const results: Record<string, Entity[]> = {};
    for (let i = 0; i < paperEntities.length; i += 10) {
      if (paperEntities.length >= 20) {
        this._logService.progress(
          `Processing ${i} / ${paperEntities.length}...`,
          (i / paperEntities.length) * 100,
          true,
          "ScrapeService",
          jobID
        );
      }
      try {
        let paperEntityChunk = paperEntities.slice(i, i + 10);

        const paperEntityDraftCandidates = await this._fuzzyScrape(
          paperEntityChunk
        );

        paperEntityChunk.forEach((p, index) => {
          results[`${p._id}`] = paperEntityDraftCandidates[index];
        });
      } catch (e) {
        this._logService.error(
          "Failed to fuzzily scrape data source.",
          `${(e as Error).message} ${(e as Error).stack}`,
          true,
          "ScrapeService"
        );
      }
    }

    if (paperEntities.length >= 20) {
      this._logService.progress(`Done!`, 100, true, "ScrapeService", jobID);
    }

    return results;
  }

  /**
   * Scrape all entry scrapers to transform data source payloads into a PaperEntity list.
   * @param payloads - data source payloads.
   * @returns List of paper entities. */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to scrape entry.", true, "ScrapeService", [])
  async _fuzzyScrape(paperEntities: IEntityCollection): Promise<Entity[][]> {
    const provider = this._selectProvider("fuzzy");
    if (this._hookService.hasHook("beforeFuzzyScrape")) {
      [paperEntities] = await this._hookService.modifyHookPoint(
        "beforeFuzzyScrape",
        5000,
        paperEntities
      );
    }

    let paperEntityDraftCandidates = (
      await this._executeFuzzyProvider(provider, { paperEntities })
    ).data;

    if (this._hookService.hasHook("afterScrapeEntry")) {
      [paperEntityDraftCandidates] = await this._hookService.modifyHookPoint(
        "afterScrapeEntry",
        5000,
        paperEntityDraftCandidates
      );

      paperEntityDraftCandidates.forEach((p) => {
        return p.map((candidate) => {
          return new Entity(candidate);
        });
      });
    }

    return paperEntityDraftCandidates;
  }
}
