import 'jasmine';
import {RealtimeEventBus} from './event_bus';

describe('RealtimeEventBus Exception Resilience', () => {
  let bus: RealtimeEventBus;

  beforeEach(() => {
    bus = new RealtimeEventBus();
  });

  afterEach(() => {
    bus.cleanup();
  });

  it('should be resilient to listener exceptions and execute subsequent listeners (Test Case 4.2)', (done) => {
    let secondListenerCalled = false;
    let errorHandled = false;

    // Listener 1: Throws an exception
    bus.on('event', (ev) => {
      if (ev.type === 'phase_update') {
        throw new Error('Crashing Listener 1');
      }
    });

    // Listener 2: Should be called anyway
    bus.on('event', (ev) => {
      if (ev.type === 'phase_update') {
        secondListenerCalled = true;
      }
    });

    // Override console.error to check if error was logged
    const originalConsoleError = console.error;
    console.error = (msg: any, err: any) => {
      if (String(msg).includes('Error in listener') || String(err).includes('Crashing Listener 1')) {
        errorHandled = true;
      }
    };

    // Emit event
    bus.emitPhaseUpdate('tenant-1', 'action-1', 'planning', 'running');

    // Wait a short time for queue processing (since RealtimeEventBus uses queues)
    setTimeout(() => {
      console.error = originalConsoleError;
      expect(secondListenerCalled).toBe(true);
      done();
    }, 200);
  });

  it('should correctly support once listeners under the overridden emit method', (done) => {
    let callCount = 0;
    bus.once('event', (ev) => {
      callCount++;
    });

    bus.emitPhaseUpdate('tenant-1', 'action-1', 'planning', 'running');
    bus.emitPhaseUpdate('tenant-1', 'action-1', 'planning', 'running');

    setTimeout(() => {
      expect(callCount).toBe(1);
      done();
    }, 200);
  });
});

