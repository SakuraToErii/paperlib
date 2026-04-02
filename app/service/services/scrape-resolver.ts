import { Entity } from "@/models/entity";

import { ScrapeMatchBasis, ScrapeSeed } from "./scrape-contract";

export interface ScrapeInputResolver {
  canResolve(payload: unknown): boolean;
  resolve(payload: unknown): ScrapeSeed;
}

export interface PaperEntityPayload {
  type: "PaperEntity";
  value: Entity | Record<string, unknown>;
}

export class PaperEntityInputResolver implements ScrapeInputResolver {
  canResolve(payload: unknown): payload is PaperEntityPayload {
    return (payload as PaperEntityPayload)?.type === "PaperEntity" && !!(payload as PaperEntityPayload)?.value;
  }

  resolve(payload: unknown): ScrapeSeed {
    const paperEntityPayload = payload as PaperEntityPayload;
    const entity = new Entity(paperEntityPayload.value as Partial<Entity>);

    return {
      kind: "entity-draft",
      payload,
      basis: "paper-entity",
      entity,
    };
  }
}

export class DefaultScrapeInputResolver implements ScrapeInputResolver {
  canResolve(_payload: unknown): boolean {
    return true;
  }

  resolve(payload: unknown): ScrapeSeed {
    return {
      kind: "entry-payload",
      payload,
      basis: this._inferBasis(payload),
    };
  }

  private _inferBasis(payload: unknown): ScrapeMatchBasis {
    if (typeof payload === "object" && payload !== null && "type" in payload) {
      const payloadType = String((payload as { type?: unknown }).type || "").toLowerCase();
      const payloadValue = String((payload as { value?: unknown }).value || "").toLowerCase();
      if (payloadType.includes("bib")) {
        return "bibtex";
      }
      if (payloadType.includes("file")) {
        if (payloadValue.endsWith(".bib")) {
          return "bibtex";
        }
        if (payloadValue.endsWith(".pdf")) {
          return "pdf";
        }
      }
      if (payloadType.includes("doi")) {
        return "doi";
      }
      if (payloadType.includes("arxiv")) {
        return "arxiv";
      }
      if (payloadType.includes("url") || payloadType.includes("web")) {
        return "url";
      }
      if (payloadType.includes("title")) {
        return "title";
      }
    }

    return "payload";
  }
}

export class ScrapeInputResolverRegistry {
  constructor(private readonly _resolvers: ScrapeInputResolver[]) {}

  resolve(payload: unknown): ScrapeSeed {
    const resolver = this._resolvers.find((candidate) => candidate.canResolve(payload));

    if (!resolver) {
      throw new Error("No scrape input resolver available.");
    }

    return resolver.resolve(payload);
  }
}
