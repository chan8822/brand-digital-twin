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
});
