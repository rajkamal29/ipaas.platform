import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import { APP_CONFIG } from '../../core/config/app-config';
import { RepositoryError, type RepositoryErrorCode } from '../contracts/repository-error';
import type { ApiErrorBody, ApiResponse } from './api-contracts';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).apiBaseUrl.replace(/\/$/, '');

  async get<T>(path: string, params?: HttpParams): Promise<T> {
    return this.send(this.http.get<ApiResponse<T>>(this.url(path), { params }));
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.send(this.http.post<ApiResponse<T>>(this.url(path), body));
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.send(this.http.put<ApiResponse<T>>(this.url(path), body));
  }

  private async send<T>(request: Observable<ApiResponse<T>>): Promise<T> {
    try {
      const response = await firstValueFrom(request);
      return response.data;
    } catch (error: unknown) {
      throw this.repositoryError(error);
    }
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private repositoryError(error: unknown): RepositoryError {
    if (!(error instanceof HttpErrorResponse))
      return new RepositoryError('network', 'The API is unavailable. Please try again.');
    const body = this.apiErrorBody(error.error);
    const serverError = body?.error;
    const code = this.errorCode(serverError?.code, error.status);
    const message =
      typeof serverError?.message === 'string'
        ? serverError.message
        : error.status === 0
          ? 'The API is unavailable. Please try again.'
          : 'The request could not be completed. Please try again.';
    return new RepositoryError(
      code,
      message,
      Array.isArray(serverError?.details) ? serverError.details : [],
      undefined,
      typeof serverError?.requestId === 'string' ? serverError.requestId : undefined,
    );
  }

  private apiErrorBody(value: unknown): ApiErrorBody | null {
    return value !== null && typeof value === 'object' ? (value as ApiErrorBody) : null;
  }

  private errorCode(value: unknown, status: number): RepositoryErrorCode {
    if (value === 'validation' || value === 'conflict' || value === 'not-found') return value;
    if (status === 400 || status === 422) return 'validation';
    if (status === 404) return 'not-found';
    if (status === 409) return 'conflict';
    return status === 0 ? 'network' : 'server';
  }
}
