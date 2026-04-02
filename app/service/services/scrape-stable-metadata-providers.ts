import { XMLParser } from "fast-xml-parser";

import { Entity } from "@/models/entity";

import {
  ScrapeProviderDescriptor,
  ScrapeProviderResult,
} from "./scrape-contract";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

export type ScrapeFetch = typeof fetch;

export interface StableMetadataProvider {
  readonly descriptor: ScrapeProviderDescriptor;
  scrape(paperEntityDrafts: Entity[]): Promise<ScrapeProviderResult<Entity[]>>;
}

interface StableMetadataProviderOptions {
  fetch?: ScrapeFetch;
}

interface CrossrefWorkMessage {
  DOI?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  abstract?: string;
  issued?: {
    "date-parts"?: Array<Array<string | number>>;
  };
  page?: string;
  volume?: string;
  issue?: string;
  publisher?: string;
  type?: string;
  ["container-title"]?: string[];
}

interface ArxivFeedEntry {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  updated?: string;
  author?: { name?: string } | Array<{ name?: string }>;
  ["arxiv:doi"]?: string;
}

export function normalizeDOI(value?: string): string {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

export function normalizeArxivId(value?: string): string {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//i, "")
    .replace(/\.pdf$/i, "")
    .replace(/^arxiv:\s*/i, "")
    .trim();
}

function coerceArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function compactWhitespace(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function joinAuthors(
  authors: Array<{ given?: string; family?: string; name?: string }>
): string {
  return authors
    .map((author) => {
      const authorName = compactWhitespace(
        [author.given, author.family].filter(Boolean).join(" ") || author.name
      );
      return authorName;
    })
    .filter(Boolean)
    .join(", ");
}

function formatDateFromParts(parts?: Array<string | number>): string {
  if (!parts || parts.length === 0) {
    return "";
  }

  return parts
    .slice(0, 3)
    .map((part, index) => {
      const normalized = `${part}`;
      return index === 0 ? normalized : normalized.padStart(2, "0");
    })
    .join("-");
}

function cloneEntityWithMetadata(
  entity: Entity,
  metadata: Partial<Entity>
): Entity {
  const draft = new Entity(entity);

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null && value !== "") {
      (draft as Record<string, unknown>)[key] = value;
    }
  }

  return draft;
}

function createResult(
  provider: ScrapeProviderDescriptor,
  status: ScrapeProviderResult<Entity[]>["status"],
  basis: ScrapeProviderResult<Entity[]>["basis"],
  data: Entity[],
  warnings: string[],
  diagnostics: Record<string, unknown>,
  complete = status === "matched"
): ScrapeProviderResult<Entity[]> {
  return {
    provider,
    status,
    basis,
    data,
    complete,
    warnings,
    diagnostics,
  };
}

abstract class BaseStableMetadataProvider implements StableMetadataProvider {
  readonly descriptor: ScrapeProviderDescriptor;
  protected readonly _fetch: ScrapeFetch;

  constructor(
    descriptor: ScrapeProviderDescriptor,
    options: StableMetadataProviderOptions = {}
  ) {
    this.descriptor = descriptor;
    this._fetch = options.fetch || fetch;
  }

  async scrape(
    paperEntityDrafts: Entity[]
  ): Promise<ScrapeProviderResult<Entity[]>> {
    const warnings: string[] = [];
    let matchedCount = 0;
    let requestedCount = 0;

    const data = await Promise.all(
      paperEntityDrafts.map(async (paperEntityDraft) => {
        if (!this._canHandle(paperEntityDraft)) {
          return new Entity(paperEntityDraft);
        }

        requestedCount += 1;

        try {
          const metadata = await this._scrapeSingle(paperEntityDraft);
          if (!metadata) {
            return new Entity(paperEntityDraft);
          }

          matchedCount += 1;
          return cloneEntityWithMetadata(paperEntityDraft, metadata);
        } catch (error) {
          warnings.push(
            `${this.descriptor.id}: ${
              (error as Error).message || "unknown error"
            }`
          );
          return new Entity(paperEntityDraft);
        }
      })
    );

    const status =
      matchedCount > 0 ? "matched" : warnings.length > 0 ? "error" : "no-match";

    return createResult(
      this.descriptor,
      status,
      this._basis(),
      data,
      warnings,
      {
        requestedCount,
        matchedCount,
        totalCount: paperEntityDrafts.length,
      }
    );
  }

  protected abstract _basis(): ScrapeProviderResult<Entity[]>["basis"];
  protected abstract _canHandle(paperEntityDraft: Entity): boolean;
  protected abstract _scrapeSingle(
    paperEntityDraft: Entity
  ): Promise<Partial<Entity> | null>;
}

export class DOIMetadataProvider extends BaseStableMetadataProvider {
  constructor(options: StableMetadataProviderOptions = {}) {
    super(
      {
        id: "builtin:doi-metadata",
        kind: "metadata",
        label: "Builtin DOI metadata provider",
        priority: 10,
      },
      options
    );
  }

  protected _basis(): ScrapeProviderResult<Entity[]>["basis"] {
    return "doi";
  }

  protected _canHandle(paperEntityDraft: Entity): boolean {
    return normalizeDOI(paperEntityDraft.doi) !== "";
  }

  protected async _scrapeSingle(
    paperEntityDraft: Entity
  ): Promise<Partial<Entity> | null> {
    const doi = normalizeDOI(paperEntityDraft.doi);
    if (!doi) {
      return null;
    }

    const response = await this._fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`
    );
    if (!response.ok) {
      throw new Error(`Crossref request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      message?: CrossrefWorkMessage;
    };
    const message = payload.message;
    if (!message) {
      return null;
    }

    const publication = compactWhitespace(message["container-title"]?.[0]);
    const publicationType = compactWhitespace(message.type).toLowerCase();
    const pubTime = formatDateFromParts(message.issued?.["date-parts"]?.[0]);
    const year = pubTime.slice(0, 4) || paperEntityDraft.year;
    const normalizedTitle = compactWhitespace(message.title?.[0]);

    return {
      doi: normalizeDOI(message.DOI) || doi,
      title: normalizedTitle,
      authors: joinAuthors(message.author || []),
      abstract: compactWhitespace(message.abstract),
      publication,
      journal: publicationType.includes("proceedings")
        ? undefined
        : publication,
      booktitle: publicationType.includes("proceedings")
        ? publication
        : undefined,
      pubTime,
      year,
      volume: compactWhitespace(message.volume),
      number: compactWhitespace(message.issue),
      pages: compactWhitespace(message.page),
      publisher: compactWhitespace(message.publisher),
    };
  }
}

export class ArxivMetadataProvider extends BaseStableMetadataProvider {
  constructor(options: StableMetadataProviderOptions = {}) {
    super(
      {
        id: "builtin:arxiv-metadata",
        kind: "metadata",
        label: "Builtin arXiv metadata provider",
        priority: 20,
      },
      options
    );
  }

  protected _basis(): ScrapeProviderResult<Entity[]>["basis"] {
    return "arxiv";
  }

  protected _canHandle(paperEntityDraft: Entity): boolean {
    return normalizeArxivId(paperEntityDraft.arxiv) !== "";
  }

  protected async _scrapeSingle(
    paperEntityDraft: Entity
  ): Promise<Partial<Entity> | null> {
    const arxivId = normalizeArxivId(paperEntityDraft.arxiv);
    if (!arxivId) {
      return null;
    }

    const response = await this._fetch(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(
        arxivId
      )}`
    );
    if (!response.ok) {
      throw new Error(`arXiv request failed with ${response.status}`);
    }

    const payload = xmlParser.parse(await response.text()) as {
      feed?: { entry?: ArxivFeedEntry | ArxivFeedEntry[] };
    };
    const entry = coerceArray(payload.feed?.entry)[0];
    if (!entry) {
      return null;
    }

    const published = compactWhitespace(entry.published || entry.updated);
    const year = published.slice(0, 4) || paperEntityDraft.year;

    return {
      arxiv: normalizeArxivId(entry.id) || arxivId,
      doi: normalizeDOI(entry["arxiv:doi"]) || paperEntityDraft.doi,
      title: compactWhitespace(entry.title),
      authors: coerceArray(entry.author)
        .map((author) => compactWhitespace(author?.name))
        .filter(Boolean)
        .join(", "),
      abstract: compactWhitespace(entry.summary),
      publication: "arXiv",
      pubTime: published,
      year,
    };
  }
}

export function createStableMetadataProviders(
  options: StableMetadataProviderOptions = {}
): StableMetadataProvider[] {
  return [new DOIMetadataProvider(options), new ArxivMetadataProvider(options)];
}
