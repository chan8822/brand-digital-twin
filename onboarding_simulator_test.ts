import {OnboardingSimulator} from './onboarding_simulator';
import {SupabaseClient} from './supabase_client';

describe('OnboardingSimulator', () => {
  let simulator: OnboardingSimulator;

  beforeEach(() => {
    simulator = new OnboardingSimulator();
  });

  it('should initialize with default onboarding state values', () => {
    const state = (simulator as any).state;
    expect(state.storefrontUrl).toBe('');
    expect(state.connectedSurfaces).toEqual([]);
    expect(state.dailyRiskCap).toBe(300);
    expect(state.maxBudgetDrift).toBe(30);
    expect(state.confidenceThreshold).toBe(85);
    expect(state.autonomyTier).toBe(0);
  });

  it('should run screen4Insights dynamic sweep audit and calculate unprofitable spend & stockout alarms', async () => {
    // Stub the readline interface to instantly resolve prompts
    const mockRl = {
      question: (query: string, callback: (ans: string) => void) => {
        callback('activate');
      },
      close: () => {},
    };
    (simulator as any).rl = mockRl;

    const logs: string[] = [];
    spyOn(console, 'log').and.callFake((...args) => {
      logs.push(args.join(' '));
    });

    await (simulator as any).screen4Insights();

    // Reconciles 30-day POAS and returns SweepFindings
    expect(logs.some(l => l.includes('Unprofitable spend on campaign Meta Lookalike Purchase'))).toBe(true);
    expect(logs.some(l => l.includes('Unprofitable spend on campaign Meta Retargeting Catalog'))).toBe(true);
    expect(logs.some(l => l.includes('Out of Stock safety pause for SKU BLUE-SHIRT-M'))).toBe(true);
    expect(logs.some(l => l.includes('Budget-capped winner: Meta Catalog Winner [SCALABLE]'))).toBe(true);
    expect(logs.some(l => l.includes('Purchase conversion tracking signal loss'))).toBe(true);
  });

  it('should emit structured onboarding events at each stage transition', async () => {
    const mockRl = {
      question: (query: string, callback: (ans: string) => void) => {
        callback('activate');
      },
      close: () => {},
    };
    (simulator as any).rl = mockRl;

    await (simulator as any).screen4Insights();

    const db = (simulator as any).db as SupabaseClient;
    const events = await db.getOnboardingEvents((simulator as any).tenantId);

    const stages = events.map((e: any) => e.stage);
    expect(stages).toContain('sweep_started');
    expect(stages).toContain('first_poas_computed');
    expect(stages).toContain('sweep_complete');
    expect(stages).toContain('first_healing_card_shown');
    expect(stages).toContain('first_action_taken');

    // durationMs should be set as a number
    expect(events[0].duration_ms).toBeDefined();
    expect(typeof events[0].duration_ms).toBe('number');
  });
});
