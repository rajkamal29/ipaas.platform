import { DestroyRef, inject, signal } from '@angular/core';
import { UiFeedback, uiFeedback } from '../../core/errors/ui-feedback';

export type LoadState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'error'; readonly error: UiFeedback };

/** Page-scoped async reads: a stale response must not replace the current route's data. */
export class AsyncResource<T> {
  private readonly destroyRef = inject(DestroyRef);
  private readonly current = signal<LoadState<T>>({ status: 'loading' });
  private sequence = 0;
  readonly state = this.current.asReadonly();

  async load(read: () => Promise<T>, fallback: string): Promise<void> {
    const sequence = ++this.sequence;
    this.current.set({ status: 'loading' });
    try {
      const data = await read();
      if (sequence === this.sequence && !this.destroyRef.destroyed) {
        this.current.set({ status: 'ready', data });
      }
    } catch (error: unknown) {
      if (sequence === this.sequence && !this.destroyRef.destroyed) {
        this.current.set({ status: 'error', error: uiFeedback(error, fallback) });
      }
    }
  }
}

/** Prevents duplicate submissions and discards feedback when a page changes context. */
export class SubmissionState {
  private readonly destroyRef = inject(DestroyRef);
  private readonly busy = signal(false);
  private readonly feedback = signal<UiFeedback | null>(null);
  private sequence = 0;
  readonly saving = this.busy.asReadonly();
  readonly error = this.feedback.asReadonly();

  reset(): void {
    this.sequence++;
    this.busy.set(false);
    this.feedback.set(null);
  }

  async run<T>(write: () => Promise<T>, fallback: string, conflict?: string): Promise<T | null> {
    if (this.busy()) return null;
    const sequence = ++this.sequence;
    this.busy.set(true);
    this.feedback.set(null);
    try {
      const result = await write();
      return sequence === this.sequence && !this.destroyRef.destroyed ? result : null;
    } catch (error: unknown) {
      if (sequence === this.sequence && !this.destroyRef.destroyed) {
        this.feedback.set(uiFeedback(error, fallback, conflict));
      }
      return null;
    } finally {
      if (sequence === this.sequence && !this.destroyRef.destroyed) this.busy.set(false);
    }
  }
}
