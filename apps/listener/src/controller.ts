export interface LiveCommand { username: string | null; revision: string }
interface ManagedListener { start(): Promise<void>; shutdown(): Promise<void> }

/** Serial reconciliation prevents overlapping listeners when the account changes. */
export class ListenerController {
  private revision: string | undefined;
  private listener: ManagedListener | undefined;
  private stopped = false;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly create: (command: LiveCommand) => ManagedListener) {}

  apply(command: LiveCommand) {
    this.pending = this.pending.catch(() => {}).then(async () => {
      if (this.stopped || this.revision === command.revision) return;
      await this.listener?.shutdown();
      this.listener = undefined;
      this.revision = command.revision;
      if (command.username) {
        this.listener = this.create(command);
        await this.listener.start();
      }
    });
    return this.pending;
  }

  async shutdown() {
    this.stopped = true;
    await this.pending.catch(() => {});
    await this.listener?.shutdown();
  }
}
