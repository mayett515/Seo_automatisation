import type { FastifyRequest } from "fastify";

export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type AuthenticatedSession = {
  id: string;
  userId: string;
  expiresAt: Date;
};

export type AuthenticatedRequestContext = {
  user: AuthenticatedUser;
  session: AuthenticatedSession;
  source: "better_auth" | "local_scaffold";
};

export type RequestWithAuth<TRequest extends FastifyRequest = FastifyRequest> = TRequest & {
  auth?: AuthenticatedRequestContext;
};
