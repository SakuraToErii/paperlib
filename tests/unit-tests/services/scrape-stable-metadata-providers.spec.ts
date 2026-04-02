import { describe, expect, it, vi } from "vitest";

import { Entity } from "../../../app/models/entity";
import {
  ArxivMetadataProvider,
  DOIMetadataProvider,
  createStableMetadataProviders,
  normalizeArxivId,
  normalizeDOI,
} from "../../../app/service/services/scrape-stable-metadata-providers";

function createResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {}
) {
  const { ok = true, status = 200 } = init;

  return {
    ok,
    status,
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  } as Response;
}

describe("scrape stable metadata providers", () => {
  it("normalizes DOI and arXiv identifiers for builtin provider requests", () => {
    expect(normalizeDOI("https://doi.org/10.1000/xyz-123")).toBe(
      "10.1000/xyz-123"
    );
    expect(normalizeDOI("doi: 10.1000/xyz-123 ")).toBe("10.1000/xyz-123");
    expect(normalizeArxivId("https://arxiv.org/abs/2404.01234v2")).toBe(
      "2404.01234v2"
    );
    expect(normalizeArxivId("arXiv: 2404.01234v2 ")).toBe("2404.01234v2");
  });

  it("hydrates metadata from Crossref for DOI-backed drafts", async () => {
    const fetchMock = vi.fn(async () =>
      createResponse({
        message: {
          DOI: "10.1000/test-doi",
          title: ["Built-in DOI Title"],
          author: [
            { given: "Ada", family: "Lovelace" },
            { given: "Grace", family: "Hopper" },
          ],
          abstract: "  DOI abstract  ",
          issued: {
            "date-parts": [[2024, 4, 2]],
          },
          page: "10-20",
          volume: "7",
          issue: "2",
          publisher: "Paperlib Press",
          type: "journal-article",
          "container-title": ["Journal of Builtins"],
        },
      })
    );
    const provider = new DOIMetadataProvider({
      fetch: fetchMock as typeof fetch,
    });
    const seed = new Entity({
      _id: "507f1f77bcf86cd799439011",
      title: "Seed Title",
      authors: "Seed Author",
      doi: "https://doi.org/10.1000/test-doi",
      year: "2020",
      tags: [],
      folders: [],
      supplementaries: {},
    });

    const result = await provider.scrape([seed]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.crossref.org/works/10.1000%2Ftest-doi"
    );
    expect(result.status).toBe("matched");
    expect(result.basis).toBe("doi");
    expect(result.warnings).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      requestedCount: 1,
      matchedCount: 1,
      totalCount: 1,
    });
    expect(result.data[0]).toBeInstanceOf(Entity);
    expect(result.data[0].title).toBe("Built-in DOI Title");
    expect(result.data[0].authors).toBe("Ada Lovelace, Grace Hopper");
    expect(result.data[0].doi).toBe("10.1000/test-doi");
    expect(result.data[0].publication).toBe("Journal of Builtins");
    expect(result.data[0].journal).toBe("Journal of Builtins");
    expect(result.data[0].pubTime).toBe("2024-04-02");
    expect(result.data[0].year).toBe("2024");
    expect(result.data[0].pages).toBe("10-20");
    expect(result.data[0].volume).toBe("7");
    expect(result.data[0].number).toBe("2");
    expect(result.data[0].publisher).toBe("Paperlib Press");
  });

  it("hydrates metadata from arXiv Atom responses for arXiv-backed drafts", async () => {
    const fetchMock = vi.fn(async () =>
      createResponse(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2404.01234v2</id>
    <updated>2024-04-02T00:00:00Z</updated>
    <published>2024-04-01T00:00:00Z</published>
    <title>  Built-in arXiv Title\n    </title>
    <summary>  arXiv abstract text\n    </summary>
    <author><name>Ada Lovelace</name></author>
    <author><name>Grace Hopper</name></author>
    <arxiv:doi>10.48550/arXiv.2404.01234</arxiv:doi>
  </entry>
</feed>`)
    );
    const provider = new ArxivMetadataProvider({
      fetch: fetchMock as typeof fetch,
    });
    const seed = new Entity({
      _id: "507f1f77bcf86cd799439022",
      title: "Seed arXiv Title",
      authors: "Seed Author",
      arxiv: "arXiv:2404.01234v2",
      year: "2023",
      tags: [],
      folders: [],
      supplementaries: {},
    });

    const result = await provider.scrape([seed]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://export.arxiv.org/api/query?id_list=2404.01234v2"
    );
    expect(result.status).toBe("matched");
    expect(result.basis).toBe("arxiv");
    expect(result.data[0].title).toBe("Built-in arXiv Title");
    expect(result.data[0].authors).toBe("Ada Lovelace, Grace Hopper");
    expect(result.data[0].arxiv).toBe("2404.01234v2");
    expect(result.data[0].doi).toBe("10.48550/arXiv.2404.01234");
    expect(result.data[0].publication).toBe("arXiv");
    expect(result.data[0].pubTime).toBe("2024-04-01T00:00:00Z");
    expect(result.data[0].year).toBe("2024");
    expect(result.data[0].abstract).toBe("arXiv abstract text");
  });

  it("preserves unmatched drafts and reports no-match when stable identifiers are absent", async () => {
    const fetchMock = vi.fn();
    const providers = createStableMetadataProviders({
      fetch: fetchMock as typeof fetch,
    });
    const seed = new Entity({
      _id: "507f1f77bcf86cd799439033",
      title: "No identifier",
      authors: "Seed Author",
      year: "2024",
      tags: [],
      folders: [],
      supplementaries: {},
    });

    const [doiResult, arxivResult] = await Promise.all(
      providers.map((provider) => provider.scrape([seed]))
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(doiResult.status).toBe("no-match");
    expect(arxivResult.status).toBe("no-match");
    expect(doiResult.data[0].title).toBe("No identifier");
    expect(arxivResult.data[0].title).toBe("No identifier");
  });
});
