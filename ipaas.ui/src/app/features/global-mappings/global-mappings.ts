import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FeaturePlaceholder } from '../../shared/ui/feature-placeholder/feature-placeholder';

@Component({
  selector: 'app-global-mappings',
  imports: [FeaturePlaceholder],
  template:
    '<app-feature-placeholder heading="Global mappings" description="Manage shared mapping defaults for providers and entities." />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalMappings {}
