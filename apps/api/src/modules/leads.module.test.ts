import { after, describe, it } from "node:test";
import assert from "node:assert/strict";

import { LeadsService } from "./leads.module.js";

// Behavioral proof for the pre-audit fail-closed change: an HTTP request to
// `POST /leads/:id/start-pre-audit` must never enqueue a job the worker cannot
// process. `pre-audit` has no handler, so `queuePreAudit` answers `dry_run`
// and the public pre-sales capture (`createLead`) is unaffected.
void describe("LeadsService", () => {
  const service = new LeadsService();

  after(() => {
    void service;
  });

  void it("answers start-pre-audit as an honest dry_run, never queued", () => {
    const job = service.queuePreAudit("lead-123");

    assert.equal(job.type, "pre_audit");
    assert.equal(job.status, "dry_run");
    assert.equal(job.leadId, "lead-123");
    assert.equal(job.inputRef, "lead-123");
    assert.ok(job.message?.includes("dry-run"));
  });

  void it("still accepts a public lead (pre-sales capture preserved)", () => {
    const lead = service.createLead({
      websiteUrl: "https://example.test/",
      businessName: "Dachbau Beispiel",
      services: ["Dachreparatur"],
      targetAreas: ["Dachau"]
    });

    assert.equal(lead.status, "new");
    assert.equal(lead.websiteUrl, "https://example.test/");
    assert.equal(lead.businessName, "Dachbau Beispiel");
    assert.ok(lead.id.length > 0);
  });
});
