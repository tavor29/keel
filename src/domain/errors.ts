// Errors raised by pure domain code. The API layer re-exports them (src/api/errors.ts).

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly fieldErrors: Record<string, string>;
  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

export class CycleError extends DomainError {
  readonly path: string[];
  constructor(path: string[]) {
    super(`Relation would create a cycle: ${path.join(' → ')}`);
    this.path = path;
  }
}
