import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ZodError } from "zod";

export const requestValidationErrorCode = "REQUEST_VALIDATION_FAILED";

@Catch(ZodError)
export class ZodValidationExceptionFilter implements ExceptionFilter<ZodError> {
  catch(exception: ZodError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    void reply.status(HttpStatus.BAD_REQUEST).send({
      statusCode: HttpStatus.BAD_REQUEST,
      error: "Bad Request",
      code: requestValidationErrorCode,
      message: "Request validation failed.",
      issues: exception.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message
      }))
    });
  }
}
