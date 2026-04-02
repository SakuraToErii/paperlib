import { XMLParser } from "fast-xml-parser";

import { Entity } from "@/models/entity";

import {
  ScrapeMetadataProviderExecution,
  ScrapeMetadataRequest,
  ScrapeProviderDescriptor,
} from "./scrape-contract";

type FetchLike = typeof fetch;

interface CrossrefWork {
  DOI?: string;
  URL?: string;
  abstract?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  publisher?: string;
  volume?: string;
  issue?: string;
  page?: string;
  type?: string;
  "container-title"?: string[];
  issued?: { "date-parts"?: number[][] };
  created?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
}

const arxivXmlParser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

export async function executeBuiltinMetadataProvider(
  provider: ScrapeProviderDescriptor,
  request: ScrapeMetadataRequest,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)
): Promise<ScrapeMetadataProviderExecution> {
  switch (provider.id) {
    case "builtin:doi":
      return _executeDOIMetadataProvider(provider, request, fetchImpl);
    case "builtin:arxiv":
      return _executeArxivMetadataProvider(provider, request, fetchImpl);
    default:
      return {
        result: {
          provider,
          status: "skipped",
          basis: "unknown",
          data: request.drafts.map((draft) => new Entity(draft)),
          complete: false,
          warnings: [],
          diagnostics: {
            reason: "unsupported-builtin-provider",
          },
        },
        request: {
          drafts: request.drafts.map((draft) => new Entity(draft)),
          scrapers: [...request.scrapers],
          force: request.force,
        },
      };
  }
}

async function _executeDOIMetadataProvider(
  provider: ScrapeProviderDescriptor,
  request: ScrapeMetadataRequest,
  fetchImpl: FetchLike
): Promise<ScrapeMetadataProviderExecution> {
  const warnings: string[] = [];
  let matchedCount = 0;
  const nextDrafts = await Promise.all(
    request.drafts.map(async (draft) => {
      const doi = _normalizeDOI(draft.doi || _getMainURL(draft) || "");
      if (!doi) {
        return new Entity(draft);
      }

      try {
        const response = await fetchImpl(
          `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );
        if (!response.ok) {
          warnings.push(`doi:${doi}:http-${response.status}`);
          return new Entity(draft);
        }

        const payload = (await response.json()) as { message?: CrossrefWork };
        const work = payload.message;
        if (!work) {
          warnings.push(`doi:${doi}:missing-message`);
          return new Entity(draft);
        }

        matchedCount += 1;
        return _mergeCrossrefWorkIntoDraft(draft, work, doi);
      } catch (error) {
        warnings.push(`doi:${doi}:${(error as Error).message}`);
        return new Entity(draft);
      }
    })
  );

  return {
    result: {
      provider,
      status: matchedCount > 0 ? "matched" : "no-match",
      basis: matchedCount > 0 ? "doi" : "unknown",
      data: nextDrafts,
      complete: matchedCount > 0,
      warnings,
      diagnostics: {
        matchedCount,
        attemptedCount: request.drafts.length,
      },
    },
    request: {
      drafts: nextDrafts.map((draft) => new Entity(draft)),
      scrapers: [...request.scrapers],
      force: request.force,
    },
  };
}

async function _executeArxivMetadataProvider(
  provider: ScrapeProviderDescriptor,
  request: ScrapeMetadataRequest,
  fetchImpl: FetchLike
): Promise<ScrapeMetadataProviderExecution> {
  const warnings: string[] = [];
  let matchedCount = 0;
  const nextDrafts = await Promise.all(
    request.drafts.map(async (draft) => {
      const arxivId = _normalizeArxivId(
        draft.arxiv || _getMainURL(draft) || ""
      );
      if (!arxivId) {
        return new Entity(draft);
      }

      try {
        const response = await fetchImpl(
          `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(
            arxivId
          )}`
        );
        if (!response.ok) {
          warnings.push(`arxiv:${arxivId}:http-${response.status}`);
          return new Entity(draft);
        }

        const xml = await response.text();
        const parsed = arxivXmlParser.parse(xml) as {
          feed?: {
            entry?: Record<string, unknown> | Record<string, unknown>[];
          };
        };
        const entry = _toArray(parsed.feed?.entry)[0];
        if (!entry) {
          warnings.push(`arxiv:${arxivId}:missing-entry`);
          return new Entity(draft);
        }

        matchedCount += 1;
        return _mergeArxivEntryIntoDraft(draft, entry, arxivId);
      } catch (error) {
        warnings.push(`arxiv:${arxivId}:${(error as Error).message}`);
        return new Entity(draft);
      }
    })
  );

  return {
    result: {
      provider,
      status: matchedCount > 0 ? "matched" : "no-match",
      basis: matchedCount > 0 ? "arxiv" : "unknown",
      data: nextDrafts,
      complete: matchedCount > 0,
      warnings,
      diagnostics: {
        matchedCount,
        attemptedCount: request.drafts.length,
      },
    },
    request: {
      drafts: nextDrafts.map((draft) => new Entity(draft)),
      scrapers: [...request.scrapers],
      force: request.force,
    },
  };
}

function _mergeCrossrefWorkIntoDraft(
  draft: Entity,
  work: CrossrefWork,
  normalizedDoi: string
) {
  const nextDraft = new Entity(draft);
  const title = work.title?.[0];
  const authors = work.author
    ?.map(
      (author) =>
        author.name || [author.given, author.family].filter(Boolean).join(" ")
    )
    .filter(Boolean)
    .join(", ");
  const publication =
    work["container-title"]?.find((containerTitle) => !!containerTitle) ||
    nextDraft.publication;
  const dateParts =
    work["published-print"]?.["date-parts"]?.[0] ||
    work["published-online"]?.["date-parts"]?.[0] ||
    work.issued?.["date-parts"]?.[0] ||
    work.created?.["date-parts"]?.[0] ||
    [];

  if (title) {
    nextDraft.title = title;
  }
  if (authors) {
    nextDraft.authors = authors;
  }
  if (publication) {
    nextDraft.publication = publication;
    nextDraft.journal = publication;
  }
  if (dateParts[0]) {
    nextDraft.year = `${dateParts[0]}`;
    nextDraft.pubTime = _formatPubTime(dateParts);
  }
  if (dateParts[1]) {
    nextDraft.month = `${dateParts[1]}`;
  }
  if (work.page) {
    nextDraft.pages = `${work.page}`;
  }
  if (work.volume) {
    nextDraft.volume = `${work.volume}`;
  }
  if (work.issue) {
    nextDraft.number = `${work.issue}`;
  }
  if (work.publisher) {
    nextDraft.publisher = `${work.publisher}`;
  }

  nextDraft.doi = _normalizeDOI(work.DOI || normalizedDoi) || normalizedDoi;
  if (work.URL) {
    _setMainURL(nextDraft, work.URL);
  }
  if (work.abstract) {
    nextDraft.abstract = work.abstract;
  }
  if (work.type) {
    nextDraft.pubType = _inferPublicationType(work.type);
  }

  return nextDraft;
}

function _mergeArxivEntryIntoDraft(
  draft: Entity,
  entry: Record<string, unknown>,
  normalizedArxivId: string
) {
  const nextDraft = new Entity(draft);
  const authors = _toArray(entry.author)
    .map((author) => {
      if (typeof author === "string") {
        return author;
      }
      return `${(author as { name?: string }).name || ""}`.trim();
    })
    .filter(Boolean)
    .join(", ");
  const published = `${(entry.published as string | undefined) || ""}`.trim();
  const doi = `${
    ((entry as { doi?: unknown }).doi as string | undefined) || ""
  }`.trim();

  if (typeof entry.title === "string" && entry.title.trim()) {
    nextDraft.title = _normalizeWhitespace(entry.title);
  }
  if (authors) {
    nextDraft.authors = authors;
  }
  nextDraft.arxiv = normalizedArxivId;
  nextDraft.publication = "arXiv";
  _setMainURL(
    nextDraft,
    typeof entry.id === "string" && entry.id.trim()
      ? entry.id.trim()
      : `https://arxiv.org/abs/${normalizedArxivId}`
  );
  if (published) {
    nextDraft.pubTime = published.slice(0, 10);
    nextDraft.year = published.slice(0, 4);
    if (published.length >= 7) {
      nextDraft.month = `${Number.parseInt(published.slice(5, 7), 10)}`;
    }
  }
  if (typeof entry.summary === "string" && entry.summary.trim()) {
    nextDraft.abstract = _normalizeWhitespace(entry.summary);
  }
  if (doi) {
    nextDraft.doi = _normalizeDOI(doi) || doi;
  }

  return nextDraft;
}

function _normalizeDOI(input: string) {
  if (!input) {
    return "";
  }

  return input
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
}

function _normalizeArxivId(input: string) {
  if (!input) {
    return "";
  }

  return input
    .trim()
    .replace(/^https?:\/\/(www\.)?arxiv\.org\/(abs|pdf)\//i, "")
    .replace(/\.pdf$/i, "")
    .replace(/^arxiv:\s*/i, "");
}

function _formatPubTime(dateParts: number[]) {
  const [year, month, day] = dateParts;
  const parts = [year, month, day].filter((value) => value !== undefined);

  return parts
    .map((value, index) =>
      index === 0 ? `${value}` : `${value}`.padStart(2, "0")
    )
    .join("-");
}

function _inferPublicationType(type: string) {
  if (type.includes("journal")) {
    return 0;
  }
  if (type.includes("proceedings") || type.includes("conference")) {
    return 1;
  }
  if (type.includes("book")) {
    return 3;
  }

  return 2;
}

function _normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function _toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function _getMainURL(draft: Entity) {
  return `${(draft as unknown as { mainURL?: string }).mainURL || ""}`;
}

function _setMainURL(draft: Entity, mainURL?: string) {
  if (!mainURL) {
    return;
  }
  (draft as unknown as { mainURL?: string }).mainURL = mainURL;
}
