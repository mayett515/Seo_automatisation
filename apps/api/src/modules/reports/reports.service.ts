import { Inject, Injectable, Optional } from "@nestjs/common";
import type { ImmutableArtifactReaderPort } from "@localseo/adapters";
import { DatabaseService } from "../../database/database.service.js";
import { IMMUTABLE_ARTIFACT_READER } from "../../media-storage.module.js";
import { ReportGenerationCapability } from "./report-generation.capability.js";
import { ReportPublicationCapability } from "./report-publication.capability.js";
import { ReportReviewCapability } from "./report-review.capability.js";

@Injectable()
export class ReportsService {
  private readonly generation: ReportGenerationCapability;
  private readonly review: ReportReviewCapability;
  private readonly publication: ReportPublicationCapability;

  constructor(
    database: DatabaseService,
    @Optional()
    @Inject(IMMUTABLE_ARTIFACT_READER)
    artifactReader?: ImmutableArtifactReaderPort
  ) {
    this.generation = new ReportGenerationCapability(database);
    this.review = new ReportReviewCapability(database, artifactReader);
    this.publication = new ReportPublicationCapability(database, artifactReader);
  }

  admitGeneration(
    ...args: Parameters<ReportGenerationCapability["admitGeneration"]>
  ): ReturnType<ReportGenerationCapability["admitGeneration"]> {
    return this.generation.admitGeneration(...args);
  }

  markGenerationEnqueueFailed(
    ...args: Parameters<ReportGenerationCapability["markGenerationEnqueueFailed"]>
  ): ReturnType<ReportGenerationCapability["markGenerationEnqueueFailed"]> {
    return this.generation.markGenerationEnqueueFailed(...args);
  }

  getGeneration(
    ...args: Parameters<ReportGenerationCapability["getGeneration"]>
  ): ReturnType<ReportGenerationCapability["getGeneration"]> {
    return this.generation.getGeneration(...args);
  }

  persistGeneratedDraft(
    ...args: Parameters<ReportGenerationCapability["persistGeneratedDraft"]>
  ): ReturnType<ReportGenerationCapability["persistGeneratedDraft"]> {
    return this.generation.persistGeneratedDraft(...args);
  }

  listWorkspace(
    ...args: Parameters<ReportReviewCapability["listWorkspace"]>
  ): ReturnType<ReportReviewCapability["listWorkspace"]> {
    return this.review.listWorkspace(...args);
  }

  getCandidate(
    ...args: Parameters<ReportReviewCapability["getCandidate"]>
  ): ReturnType<ReportReviewCapability["getCandidate"]> {
    return this.review.getCandidate(...args);
  }

  submitForReview(
    ...args: Parameters<ReportReviewCapability["submitForReview"]>
  ): ReturnType<ReportReviewCapability["submitForReview"]> {
    return this.review.submitForReview(...args);
  }

  requestChanges(
    ...args: Parameters<ReportReviewCapability["requestChanges"]>
  ): ReturnType<ReportReviewCapability["requestChanges"]> {
    return this.review.requestChanges(...args);
  }

  getArtifact(
    ...args: Parameters<ReportReviewCapability["getArtifact"]>
  ): ReturnType<ReportReviewCapability["getArtifact"]> {
    return this.review.getArtifact(...args);
  }

  getArtifactDocument(
    ...args: Parameters<ReportReviewCapability["getArtifactDocument"]>
  ): ReturnType<ReportReviewCapability["getArtifactDocument"]> {
    return this.review.getArtifactDocument(...args);
  }

  retryArtifact(
    ...args: Parameters<ReportReviewCapability["retryArtifact"]>
  ): ReturnType<ReportReviewCapability["retryArtifact"]> {
    return this.review.retryArtifact(...args);
  }

  publish(
    ...args: Parameters<ReportPublicationCapability["publish"]>
  ): ReturnType<ReportPublicationCapability["publish"]> {
    return this.publication.publish(...args);
  }

  listPublished(
    ...args: Parameters<ReportPublicationCapability["listPublished"]>
  ): ReturnType<ReportPublicationCapability["listPublished"]> {
    return this.publication.listPublished(...args);
  }

  getPublished(
    ...args: Parameters<ReportPublicationCapability["getPublished"]>
  ): ReturnType<ReportPublicationCapability["getPublished"]> {
    return this.publication.getPublished(...args);
  }

  getPublishedDocument(
    ...args: Parameters<ReportPublicationCapability["getPublishedDocument"]>
  ): ReturnType<ReportPublicationCapability["getPublishedDocument"]> {
    return this.publication.getPublishedDocument(...args);
  }
}
