export interface ApiResponse<T> {
  readonly data: T;
  readonly timestamp: string;
}

export function createApiResponse<T>(data: T): ApiResponse<T> {
  return { data, timestamp: new Date().toISOString() };
}
