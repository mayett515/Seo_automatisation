export type OpportunityScoutPromptSection = {
  key:
    | "role"
    | "evidence_and_proof"
    | "classification"
    | "nearby_orte_corridors"
    | "competitor_containment"
    | "german_local_examples"
    | "output_format";
  title: string;
  lines: readonly string[];
};
