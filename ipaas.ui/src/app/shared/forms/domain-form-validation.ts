import { AbstractControl, ValidatorFn } from '@angular/forms';
import type { ValidationIssue } from '../../domain/validation/model-validation';

export function domainFormValidator(
  validate: (value: unknown) => readonly ValidationIssue[],
): ValidatorFn {
  return (control: AbstractControl<unknown>) => {
    const issues = validate(control.value);
    return issues.length ? { domain: issues } : null;
  };
}

export function fieldErrors(form: AbstractControl, field: string): readonly string[] {
  const issues = form.errors?.['domain'] as readonly ValidationIssue[] | undefined;
  return issues?.filter((issue) => issue.field === field).map((issue) => issue.message) ?? [];
}
