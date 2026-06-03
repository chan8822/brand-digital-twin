/**
 * @fileoverview Integration tests for Native HTTP and SSE Server.
 */

// taze: require from //third_party/javascript/typings/node


import * as http from "http";
import { startServer } from "./server";
import { SupabaseClient } from "./supabase_client";

describe("Native HTTP & SSE Server Integration Test", () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9988;
  const baseUrl = `http://localhost:${PORT}`;

  beforeAll(async () => {
    db = new SupabaseClient();
    // Pre-populate mock database structures for testing
    await db.saveClient({
      clientId: "client-nike",
      orgId: "org-nike",
      name: "Nike Marketing",
      mrr: 15000,
      marginTarget: 0.4,
      healthScore: 92,
      churnRisk: 0.1,
      tenantId: "test-tenant",
    });
    await db.saveApproval({
      approvalId: "app-1",
      orgId: "org-nike",
      entityType: "budget_shift",
      entityId: "campaign-nike-1",
      requestedBy: "analyst_agent",
      assignedTo: "cmo",
      status: "pending",
      tenantId: "test-tenant",
      createdAt: Date.now(),
    });
    await db.saveTrustTier("test-tenant", "pause", 3);

    server = startServer(PORT, db);
  });

  afterAll((done) => {
    server.close(done);
  });

  function getJson(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk.toString(); });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      }).on("error", reject);
    });
  }

  function postJson(path: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const req = http.request({
        hostname: "localhost",
        port: PORT,
        path: path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk.toString(); });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      });
      req.on("error", reject);
      req.write(postData);
      req.end();
    });
  }

  it("should return healthy status on GET /api/v1/health", async () => {
    const res = await getJson("/api/v1/health");
    expect(res.status).toBe("healthy");
    expect(res.pulse.overallScore).toBe(78);
    expect(res.clientsCount).toBeGreaterThan(0);
  });

  it("should return recommendations list on GET /api/v1/recommendations", async () => {
    // Generate some test brand signals to cause recommendations
    await db.saveBrandSignal({
      signalId: "sig-1",
      tenantId: "test-tenant",
      source: "sentiment",
      type: "low_performance_roi",
      severity: "high",
      message: "ROI dropped under threshold",
      payload: { campaignId: "nike-summer-1" },
      timestamp: Date.now(),
    });

    const res = await getJson("/api/v1/recommendations");
    expect(res.recommendations).toBeDefined();
    expect(res.recommendations.length).toBeGreaterThan(0);
    expect(res.recommendations[0].type).toBe("pause_campaign");
  });

  it("should retrieve approvals list on GET /api/v1/approvals", async () => {
    const res = await getJson("/api/v1/approvals");
    expect(res.approvals).toBeDefined();
    expect(res.approvals.length).toBeGreaterThan(0);
    expect(res.approvals[0].approvalId).toBe("app-1");
  });

  it("should execute campaign actions and trigger SSE stream updates", (done) => {
    const actionRequest = {
      idempotencyKey: "action-test-sse",
      op: "pause_campaign",
      entity: "campaign",
      targetId: "nike-summer-1",
      payload: {
        verifyMetrics: {
          preExecutionROAS: 2.5,
          postExecutionROAS: 2.6, // no anomaly
        },
      },
    };

    const context = {
      tenant: {
        tenantId: "test-tenant",
        name: "Nike Agency",
        policy: {
          maxDailyDollarsRisk: 1000,
          confidenceThreshold: 80,
        },
        shadowMode: false,
      },
      role: { name: "media_buyer", permissions: [] },
    };

    const eventsReceived: any[] = [];
    const clientReq = http.get(`${baseUrl}/api/v1/stream`, (sseRes) => {
      sseRes.on("data", (chunk) => {
        const raw = chunk.toString();
        // SSE formatting could concatenate frames
        const frames = raw.split("\n\n");
        for (const frame of frames) {
          if (frame.startsWith("data: ")) {
            const data = JSON.parse(frame.replace("data: ", "")) as any;
            eventsReceived.push(data);

            if (data.type === "phase_update" && data.phase === "AUDIT" && data.status === "COMPLETE") {
              // Ensure we received preceding phase events (PLAN, DECIDE, EXECUTE, VERIFY, AUDIT)
              const phases = eventsReceived.map(e => e.phase);
              expect(phases).toContain("PLAN");
              expect(phases).toContain("DECIDE");
              expect(phases).toContain("EXECUTE");
              expect(phases).toContain("VERIFY");
              expect(phases).toContain("AUDIT");

              clientReq.destroy();
              done();
            }
          }
        }
      });
    });

    clientReq.on("error", (err) => {
      fail(err);
      done();
    });

    // Make the POST action call after a tiny timeout to ensure SSE is connected
    setTimeout(async () => {
      const res = await postJson("/api/v1/actions", { actionRequest, context });
      expect(res.status).toBe("executed");
    }, 100);
  });
});
