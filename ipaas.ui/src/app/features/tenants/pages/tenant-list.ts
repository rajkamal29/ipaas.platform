import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TENANT_PATHS } from '../../../core/config/navigation';
import { FeedbackPanel } from '../../../shared/ui/feedback-panel/feedback-panel';
import { tenantLabel } from '../../../shared/ui/configuration-labels';
import { TenantFacade } from '../tenant.facade';

@Component({
  selector: 'app-tenant-list',
  imports: [DatePipe, RouterLink, FeedbackPanel],
  providers: [TenantFacade],
  templateUrl: './tenant-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantList {
  protected readonly facade = inject(TenantFacade);
  protected readonly paths = TENANT_PATHS;
  protected readonly tenantLabel = tenantLabel;
  constructor() {
    void this.facade.loadList();
  }
}
