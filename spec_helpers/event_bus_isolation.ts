import {eventBus} from '../event_bus';

// Test isolation for the shared eventBus singleton.
//
// Under Blaze each *_test.ts was a jasmine_node_test target and ran in its own
// process, so the module-level `eventBus` singleton started fresh per file. In a
// single-process runner (npm test) every GovernanceEngine instance registers a
// per-instance 'circuit_breaker_tripped' listener on that singleton and never
// removes it, so listeners leak across files. When a later spec (e.g.
// observability_test) emits the event, leaked listeners fire with their mock
// trust ledgers and throw.
//
// Clearing the event before each spec restores per-file isolation: any listener
// a spec actually needs is re-registered in its own beforeEach/it, which runs
// after this global hook.
beforeEach(() => {
  eventBus.removeAllListeners('circuit_breaker_tripped');
});
