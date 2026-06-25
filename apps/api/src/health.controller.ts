import { connect, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import { Controller, Get } from "@nestjs/common";
import { createRedisConnection } from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import { HealthProbeResponseSchema, HealthResponseSchema, type HealthProbeResponse } from "@localseo/contracts";
import { createDatabaseClient } from "@localseo/db";

const env = parseAppEnv(process.env);

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return HealthResponseSchema.parse({
      status: "ok",
      service: "local-seo-api",
      stack: {
        http: "NestJS/Fastify",
        workers: "BullMQ",
        ai: "Mastra"
      }
    });
  }

  @Get("live")
  getLive(): HealthProbeResponse {
    return HealthProbeResponseSchema.parse({
      ...this.getHealth(),
      probe: "liveness"
    });
  }

  @Get("ready")
  async getReady(): Promise<HealthProbeResponse> {
    const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
    const status = database === "up" && redis === "up" ? "ok" : "degraded";

    return HealthProbeResponseSchema.parse({
      ...this.getHealth(),
      status,
      probe: "readiness",
      dependencies: {
        database,
        redis
      }
    });
  }
}

async function checkDatabase(): Promise<"up" | "down" | "not_configured"> {
  if (!env.DATABASE_URL) {
    return "not_configured";
  }

  const handle = createDatabaseClient(env.DATABASE_URL);

  try {
    await handle.sql`select 1`;
    return "up";
  } catch {
    return "down";
  } finally {
    await handle.close();
  }
}

async function checkRedis(): Promise<"up" | "down" | "not_configured"> {
  if (!env.REDIS_URL) {
    return "not_configured";
  }

  try {
    await pingRedis(env.REDIS_URL);
    return "up";
  } catch {
    return "down";
  }
}

async function pingRedis(redisUrl: string): Promise<void> {
  const connection = createRedisConnection(redisUrl);
  const socket = await openRedisSocket(connection.host, connection.port, Boolean(connection.tls));

  try {
    const commands = [];

    if (connection.password) {
      commands.push(
        encodeRedisCommand(
          connection.username ? ["AUTH", connection.username, connection.password] : ["AUTH", connection.password]
        )
      );
    }

    commands.push(encodeRedisCommand(["PING"]));
    await writeRedisCommands(socket, commands.join(""));
  } finally {
    socket.end();
  }
}

function openRedisSocket(host: string, port: number, useTls: boolean): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = useTls ? connectTls({ host, port, servername: host }) : connect({ host, port });
    const readyEvent = useTls ? "secureConnect" : "connect";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Redis readiness ping timed out"));
    }, 2000);

    socket.once(readyEvent, () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error("Redis readiness socket failed"));
    });
  });
}

function writeRedisCommands(socket: Socket, commands: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let response = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Redis readiness ping timed out"));
    }, 2000);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onData = (chunk: Buffer) => {
      response += chunk.toString("utf8");

      if (response.includes("-")) {
        cleanup();
        reject(new Error("Redis readiness ping failed"));
        return;
      }

      if (response.includes("+PONG")) {
        cleanup();
        resolve();
      }
    };

    socket.on("data", onData);
    socket.on("error", onError);
    socket.write(commands);
  });
}

function encodeRedisCommand(parts: string[]): string {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
}
