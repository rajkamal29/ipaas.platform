import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TENANT_PATHS } from '../../../core/config/navigation';
import { PROVIDERS, type Provider } from '../../../domain/value-sets/database-values';
import { validateSyncRequestInput } from '../../../domain/validation/model-validation';
import { domainFormValidator, fieldErrors } from '../../../shared/forms/domain-form-validation';
import { PROVIDER_LABELS, tenantLabel } from '../../../shared/ui/configuration-labels';
import { FeedbackPanel } from '../../../shared/ui/feedback-panel/feedback-panel';
import { SyncRequestFacade } from '../sync-request.facade';

@Component({
  selector: 'app-sync-request-create',
  imports: [RouterLink, ReactiveFormsModule, FeedbackPanel],
  providers: [SyncRequestFacade],
  templateUrl: './sync-request-create.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncRequestCreate {
  protected readonly facade = inject(SyncRequestFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly paths = TENANT_PATHS;
  protected readonly providers = Object.values(PROVIDERS);
  protected readonly providerLabels = PROVIDER_LABELS;
  protected readonly tenantLabel = tenantLabel;
  protected readonly fieldErrors = fieldErrors;
  protected readonly attempted = signal(false);
  protected readonly form = new FormGroup(
    {
      source: new FormControl<Provider | null>(null),
      target: new FormControl<Provider | null>(null),
    },
    { validators: domainFormValidator(validateSyncRequestInput) },
  );

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.form.reset();
      this.attempted.set(false);
      void this.facade.loadTenant(params.get('tenantId'));
    });
  }
  protected retry(): void {
    void this.facade.loadTenant(this.route.snapshot.paramMap.get('tenantId'));
  }

  protected async submit(): Promise<void> {
    this.attempted.set(true);
    this.form.markAllAsTouched();
    const state = this.facade.tenant.state();
    const { source, target } = this.form.getRawValue();
    if (
      this.form.invalid ||
      state.status !== 'ready' ||
      !source ||
      !target ||
      this.facade.submission.saving()
    )
      return;
    const request = await this.facade.create(state.data.id, { source, target });
    if (request && !this.destroyRef.destroyed)
      await this.router.navigateByUrl(this.paths.request(request.tenantId, request.id));
  }
}
