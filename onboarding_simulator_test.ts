import {OnboardingSimulator} from './onboarding_simulator';

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

    // Reconciles 30-day POAS and returns $2,400 of unprofitable spend across 2 Meta campaigns
    expect(logs.some(l => l.includes('Found $2,400 of unprofitable ad spend on 2 campaigns'))).toBe(true);
    // Finds 1 variant out of stock with active ads running (BLUE-SHIRT-M, qty: 0)
    expect(logs.some(l => l.includes('1 variant(s) are out of stock with active ads running'))).toBe(true);
  });
});
