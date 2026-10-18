import { describe, expect, it } from "vitest"
import { SnapshotCoordinator } from "./snapshot-coordinator"

describe("whole snapshot serialization", () => {
  it("serializes active writes and coalesces pending snapshots to the newest", async () => {
    const sent: number[] = []; let finish: (() => void) | undefined
    const coordinator = new SnapshotCoordinator<number>(async value => {
      sent.push(value)
      if (value === 1) await new Promise<void>(resolve => { finish = resolve })
    })
    const first = coordinator.enqueue(1); const second = coordinator.enqueue(2); const third = coordinator.enqueue(3)
    expect(sent).toEqual([1]); finish?.()
    await Promise.all([first, second, third]); expect(sent).toEqual([1, 3])
  })
  it("does not wedge after failure and exposes the failed write", async () => {
    const sent: number[] = []
    const coordinator = new SnapshotCoordinator<number>(async value => {
      sent.push(value); if (value === 1) throw new Error("offline")
    })
    await expect(coordinator.enqueue(1)).rejects.toThrow("offline")
    await expect(coordinator.enqueue(2)).resolves.toBeUndefined()
    expect(sent).toEqual([1, 2])
  })
})
