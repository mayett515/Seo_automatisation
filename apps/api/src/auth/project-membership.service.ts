import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { parseAppEnv } from "@localseo/config";
import { createDatabaseClient, customerMemberships, customers, projects } from "@localseo/db";
import { and, eq, or } from "drizzle-orm";

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
    if (!this.dbHandle) {
      return false;
    }

    const [row] = await this.dbHandle.db
      .select({ projectId: projects.id })
      .from(projects)
      .innerJoin(customers, eq(projects.customerId, customers.id))
      .leftJoin(
        customerMemberships,
        and(eq(customerMemberships.customerId, customers.id), eq(customerMemberships.userId, input.userId))
      )
      .where(
        and(
          eq(projects.id, input.projectId),
          or(eq(customers.ownerUserId, input.userId), eq(customerMemberships.userId, input.userId))
        )
      )
      .limit(1);

    return Boolean(row);
  }

  async onModuleDestroy(): Promise<void> {
    await this.dbHandle?.close();
  }
}
