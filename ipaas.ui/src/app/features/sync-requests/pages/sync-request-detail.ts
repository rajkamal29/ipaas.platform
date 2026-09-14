import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TENANT_PATHS } from '../../../core/config/navigation';
import { SYNC_TYPES } from '../../../domain/value-sets/database-values';
import {
  ENTITY_LABELS,
  PROVIDER_LABELS,
  REAL_TIME_NOTICE,
  STATUS_LABELS,
  SYNC_TYPE_LABELS,
  tenantLabel,
} from '../../../shared/ui/configuration-labels';
import { FeedbackPanel } from '../../../shared/ui/feedback-panel/feedback-panel';
import { SyncRequestFacade } from '../sync-request.facade';

@Component({
  selector: 'app-sync-request-detail',
  imports: [DatePipe, RouterLink, FeedbackPanel],
  providers: [SyncRequestFacade],
  templateUrl: './sync-request-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncRequestDetail {
  protected readonly facade = inject(SyncRequestFacade);
  private readonly route = inject(ActivatedRoute);
  protected readonly paths = TENANT_PATHS;
  protected readonly providers = PROVIDER_LABELS;
  protected readonly entities = ENTITY_LABELS;
  protected readonly statuses = STATUS_LABELS;
  protected readonly syncTypeLabels = SYNC_TYPE_LABELS;
  protected readonly syncTypes = SYNC_TYPES;
  protected readonly realTimeNotice = REAL_TIME_NOTICE;
  protected readonly tenantLabel = tenantLabel;
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.facade.loadDetail(params.get('tenantId'), params.get('requestId'));
    });
  }
  protected retry(): void {
    const params = this.route.snapshot.paramMap;
    void this.facade.loadDetail(params.get('tenantId'), params.get('requestId'));
  }
}
