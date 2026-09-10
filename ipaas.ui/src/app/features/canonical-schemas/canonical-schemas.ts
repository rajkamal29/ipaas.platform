import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FeaturePlaceholder } from '../../shared/ui/feature-placeholder/feature-placeholder';

@Component({
  selector: 'app-canonical-schemas',
  imports: [FeaturePlaceholder],
  template:
    '<app-feature-placeholder heading="Canonical schemas" description="Explore the common data definitions used across integrations." />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanonicalSchemas {}
