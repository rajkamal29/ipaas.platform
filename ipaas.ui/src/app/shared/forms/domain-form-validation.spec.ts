import { FormControl, FormGroup } from '@angular/forms';
import {
  validateSyncEntityInput,
  validateSyncRequestInput,
  validateTenantInput,
} from '../../domain/validation/model-validation';
import { domainFormValidator, fieldErrors } from './domain-form-validation';

describe('Domain-backed forms', () => {
  it('validates tenant input without inventing metadata or stronger name constraints', () => {
    expect(validateTenantInput({ name: '' })).toEqual([]);
    expect(validateTenantInput({ name: '  ' })).toEqual([]);
    expect(validateTenantInput({ name: 'North' })).toEqual([]);
    expect(validateTenantInput({ name: null })).toEqual([
      expect.objectContaining({ field: 'name' }),
    ]);
    expect(validateTenantInput({ name: 'North\u0000' })).toEqual([
      expect.objectContaining({ field: 'name' }),
    ]);
  });

  it('allows schema-supported identical source and target providers', () => {
    expect(validateSyncRequestInput({ source: 'keka', target: 'keka' })).toEqual([]);
    expect(validateSyncRequestInput({ source: 'unsupported', target: null })).toHaveLength(2);
  });

  it('maps domain issues to form validity and field feedback', () => {
    const form = new FormGroup(
      {
        entity: new FormControl('project'),
        syncType: new FormControl('interval'),
        intervalSeconds: new FormControl(59),
      },
      { validators: domainFormValidator(validateSyncEntityInput) },
    );
    expect(form.invalid).toBe(true);
    expect(fieldErrors(form, 'intervalSeconds')[0]).toContain('integer seconds');
    expect(fieldErrors(form, 'entity')).toEqual([]);
    form.controls.intervalSeconds.setValue(60);
    expect(form.valid).toBe(true);
    expect(fieldErrors(form, 'intervalSeconds')).toEqual([]);
  });
});
