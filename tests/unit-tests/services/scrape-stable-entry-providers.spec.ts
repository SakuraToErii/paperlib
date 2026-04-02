import { describe, expect, it } from "vitest";

import { Entity } from "../../../app/models/entity";
import {
  BibtexEntryProvider,
  GenericWebcontentEntryProvider,
  PDFIdentifierBootstrapEntryProvider,
} from "../../../app/service/services/scrape-stable-entry-providers";

describe("scrape stable entry providers", () => {
  it("parses BibTeX payloads into app-owned entity drafts", async () => {
    const provider = new BibtexEntryProvider();

    const result = await provider.scrape([
      {
        type: "bibtex",
        value: `@inproceedings{paperlib2026,
  title={Paperlib Stable Entry Provider},
  author={Lovelace, Ada and Hopper, Grace},
  booktitle={Proceedings of the Local First Conference},
  year={2026},
  doi={10.1000/paperlib-bibtex}
}`,
      },
    ]);

    expect(result.status).toBe("matched");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].payloadIndex).toBe(0);
    expect(result.data[0].drafts[0]).toBeInstanceOf(Entity);
    expect(result.data[0].drafts[0].title).toBe("Paperlib Stable Entry Provider");
    expect(result.data[0].drafts[0].authors).toBe("Ada Lovelace, Grace Hopper");
    expect(result.data[0].drafts[0].doi).toBe("10.1000/paperlib-bibtex");
    expect(result.data[0].drafts[0].booktitle).toBe(
      "Proceedings of the Local First Conference"
    );
    expect(result.data[0].drafts[0].publication).toBe(
      "Proceedings of the Local First Conference"
    );
    expect(result.data[0].drafts[0].year).toBe("2026");
  });

  it("extracts generic HTML metadata from browser webcontent payloads", async () => {
    const provider = new GenericWebcontentEntryProvider();

    const result = await provider.scrape([
      {
        type: "webcontent",
        value: {
          url: "https://example.test/paper",
          document: `<!doctype html>
            <html>
              <head>
                <meta name="citation_title" content="Generic HTML Title" />
                <meta name="citation_author" content="Ada Lovelace" />
                <meta name="citation_author" content="Grace Hopper" />
                <meta name="citation_doi" content="10.1000/html-doi" />
                <meta name="citation_journal_title" content="Journal of HTML" />
                <meta name="citation_publication_date" content="2026-04-02" />
                <meta name="citation_pdf_url" content="/paper.pdf" />
                <meta name="description" content="HTML abstract" />
              </head>
            </html>`,
        },
      },
    ]);

    expect(result.status).toBe("matched");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].drafts[0].title).toBe("Generic HTML Title");
    expect(result.data[0].drafts[0].authors).toBe("Ada Lovelace, Grace Hopper");
    expect(result.data[0].drafts[0].doi).toBe("10.1000/html-doi");
    expect(result.data[0].drafts[0].publication).toBe("Journal of HTML");
    expect(result.data[0].drafts[0].journal).toBe("Journal of HTML");
    expect(result.data[0].drafts[0].abstract).toBe("HTML abstract");
    expect(result.data[0].drafts[0].pubTime).toBe("2026-04-02");
    expect(result.data[0].drafts[0].year).toBe("2026");
  });

  it("bootstraps DOI/arXiv identifiers from PDF payload text", async () => {
    const provider = new PDFIdentifierBootstrapEntryProvider({
      readPdfText: async () =>
        "This PDF mentions doi:10.48550/arXiv.2404.01234 and arXiv:2404.01234v2",
    });

    const result = await provider.scrape([
      {
        type: "file",
        value: "/Users/testuser/Papers/Bootstrap Paper.pdf",
      },
    ]);

    expect(result.status).toBe("matched");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].drafts[0].title).toBe("Bootstrap Paper");
    expect(result.data[0].drafts[0].doi).toBe("10.48550/arXiv.2404.01234");
    expect(result.data[0].drafts[0].arxiv).toBe("2404.01234v2");
    expect(result.data[0].drafts[0].defaultSup).toBe("main");
    expect(result.data[0].drafts[0].supplementaries.main.url).toBe(
      "/Users/testuser/Papers/Bootstrap Paper.pdf"
    );
  });
});
