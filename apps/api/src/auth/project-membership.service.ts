import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { parseAppEnv } from "@localseo/config";
import { createDatabaseClient, customerMemberships, customers, projects } from "@localseo/db";
import { and, eq, ne, or } from "drizzle-orm";
import type { ProjectAccessContext } from "./types/authenticated-request.js";

const env = parseAppEnv(process.env);

type DbHandle = ReturnType<typeof createDatabaseClient>;

@Injectable()
export class ProjectMembershipService implements OnModuleDestroy {
  private readonly dbHandle: DbHandle | undefined = env.DATABASE_URL
    ? createDatabaseClient(env.DATABASE_URL)
    : undefined;

  isDatabaseBacked(): boolean {
    return Boolean(this.dbHandle);
  }

  async canAccessProject(input: { userId: string; projectId: string }): Promise<boolean> {
    return Boolean(await this.getProjectAccess(input));
  }

  async getProjectAccess(input: { userId: string; projectId: string }): Promise<ProjectAccessContext | undefined> {
    if (!this.dbHandle) {
      return undefined;
    }

    const [row] = await this.dbHandle.db
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

  async onModuleDestroy(): Promise<void> {
    await this.dbHandle?.close();
  }
}
