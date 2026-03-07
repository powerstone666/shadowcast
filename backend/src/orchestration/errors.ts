export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class WorkflowTerminatedError extends Error {
  constructor(message = "Workflow terminated by user") {
    super(message);
    this.name = "WorkflowTerminatedError";
  }
}

export function isConflictError(error: unknown): error is ConflictError {
  return error instanceof ConflictError;
}

export function isWorkflowTerminatedError(error: unknown): error is WorkflowTerminatedError {
  return error instanceof WorkflowTerminatedError;
}
