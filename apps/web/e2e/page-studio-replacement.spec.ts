import { expect, test, type Route } from "@playwright/test";
import { PageVersionSummarySchema } from "@localseo/contracts";
import type {
  EditPageVersionRequest,
  MediaAssetSummary,
  PageJson,
  PageStudioEditCommand,
  PageVersionDetail,
  SectionCopySuggestion
} from "@localseo/contracts";

const projectId = "demo-project";
const proposalId = "proposal-1";
const baseVersionId = "version-1";
const replacementVersionId = "version-2";
const copySuggestionId = "10000000-0000-4000-8000-000000000001";
const copyRunId = "10000000-0000-4000-8000-000000000002";
const mediaAssetId = "10000000-0000-4000-8000-000000000003";
const mediaActorId = "10000000-0000-4000-8000-000000000004";
const createdAt = "2026-07-12T10:00:00.000Z";

test("stages controlled section replacement before creating one next version", async ({ page }) => {
  let versions = [pageVersion(baseVersionId, 1, pageJson())];
  const submittedCommands: PageStudioEditCommand[] = [];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    const isApiRequest =
      ["fetch", "xhr"].includes(request.resourceType()) ||
      (request.resourceType() === "document" && path.endsWith("/preview/document"));
    if (!isApiRequest || (path !== "/health" && !path.startsWith(`/projects/${projectId}`))) {
      await route.continue();
      return;
    }

    if (path === "/health") {
      await json(route, { status: "ok", service: "local-seo-api", stack: {} });
      return;
    }

    if (path === `/projects/${projectId}/pages`) {
      await json(route, {
        projectId,
        pageVersions: versions.map(pageVersionSummary)
      });
      return;
    }

    if (path === `/projects/${projectId}/media/assets`) {
      await json(route, { projectId, assets: [] });
      return;
    }

    const version = versions.find((candidate) => path.includes(`/pages/${candidate.id}`));
    if (!version) {
      await json(route, null);
      return;
    }

    if (path.endsWith("/copy-suggestions")) {
      await json(route, { projectId, pageVersionId: version.id, suggestions: [] });
      return;
    }

    if (path.endsWith("/preview")) {
      await json(route, {
        projectId,
        pageVersionId: version.id,
        route: version.route,
        mode: "editor",
        documentPath: `/projects/${projectId}/pages/${version.id}/preview/document`,
        file: {
          path: "/dachreinigung-muenchen/index.html",
          contentType: "text/html; charset=utf-8",
          encoding: "utf8",
          decodedBytes: 100
        }
      });
      return;
    }

    if (path.endsWith("/preview/document")) {
      await html(route, `<main><h1>${previewHeading(version.pageJson)}</h1></main>`);
      return;
    }

    if (path.endsWith("/notes")) {
      await json(route, { projectId, pageVersionId: version.id, notes: [] });
      return;
    }

    if (path.endsWith("/edits") && request.method() === "POST") {
      const body = request.postDataJSON() as { command: PageStudioEditCommand };
      submittedCommands.push(body.command);
      const next = replacementVersion(version, body.command);
      versions = [...versions, next];
      await json(route, { projectId, basePageVersionId: version.id, pageVersion: next });
      return;
    }

    await json(route, version);
  });

  await page.goto(`/projects/${projectId}/pages/${baseVersionId}/preview`);
  await expect(page.getByRole("heading", { name: "Page Studio" })).toBeVisible();

  await page.getByRole("button", { name: /Benefits Grid/u }).click();
  await page.getByRole("button", { name: "Replace section" }).click();
  await page.getByLabel("Replacement type").selectOption("ServiceDescription.default");
  await page.getByLabel("Replacement variant").selectOption("detailed");

  const replacement = page.locator(".page-studio-replacement");
  await replacement.getByLabel("Heading").fill("Dachpflege im Detail");
  await replacement.getByLabel("List item value").fill("Wir pruefen und reinigen das Dach mit klarer Planung.");

  expect(submittedCommands).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Create replacement version" })).toBeEnabled();
  await page.getByRole("button", { name: "Create replacement version" }).click();

  await expect(page).toHaveURL(new RegExp(`/pages/${replacementVersionId}/preview$`, "u"));
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  const previewFrame = page.locator("iframe[title='Page preview']");
  await expect(previewFrame).toHaveAttribute("sandbox", "");
  await expect(previewFrame).toHaveAttribute("src", /\/preview\/document$/u);
  await expect(
    page.frameLocator("iframe[title='Page preview']").getByRole("heading", { name: "Dachpflege im Detail" })
  ).toBeVisible();
  expect(submittedCommands).toEqual([
    {
      type: "replace_section",
      sectionId: "benefits-1",
      registryKey: "ServiceDescription.default",
      variant: "detailed",
      props: {
        heading: "Dachpflege im Detail",
        paragraphs: ["Wir pruefen und reinigen das Dach mit klarer Planung."]
      }
    }
  ]);

  const horizontalScroll = await page.evaluate(() => {
    const top = window.scrollY;
    const viewportWidth = document.documentElement.clientWidth;
    const overflowingElements = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${Array.from(
            element.classList
          )
            .map((className) => `.${className}`)
            .join("")}`,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          boxSizing: style.boxSizing,
          declaredWidth: style.width,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          text: element.textContent?.trim().slice(0, 120) ?? ""
        };
      })
      .filter((element) => element.left < -0.5 || element.right > viewportWidth + 0.5)
      .sort((left, right) => right.right - left.right)
      .slice(0, 12);
    window.scrollTo(document.documentElement.scrollWidth, top);
    const distance = window.scrollX;
    window.scrollTo(0, top);
    return {
      distance,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      overflowingElements
    };
  });
  expect(horizontalScroll.distance, JSON.stringify(horizontalScroll, null, 2)).toBe(0);
});

test("uploads and stages project media before one explicit ImageText version command", async ({ page }) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  let versions = [pageVersion(baseVersionId, 1, pageJson())];
  let assets: MediaAssetSummary[] = [];
  let expectedSha256 = "";
  const submittedCommands: PageStudioEditCommand[] = [];
  const uploadRequests: unknown[] = [];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const thumbnailPath = `/projects/${projectId}/media/assets/${mediaAssetId}/thumbnail`;

    if (path === thumbnailPath && request.resourceType() === "image") {
      await route.fulfill({ contentType: "image/png", body: png });
      return;
    }

    const isApiRequest =
      ["fetch", "xhr"].includes(request.resourceType()) ||
      (request.resourceType() === "document" && path.endsWith("/preview/document"));
    if (!isApiRequest || (path !== "/health" && !path.startsWith(`/projects/${projectId}`))) {
      await route.continue();
      return;
    }

    if (path === "/health") {
      await json(route, { status: "ok", service: "local-seo-api", stack: {} });
      return;
    }

    if (path === `/projects/${projectId}/pages`) {
      await json(route, { projectId, pageVersions: versions.map(pageVersionSummary) });
      return;
    }

    if (path === `/projects/${projectId}/media/assets` && request.method() === "GET") {
      await json(route, { projectId, assets });
      return;
    }

    if (path === `/projects/${projectId}/media/upload-intents` && request.method() === "POST") {
      const body = request.postDataJSON() as {
        claimedContentType: "image/png";
        displayName: string;
        expectedBytes: number;
        expectedSha256: string;
      };
      uploadRequests.push(body);
      expectedSha256 = body.expectedSha256;
      const pending = mediaAsset("pending_upload", body.expectedBytes, expectedSha256);
      assets = [pending];
      await json(route, {
        asset: pending,
        upload: {
          kind: "api_put",
          url: `/projects/${projectId}/media/assets/${mediaAssetId}/upload`,
          headers: { "content-type": "image/png", "x-media-sha256": expectedSha256 },
          expiresAt: "2026-07-15T12:05:00.000Z"
        }
      });
      return;
    }

    if (path === `/projects/${projectId}/media/assets/${mediaAssetId}/upload` && request.method() === "PUT") {
      await route.fulfill({ status: 204 });
      return;
    }

    if (path === `/projects/${projectId}/media/assets/${mediaAssetId}/complete` && request.method() === "POST") {
      const ready = mediaAsset("ready", png.byteLength, expectedSha256);
      assets = [ready];
      await json(route, {
        asset: ready,
        processing: {
          jobId: mediaAssetId,
          projectId,
          type: "media_processing",
          status: "queued",
          inputRef: mediaAssetId,
          createdAt
        }
      });
      return;
    }

    const version = versions.find((candidate) => path.includes(`/pages/${candidate.id}`));
    if (!version) {
      await json(route, null);
      return;
    }

    if (path.endsWith("/copy-suggestions")) {
      await json(route, { projectId, pageVersionId: version.id, suggestions: [] });
      return;
    }
    if (path.endsWith("/preview")) {
      await json(route, {
        projectId,
        pageVersionId: version.id,
        route: version.route,
        mode: "editor",
        documentPath: `/projects/${projectId}/pages/${version.id}/preview/document`,
        file: {
          path: "/dachreinigung-muenchen/index.html",
          contentType: "text/html; charset=utf-8",
          encoding: "utf8",
          decodedBytes: 100
        }
      });
      return;
    }
    if (path.endsWith("/preview/document")) {
      await html(route, `<main><h1>${previewHeading(version.pageJson)}</h1></main>`);
      return;
    }
    if (path.endsWith("/notes")) {
      await json(route, { projectId, pageVersionId: version.id, notes: [] });
      return;
    }
    if (path.endsWith("/edits") && request.method() === "POST") {
      const body = request.postDataJSON() as { command: PageStudioEditCommand };
      submittedCommands.push(body.command);
      const next = replacementVersion(version, body.command);
      versions = [...versions, next];
      await json(route, { projectId, basePageVersionId: version.id, pageVersion: next });
      return;
    }
    await json(route, version);
  });

  await page.goto(`/projects/${projectId}/pages/${baseVersionId}/preview`);
  await page.getByRole("button", { name: /Benefits Grid/u }).click();
  await page.getByRole("button", { name: "Replace section" }).click();
  await page.getByLabel("Replacement type").selectOption("ImageText.default");

  await page.getByLabel("Upload image").setInputFiles({ name: "local-proof.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: /local-proof\.png/u })).toBeVisible();
  expect(uploadRequests).toHaveLength(1);
  expect(submittedCommands).toHaveLength(0);

  await page.getByRole("button", { name: /local-proof\.png/u }).click();
  await page.getByLabel("Alternative text").fill("Completed roof cleaning in Muenchen");
  const replacement = page.locator(".page-studio-replacement");
  await replacement.getByLabel("Body").fill("A recent local project with deterministic media rendering.");
  await setRangeValue(replacement.getByLabel(/Horizontal focus/u), "0.35");
  await setRangeValue(replacement.getByLabel(/Vertical focus/u), "0.65");

  expect(submittedCommands).toHaveLength(0);
  await page.getByRole("button", { name: "Create replacement version" }).click();

  await expect(page).toHaveURL(new RegExp(`/pages/${replacementVersionId}/preview$`, "u"));
  expect(submittedCommands).toEqual([
    {
      type: "replace_section",
      sectionId: "benefits-1",
      registryKey: "ImageText.default",
      variant: "media_left",
      props: {
        body: "A recent local project with deterministic media rendering.",
        media: {
          assetId: mediaAssetId,
          purpose: "content",
          alt: "Completed roof cleaning in Muenchen",
          focalPoint: { x: 0.35, y: 0.65 }
        }
      }
    }
  ]);

  const horizontalScroll = await page.evaluate(() => {
    const top = window.scrollY;
    window.scrollTo(document.documentElement.scrollWidth, top);
    const distance = window.scrollX;
    window.scrollTo(0, top);
    return {
      distance,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    };
  });
  expect(horizontalScroll.distance, JSON.stringify(horizontalScroll, null, 2)).toBe(0);
});

test("queues, reviews, and explicitly applies a section copy suggestion", async ({ page }) => {
  const suggestionId = copySuggestionId;
  const runId = copyRunId;
  const revisedHeading = "Dachreinigung fuer Muenchen auf den Punkt";
  let versions = [pageVersion(baseVersionId, 1, pageJson())];
  let suggestions: SectionCopySuggestion[] = [];
  let serveQueuedSuggestionOnce = false;
  const queuedRequests: unknown[] = [];
  const submittedEdits: EditPageVersionRequest[] = [];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    const isApiRequest =
      ["fetch", "xhr"].includes(request.resourceType()) ||
      (request.resourceType() === "document" && path.endsWith("/preview/document"));
    if (!isApiRequest || (path !== "/health" && !path.startsWith(`/projects/${projectId}`))) {
      await route.continue();
      return;
    }

    if (path === "/health") {
      await json(route, { status: "ok", service: "local-seo-api", stack: {} });
      return;
    }

    if (path === `/projects/${projectId}/pages`) {
      await json(route, { projectId, pageVersions: versions.map(pageVersionSummary) });
      return;
    }

    if (path === `/projects/${projectId}/media/assets`) {
      await json(route, { projectId, assets: [] });
      return;
    }

    const version = versions.find((candidate) => path.includes(`/pages/${candidate.id}`));
    if (!version) {
      await json(route, null);
      return;
    }

    if (path.endsWith("/copy-suggestions")) {
      if (request.method() === "POST") {
        queuedRequests.push(request.postDataJSON());
        suggestions = [readyCopySuggestion(suggestionId, runId, version, revisedHeading)];
        serveQueuedSuggestionOnce = true;
        await json(route, {
          jobId: runId,
          projectId,
          type: "page_generation",
          status: "queued",
          runId,
          suggestionId,
          pageVersionId: version.id,
          sectionId: "hero-1",
          createdBy: "user-1",
          createdAt
        });
        return;
      }

      const visibleSuggestions = serveQueuedSuggestionOnce
        ? suggestions.map((suggestion) => ({
            ...suggestion,
            status: "queued" as const,
            suggestedProps: undefined,
            readyAt: undefined
          }))
        : suggestions;
      serveQueuedSuggestionOnce = false;
      await json(route, {
        projectId,
        pageVersionId: version.id,
        suggestions: version.id === baseVersionId ? visibleSuggestions : []
      });
      return;
    }

    if (path.endsWith("/preview")) {
      await json(route, {
        projectId,
        pageVersionId: version.id,
        route: version.route,
        mode: "editor",
        documentPath: `/projects/${projectId}/pages/${version.id}/preview/document`,
        file: {
          path: "/dachreinigung-muenchen/index.html",
          contentType: "text/html; charset=utf-8",
          encoding: "utf8",
          decodedBytes: 100
        }
      });
      return;
    }

    if (path.endsWith("/preview/document")) {
      await html(route, `<main><h1>${previewHeading(version.pageJson)}</h1></main>`);
      return;
    }

    if (path.endsWith("/notes")) {
      await json(route, { projectId, pageVersionId: version.id, notes: [] });
      return;
    }

    if (path.endsWith("/edits") && request.method() === "POST") {
      const body = request.postDataJSON() as EditPageVersionRequest;
      submittedEdits.push(body);
      const next = copySuggestionVersion(version, body);
      versions = [...versions, next];
      suggestions = suggestions.map((suggestion) => ({
        ...suggestion,
        status: "applied",
        appliedPageVersionId: next.id,
        appliedByUserId: "user-1",
        appliedAt: createdAt,
        updatedAt: createdAt
      }));
      await json(route, { projectId, basePageVersionId: version.id, pageVersion: next });
      return;
    }

    await json(route, version);
  });

  await page.goto(`/projects/${projectId}/pages/${baseVersionId}/preview`);
  await page.getByRole("button", { name: /^Hero hero/u }).click();
  await page.getByRole("button", { name: "AI copy" }).click();
  await page.getByLabel("Revision instruction").fill("Make the local intent clearer.");
  await page.getByRole("button", { name: "Generate revision" }).click();

  await expect(page.getByRole("button", { name: "Cancel revision" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply suggestion" })).toBeVisible();
  expect(queuedRequests).toEqual([{ sectionId: "hero-1", instruction: "Make the local intent clearer." }]);
  expect(submittedEdits).toHaveLength(0);
  await expect(page.getByLabel("Headline")).toHaveValue(revisedHeading);

  await page.getByRole("button", { name: "Apply suggestion" }).click();

  await expect.poll(() => submittedEdits.length).toBe(1);
  await expect(page).toHaveURL(new RegExp(`/pages/${replacementVersionId}/preview$`, "u"));
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await expect(
    page.frameLocator("iframe[title='Page preview']").getByRole("heading", { name: revisedHeading })
  ).toBeVisible();
  expect(submittedEdits).toEqual([
    {
      suggestionId,
      command: {
        type: "update_section_props",
        sectionId: "hero-1",
        props: {
          h1: revisedHeading,
          lead: "Lokale Dachreinigung in Muenchen.",
          primaryCtaLabel: "Anfragen",
          primaryCtaHref: "/kontakt/"
        }
      }
    }
  ]);
});

function pageVersion(id: string, versionNumber: number, value: PageJson): PageVersionDetail {
  return {
    id,
    projectId,
    pageProposalId: proposalId,
    route: value.route,
    primaryKeyword: value.target.primaryKeyword,
    uniquenessRationale: value.uniquenessRationale ?? "Dedicated local page.",
    proposalStatus: "draft",
    sitemapReady: value.seo.sitemapReady,
    versionNumber,
    status: "preview",
    createdAt,
    updatedAt: createdAt,
    pageJson: value
  };
}

function pageVersionSummary(value: PageVersionDetail) {
  const { pageJson: detailOnlyPageJson, ...summary } = value;
  void detailOnlyPageJson;
  return PageVersionSummarySchema.parse(summary);
}

function replacementVersion(base: PageVersionDetail, command: PageStudioEditCommand): PageVersionDetail {
  if (command.type !== "replace_section") {
    throw new Error("Expected a controlled replacement command.");
  }

  const sections = base.pageJson.sections.map((section) =>
    section.id === command.sectionId
      ? {
          ...section,
          type: command.registryKey === "ImageText.default" ? ("ImageText" as const) : ("ServiceDescription" as const),
          registryKey: command.registryKey,
          schemaVersion: 1,
          variant: command.variant,
          props: command.props,
          evidenceRefs: [],
          generation: { source: "human" as const, reason: "page_studio:replace_section" }
        }
      : section
  );

  return {
    ...pageVersion(replacementVersionId, 2, {
      ...base.pageJson,
      sections,
      generation: { source: "human", reason: "page_studio:replace_section" }
    }),
    basedOnVersionId: base.id,
    createdByUserId: "user-1"
  };
}

function mediaAsset(
  status: "pending_upload" | "ready",
  expectedBytes: number,
  expectedSha256: string
): MediaAssetSummary {
  return {
    id: mediaAssetId,
    projectId,
    status,
    displayName: "local-proof.png",
    claimedContentType: "image/png",
    expectedBytes,
    expectedSha256,
    ...(status === "ready"
      ? {
          detectedContentType: "image/png" as const,
          sourceBytes: expectedBytes,
          checksumSha256: expectedSha256,
          width: 640,
          height: 480,
          processorVersion: "e2e-v1",
          variants: [
            {
              variantKey: "w640_webp",
              width: 640,
              height: 480,
              contentType: "image/webp" as const,
              byteSize: expectedBytes,
              sha256: expectedSha256
            }
          ],
          readyAt: createdAt
        }
      : { variants: [] }),
    createdByUserId: mediaActorId,
    createdAt,
    updatedAt: createdAt
  };
}

function readyCopySuggestion(
  id: string,
  agentRunId: string,
  version: PageVersionDetail,
  revisedHeading: string
): SectionCopySuggestion {
  const hero = version.pageJson.sections.find((section) => section.id === "hero-1");
  if (!hero) {
    throw new Error("Expected the Hero fixture section.");
  }

  return {
    id,
    projectId,
    pageVersionId: version.id,
    sectionId: hero.id,
    agentRunId,
    status: "ready",
    instruction: "Make the local intent clearer.",
    suggestedProps: {
      ...hero.props,
      h1: revisedHeading
    },
    requestedByUserId: "user-1",
    readyAt: createdAt,
    createdAt,
    updatedAt: createdAt
  };
}

function copySuggestionVersion(base: PageVersionDetail, request: EditPageVersionRequest): PageVersionDetail {
  if (request.command.type !== "update_section_props" || request.suggestionId !== copySuggestionId) {
    throw new Error("Expected the suggestion-attributed props command.");
  }
  const command = request.command;

  const sections = base.pageJson.sections.map((section) =>
    section.id === command.sectionId
      ? {
          ...section,
          props: command.props,
          generation: {
            source: "agent" as const,
            agentRunId: copyRunId,
            reason: "page_studio:section_text_generation"
          }
        }
      : section
  );

  return {
    ...pageVersion(replacementVersionId, 2, {
      ...base.pageJson,
      sections,
      generation: {
        source: "agent",
        agentRunId: copyRunId,
        reason: "page_studio:section_text_generation"
      }
    }),
    basedOnVersionId: base.id,
    createdByUserId: "user-1",
    uniquenessRationale: base.uniquenessRationale,
    pageJson: {
      ...base.pageJson,
      sections,
      generation: {
        source: "agent",
        agentRunId: copyRunId,
        reason: "page_studio:section_text_generation"
      }
    }
  };
}

function previewHeading(value: PageJson): string {
  const replacement = value.sections.find((section) => section.id === "benefits-1");
  const replacementHeading = replacement?.props.heading;
  if (typeof replacementHeading === "string" && replacement?.registryKey === "ServiceDescription.default") {
    return replacementHeading;
  }
  const hero = value.sections.find((section) => section.id === "hero-1");
  return typeof hero?.props.h1 === "string" ? hero.props.h1 : "Dachreinigung in Muenchen";
}

function pageJson(): PageJson {
  return {
    schemaVersion: 1,
    route: "/dachreinigung-muenchen/",
    pageType: "service_area_page",
    target: {
      service: "Dachreinigung",
      location: "Muenchen",
      primaryKeyword: "Dachreinigung Muenchen",
      secondaryKeywords: []
    },
    seo: {
      title: "Dachreinigung Muenchen",
      metaDescription: "Lokale Dachreinigung in Muenchen.",
      canonicalPath: "/dachreinigung-muenchen/",
      robots: "noindex",
      jsonLd: [],
      sitemapReady: true
    },
    sections: [
      section("header-1", "Header", "Header.default", "frame_top", 0, {
        brandName: "Muster Dachservice",
        navItems: [{ label: "Kontakt", href: "/kontakt/" }]
      }),
      section("hero-1", "Hero", "Hero.default", "hero", 1, {
        h1: "Dachreinigung in Muenchen",
        lead: "Lokale Dachreinigung in Muenchen.",
        primaryCtaLabel: "Anfragen",
        primaryCtaHref: "/kontakt/"
      }),
      section("service-1", "ServiceIntro", "ServiceIntro.default", "body_intro", 2, {
        heading: "Dachreinigung fuer Muenchen",
        body: "Wir reinigen Daecher mit lokal abgestimmter Planung."
      }),
      section("description-1", "ServiceDescription", "ServiceDescription.default", "body_main", 3, {
        heading: "Leistungsumfang",
        paragraphs: ["Moos und Ablagerungen werden schonend entfernt."]
      }),
      section("benefits-1", "BenefitsGrid", "BenefitsGrid.default", "body_main", 4, {
        heading: "Vorteile",
        benefits: [
          { title: "Lokale Anfahrt", body: "Termine in Muenchen." },
          { title: "Klare Beratung", body: "Der Zustand wird nachvollziehbar besprochen." }
        ]
      }),
      section("faq-1", "FAQ", "FAQ.default", "body_late", 5, {
        heading: "Haeufige Fragen",
        items: [{ question: "Wie schnell?", answer: "Nach Absprache." }]
      }),
      section("areas-1", "ServiceAreaList", "ServiceAreaList.default", "body_late", 6, {
        heading: "Einsatzgebiet",
        areas: [{ name: "Muenchen", route: "/dachreinigung-muenchen/" }]
      }),
      section("cta-1", "FinalCTA", "FinalCTA.default", "cta_late", 7, {
        heading: "Dachreinigung anfragen",
        body: "Wir pruefen die passende Ausfuehrung.",
        ctaLabel: "Anfragen",
        ctaHref: "/kontakt/"
      }),
      section("footer-1", "Footer", "Footer.default", "frame_bottom", 8, {
        businessName: "Muster Dachservice",
        legalLinks: [{ label: "Impressum", href: "/impressum/" }]
      })
    ],
    internalLinks: ["/kontakt/"],
    evidenceRefs: [],
    uniquenessRationale: "Dedicated local page."
  };
}

function section(
  id: string,
  type: PageJson["sections"][number]["type"],
  registryKey: string,
  zone: PageJson["sections"][number]["zone"],
  order: number,
  props: Record<string, unknown>
): PageJson["sections"][number] {
  return { id, type, registryKey, schemaVersion: 1, zone, order, variant: "default", props, evidenceRefs: [] };
}

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
}

async function html(route: Route, body: string): Promise<void> {
  await route.fulfill({ contentType: "text/html; charset=utf-8", body });
}

async function setRangeValue(locator: import("@playwright/test").Locator, value: string): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.bind(input);
    setter?.(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
