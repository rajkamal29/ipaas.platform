import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FeaturePlaceholder } from '../../shared/ui/feature-placeholder/feature-placeholder';

@Component({
  selector: 'app-tenants',
  imports: [FeaturePlaceholder],
  template:
    '<app-feature-placeholder heading="Tenants" description="Organize tenant workspaces and their integration configurations." />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tenants {}
