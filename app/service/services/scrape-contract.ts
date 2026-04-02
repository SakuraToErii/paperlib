import { Entity } from "@/models/entity";

export type ScrapeProviderKind = "entry" | "metadata" | "fuzzy";
export type ScrapeSeedKind = "entry-payload" | "entity-draft";
export type ScrapeMatchBasis =
  | "payload"
  | "paper-entity"
  | "doi"
  | "arxiv"
  | "title"
  | "url"
  | "unknown";
export type ScrapeExecutionStatus = "matched" | "skipped" | "no-match" | "error";

export interface ScrapeProviderDescriptor {
  id: string;
  kind: ScrapeProviderKind;
  label?: string;
  priority?: number;
}

export interface ScrapeSeed {
  kind: ScrapeSeedKind;
  payload: unknown;
  basis: ScrapeMatchBasis;
  entity?: Entity;
}

export interface ScrapeProviderResult<TData> {
  provider: ScrapeProviderDescriptor;
  status: ScrapeExecutionStatus;
  basis: ScrapeMatchBasis;
  data: TData;
  confidence?: number;
  complete?: boolean;
  warnings: string[];
  diagnostics?: Record<string, unknown>;
}

export interface ScrapeMergeContext {
  providerId: string;
  providerIndex: number;
  force: boolean;
}
