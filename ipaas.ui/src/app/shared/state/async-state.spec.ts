import { TestBed } from '@angular/core/testing';
import { AsyncResource, SubmissionState } from './async-state';

describe('Page async state', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('discards stale reads that resolve after a newer context', async () => {
    const resource = TestBed.runInInjectionContext(() => new AsyncResource<string>());
    let resolve!: (value: string) => void;
    const first = resource.load(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
      'Load failed',
    );
    await resource.load(async () => 'new route', 'Load failed');
    resolve('old route');
    await first;
    expect(resource.state()).toEqual({ status: 'ready', data: 'new route' });
  });

  it('discards stale failures without replacing the current page', async () => {
    const resource = TestBed.runInInjectionContext(() => new AsyncResource<string>());
    let reject!: (reason: Error) => void;
    const first = resource.load(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
      'Load failed',
    );
    await resource.load(async () => 'current', 'Load failed');
    reject(new Error('Old context failed'));
    await first;
    expect(resource.state()).toEqual({ status: 'ready', data: 'current' });
  });

  it('ignores submission results after changing context', async () => {
    const state = TestBed.runInInjectionContext(() => new SubmissionState());
    let resolve!: (value: string) => void;
    const oldWrite = state.run(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
      'Save failed',
    );
    state.reset();
    resolve('created for previous route');
    expect(await oldWrite).toBeNull();
    expect(state.saving()).toBe(false);
    expect(state.error()).toBeNull();
  });

  it('supports retrying a failed submission without exposing internal errors', async () => {
    const state = TestBed.runInInjectionContext(() => new SubmissionState());
    expect(
      await state.run(async () => {
        throw new Error('sensitive server detail');
      }, 'Could not save'),
    ).toBeNull();
    expect(state.error()?.message).toBe('Could not save');
    expect(state.saving()).toBe(false);
    expect(await state.run(async () => 'saved', 'Could not save')).toBe('saved');
    expect(state.error()).toBeNull();
  });
});
