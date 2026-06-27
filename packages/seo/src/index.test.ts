import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCustomerReportPayloadSafe } from "./index.js";

void describe("assertCustomerReportPayloadSafe", () => {
  void it("allows customer proof payloads without banned GSC metrics", () => {
    assert.doesNotThrow(() =>
      assertCustomerReportPayloadSafe({
        title: "Visibility proof",
        proof: [{ route: "/dachreinigung-dachau/", rankingTier: "top_10" }]
      })
    );
  });

  void it("rejects nested customer report payloads containing banned GSC metrics", () => {
    assert.throws(
      () =>
        assertCustomerReportPayloadSafe({
          sections: [
            {
              headline: "Internal GSC data leaked",
              metrics: {
                impressions: 1200
              }
            }
          ]
        }),
      /sections\.0\.metrics\.impressions/u
    );
  });

  void it("allows non-GSC uses of a generic position key", () => {
    assert.doesNotThrow(() =>
      assertCustomerReportPayloadSafe({
        contact: {
          name: "Customer Champion",
          position: "CEO"
        },
        mapPin: {
          position: {
            lat: 48.137,
            lng: 11.575
          }
        }
      })
    );
  });
});
