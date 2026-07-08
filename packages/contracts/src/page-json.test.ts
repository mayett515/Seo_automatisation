import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ApprovedReleaseArtifactPageSchema,
  CreateReleasePlanRequestSchema,
  PageJsonSchema,
  PageProposalJsonSchema,
  ReviewPageVersionRequestSchema,
  type PageJson
} from "./index.js";

void describe("PageJsonSchema", () => {
  void it("parses a structured v1 page", () => {
    assert.equal(PageJsonSchema.safeParse(validPageJson()).success, true);
  });

  void it("rejects duplicate section ids", () => {
    const result = PageJsonSchema.safeParse(
      validPageJson({
        sections: [
          section({ id: "hero-1", order: 0 }),
          section({ id: "hero-1", order: 1, type: "ServiceIntro", registryKey: "ServiceIntro.default" })
        ]
      })
    );

    assert.equal(result.success, false);
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /Duplicate PageJson section id/u);
  });

  void it("rejects raw markup, style, class, script, and event-handler keys deeply inside props", () => {
    const result = PageJsonSchema.safeParse(
      validPageJson({
        sections: [
          section({
            props: {
              nested: [
                {
                  content: {
                    class: "hero-card",
                    style: "color:red",
                    onClick: "alert(1)"
                  }
                }
              ]
            }
          })
        ]
      })
    );

    assert.equal(result.success, false);
    const messages = result.error.issues.map((issue) => issue.message).join("\n");
    assert.match(messages, /class/u);
    assert.match(messages, /style/u);
    assert.match(messages, /onClick/u);
  });

  void it("rejects unsafe javascript and html data URL string values", () => {
    const result = PageJsonSchema.safeParse(
      validPageJson({
        sections: [
          section({
            props: {
              ctaHref: "javascript:alert(1)",
              iframeSource: "data:text/html,<script>alert(1)</script>",
              obfuscatedHref: "java\tscript:alert(1)"
            }
          })
        ]
      })
    );

    assert.equal(result.success, false);
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /javascript: or data:text\/html/u);
  });

  void it("rejects protocol-relative and backslash page paths", () => {
    const result = PageJsonSchema.safeParse(
      validPageJson({
        seo: {
          title: "Entruempelung Dachau",
          metaDescription: "Entruempelung in Dachau mit lokaler Erfahrung.",
          canonicalPath: "//evil.example/entruempelung-dachau/",
          robots: "noindex",
          jsonLd: [],
          sitemapReady: false
        },
        internalLinks: ["/kontakt\\evil"],
        sections: [
          section({
            props: {
              h1: "Entruempelung Dachau",
              primaryCtaHref: "//evil.example/kontakt/"
            }
          })
        ]
      })
    );

    assert.equal(result.success, false);
    const messages = result.error.issues.map((issue) => issue.message).join("\n");
    assert.match(messages, /protocol-relative/u);
    assert.match(messages, /backslashes/u);
  });

  void it("rejects pathologically deep PageJson props", () => {
    const result = PageJsonSchema.safeParse(
      validPageJson({
        sections: [
          section({
            props: {
              nested: nestedObject(40)
            }
          })
        ]
      })
    );

    assert.equal(result.success, false);
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /scan depth/u);
  });

  void it("rejects PageJson that exceeds the safety scan node budget", () => {
    const result = PageJsonSchema.safeParse(
      validPageJson({
        sections: [
          section({
            props: {
              many: Array.from({ length: 5_001 }, (_, index) => index)
            }
          })
        ]
      })
    );

    assert.equal(result.success, false);
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /scan limit/u);
  });
});

void describe("PageProposalJsonSchema", () => {
  void it("requires projected route and primary keyword to match the embedded PageJson", () => {
    const result = PageProposalJsonSchema.safeParse({
      schemaVersion: 1,
      projectId: "project-1",
      route: "/entruempelung-dachau/",
      primaryKeyword: "Entruempelung Dachau",
      page: validPageJson({ route: "/other/" })
    });

    assert.equal(result.success, false);
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /route must match/u);
  });
});

void describe("ApprovedReleaseArtifactPageSchema", () => {
  void it("requires PageJson for create and update actions", () => {
    const result = ApprovedReleaseArtifactPageSchema.safeParse({
      releasePlanItemId: "item-1",
      pageVersionId: "version-1",
      targetUrl: "/entruempelung-dachau/",
      targetSubdomain: null,
      action: "create",
      pageJson: null
    });

    assert.equal(result.success, false);
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /Renderable release actions require/u);
  });

  void it("allows redirect, remove, and noindex actions without PageJson", () => {
    for (const action of ["redirect", "remove", "noindex"] as const) {
      assert.equal(
        ApprovedReleaseArtifactPageSchema.safeParse({
          releasePlanItemId: `item-${action}`,
          pageVersionId: null,
          targetUrl: "/entruempelung-dachau/",
          targetSubdomain: null,
          action,
          pageJson: null
        }).success,
        true
      );
    }
  });
});

void describe("ReviewPageVersionRequestSchema", () => {
  void it("requires a decision note when requesting changes", () => {
    const result = ReviewPageVersionRequestSchema.safeParse({ decision: "request_changes" });

    assert.equal(result.success, false);
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /requires a decision note/u);
  });

  void it("allows approval without a decision note", () => {
    assert.equal(ReviewPageVersionRequestSchema.safeParse({ decision: "approve" }).success, true);
  });
});

void describe("CreateReleasePlanRequestSchema", () => {
  void it("requires at least one page version id", () => {
    const result = CreateReleasePlanRequestSchema.safeParse({ pageVersionIds: [] });

    assert.equal(result.success, false);
  });

  void it("accepts approved page-version candidates by id", () => {
    assert.equal(
      CreateReleasePlanRequestSchema.safeParse({
        pageVersionIds: ["11111111-1111-4111-8111-111111111111"]
      }).success,
      true
    );
  });
});

function validPageJson(input: Partial<PageJson> = {}): PageJson {
  return {
    schemaVersion: 1,
    route: "/entruempelung-dachau/",
    pageType: "service_area_page",
    target: {
      service: "Entruempelung",
      location: "Dachau",
      primaryKeyword: "Entruempelung Dachau",
      secondaryKeywords: ["Wohnungsaufloesung Dachau"]
    },
    seo: {
      title: "Entruempelung Dachau",
      metaDescription: "Entruempelung in Dachau mit lokaler Erfahrung.",
      canonicalPath: "/entruempelung-dachau/",
      robots: "noindex",
      jsonLd: [],
      sitemapReady: false
    },
    sections: [section()],
    internalLinks: ["/"],
    evidenceRefs: [],
    uniquenessRationale: "Dachau intent with local service fit.",
    ...input
  };
}

function section(input: Partial<PageJson["sections"][number]> = {}): PageJson["sections"][number] {
  return {
    id: "hero-1",
    type: "Hero",
    registryKey: "Hero.default",
    schemaVersion: 1,
    zone: "hero",
    order: 0,
    variant: "default",
    props: {
      h1: "Entruempelung Dachau",
      body: "Lokale Entruempelung fuer Dachau."
    },
    evidenceRefs: [],
    ...input
  };
}

function nestedObject(depth: number): Record<string, unknown> {
  let value: Record<string, unknown> = { leaf: "value" };

  for (let index = 0; index < depth; index += 1) {
    value = { nested: value };
  }

  return value;
}
