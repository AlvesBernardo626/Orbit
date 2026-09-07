export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  status = 403,
  message = 'Operação não permitida',
): asserts condition {
  if (!condition) throw new AppError(status, message);
}
