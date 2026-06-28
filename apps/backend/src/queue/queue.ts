// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal job-queue abstraction. The call site (`queue.add(name, payload)`) and
// signature match a future Redis/BullMQ-backed queue, so swapping the backend
// later touches only this file. For now jobs run in-process, fire-and-forget.

export type JobName =
  | "federate_post"
  | "federate_list_item"
  | "send_follow"
  | "send_unfollow"
  | "delete_actor";

export type JobPayloads = {
  federate_post: { postId: string };
  federate_list_item: { listId: string; postId: string; action: "add" | "remove" };
  send_follow: { followerId: string; targetActor: string };
  send_unfollow: { followerId: string; targetActor: string };
  delete_actor: { userId: string };
};

type Handler<N extends JobName> = (payload: JobPayloads[N]) => Promise<void>;

const handlers = new Map<JobName, Handler<JobName>>();

export function registerHandler<N extends JobName>(name: N, handler: Handler<N>) {
  handlers.set(name, handler as Handler<JobName>);
}

export const queue = {
  // Enqueue a job. Returns immediately; execution is detached so request
  // latency is unaffected. Swap the body for a real broker later.
  add<N extends JobName>(name: N, payload: JobPayloads[N]): void {
    const handler = handlers.get(name);
    if (!handler) {
      console.warn(`queue: no handler registered for "${name}" (dropping job)`);
      return;
    }
    queueMicrotask(async () => {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`queue: job "${name}" failed:`, err);
      }
    });
  },
};
