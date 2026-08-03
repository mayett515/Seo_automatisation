import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerReportPublicationCommand,
  defaultCustomerReportGeneration,
  isActiveCustomerReportGeneration
} from "./reports-state.js";

void describe("customer report UI state", () => {
  void it("selects the previous completed month within the accepted cutoff window", () => {
    const defaults = defaultCustomerReportGeneration(new Date("2026-08-03T10:00:00.000Z"));
    assert.equal(defaults.period, "2026-07");
    assert.equal(defaults.evidenceCutoffAt, "2026-08-03T10:00:00.000Z");
  });

  void it("caps a late generation cutoff at the deterministic grace deadline", () => {
    const defaults = defaultCustomerReportGeneration(new Date("2026-08-20T10:00:00.000Z"));
    assert.equal(defaults.period, "2026-07");
    assert.equal(defaults.evidenceCutoffAt, "2026-08-07T22:00:00.000Z");
  });

  void it("uses the Europe/Berlin month at the UTC month boundary", () => {
    const defaults = defaultCustomerReportGeneration(new Date("2026-07-31T22:30:00.000Z"));
    assert.equal(defaults.period, "2026-07");
  });

  void it("selects correction publication only for an admitted successor", () => {
    assert.equal(customerReportPublicationCommand(undefined), "publish");
    assert.equal(customerReportPublicationCommand("11111111-1111-4111-8111-111111111111"), "publish_correction");
    assert.equal(isActiveCustomerReportGeneration("validating"), true);
    assert.equal(isActiveCustomerReportGeneration("succeeded"), false);
  });
});
