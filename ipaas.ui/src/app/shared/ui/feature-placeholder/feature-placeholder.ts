import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-feature-placeholder',
  template: `
    <header class="page-header">
      <p class="eyebrow">Workspace</p>
      <h1>{{ heading() }}</h1>
      <p class="page-description">{{ description() }}</p>
    </header>
    <section class="panel empty-state" aria-labelledby="placeholder-heading">
      <span class="status-label">Coming next</span>
      <h2 id="placeholder-heading">{{ heading() }} workspace</h2>
      <p>
        This area is being prepared. Configuration and management tools will appear here in a future
        release.
      </p>
    </section>
  `,
  styles: `
    .empty-state {
      padding: var(--space-10) var(--space-6);
      text-align: center;
    }
    .empty-state h2 {
      margin-top: var(--space-4);
    }
    .empty-state p {
      max-width: 34rem;
      margin: var(--space-3) auto 0;
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturePlaceholder {
  readonly heading = input.required<string>();
  readonly description = input.required<string>();
}
