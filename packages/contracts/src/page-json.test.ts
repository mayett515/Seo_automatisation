import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AgentRunFailureCodeSchema,
  ApprovedReleaseArtifactPageSchema,
  CreateReleasePlanRequestSchema,
  EditPageVersionRequestSchema,
  PageJsonSchema,
  PageProposalJsonSchema,
  ReleaseDeployApprovalResponseSchema,
  ReleasePreflightResponseSchema,
  ReviewPageVersionRequestSchema,
  SectionCopyRevisionOutputSchema,
  StaticSiteArtifactSchema,
  decodedStaticSiteFileByteLength,
  type PageJson
} from "./index.js";

void describe("AgentRunFailureCodeSchema", () => {
  void it("accepts visible recovery and operator terminal failure codes", () => {
    assert.equal(AgentRunFailureCodeSchema.parse("work_recovery_exhausted"), "work_recovery_exhausted");
    assert.equal(AgentRunFailureCodeSchema.parse("work_transport_inconsistent"), "work_transport_inconsistent");
    assert.equal(AgentRunFailureCodeSchema.parse("operator_cancelled"), "operator_cancelled");
  });
});

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

void describe("StaticSiteArtifactSchema", () => {
  void it("requires explicit encoding and measures decoded bytes", () => {
    const binary = Buffer.from([0, 1, 2, 253, 254, 255]);
    const artifact = StaticSiteArtifactSchema.parse({
      files: [
        {
          path: "/index.html",
          contentType: "text/html; charset=utf-8",
          encoding: "utf8",
          body: "Gruesse"
        },
        {
          path: "/assets/image.webp",
          contentType: "image/webp",
          encoding: "base64",
          body: binary.toString("base64")
        }
      ]
    });

    assert.equal(decodedStaticSiteFileByteLength(artifact.files[0]!), 7);
    assert.equal(decodedStaticSiteFileByteLength(artifact.files[1]!), binary.byteLength);
  });

  void it("rejects ambiguous encodings, duplicate paths, and traversal paths", () => {
    assert.equal(
      StaticSiteArtifactSchema.safeParse({
        files: [{ path: "/index.html", contentType: "text/html", body: "missing encoding" }]
      }).success,
      false
    );
    assert.equal(
      StaticSiteArtifactSchema.safeParse({
        files: [{ path: "/asset.webp", contentType: "image/webp", encoding: "base64", body: "not-base64" }]
      }).success,
      false
    );
    assert.equal(
      StaticSiteArtifactSchema.safeParse({
        files: [
          { path: "/same", contentType: "text/plain", encoding: "utf8", body: "one" },
          { path: "/same", contentType: "text/plain", encoding: "utf8", body: "two" }
        ]
      }).success,
      false
    );
    assert.equal(
      StaticSiteArtifactSchema.safeParse({
        files: [{ path: "/assets/../secret", contentType: "text/plain", encoding: "utf8", body: "no" }]
      }).success,
      false
    );
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

void describe("EditPageVersionRequestSchema", () => {
  void it("accepts only explicit Page Studio edit commands", () => {
    assert.equal(
      EditPageVersionRequestSchema.safeParse({
        command: {
          type: "update_section_props",
          sectionId: "hero-1",
          props: { h1: "Updated heading" }
        }
      }).success,
      true
    );
    assert.equal(
      EditPageVersionRequestSchema.safeParse({
        command: { type: "move_section", sectionId: "benefits-1", direction: "up" }
      }).success,
      true
    );
    assert.equal(
      EditPageVersionRequestSchema.safeParse({
        command: { type: "switch_section_variant", sectionId: "hero-1", variant: "split" }
      }).success,
      true
    );
    assert.equal(
      EditPageVersionRequestSchema.safeParse({
        command: {
          type: "replace_section",
          sectionId: "benefits-1",
          registryKey: "ServiceDescription.default",
          variant: "detailed",
          props: { heading: "Mehr Details", paragraphs: ["Lokale Details fuer Dachau."] }
        }
      }).success,
      true
    );
  });

  void it("rejects unrestricted patch commands and extra fields", () => {
    assert.equal(
      EditPageVersionRequestSchema.safeParse({
        command: { type: "json_patch", path: "/sections/0/props/h1", value: "Unsafe" }
      }).success,
      false
    );
    assert.equal(
      EditPageVersionRequestSchema.safeParse({
        command: { type: "move_section", sectionId: "benefits-1", direction: "up", html: "<script>" }
      }).success,
      false
    );
    assert.equal(
      EditPageVersionRequestSchema.safeParse({
        command: {
          type: "replace_section",
          sectionId: "benefits-1",
          registryKey: "ServiceDescription.default",
          variant: "detailed",
          props: { heading: "Mehr Details", paragraphs: ["Lokale Details fuer Dachau."] },
          zone: "body_main"
        }
      }).success,
      false
    );
  });

  void it("allows suggestion attribution only for structured props edits", () => {
    const suggestionId = "11111111-1111-4111-8111-111111111111";

    assert.equal(
      EditPageVersionRequestSchema.safeParse({
        suggestionId,
        command: {
          type: "update_section_props",
          sectionId: "hero-1",
          props: { h1: "AI suggestion" }
        }
      }).success,
      true
    );
    assert.equal(
      EditPageVersionRequestSchema.safeParse({
        suggestionId,
        command: { type: "move_section", sectionId: "benefits-1", direction: "up" }
      }).success,
      false
    );
  });
});

void describe("SectionCopyRevisionOutputSchema", () => {
  void it("accepts a bounded field suggestion and rejects empty or structural output", () => {
    assert.equal(
      SectionCopyRevisionOutputSchema.safeParse({
        schemaVersion: 1,
        sectionId: "hero-1",
        suggestedFields: { h1: "Dachreinigung in Muenchen" }
      }).success,
      true
    );
    assert.equal(
      SectionCopyRevisionOutputSchema.safeParse({
        schemaVersion: 1,
        sectionId: "hero-1",
        suggestedFields: {}
      }).success,
      false
    );
    assert.equal(
      SectionCopyRevisionOutputSchema.safeParse({
        schemaVersion: 1,
        sectionId: "hero-1",
        suggestedFields: { h1: "Dachreinigung" },
        pageJson: { route: "/unsafe/" }
      }).success,
      false
    );
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

void describe("Release action response schemas", () => {
  void it("parses release preflight checks and readiness", () => {
    assert.equal(
      ReleasePreflightResponseSchema.safeParse({
        projectId: "11111111-1111-4111-8111-111111111111",
        releasePlanId: "plan-1",
        readiness: "ready_with_warnings",
        checks: [
          {
            checkKey: "tracking_ready",
            scope: "tracking",
            severity: "warning",
            result: "failed",
            message: "Tracking key is not configured."
          }
        ]
      }).success,
      true
    );
  });

  void it("parses release deploy approval evidence", () => {
    assert.equal(
      ReleaseDeployApprovalResponseSchema.safeParse({
        projectId: "11111111-1111-4111-8111-111111111111",
        releasePlanId: "plan-1",
        status: "approved_for_deploy",
        approvedAt: "2026-07-08T12:00:00.000Z"
      }).success,
      true
    );
  });

  void it("rejects non-readiness statuses for release preflight responses", () => {
    assert.equal(
      ReleasePreflightResponseSchema.safeParse({
        projectId: "11111111-1111-4111-8111-111111111111",
        releasePlanId: "plan-1",
        readiness: "approved_for_deploy",
        checks: []
      }).success,
      false
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
