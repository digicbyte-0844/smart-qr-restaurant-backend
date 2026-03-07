import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global Exception Filter — returns structured JSON for ALL errors.
 * Format: { success: false, message: string, error: string, statusCode: number, path: string, timestamp: string }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        // Extract human-readable message
        let message = 'Internal server error';
        let errorDetail = '';

        if (exception instanceof HttpException) {
            const res = exception.getResponse();
            if (typeof res === 'string') {
                message = res;
            } else if (typeof res === 'object' && res !== null) {
                message = (res as any).message || (res as any).error || 'Request failed';
                errorDetail = Array.isArray((res as any).message)
                    ? (res as any).message.join(', ')
                    : (res as any).error || '';
            }
        } else if (exception instanceof Error) {
            message = exception.message;
            errorDetail = exception.stack?.split('\n')[0] || '';
        }

        const errorResponse = {
            success: false,
            message: typeof message === 'string' ? message : JSON.stringify(message),
            error: errorDetail || message,
            statusCode: status,
            path: request.url,
            timestamp: new Date().toISOString(),
        };

        // Centralized logging
        this.logger.error(
            `[${request.method}] ${request.url} → ${status} — ${errorResponse.message}`,
            exception instanceof Error ? exception.stack : JSON.stringify(exception)
        );

        response.status(status).json(errorResponse);
    }
}
