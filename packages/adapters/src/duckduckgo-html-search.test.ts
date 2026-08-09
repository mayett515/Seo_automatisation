import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DuckDuckGoHtmlSearchAdapter,
  DuckDuckGoHtmlSearchError,
  parseDuckDuckGoHtml
} from "./duckduckgo-html-search.js";

void describe("DuckDuckGoHtmlSearchAdapter", () => {
  void it("parses normalized discovery links without inventing rank fields", () => {
    const target = encodeURIComponent("https://example.com/leistung?x=1#ignored");
    const results = parseDuckDuckGoHtml(`
      <html lang="de"><body>
        <div class="result">
          <a class="result__a" href="//duckduckgo.com/l/?uddg=${target}"> Beispiel Leistung </a>
          <a class="result__url">example.com/leistung</a>
          <div class="result__snippet"> Ein kurzer   Auszug. </div>
        </div>
      </body></html>
    `);
    assert.deepEqual(results, [
      {
        title: "Beispiel Leistung",
        url: "https://example.com/leistung?x=1",
        domain: "example.com",
        displayUrl: "example.com/leistung",
        snippet: "Ein kurzer Auszug."
      }
    ]);
    assert.equal("rank" in (results[0] ?? {}), false);
    assert.equal("position" in (results[0] ?? {}), false);
  });

  void it("classifies an anti-automation page as provider_blocked", async () => {
    const adapter = new DuckDuckGoHtmlSearchAdapter({
      fetchImpl: () =>
        Promise.resolve(
          new Response("<html><body>Verify you are human with a CAPTCHA</body></html>", {
            status: 200,
            headers: { "content-type": "text/html" }
          })
        )
    });
    await assert.rejects(
      adapter.search({ query: "test", requestedLocale: "de-DE", maxResults: 5 }),
      (error: unknown) => error instanceof DuckDuckGoHtmlSearchError && error.code === "provider_blocked"
    );
  });
});
