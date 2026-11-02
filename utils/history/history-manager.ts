import type { IHistoryCommand } from './command.interface'

export const MAX_HISTORY_LIMIT = 50

export class HistoryManager {
  private undoStack: IHistoryCommand[] = []
  private redoStack: IHistoryCommand[] = []
  private readonly maxLimit: number

  constructor(maxLimit: number = MAX_HISTORY_LIMIT) {
    this.maxLimit = maxLimit
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoCount(): number {
    return this.undoStack.length
  }

  get redoCount(): number {
    return this.redoStack.length
  }

  /**
   * Execute a command, push it to undo stack, and clear the redo stack.
   */
  public execute(command: IHistoryCommand): void {
    command.execute()
    this.record(command)
  }

  /**
   * Record a command that was already applied directly to the state.
   * New change after undo clears the redo stack.
   */
  public record(command: IHistoryCommand): void {
    this.undoStack.push(command)

    // Clear redo branch on new action
    if (this.redoStack.length > 0) {
      this.redoStack = []
    }

    // Enforce 50 steps limit (FIFO)
    if (this.undoStack.length > this.maxLimit) {
      this.undoStack.shift()
    }
  }

  /**
   * Undo the last command.
   */
  public undo(): boolean {
    const command = this.undoStack.pop()
    if (!command) return false

    command.undo()
    this.redoStack.push(command)
    return true
  }

  /**
   * Redo the last undone command.
   */
  public redo(): boolean {
    const command = this.redoStack.pop()
    if (!command) return false

    command.execute()
    this.undoStack.push(command)
    return true
  }

  /**
   * Clear all history (resets stacks on save or cancel).
   */
  public clear(): void {
    this.undoStack = []
    this.redoStack = []
  }

  /**
   * Introspection for debugging and unit tests.
   */
  public getSnapshotSummary(): { undoTypes: string[]; redoTypes: string[] } {
    return {
      undoTypes: this.undoStack.map(c => c.type),
      redoTypes: this.redoStack.map(c => c.type)
    }
  }
}
