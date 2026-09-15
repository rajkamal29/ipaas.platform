import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TENANT_PATHS } from '../../../core/config/navigation';
import {
  ENTITY_TYPES,
  SYNC_TYPES,
  type EntityType,
  type SyncType,
} from '../../../domain/value-sets/database-values';
import {
  MIN_INTERVAL_SECONDS,
  validateSyncEntityInput,
} from '../../../domain/validation/model-validation';
import { domainFormValidator, fieldErrors } from '../../../shared/forms/domain-form-validation';
import {
  ENTITY_LABELS,
  REAL_TIME_NOTICE,
  SYNC_TYPE_LABELS,
  tenantLabel,
} from '../../../shared/ui/configuration-labels';
import { FeedbackPanel } from '../../../shared/ui/feedback-panel/feedback-panel';
import { SyncEntityFacade, type SyncEntityConfiguration } from '../sync-entity.facade';

@Component({
  selector: 'app-sync-entity-create',
  imports: [RouterLink, ReactiveFormsModule, FeedbackPanel],
  providers: [SyncEntityFacade],
  templateUrl: './sync-entity-create.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncEntityCreate {
  protected readonly facade = inject(SyncEntityFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly paths = TENANT_PATHS;
  protected readonly entities = Object.values(ENTITY_TYPES);
  protected readonly entityLabels = ENTITY_LABELS;
  protected readonly syncTypes = SYNC_TYPES;
  protected readonly syncTypeOptions = [
    SYNC_TYPES.oneTime,
    SYNC_TYPES.interval,
    SYNC_TYPES.realTime,
  ] as const;
  protected readonly syncTypeLabels = SYNC_TYPE_LABELS;
  protected readonly minInterval = MIN_INTERVAL_SECONDS;
  protected readonly realTimeNotice = REAL_TIME_NOTICE;
  protected readonly tenantLabel = tenantLabel;
  protected readonly fieldErrors = fieldErrors;
  protected readonly attempted = signal(false);
  protected readonly form = new FormGroup(
    {
      entity: new FormControl<EntityType | null>(null),
      syncType: new FormControl<SyncType>(SYNC_TYPES.oneTime, { nonNullable: true }),
      intervalSeconds: new FormControl<number | null>(null),
    },
    { validators: domainFormValidator(validateSyncEntityInput) },
  );

  constructor() {
    this.form.controls.syncType.valueChanges.pipe(takeUntilDestroyed()).subscribe((syncType) => {
      if (syncType !== SYNC_TYPES.interval) this.form.controls.intervalSeconds.setValue(null);
    });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.form.reset();
      this.attempted.set(false);
      void this.facade.loadContext(params.get('tenantId'), params.get('requestId'));
    });
  }
  protected retry(): void {
    const params = this.route.snapshot.paramMap;
    void this.facade.loadContext(params.get('tenantId'), params.get('requestId'));
  }
  protected isConfigured(entity: EntityType): boolean {
    const state = this.facade.context.state();
    return state.status === 'ready' && state.data.entities.some((item) => item.entity === entity);
  }
  protected async submit(): Promise<void> {
    this.attempted.set(true);
    this.form.markAllAsTouched();
    const state = this.facade.context.state();
    const { entity, syncType, intervalSeconds } = this.form.getRawValue();
    if (this.form.invalid || state.status !== 'ready' || !entity || this.facade.submission.saving())
      return;
    let input: SyncEntityConfiguration;
    if (syncType === SYNC_TYPES.interval) {
      if (intervalSeconds === null) return;
      input = { entity, syncType, intervalSeconds };
    } else {
      input = { entity, syncType, intervalSeconds: null };
    }
    const result = await this.facade.create(state.data.tenant.id, state.data.request.id, input);
    if (result && !this.destroyRef.destroyed)
      await this.router.navigateByUrl(
        this.paths.request(state.data.tenant.id, state.data.request.id),
      );
  }
}
