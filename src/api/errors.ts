export class KeelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ForbiddenError extends KeelError {}
export class NotFoundError extends KeelError {}

export class ValidationError extends KeelError {
  readonly fieldErrors: Record<string, string>;
  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

export class CycleError extends KeelError {
  readonly path: string[];
  constructor(path: string[]) {
    super(`Relation would create a cycle: ${path.join(' → ')}`);
    this.path = path;
  }
}

export class ConflictError extends KeelError {}

/** Thrown by mock methods that are part of the contract but scheduled for a later build phase. */
export class NotImplementedError extends KeelError {
  readonly method: string;
  readonly phase: number;
  constructor(method: string, phase: number) {
    super(`${method} is not implemented yet (planned for phase ${phase})`);
    this.method = method;
    this.phase = phase;
  }
}
