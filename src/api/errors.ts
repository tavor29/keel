import { DomainError } from '@/domain/errors';

export { CycleError, ValidationError } from '@/domain/errors';

export class KeelError extends DomainError {}

export class ForbiddenError extends KeelError {}
export class NotFoundError extends KeelError {}

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
