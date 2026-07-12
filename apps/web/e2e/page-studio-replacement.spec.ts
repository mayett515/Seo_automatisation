import { expect, test, type Route } from "@playwright/test";
import { PageVersionSummarySchema } from "@localseo/contracts";
import type { PageJson, PageStudioEditCommand, PageVersionDetail } from "@localseo/contracts";

const projectId = "demo-project";
const proposalId = "proposal-1";
const baseVersionId = "version-1";
const replacementVersionId = "version-2";
const createdAt = "2026-07-12T10:00:00.000Z";

test("stages controlled section replacement before creating one next version", async ({ page }) => {
  let versions = [pageVersion(baseVersionId, 1, pageJson())];
  const submittedCommands: PageStudioEditCommand[] = [];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("http://127.0.0.1:65535/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

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

    const version = versions.find((candidate) => path.includes(`/pages/${candidate.id}`));
    if (!version) {
      await json(route, null);
      return;
    }

    if (path.endsWith("/preview")) {
      await json(route, {
        projectId,
        pageVersionId: version.id,
        route: version.route,
        mode: "editor",
        file: {
          path: "/dachreinigung-muenchen/index.html",
          contentType: "text/html; charset=utf-8",
          body: `<main><h1>${previewHeading(version.pageJson)}</h1></main>`
        }
      });
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
          type: "ServiceDescription" as const,
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

function previewHeading(value: PageJson): string {
  const replacement = value.sections.find((section) => section.id === "benefits-1");
  const heading = replacement?.props.heading;
  return typeof heading === "string" ? heading : "Dachreinigung in Muenchen";
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
