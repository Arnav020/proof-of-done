export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public debugId?: string,
  ) {
    super(message);
  }
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const cents = (n: number) => Math.round(n * 100);
export const money = (n: number) => round2(n).toFixed(2);
