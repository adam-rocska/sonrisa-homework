interface Pending<T> {
  value: T
  resolve: (() => void)[]
  reject: ((reason: unknown) => void)[]
}

/** One request in flight; intermediate pending snapshots collapse to the newest whole snapshot. */
export class SnapshotCoordinator<T> {
  private pending: Pending<T> | undefined
  private running = false

  constructor(private readonly write: (snapshot: T) => Promise<void>) {}

  enqueue(value: T): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      if (this.pending) {
        this.pending.value = value
        this.pending.resolve.push(resolve)
        this.pending.reject.push(reject)
      } else {
        this.pending = { value, resolve: [resolve], reject: [reject] }
      }
    })
    void this.drain()
    return promise
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.pending) {
        const request = this.pending
        this.pending = undefined
        try {
          await this.write(request.value)
          request.resolve.forEach(resolve => resolve())
        } catch (error: unknown) {
          request.reject.forEach(reject => reject(error))
        }
      }
    } finally {
      this.running = false
    }
  }
}
