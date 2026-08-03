import {
  customerReportNarrativeLimits,
  CustomerReportNarrativeDraftOutputSchema,
  CustomerReportNarrativeOutputSchema,
  CustomerReportNarrativePacketSchema,
  type CustomerReportNarrativeFragment,
  type CustomerReportNarrativeOutput,
  type CustomerReportNarrativePacket
} from "@localseo/contracts";

export type CustomerReportNarrativeQaFailure = {
  gateId: "slot_set" | "markup" | "fact_token" | "unsupported_claim" | "length" | "duplicate_text";
  message: string;
  slotKey?: string;
};

export type CustomerReportNarrativeQaResult =
  | { ok: true; output: CustomerReportNarrativeOutput; fragments: CustomerReportNarrativeFragment[] }
  | { ok: false; failure: CustomerReportNarrativeQaFailure };

const markupPattern = /[<>`*_~#]|!?\[[^\]]*\]\([^)]*\)/u;
const urlPattern = /\b(?:https?:\/\/|www\.)\S+/iu;
const factTokenPattern = /[\p{N}%€$£¥]|\b(?:rang|ranking|position|platz|datum|quelle|zitat)\b/iu;
const unsupportedClaimPattern =
  /\b(?:garantiert|garantie|sicherer erfolg|umsatz|gewinn|roi|revenue|profit|fuehrt zu|führt zu|verursacht|dank|wegen|steigert|erhoeht|erhöht|mehr kunden|mehr anfragen|mehr umsatz)\b/iu;

export function buildCustomerReportNarrativePrompt(): string {
  return [
    "Du entwirfst ausschliesslich kurze, faktenarme Ueberschriften und Ueberleitungen fuer einen Local-SEO-Monatsbericht.",
    "Antworte nur mit CustomerReportNarrativeDraftOutput JSON und genau den vorgegebenen slotKey-Werten.",
    "Fuer jeden Slot ist genau ein Fragment erforderlich. Erfinde, veraendere oder wiederhole keine Fakten.",
    "Verwende keine Zahlen, Daten, Rankings, URLs, Zitate, Quellenangaben, Warnungsdetails oder Handlungsaufforderungen.",
    "Verwende kein HTML, Markdown, Garantien, Kausalitaetsbehauptungen oder wirtschaftliche Wirkungsversprechen.",
    "heading: kurze neutrale Ueberschrift. transition: ein kurzer neutraler Uebergang zu den serverseitig genannten Themen.",
    "Alle Texte muessen auf Deutsch und einzeilig sein. Gib keine Erklaerung ausserhalb des JSON aus."
  ].join("\n");
}

export function evaluateCustomerReportNarrative(input: {
  packet: CustomerReportNarrativePacket;
  output: unknown;
}): CustomerReportNarrativeQaResult {
  const packet = CustomerReportNarrativePacketSchema.parse(input.packet);
  const parsed = CustomerReportNarrativeDraftOutputSchema.safeParse(input.output);
  if (!parsed.success) {
    return {
      ok: false,
      failure: { gateId: "slot_set", message: "Narrative output failed its strict draft schema." }
    };
  }

  const draftBySlot = new Map(parsed.data.fragments.map((fragment) => [fragment.slotKey, fragment] as const));
  const expectedKeys = packet.slots.map((slot) => slot.slotKey);
  if (
    draftBySlot.size !== expectedKeys.length ||
    expectedKeys.some((slotKey) => !draftBySlot.has(slotKey)) ||
    parsed.data.fragments.some((fragment) => !expectedKeys.includes(fragment.slotKey))
  ) {
    return {
      ok: false,
      failure: { gateId: "slot_set", message: "Narrative output must fill exactly the server-assigned slots." }
    };
  }

  const seenTexts = new Set<string>();
  const fragments: CustomerReportNarrativeFragment[] = [];
  for (const slot of packet.slots) {
    const draft = draftBySlot.get(slot.slotKey);
    if (!draft) {
      return {
        ok: false,
        failure: { gateId: "slot_set", message: "Narrative slot is missing.", slotKey: slot.slotKey }
      };
    }
    const text = draft.text.trim();
    const maxLength =
      slot.kind === "heading"
        ? customerReportNarrativeLimits.maxHeadingLength
        : customerReportNarrativeLimits.maxTransitionLength;
    if (text.length > maxLength || text.includes("\n") || text.includes("\r")) {
      return {
        ok: false,
        failure: {
          gateId: "length",
          message: "Narrative text exceeds its slot bound or is not one line.",
          slotKey: slot.slotKey
        }
      };
    }
    if (markupPattern.test(text) || urlPattern.test(text)) {
      return {
        ok: false,
        failure: { gateId: "markup", message: "Narrative text contains markup or a URL.", slotKey: slot.slotKey }
      };
    }
    if (factTokenPattern.test(text)) {
      return {
        ok: false,
        failure: {
          gateId: "fact_token",
          message: "Narrative text contains a forbidden factual token.",
          slotKey: slot.slotKey
        }
      };
    }
    if (unsupportedClaimPattern.test(text)) {
      return {
        ok: false,
        failure: {
          gateId: "unsupported_claim",
          message: "Narrative text contains a guarantee, causal claim, or economic promise.",
          slotKey: slot.slotKey
        }
      };
    }
    const duplicateKey = text.toLowerCase();
    if (seenTexts.has(duplicateKey)) {
      return {
        ok: false,
        failure: {
          gateId: "duplicate_text",
          message: "Narrative slots must not repeat identical text.",
          slotKey: slot.slotKey
        }
      };
    }
    seenTexts.add(duplicateKey);
    fragments.push({
      slotKey: slot.slotKey,
      kind: slot.kind,
      text,
      supportingClaimKeys: slot.supportingClaims.map((claim) => claim.claimKey)
    });
  }

  fragments.sort((left, right) => compareStableText(left.slotKey, right.slotKey));
  const output = CustomerReportNarrativeOutputSchema.parse({
    schemaVersion: "customer_report_narrative_output.v1",
    fragments
  });
  return { ok: true, output, fragments: output.fragments };
}

function compareStableText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
