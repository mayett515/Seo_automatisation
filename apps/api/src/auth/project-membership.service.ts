import { Injectable } from "@nestjs/common";
import { customerMemberships, customers, projects } from "@localseo/db";
import { and, eq, ne, or } from "drizzle-orm";
import { DatabaseService } from "../database/database.service.js";
import type { ProjectAccessContext } from "./types/authenticated-request.js";

@Injectable()
export class ProjectMembershipService {
  constructor(private readonly database: DatabaseService) {}

  isDatabaseBacked(): boolean {
    return this.database.isConfigured();
  }

  async canAccessProject(input: { userId: string; projectId: string }): Promise<boolean> {
    return Boolean(await this.getProjectAccess(input));
  }

  async getProjectAccess(input: { userId: string; projectId: string }): Promise<ProjectAccessContext | undefined> {
    const db = this.database.db;

    if (!db) {
      return undefined;
    }

    const [row] = await db
      .select({
        projectId: projects.id,
        projectStatus: projects.status,
        customerId: projects.customerId,
        ownerUserId: customers.ownerUserId,
        membershipRole: customerMemberships.role
      })
      .from(projects)
      .innerJoin(customers, eq(projects.customerId, customers.id))
      .leftJoin(
        customerMemberships,
        and(eq(customerMemberships.customerId, customers.id), eq(customerMemberships.userId, input.userId))
      )
      .where(
        and(
          eq(projects.id, input.projectId),
          ne(projects.status, "deleted"),
          or(eq(customers.ownerUserId, input.userId), eq(customerMemberships.userId, input.userId))
        )
      )
      .limit(1);

    if (!row) {
      return undefined;
    }

    const role = row.ownerUserId === input.userId ? "owner" : row.membershipRole;

    if (!role) {
      return undefined;
    }

    return {
      userId: input.userId,
      customerId: row.customerId,
      projectId: row.projectId,
      role,
      projectStatus: row.projectStatus
    };
  }
}
