import { errorcatching } from "@/base/error";
import { Eventable } from "@/base/event";
import { createDecorator } from "@/base/injection/injection";
import { Process } from "@/base/process-id";
import { ILogService, LogService } from "@/common/services/log-service";
import { ProcessingKey, processing } from "@/common/utils/processing";
import { IEntityCollection, Entity } from "@/models/entity";
import { PaperEntity } from "@/models/paper-entity";

import {
  DefaultMetadataMergePolicy,
  MetadataMergePolicy,
} from "./scrape-merge-policy";
import {
  ScrapeProviderDescriptor,
  ScrapeProviderResult,
} from "./scrape-contract";
import { ScrapeProviderRegistry } from "./scrape-provider-registry";
import {
  DefaultScrapeInputResolver,
  PaperEntityInputResolver,
  PaperEntityPayload,
  ScrapeInputResolverRegistry,
} from "./scrape-resolver";
import { HookService, IHookService } from "./hook-service";

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

  private _isPaperEntityPayload(payload: unknown): payload is PaperEntityPayload {
    return this._resolvePayload(payload).kind === "entity-draft";
  }

  private _resolvePayload(payload: unknown) {
    return this._inputResolverRegistry.resolve(payload);
  }

  private _getPaperEntityDraftsFromPayloads(payloads: unknown[]): Entity[] | null {
    if (payloads.length === 0) {
      return null;
    }

    const resolvedPayloads = payloads.map((payload) => this._resolvePayload(payload));
    if (!resolvedPayloads.every((resolvedPayload) => resolvedPayload.kind === "entity-draft")) {
      return null;
    }

    return resolvedPayloads.map((resolvedPayload) => new Entity(resolvedPayload.entity));
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
    this._metadataMergePolicy = new DefaultMetadataMergePolicy();
    this._registerBuiltinProviders();
  }

  private _registerBuiltinProviders() {
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

  private _getProvider(kind: "entry" | "metadata" | "fuzzy"): ScrapeProviderDescriptor {
    const provider = this._providerRegistry.list(kind)[0];
    if (!provider) {
      throw new Error(`No scrape provider registered for ${kind}.`);
    }
    return provider;
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

  private async _scrapeExtensionReady() {
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
    const resolvedPayloads = payloads.map((payload) => this._resolvePayload(payload));
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

    // 0. Wait for scraper extension to be ready.
    await this._scrapeExtensionReady();

    // Do in chunks 10
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

        // 1. Entry scraper transforms data source payloads into a PaperEntity list.
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

        // ENHANCE: merge duplicated paperEntityDrafts?

        // 2. Metadata scraper fullfills the metadata of PaperEntitys.
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
    const provider = this._getProvider("entry");
    if (this._hookService.hasHook("beforeScrapeEntry")) {
      [payloads] = await this._hookService.modifyHookPoint(
        "beforeScrapeEntry",
        5000,
        payloads
      );
    }

    let paperEntityDrafts: Entity[] = [];
    if (this._hookService.hasHook("scrapeEntry")) {
      const hookedPaperEntityDrafts = await this._hookService.transformhookPoint<any[], Object[]>(
        "scrapeEntry",
        600000, // 10 min
        payloads
      );
      const providerResult = this._wrapProviderResult(
        provider,
        "payload",
        hookedPaperEntityDrafts.map((p) => new Entity(p))
      );
      paperEntityDrafts = providerResult.data;
    }

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
    const provider = this._getProvider("metadata");
    const rehydrateEntities = (drafts: Entity[]) => drafts.map((draft) => new Entity(draft));

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

    let scrapedPaperEntityDrafts = paperEntityDrafts;
    if (this._hookService.hasHook("scrapeMetadata")) {
      const metadataHookResult = await this._hookService.modifyHookPoint(
        "scrapeMetadata",
        60000,
        paperEntityDrafts,
        scrapers,
        force
      );
      const providerResult = this._wrapProviderResult(
        provider,
        "paper-entity",
        rehydrateEntities(metadataHookResult[0])
      );
      scrapedPaperEntityDrafts = providerResult.data;
      [, scrapers, force] = metadataHookResult;
    }

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
    // 0. Wait for scraper extension to be ready.
    await this._scrapeExtensionReady();

    // Do in chunks 10
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
  async _fuzzyScrape(
    paperEntities: IEntityCollection
  ): Promise<Entity[][]> {
    const provider = this._getProvider("fuzzy");
    if (this._hookService.hasHook("beforeFuzzyScrape")) {
      [paperEntities] = await this._hookService.modifyHookPoint(
        "beforeFuzzyScrape",
        5000,
        paperEntities
      );
    }

    let paperEntityDraftCandidates: Entity[][] = [];
    if (this._hookService.hasHook("fuzzyScrapeMetadata")) {
      const hookedCandidates = await this._hookService.transformhookPoint<any[], Object[]>(
        "fuzzyScrapeMetadata",
        600000, // 10 min
        paperEntities
      );
      const providerResult = this._wrapProviderResult(
        provider,
        "paper-entity",
        hookedCandidates.map((candidateGroup: Object[]) =>
          candidateGroup.map((candidate) => new Entity(candidate))
        )
      );
      paperEntityDraftCandidates = providerResult.data;
    }

    if (this._hookService.hasHook("afterScrapeEntry")) {
      [paperEntityDraftCandidates] = await this._hookService.modifyHookPoint(
        "afterScrapeEntry",
        5000,
        paperEntityDraftCandidates
      );

      paperEntityDraftCandidates.forEach((p) => {
        return p.map((p) => {
          return new Entity(p);
        });
      });
    }

    return paperEntityDraftCandidates;
  }
}
