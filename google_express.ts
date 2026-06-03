// Phase 4 — Google Express Migration Engine.
// Ingests non-Google marketing parameters and maps/translates them to Google Ads structures.

export interface MetaCampaign {
  id: string;
  name: string;
  dailyBudget: number;
  objective: "CONVERSIONS" | "TRAFFIC" | "LEADS";
  targeting: {
    genders: string[]; // ['MALE', 'FEMALE'] etc.
    interests: string[]; // ['fashion', 'shoes'] etc.
  };
  adAssets: {
    headline: string;
    bodyText: string;
  };
}

export interface GoogleCampaignProposal {
  campaignName: string;
  budget: number;
  advertisingChannelType: "PERFORMANCE_MAX" | "SEARCH";
  optimizationGoal: "SALES" | "LEADS" | "WEBSITE_TRAFFIC";
  customIntentKeywords: string[];
  headlines: string[];
  descriptions: string[];
}

export class GoogleExpress {
  /**
   * Translates a Meta campaign configuration to a Google Ads equivalent campaign proposal.
   */
  translateMetaToGoogle(meta: MetaCampaign): GoogleCampaignProposal {
    // 1. Objective Mapping
    let channel: "PERFORMANCE_MAX" | "SEARCH" = "PERFORMANCE_MAX";
    let goal: "SALES" | "LEADS" | "WEBSITE_TRAFFIC" = "SALES";

    if (meta.objective === "TRAFFIC") {
      channel = "SEARCH";
      goal = "WEBSITE_TRAFFIC";
    } else if (meta.objective === "LEADS") {
      channel = "SEARCH";
      goal = "LEADS";
    }

    // 2. Budget Translation
    // Typically, when migrating, the user may apply a conservative trial budget factor (e.g. 80%)
    const proposedBudget = Math.round(meta.dailyBudget * 0.80);

    // 3. Keyword / Intent Mapping
    // In Meta we target interests; in Google we target search intent keywords.
    const keywords = meta.targeting.interests.map(interest => `${interest} buy online`);

    return {
      campaignName: `Migrated_from_Meta_${meta.name}`,
      budget: proposedBudget,
      advertisingChannelType: channel,
      optimizationGoal: goal,
      customIntentKeywords: keywords,
      headlines: [meta.adAssets.headline, "Best Offers Online"],
      descriptions: [meta.adAssets.bodyText, "Shop the collection now!"],
    };
  }
}
