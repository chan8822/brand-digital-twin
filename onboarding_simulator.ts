import * as readline from "readline";

export interface OnboardingState {
  storefrontUrl: string;
  connectedSurfaces: string[];
  dailyRiskCap: number;
  maxBudgetDrift: number;
  confidenceThreshold: number;
  autonomyTier: number;
}

export class OnboardingSimulator {
  private rl: readline.Interface;
  private state: OnboardingState = {
    storefrontUrl: "",
    connectedSurfaces: [],
    dailyRiskCap: 300,
    maxBudgetDrift: 30,
    confidenceThreshold: 85,
    autonomyTier: 0,
  };

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  start() {
    console.clear();
    console.log("=================================================");
    console.log("      GaaS Brand Digital Twin Onboarding        ");
    console.log("=================================================");
    this.screen1Scan();
  }

  private screen1Scan() {
    console.log("\n[ SCREEN 1 of 4: Scan & Audit ]");
    console.log("Build your brand's digital twin in seconds.");
    this.rl.question("Enter your storefront URL (e.g. ableys.in): ", (url) => {
      this.state.storefrontUrl = url;
      console.log("\nScanning storefront...");
      setTimeout(() => {
        console.log("[x] Shopify Storefront Detected");
        console.log("[x] Active Meta Pixel found");
        console.log("[x] Google Analytics v4 (GA4) found");
        console.log("\nFootprint Maturity Score: 68/100");
        console.log("- 1st-party server tracking missing");
        console.log("- COGS margins not reconciled");

        this.rl.question("\nPress [Enter] to continue to Integration...", () => {
          this.screen2Credentials();
        });
      }, 1000);
    });
  }

  private screen2Credentials() {
    console.clear();
    console.log("\n[ SCREEN 2 of 4: Connect Surfaces ]");
    console.log("Connect your surfaces to seed the twin's data spine:\n");
    console.log("1. Shopify Admin API      [ CONNECTED (read-only) ]");
    console.log("2. Google Ads             [ Pending OAuth ]");
    console.log("3. Meta Ads               [ Pending OAuth ]");
    console.log("4. RBI Account Aggregator [ Pending Auth ]");

    this.rl.question("\nType 'connect' to authorize mock integrations: ", (ans) => {
      if (ans.toLowerCase() === "connect") {
        this.state.connectedSurfaces = ["shopify", "google_ads", "meta_ads", "rbi_aa"];
        console.log("\n[x] Google Ads Connected (Read/Write)");
        console.log("[x] Meta Ads Connected (Read-Only)");
        console.log("[x] RBI Account Aggregator Authorized");
      } else {
        this.state.connectedSurfaces = ["shopify"];
        console.log("\nOnly Shopify (Read-Only) connected.");
      }
      this.rl.question("\nPress [Enter] to set Governance Guardrails...", () => {
        this.screen3Guardrails();
      });
    });
  }

  private screen3Guardrails() {
    console.clear();
    console.log("\n[ SCREEN 3 of 4: Governance Guardrails ]");
    console.log("Configure your autonomous blast-radius limits:");

    this.rl.question("\nEnter Daily Dollars-at-Risk Limit (default $300): $", (val) => {
      const cap = parseInt(val);
      if (!isNaN(cap)) {
        this.state.dailyRiskCap = cap;
      }

      this.rl.question("Enter Max Budget Drift percentage per 24h (default 30%): ", (driftVal) => {
        const drift = parseInt(driftVal);
        if (!isNaN(drift)) {
          this.state.maxBudgetDrift = drift;
        }

        console.log("\nAutonomy Level Options:");
        console.log("  0: Suggestions only (Highly Recommended)");
        console.log("  1: Auto-pilot minor updates");
        this.rl.question("Select Autonomy Tier (0 or 1): ", (tierVal) => {
          const tier = parseInt(tierVal);
          if (tier === 0 || tier === 1) {
            this.state.autonomyTier = tier;
          }
          this.screen4Insights();
        });
      });
    });
  }

  private screen4Insights() {
    console.clear();
    console.log("\n[ SCREEN 4 of 4: Brand Digital Twin Ready ]");
    console.log("Your shadow twin has reconciled your last 30 days of data!\n");
    console.log("[!] Found $2,400 of unprofitable ad spend on 3 Meta campaigns");
    console.log("    that reported positive ROAS but are net-negative after COGS & refunds");
    console.log("[!] 2 Shopify variants are 4 days from stockout with active ads running\n");

    console.log("Current Configuration Summary:");
    console.log(JSON.stringify(this.state, null, 2));

    this.rl.question("\nType 'activate' to begin Shadow Run (Read-Only): ", (ans) => {
      if (ans.toLowerCase() === "activate") {
        console.log("\n=================================================");
        console.log("   SHADOW RUN ACTIVATED SUCCESSFULLY!            ");
        console.log("=================================================");
      } else {
        console.log("\nOnboarding paused. Config saved as draft.");
      }
      this.rl.close();
    });
  }
}
