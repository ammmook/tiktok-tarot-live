export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = "BAD_REQUEST",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (message = "Queue entry not found") => new AppError(message, 404, "NOT_FOUND");
export const conflict = (message: string, details?: unknown) => new AppError(message, 409, "CONFLICT", details);
export const badRequest = (message: string, details?: unknown) => new AppError(message, 400, "BAD_REQUEST", details);
export const invalidTransition = (message: string) => new AppError(message, 409, "INVALID_TRANSITION");
