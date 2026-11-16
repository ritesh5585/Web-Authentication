export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "ERROR",
  ) {
    super(message);
  }
}