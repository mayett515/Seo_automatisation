export const mastraAgents = [
  "ResearchAgent",
  "SeoStrategyAgent",
  "ContentAgent",
  "TemplateLayoutAgent",
  "SeoAnalystAgent",
  "ReportAgent",
  "DeploymentAgent"
] as const;

export const mastraWorkflows = [
  "preAuditWorkflow",
  "websiteImportWorkflow",
  "localSeoAnalysisWorkflow",
  "pageGenerationWorkflow",
  "releasePreflightWorkflow",
  "postDeployVerificationWorkflow",
  "reportGenerationWorkflow"
] as const;

export type MastraAgentName = (typeof mastraAgents)[number];
export type MastraWorkflowName = (typeof mastraWorkflows)[number];

export type AgentDescriptor = {
  name: MastraAgentName;
  responsibility: string;
  canMutateProduction: false;
};

export const agentDescriptors: AgentDescriptor[] = [
  { name: "ResearchAgent", responsibility: "Find SERP, competitor, and industry patterns.", canMutateProduction: false },
  { name: "SeoStrategyAgent", responsibility: "Score areas, services, keywords, and competition.", canMutateProduction: false },
  { name: "ContentAgent", responsibility: "Draft local text, FAQs, meta titles, and CTAs.", canMutateProduction: false },
  { name: "TemplateLayoutAgent", responsibility: "Recommend components and layout variants.", canMutateProduction: false },
  { name: "SeoAnalystAgent", responsibility: "Explain data, write observations, and propose next actions.", canMutateProduction: false },
  { name: "ReportAgent", responsibility: "Draft customer-safe reports and decision cards.", canMutateProduction: false },
  { name: "DeploymentAgent", responsibility: "Evaluate release readiness, blockers, risk, and release notes.", canMutateProduction: false }
];

