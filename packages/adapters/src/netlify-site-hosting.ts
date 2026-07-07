import { createHash } from "node:crypto";
import { StaticSiteArtifactSchema } from "@localseo/contracts";
import { ProviderRequestError, runProviderRequestWithTimeout } from "./provider-errors.js";
import type {
  BeginDeployResult,
  CreateDeployInput,
  DeployReleaseResult,
  ObjectStoragePort,
  PublishedDeploySnapshot,
  ProviderDeploySnapshot,
  ProviderDeployStatus,
  ProviderUploadResumeToken,
  RollbackDeployInput,
  RollbackDeployResult,
  RestoreDeployInput,
  RestoreDeployResult,
  SiteHostingPort,
  UploadDeployFilesInput,
  UploadDeployFilesResult
} from "./index.js";

type NetlifyDeployResponse = {
  id?: unknown;
  state?: unknown;
  url?: unknown;
  ssl_url?: unknown;
  deploy_url?: unknown;
  deploy_ssl_url?: unknown;
  required?: unknown;
  required_functions?: unknown;
  [key: string]: unknown;
};

type NetlifySiteResponse = {
  id?: unknown;
  deploy_id?: unknown;
  published_deploy?: unknown;
  url?: unknown;
  ssl_url?: unknown;
  [key: string]: unknown;
};

export type NetlifySiteHostingAdapterOptions = {
  authToken: string;
  objectStorage: ObjectStoragePort;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  requiredFilePollAttempts?: number;
  requiredFilePollIntervalMs?: number;
};

type StaticFile = {
  path: string;
  body: string;
  contentType: string;
};

type StaticFileManifest = {
  digestByPath: Record<string, string>;
  fileByDigest: Map<string, StaticFile>;
};

export class NetlifySiteHostingAdapter implements SiteHostingPort {
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;
  private readonly requiredFilePollAttempts: number;
  private readonly requiredFilePollIntervalMs: number;

  constructor(private readonly options: NetlifySiteHostingAdapterOptions) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.netlify.com/api/v1";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.requiredFilePollAttempts = options.requiredFilePollAttempts ?? 12;
    this.requiredFilePollIntervalMs = options.requiredFilePollIntervalMs ?? 2500;
  }

  async beginDeploy(input: CreateDeployInput): Promise<BeginDeployResult> {
    if (!input.hostingSiteId) {
      return {
        status: "not_configured",
        message: `Netlify site id is not configured for project ${input.projectId}.`,
        liveUrls: []
      };
    }

    const { digestByPath } = await this.buildStaticFileManifest(input.buildArtifactKey);
    const deployTitle = buildNetlifyDeployTitle(input);

    const created = await this.netlifyRequest<NetlifyDeployResponse>(`/sites/${input.hostingSiteId}/deploys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        async: true,
        title: deployTitle,
        files: digestByPath
      })
    });
    const providerDeployId = stringField(created.id, "Netlify deploy id");
    const requiredDigests = await this.waitForRequiredFileDigests(providerDeployId, created);

    return {
      status: "started",
      providerDeployId,
      liveUrls: liveUrlsFromDeploy(created),
      resumeToken: netlifyResumeToken(requiredDigests),
      evidence: {
        adapter: "netlify",
        deploymentKey: input.deploymentKey,
        deployTitle,
        state: typeof created.state === "string" ? created.state : "unknown",
        requiredDigestCount: requiredDigests.length
      }
    };
  }

  async uploadDeployFiles(input: UploadDeployFilesInput): Promise<UploadDeployFilesResult> {
    const { fileByDigest } = await this.buildStaticFileManifest(input.buildArtifactKey);
    const requiredDigests = requiredDigestsFromResumeToken(input.resumeToken);

    for (const requiredFile of requiredFiles(requiredDigests, fileByDigest)) {
      await this.netlifyRequest<unknown>(
        `/deploys/${input.providerDeployId}/files/${encodeDeployFilePath(requiredFile.path)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/octet-stream" },
          body: requiredFile.body
        }
      );
    }

    return {
      evidence: {
        adapter: "netlify",
        uploadedDigestCount: requiredDigests.length
      }
    };
  }

  async createDeploy(input: CreateDeployInput): Promise<DeployReleaseResult> {
    const started = await this.beginDeploy(input);

    if (started.status === "not_configured") {
      return started;
    }

    const upload = await this.uploadDeployFiles({
      projectId: input.projectId,
      releasePlanId: input.releasePlanId,
      deploymentKey: input.deploymentKey,
      buildArtifactKey: input.buildArtifactKey,
      providerDeployId: started.providerDeployId,
      resumeToken: started.resumeToken
    });
    const snapshot = await this.getDeploy({ providerDeployId: started.providerDeployId });

    if (snapshot.status === "ready") {
      return {
        status: "ready",
        providerDeployId: started.providerDeployId,
        liveUrls: snapshot.liveUrls,
        evidence: {
          adapter: "netlify",
          deploymentKey: input.deploymentKey,
          begin: started.evidence ?? null,
          upload: upload.evidence ?? null,
          state: snapshot.evidence?.state ?? null
        }
      };
    }

    return {
      status: "pending",
      providerDeployId: started.providerDeployId,
      liveUrls: snapshot.liveUrls,
      evidence: {
        adapter: "netlify",
        deploymentKey: input.deploymentKey,
        begin: started.evidence ?? null,
        upload: upload.evidence ?? null,
        state: snapshot.evidence?.state ?? null
      }
    };
  }

  async getDeploy(input: { providerDeployId: string }): Promise<ProviderDeploySnapshot> {
    const deploy = await this.netlifyRequest<NetlifyDeployResponse>(`/deploys/${input.providerDeployId}`, {
      method: "GET"
    });

    return {
      providerDeployId: stringField(deploy.id, "Netlify deploy id"),
      status: mapNetlifyDeployState(deploy.state),
      liveUrls: liveUrlsFromDeploy(deploy),
      evidence: {
        adapter: "netlify",
        state: typeof deploy.state === "string" ? deploy.state : "unknown"
      }
    };
  }

  async getPublishedDeploy(input: { hostingSiteId: string }): Promise<PublishedDeploySnapshot | undefined> {
    const site = await this.netlifyRequest<NetlifySiteResponse>(`/sites/${input.hostingSiteId}`, {
      method: "GET"
    });
    const publishedDeploy = recordFromUnknown(site.published_deploy);
    const providerDeployId =
      stringFieldOrUndefined(publishedDeploy.id) ?? stringFieldOrUndefined(site.deploy_id) ?? undefined;

    if (!providerDeployId) {
      return undefined;
    }

    const status = mapNetlifyDeployState(publishedDeploy.state);
    const liveUrls = liveUrlsFromDeploy({
      ...publishedDeploy,
      ssl_url: publishedDeploy.ssl_url ?? site.ssl_url,
      url: publishedDeploy.url ?? site.url
    });

    return {
      providerDeployId,
      status,
      liveUrls,
      evidence: {
        adapter: "netlify",
        source: "site_published_deploy",
        state: typeof publishedDeploy.state === "string" ? publishedDeploy.state : "unknown"
      }
    };
  }

  restoreDeploy(input: RestoreDeployInput): Promise<RestoreDeployResult> {
    return Promise.resolve({
      artifactKey: `netlify/${input.releasePlanId}/restore-not-implemented.json`,
      evidence: { adapter: "netlify", status: "restore_not_implemented" }
    });
  }

  async rollbackDeploy(input: RollbackDeployInput): Promise<RollbackDeployResult> {
    if (!input.hostingSiteId || !input.providerDeployId) {
      return {
        status: "failed",
        providerDeployId: input.providerDeployId,
        evidence: {
          adapter: "netlify",
          status: "rollback_missing_provider_evidence",
          hasHostingSiteId: Boolean(input.hostingSiteId),
          hasProviderDeployId: Boolean(input.providerDeployId)
        }
      };
    }

    const restored = await this.netlifyRequest<NetlifyDeployResponse>(
      `/sites/${input.hostingSiteId}/deploys/${input.providerDeployId}/restore`,
      {
        method: "POST"
      }
    );
    const restoredProviderDeployId = stringField(restored.id, "Netlify restored deploy id");
    const status = mapNetlifyDeployState(restored.state);

    return {
      status: rollbackStatusFromProviderStatus(status),
      providerDeployId: restoredProviderDeployId,
      liveUrl: liveUrlsFromDeploy(restored)[0],
      evidence: {
        adapter: "netlify",
        restoredFromDeployId: input.providerDeployId,
        restoredDeployId: restoredProviderDeployId,
        state: typeof restored.state === "string" ? restored.state : "unknown"
      }
    };
  }

  private async netlifyRequest<T>(pathname: string, init: RequestInit): Promise<T> {
    const method = init.method ?? "GET";

    return runProviderRequestWithTimeout(
      {
        provider: "netlify",
        operation: `${method} ${pathname}`,
        timeoutMs: this.requestTimeoutMs
      },
      async (signal) => {
        const response = await this.fetchImpl(`${this.apiBaseUrl}${pathname}`, {
          ...init,
          signal,
          headers: {
            authorization: `Bearer ${this.options.authToken}`,
            "user-agent": "localseo-deploy-worker",
            ...(init.headers ?? {})
          }
        });

        if (!response.ok) {
          throw new ProviderRequestError({
            provider: "netlify",
            operation: `${method} ${pathname}`,
            reasonCode: "http_error",
            statusCode: response.status
          });
        }

        if (response.status === 204) {
          return undefined as T;
        }

        try {
          return (await response.json()) as T;
        } catch {
          throw new ProviderRequestError({
            provider: "netlify",
            operation: `${method} ${pathname}`,
            reasonCode: "invalid_json_response",
            statusCode: response.status
          });
        }
      }
    );
  }

  private async waitForRequiredFileDigests(
    providerDeployId: string,
    initialDeploy: NetlifyDeployResponse
  ): Promise<string[]> {
    let deploy = initialDeploy;

    for (let attempt = 0; attempt <= this.requiredFilePollAttempts; attempt += 1) {
      const required = requiredDigests(deploy.required);

      if (required.length > 0) {
        return required;
      }

      const status = mapNetlifyDeployState(deploy.state);

      if (status === "ready" || status === "deploying") {
        return [];
      }

      if (status === "failed" || status === "rolled_back") {
        throw new Error(`Netlify deploy ${providerDeployId} failed before file upload.`);
      }

      if (attempt === this.requiredFilePollAttempts) {
        throw new Error(`Netlify deploy ${providerDeployId} did not expose required files before the poll limit.`);
      }

      await sleep(this.requiredFilePollIntervalMs);
      deploy = await this.netlifyRequest<NetlifyDeployResponse>(`/deploys/${providerDeployId}`, { method: "GET" });
    }

    return [];
  }

  private async buildStaticFileManifest(buildArtifactKey: string): Promise<StaticFileManifest> {
    const artifact = StaticSiteArtifactSchema.parse(
      await this.options.objectStorage.getJson({ key: buildArtifactKey })
    );
    const files = artifact.files;

    return {
      digestByPath: Object.fromEntries(files.map((file) => [file.path, sha1(file.body)])),
      fileByDigest: new Map(files.map((file) => [sha1(file.body), file]))
    };
  }
}

function buildNetlifyDeployTitle(input: Pick<CreateDeployInput, "deploymentId" | "deploymentKey">): string {
  return input.deploymentId ? `${input.deploymentKey}:${input.deploymentId}` : input.deploymentKey;
}

function netlifyResumeToken(requiredDigests: string[]): ProviderUploadResumeToken {
  return {
    adapter: "netlify",
    requiredDigests
  };
}

function requiredDigestsFromResumeToken(resumeToken: ProviderUploadResumeToken | undefined): string[] {
  if (resumeToken?.adapter !== "netlify") {
    throw new Error("Netlify deploy upload resume token is missing");
  }

  return requiredDigests(resumeToken.requiredDigests);
}

function requiredDigests(required: unknown): string[] {
  return Array.isArray(required) ? required.filter((item): item is string => typeof item === "string") : [];
}

function requiredFiles(required: string[], fileByDigest: Map<string, StaticFile>): StaticFile[] {
  return required.map((item) => {
    const byDigest = fileByDigest.get(item);

    if (!byDigest) {
      throw new Error(`Netlify requested a digest that is not in the static site artifact: ${item}`);
    }

    return byDigest;
  });
}

function mapNetlifyDeployState(state: unknown): ProviderDeployStatus {
  if (state === "ready" || state === "current") {
    return "ready";
  }

  if (state === "error" || state === "failed") {
    return "failed";
  }

  if (state === "building" || state === "processing" || state === "uploading" || state === "uploaded") {
    return "deploying";
  }

  if (
    state === "accepted" ||
    state === "queued" ||
    state === "preparing" ||
    state === "prepared" ||
    state === "upload_required"
  ) {
    return "pending";
  }

  return "unknown";
}

function liveUrlsFromDeploy(deploy: NetlifyDeployResponse): string[] {
  const urls = [deploy.ssl_url, deploy.url, deploy.deploy_ssl_url, deploy.deploy_url].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );

  return [...new Set(urls)];
}

function rollbackStatusFromProviderStatus(status: ProviderDeployStatus): RollbackDeployResult["status"] {
  if (status === "ready") {
    return "completed";
  }

  if (status === "failed" || status === "rolled_back") {
    return "failed";
  }

  return "queued";
}

function encodeDeployFilePath(filePath: string): string {
  return filePath
    .replace(/^\/+/u, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function sha1(body: string): string {
  return createHash("sha1").update(body).digest("hex");
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} missing from Netlify response`);
  }

  return value;
}

function stringFieldOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
