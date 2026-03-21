import type { RuntimeState } from "../types.ts";
import type {
  IIssueRepository,
  IEventStore,
  IPersistencePort,
} from "../ports/index.ts";

// Persistence adapters
import { createS3dbIssueRepository } from "./s3db-issue-repository.ts";
import { createS3dbEventStore } from "./s3db-event-store.ts";
import { setFsmEventEmitter } from "./plugins/issue-state-machine.ts";

// Store
import { persistState } from "./store.ts";

export type Container = {
  issueRepository: IIssueRepository;
  eventStore: IEventStore;
  persistencePort: IPersistencePort;
};

let _container: Container | null = null;

export function createContainer(state: RuntimeState): Container {
  const issueRepository = createS3dbIssueRepository(state);
  const eventStore = createS3dbEventStore(state);

  const persistencePort: IPersistencePort = {
    persistState: (s) => persistState(s),
    loadState: async () => null,
  };

  const container: Container = {
    issueRepository, eventStore, persistencePort,
  };

  _container = container;

  // Wire FSM event emitter so entry actions can emit events through the event store
  setFsmEventEmitter((issueId, kind, message) => {
    eventStore.addEvent(issueId, kind as any, message);
  });

  return container;
}

export function getContainer(): Container {
  if (!_container) throw new Error("Container not initialized. Call createContainer(state) first.");
  return _container;
}
