import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TENANT_PATHS } from '../../../core/config/navigation';
import { validateTenantInput } from '../../../domain/validation/model-validation';
import type { ValidationIssue } from '../../../domain/validation/model-validation';
import { domainFormValidator, fieldErrors } from '../../../shared/forms/domain-form-validation';
import { FeedbackPanel } from '../../../shared/ui/feedback-panel/feedback-panel';
import { TenantFacade } from '../tenant.facade';

function validateTenantForm(value: unknown): readonly ValidationIssue[] {
  const issues = [...validateTenantInput(value)];
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const name = (value as Readonly<Record<string, unknown>>)['name'];
    if (typeof name === 'string' && !name.includes('\u0000')) {
      if (name.trim().length === 0) {
        issues.push({ field: 'name', code: 'required', message: 'Name is required.' });
      } else if (name.trim().length < 3) {
        issues.push({
          field: 'name',
          code: 'range',
          message: 'Name must be at least 3 characters.',
        });
      }
    }
  }
  return issues;
}

@Component({
  selector: 'app-tenant-create',
  imports: [RouterLink, ReactiveFormsModule, FeedbackPanel],
  providers: [TenantFacade],
  templateUrl: './tenant-create.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantCreate {
  protected readonly facade = inject(TenantFacade);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly paths = TENANT_PATHS;
  protected readonly attempted = signal(false);
  protected readonly fieldErrors = fieldErrors;
  protected readonly form = new FormGroup(
    {
      name: new FormControl('', { nonNullable: true }),
    },
    { validators: domainFormValidator(validateTenantForm) },
  );

  protected async submit(): Promise<void> {
    this.attempted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.facade.submission.saving()) return;
    const tenant = await this.facade.create(this.form.getRawValue());
    if (tenant && !this.destroyRef.destroyed)
      await this.router.navigateByUrl(this.paths.detail(tenant.id));
  }
}
