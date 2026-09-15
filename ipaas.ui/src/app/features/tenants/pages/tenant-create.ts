import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TENANT_PATHS } from '../../../core/config/navigation';
import { validateTenantInput } from '../../../domain/validation/model-validation';
import { domainFormValidator, fieldErrors } from '../../../shared/forms/domain-form-validation';
import { FeedbackPanel } from '../../../shared/ui/feedback-panel/feedback-panel';
import { TenantFacade } from '../tenant.facade';

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
    { validators: domainFormValidator(validateTenantInput) },
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
