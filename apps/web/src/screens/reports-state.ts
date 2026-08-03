import { customerReportPeriodWindow } from "@localseo/domain";

export type CustomerReportGenerationDefaults = {
  period: string;
  evidenceCutoffAt: string;
  correctionReason: string;
};

export function defaultCustomerReportGeneration(now: Date): CustomerReportGenerationDefaults {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new TypeError("Customer report generation defaults require a valid Europe/Berlin month.");
  }
  const previousMonth = new Date(Date.UTC(year, month - 2, 1));
  const period = `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, "0")}`;
  const window = customerReportPeriodWindow(period);
  const cutoff = new Date(Math.min(now.getTime(), window.cutoffDeadlineAt.getTime()));
  return { period, evidenceCutoffAt: cutoff.toISOString(), correctionReason: "" };
}

export function customerReportPublicationCommand(
  supersedesReportId: string | undefined
): "publish" | "publish_correction" {
  return supersedesReportId ? "publish_correction" : "publish";
}

export function isActiveCustomerReportGeneration(status: string | undefined): boolean {
  return status === "queued" || status === "assembling" || status === "narrative_running" || status === "validating";
}
