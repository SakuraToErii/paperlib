import Cite from "citation-js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { Entity, EntityType } from "@/models/entity";

import {
  ScrapeEntryDraftGroup,
  ScrapeProviderDescriptor,
  ScrapeProviderResult,
} from "./scrape-contract";
import {
  normalizeArxivId,
  normalizeDOI,
} from "./scrape-stable-metadata-providers";

type CslAuthor = {
  given?: string;
  family?: string;
  literal?: string;
  name?: string;
};

type CslDate = {
  "date-parts"?: Array<Array<string | number>>;
};

type CslRecord = {
  type?: string;
  title?: string;
  author?: CslAuthor[];
  abstract?: string;
  DOI?: string;
  URL?: string;
  publisher?: string;
  page?: string;
  volume?: string;
  issue?: string;
  issued?: CslDate;
  published?: CslDate;
  ["container-title"]?: string | string[];
};

type WebcontentPayload = {
  type: "webcontent";
  value?: {
    url?: string;
    document?: string;
  };
};

type FilePayload = {
  type: "file";
  value?: string;
};

type BibtexPayload = {
  type: "bibtex";
  value?: string;
};

type EntryPayload = WebcontentPayload | FilePayload | BibtexPayload;

type ReadTextFile = (filePath: string) => Promise<string>;
type ReadPdfText = (filePath: string) => Promise<string>;

export interface StableEntryProvider {
  readonly descriptor: ScrapeProviderDescriptor;
  scrape(payloads: unknown[]): Promise<ScrapeProviderResult<ScrapeEntryDraftGroup[]>>;
}

interface StableEntryProviderOptions {
  readTextFile?: ReadTextFile;
  readPdfText?: ReadPdfText;
}

let mupdfModulePromise: Promise<typeof import("mupdf") | null> | null = null;

async function loadMuPDF(): Promise<typeof import("mupdf") | null> {
  if (!mupdfModulePromise) {
    mupdfModulePromise = import("mupdf")
      .then((module) => module)
      .catch(() => null);
  }

  return mupdfModulePromise;
}

function compactWhitespace(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function coerceArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function createResult(
  provider: ScrapeProviderDescriptor,
  status: ScrapeProviderResult<ScrapeEntryDraftGroup[]>["status"],
  basis: ScrapeProviderResult<ScrapeEntryDraftGroup[]>["basis"],
  data: ScrapeEntryDraftGroup[],
  warnings: string[],
  diagnostics: Record<string, unknown>,
  complete = status === "matched"
): ScrapeProviderResult<ScrapeEntryDraftGroup[]> {
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

function parseMetaAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributeRegex =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;

  let match: RegExpExecArray | null;
  while ((match = attributeRegex.exec(tag))) {
    const [, key, doubleQuoted, singleQuoted, bare] = match;
    attributes[key.toLowerCase()] = `${doubleQuoted || singleQuoted || bare || ""}`;
  }

  return attributes;
}

function extractMetaMap(html: string): Map<string, string[]> {
  const metaMap = new Map<string, string[]>();
  const metaRegex = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaRegex.exec(html))) {
    const attributes = parseMetaAttributes(match[0]);
    const content = compactWhitespace(attributes.content);
    if (!content) {
      continue;
    }

    const keys = [attributes.name, attributes.property, attributes["http-equiv"]]
      .map((value) => compactWhitespace(value).toLowerCase())
      .filter(Boolean);

    for (const key of keys) {
      const values = metaMap.get(key) || [];
      values.push(content);
      metaMap.set(key, values);
    }
  }

  return metaMap;
}

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return compactWhitespace(titleMatch?.[1]);
}

function extractAllMeta(metaMap: Map<string, string[]>, ...keys: string[]) {
  return keys.flatMap((key) => metaMap.get(key.toLowerCase()) || []);
}

function extractFirstMeta(metaMap: Map<string, string[]>, ...keys: string[]) {
  return compactWhitespace(extractAllMeta(metaMap, ...keys)[0]);
}

function normalizePages(firstPage?: string, lastPage?: string, pages?: string) {
  const normalizedPages = compactWhitespace(pages);
  if (normalizedPages) {
    return normalizedPages;
  }

  const start = compactWhitespace(firstPage);
  const end = compactWhitespace(lastPage);
  if (start && end) {
    return `${start}-${end}`;
  }

  return start || end;
}

function normalizeDate(value?: string) {
  const trimmed = compactWhitespace(value);
  if (!trimmed) {
    return { pubTime: "", year: "", month: "" };
  }

  const parts = trimmed.match(/^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?/);
  if (!parts) {
    return {
      pubTime: trimmed,
      year: trimmed.slice(0, 4),
      month: "",
    };
  }

  const [, year, month, day] = parts;
  const formatted = [year, month, day]
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? `${part}` : `${part}`.padStart(2, "0")
    )
    .join("-");

  return {
    pubTime: formatted,
    year: year || "",
    month: month ? `${Number.parseInt(month, 10)}` : "",
  };
}

function normalizeLocalFilePath(filePath: string) {
  if (filePath.startsWith("file://")) {
    return fileURLToPath(filePath);
  }

  return filePath;
}

function basenameWithoutExtension(filePath: string) {
  const localPath = normalizeLocalFilePath(filePath);
  return compactWhitespace(
    decodeURIComponent(path.basename(localPath, path.extname(localPath))).replace(
      /[_+]+/g,
      " "
    )
  );
}

function createFileSupplementaries(fileURL: string) {
  const normalizedURL = compactWhitespace(fileURL);
  if (!normalizedURL) {
    return {
      defaultSup: undefined,
      supplementaries: {} as Record<string, never>,
    };
  }

  return {
    defaultSup: "main",
    supplementaries: {
      main: {
        _id: "main",
        name: path.basename(normalizeLocalFilePath(normalizedURL)),
        url: normalizedURL,
      },
    },
  };
}

function assignMainURL(entity: Entity, mainURL?: string) {
  const normalizedURL = compactWhitespace(mainURL);
  if (!normalizedURL) {
    return entity;
  }

  (entity as Entity & { mainURL?: string }).mainURL = normalizedURL;
  return entity;
}

function resolveURL(candidate: string, baseURL?: string) {
  const normalized = compactWhitespace(candidate);
  if (!normalized) {
    return "";
  }

  try {
    if (!baseURL) {
      return new URL(normalized).toString();
    }

    return new URL(normalized, baseURL).toString();
  } catch {
    return normalized;
  }
}

function inferEntityType(recordType?: string): EntityType {
  const normalizedType = compactWhitespace(recordType).toLowerCase();

  if (normalizedType.includes("journal")) {
    return "article";
  }
  if (
    normalizedType.includes("conference") ||
    normalizedType.includes("proceedings")
  ) {
    return "inproceedings";
  }
  if (normalizedType.includes("book")) {
    return "book";
  }
  if (normalizedType.includes("report")) {
    return "techreport";
  }
  if (normalizedType.includes("thesis")) {
    return normalizedType.includes("phd") ? "phdthesis" : "mastersthesis";
  }

  return "article";
}

function mapAuthors(authors: CslAuthor[] = []) {
  return authors
    .map((author) =>
      compactWhitespace(
        [author.given, author.family].filter(Boolean).join(" ") ||
          author.literal ||
          author.name
      )
    )
    .filter(Boolean)
    .join(", ");
}

function formatDateFromParts(parts?: Array<string | number>) {
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

function mapBibtexRecordToEntity(record: CslRecord) {
  const publication = compactWhitespace(
    coerceArray(record["container-title"])[0] as string | undefined
  );
  const pubTime =
    formatDateFromParts(record.issued?.["date-parts"]?.[0]) ||
    formatDateFromParts(record.published?.["date-parts"]?.[0]);
  const year = pubTime.slice(0, 4);
  const isConference =
    compactWhitespace(record.type).toLowerCase().includes("conference") ||
    compactWhitespace(record.type).toLowerCase().includes("proceedings") ||
    compactWhitespace(record.type).toLowerCase() === "chapter";

  return assignMainURL(
    new Entity({
    type: inferEntityType(record.type),
    title: compactWhitespace(record.title),
    authors: mapAuthors(record.author || []),
    abstract: compactWhitespace(record.abstract),
    doi: normalizeDOI(record.DOI),
    journal: isConference ? "" : publication,
    booktitle: isConference ? publication : "",
    publication,
    pubTime,
    year,
    volume: compactWhitespace(record.volume),
    number: compactWhitespace(record.issue),
    pages: compactWhitespace(record.page),
    publisher: compactWhitespace(record.publisher),
    tags: [],
    folders: [],
    supplementaries: {},
    }),
    resolveURL(record.URL || "")
  );
}

function findDOI(value?: string) {
  const match = `${value || ""}`.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return normalizeDOI(match?.[0]?.replace(/[)\];.,]+$/g, ""));
}

function findArxivId(value?: string) {
  const text = `${value || ""}`;
  const prefixedMatch = text.match(
    /(?:arxiv:\s*|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)/i
  );
  if (prefixedMatch?.[1]) {
    return normalizeArxivId(prefixedMatch[1]);
  }

  const newStyleMatch = text.match(/\b\d{4}\.\d{4,5}(?:v\d+)?\b/i);
  if (newStyleMatch?.[0]) {
    return normalizeArxivId(newStyleMatch[0]);
  }

  const legacyMatch = text.match(
    /\b[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?\b/i
  );
  return normalizeArxivId(legacyMatch?.[0]);
}

async function defaultReadTextFile(filePath: string) {
  return fs.readFile(normalizeLocalFilePath(filePath), "utf8");
}

async function defaultReadPdfText(filePath: string) {
  const localPath = normalizeLocalFilePath(filePath);
  const fileBuffer = await fs.readFile(localPath);
  const rawText = fileBuffer.toString("utf8");
  const mupdf = await loadMuPDF();

  if (!mupdf) {
    return rawText;
  }

  try {
    const pdf = mupdf.Document.openDocument(
      fileBuffer as any,
      "application/pdf"
    );

    let structuredText = "";

    for (let i = 0; i < pdf.countPages(); i++) {
      const page = pdf.loadPage(i);
      const json = JSON.parse(
        page.toStructuredText("preserve-whitespace").asJSON()
      ) as {
        blocks?: Array<{
          lines?: Array<{
            text?: string;
          }>;
        }>;
      };

      for (const block of json.blocks || []) {
        for (const line of block.lines || []) {
          structuredText += `${line.text || ""} `;
        }
      }
    }

    return `${rawText}\n${structuredText}`.trim();
  } catch {
    return rawText;
  }
}

abstract class BaseStableEntryProvider implements StableEntryProvider {
  readonly descriptor: ScrapeProviderDescriptor;

  constructor(descriptor: ScrapeProviderDescriptor) {
    this.descriptor = descriptor;
  }

  async scrape(
    payloads: unknown[]
  ): Promise<ScrapeProviderResult<ScrapeEntryDraftGroup[]>> {
    const warnings: string[] = [];
    let handledCount = 0;
    let matchedCount = 0;
    const data: ScrapeEntryDraftGroup[] = [];

    for (const [payloadIndex, payload] of payloads.entries()) {
      if (!this._canHandle(payload)) {
        continue;
      }

      handledCount += 1;

      try {
        const entries = await this._scrapePayload(payload);
        if (entries.length > 0) {
          matchedCount += 1;
          data.push({
            payloadIndex,
            drafts: entries.map((entry) => new Entity(entry)),
          });
        }
      } catch (error) {
        warnings.push(
          `${this.descriptor.id}: ${
            (error as Error).message || "unknown error"
          }`
        );
      }
    }

    const status =
      data.length > 0 ? "matched" : warnings.length > 0 ? "error" : "no-match";

    return createResult(
      this.descriptor,
      status,
      this._basis(),
      data,
      warnings,
      {
        handledCount,
        matchedCount,
        totalPayloadCount: payloads.length,
      }
    );
  }

  protected abstract _basis(): ScrapeProviderResult<ScrapeEntryDraftGroup[]>["basis"];
  protected abstract _canHandle(payload: unknown): boolean;
  protected abstract _scrapePayload(payload: unknown): Promise<Entity[]>;
}

export class BibtexEntryProvider extends BaseStableEntryProvider {
  private readonly _readTextFile: ReadTextFile;

  constructor(options: StableEntryProviderOptions = {}) {
    super({
      id: "builtin:bibtex",
      kind: "entry",
      label: "Builtin BibTeX entry provider",
      priority: 10,
      aliases: ["bibtex"],
    });
    this._readTextFile = options.readTextFile || defaultReadTextFile;
  }

  protected _basis(): ScrapeProviderResult<ScrapeEntryDraftGroup[]>["basis"] {
    return "bibtex";
  }

  protected _canHandle(payload: unknown): boolean {
    if ((payload as BibtexPayload)?.type === "bibtex") {
      return true;
    }

    if ((payload as FilePayload)?.type !== "file") {
      return false;
    }

    const filePath = `${(payload as FilePayload).value || ""}`.toLowerCase();
    return filePath.endsWith(".bib") || filePath.endsWith(".bibtex");
  }

  protected async _scrapePayload(payload: unknown): Promise<Entity[]> {
    const bibtex =
      (payload as BibtexPayload)?.type === "bibtex"
        ? `${(payload as BibtexPayload).value || ""}`
        : await this._readTextFile(`${(payload as FilePayload).value || ""}`);

    const records = new Cite(bibtex).data as unknown as CslRecord[];
    return records.map((record) => mapBibtexRecordToEntity(record));
  }
}

export class GenericWebcontentEntryProvider extends BaseStableEntryProvider {
  constructor() {
    super({
      id: "builtin:html-metadata",
      kind: "entry",
      label: "Builtin generic webcontent metadata provider",
      priority: 20,
      aliases: ["html", "webcontent"],
    });
  }

  protected _basis(): ScrapeProviderResult<ScrapeEntryDraftGroup[]>["basis"] {
    return "url";
  }

  protected _canHandle(payload: unknown): boolean {
    return (payload as WebcontentPayload)?.type === "webcontent";
  }

  protected async _scrapePayload(payload: unknown): Promise<Entity[]> {
    const webcontent = (payload as WebcontentPayload).value || {};
    const url = compactWhitespace(webcontent.url);
    const html = `${webcontent.document || ""}`;
    const metaMap = extractMetaMap(html);
    const title =
      extractFirstMeta(
        metaMap,
        "citation_title",
        "dc.title",
        "og:title",
        "twitter:title"
      ) || extractTitle(html);
    const doi =
      normalizeDOI(
        extractFirstMeta(
          metaMap,
          "citation_doi",
          "dc.identifier",
          "dc.identifier.doi",
          "prism.doi",
          "doi"
        )
      ) || findDOI(`${html}\n${url}`);
    const arxiv =
      normalizeArxivId(
        extractFirstMeta(metaMap, "citation_arxiv_id", "arxiv", "arxiv:id")
      ) || findArxivId(`${html}\n${url}`);
    const authors = extractAllMeta(metaMap, "citation_author", "dc.creator")
      .map((author) => compactWhitespace(author))
      .filter(Boolean)
      .join(", ");
    const publication = extractFirstMeta(
      metaMap,
      "citation_journal_title",
      "citation_conference_title",
      "prism.publicationname",
      "dc.source"
    );
    const conferenceTitle = extractFirstMeta(metaMap, "citation_conference_title");
    const abstract = extractFirstMeta(
      metaMap,
      "citation_abstract",
      "dc.description",
      "description",
      "og:description",
      "twitter:description"
    );
    const publisher = extractFirstMeta(
      metaMap,
      "citation_publisher",
      "dc.publisher"
    );
    const volume = extractFirstMeta(metaMap, "citation_volume", "prism.volume");
    const number = extractFirstMeta(
      metaMap,
      "citation_issue",
      "prism.number"
    );
    const pages = normalizePages(
      extractFirstMeta(metaMap, "citation_firstpage"),
      extractFirstMeta(metaMap, "citation_lastpage"),
      extractFirstMeta(metaMap, "citation_pages")
    );
    const pdfURL = resolveURL(
      extractFirstMeta(metaMap, "citation_pdf_url", "pdf_url"),
      url
    );
    const { pubTime, year, month } = normalizeDate(
      extractFirstMeta(
        metaMap,
        "citation_publication_date",
        "citation_online_date",
        "dc.date",
        "prism.publicationdate"
      )
    );

    const hasUsefulMetadata =
      !!title ||
      !!authors ||
      !!doi ||
      !!arxiv ||
      !!publication ||
      !!abstract ||
      !!pdfURL;

    if (!hasUsefulMetadata) {
      return [];
    }

    return [
      assignMainURL(
        new Entity({
          type:
            conferenceTitle || publication.toLowerCase().includes("conference")
            ? "inproceedings"
            : "article",
          title,
          authors,
          abstract,
          doi,
          arxiv,
          journal: conferenceTitle ? "" : publication,
          booktitle: conferenceTitle || "",
          publication,
          pubTime,
          year,
          month,
          volume,
          number,
          pages,
          publisher,
          tags: [],
          folders: [],
          supplementaries: {},
        }),
        pdfURL || url
      ),
    ];
  }
}

export class PDFIdentifierBootstrapEntryProvider extends BaseStableEntryProvider {
  private readonly _readPdfText: ReadPdfText;

  constructor(options: StableEntryProviderOptions = {}) {
    super({
      id: "builtin:pdf-bootstrap",
      kind: "entry",
      label: "Builtin PDF identifier bootstrap provider",
      priority: 30,
      aliases: ["pdf"],
    });
    this._readPdfText = options.readPdfText || defaultReadPdfText;
  }

  protected _basis(): ScrapeProviderResult<ScrapeEntryDraftGroup[]>["basis"] {
    return "pdf";
  }

  protected _canHandle(payload: unknown): boolean {
    if ((payload as FilePayload)?.type === "file") {
      return `${(payload as FilePayload).value || ""}`
        .toLowerCase()
        .endsWith(".pdf");
    }

    if ((payload as WebcontentPayload)?.type === "webcontent") {
      const url = compactWhitespace((payload as WebcontentPayload).value?.url);
      return url.toLowerCase().endsWith(".pdf");
    }

    return false;
  }

  protected async _scrapePayload(payload: unknown): Promise<Entity[]> {
    const fileValue =
      (payload as FilePayload)?.type === "file"
        ? `${(payload as FilePayload).value || ""}`
        : "";
    const urlValue =
      (payload as WebcontentPayload)?.type === "webcontent"
        ? compactWhitespace((payload as WebcontentPayload).value?.url)
        : fileValue;
    const identifierSourceParts = [urlValue, basenameWithoutExtension(urlValue)];

    if (fileValue) {
      identifierSourceParts.push(await this._readPdfText(fileValue));
    }

    const identifierSource = identifierSourceParts.join("\n");
    const doi = findDOI(identifierSource);
    const arxiv = findArxivId(identifierSource);

    if (!doi && !arxiv) {
      return [];
    }

    return [
      new Entity({
        type: "article",
        title: basenameWithoutExtension(urlValue),
        doi,
        arxiv,
        ...createFileSupplementaries(urlValue),
        tags: [],
        folders: [],
      }),
    ];
  }
}

export function createStableEntryProviders(
  options: StableEntryProviderOptions = {}
): StableEntryProvider[] {
  return [
    new BibtexEntryProvider(options),
    new GenericWebcontentEntryProvider(),
    new PDFIdentifierBootstrapEntryProvider(options),
  ];
}
