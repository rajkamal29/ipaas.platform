import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ROUTE_PATHS } from '../../config/navigation';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="panel not-found">
      <p class="eyebrow">404 · Page not found</p>
      <h1>This page isn’t here.</h1>
      <p>
        The address may have changed. Return to the overview to continue exploring your workspace.
      </p>
      <a class="button-link" [routerLink]="overviewPath">Back to overview</a>
    </section>
  `,
  styles: `
    .not-found {
      padding: var(--space-10) var(--space-6);
      text-align: center;
    }
    .not-found > p:not(.eyebrow) {
      max-width: 34rem;
      margin: var(--space-4) auto var(--space-6);
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {
  protected readonly overviewPath = '/' + ROUTE_PATHS.overview;
}
