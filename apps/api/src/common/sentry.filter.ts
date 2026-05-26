import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';

/**
 * Catches all unhandled exceptions, reports 5xx + uncaught to Sentry,
 * and returns a clean JSON response.
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse() as any;
    }

    // Send to Sentry only for 5xx / unknown — 4xx are user errors
    if (status >= 500) {
      Sentry.withScope((scope) => {
        scope.setTag('path', req.url);
        scope.setTag('method', req.method);
        const userId = (req as any).user?.id;
        if (userId) scope.setUser({ id: userId });
        Sentry.captureException(exception);
      });
      this.logger.error(`${req.method} ${req.url} → ${status}`, (exception as any)?.stack);
    }

    res.status(status).json(
      typeof message === 'string' ? { statusCode: status, message } : { statusCode: status, ...(message as object) },
    );
  }
}
