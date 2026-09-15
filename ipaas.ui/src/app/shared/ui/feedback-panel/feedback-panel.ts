import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { UiFeedback } from '../../../core/errors/ui-feedback';

@Component({
  selector: 'app-feedback-panel',
  template: `
    <div class="notice notice--error" role="alert">
      <p>{{ feedback().message }}</p>
      @if (feedback().issues.length) {
        <ul>
          @for (issue of feedback().issues; track $index) {
            <li>{{ issue.message }}</li>
          }
        </ul>
      }
      @if (allowRetry() && feedback().retryable) {
        <button class="button-secondary" type="button" (click)="retry.emit()">Try again</button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackPanel {
  readonly feedback = input.required<UiFeedback>();
  readonly allowRetry = input(false);
  readonly retry = output<void>();
}
