import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TENANT_PATHS } from '../../../core/config/navigation';
import { PROVIDER_LABELS, tenantLabel } from '../../../shared/ui/configuration-labels';
import { FeedbackPanel } from '../../../shared/ui/feedback-panel/feedback-panel';
import { TenantFacade } from '../tenant.facade';

@Component({
  selector: 'app-tenant-detail',
  imports: [DatePipe, RouterLink, FeedbackPanel],
  providers: [TenantFacade],
  templateUrl: './tenant-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantDetail {
  protected readonly facade = inject(TenantFacade);
  private readonly route = inject(ActivatedRoute);
  protected readonly paths = TENANT_PATHS;
  protected readonly providers = PROVIDER_LABELS;
  protected readonly tenantLabel = tenantLabel;
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.facade.loadDetail(params.get('tenantId'));
    });
  }
  protected retry(): void {
    void this.facade.loadDetail(this.route.snapshot.paramMap.get('tenantId'));
  }
}
