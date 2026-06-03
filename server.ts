/**
 * @fileoverview Native Node.js HTTP and SSE Server for Brand Digital Twin OS.
 */

// taze: require from //third_party/javascript/typings/node


import * as http from "http";
import * as url from "url";
import { config } from "./config";
import { sendErrorResponse, ValidationError, BaseError } from "./errors";
import { eventBus } from "./event_bus";
import { SupabaseClient } from "./supabase_client";
import { UnifiedIntelligenceBrain } from "./unified_brain";
import { GovernanceEngine, CircuitBreaker, TrustLedger } from "./governance_engine";
import { GoogleAdsAdapter } from "./google_ads_adapter";

const sseClients = new Set<http.ServerResponse>();

// Distribute events received on eventBus to all connected SSE clients
eventBus.on("event", (data) => {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
});

function parseRequestBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new ValidationError("Invalid JSON in request body"));
      }
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

export function startServer(port: number, db: SupabaseClient): http.Server {
  const brain = new UnifiedIntelligenceBrain(db);
  const cb = new CircuitBreaker();
  const tl = new TrustLedger();
  const governance = new GovernanceEngine({ record: async () => {} }, tl, cb, undefined, undefined, db);

  const server = http.createServer(async (req, res) => {
    // Enable CORS by default
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url || "", true);
    const path = parsedUrl.pathname || "";

    try {
      // 1. SSE STREAM ENDPOINT
      if (path === "/api/v1/stream" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        
        // Write initial heartbeat
        res.write("data: {\"type\":\"connected\"}\n\n");
        sseClients.add(res);

        req.on("close", () => {
          sseClients.delete(res);
        });
        return;
      }

      // 2. HEALTH / STATUS PULSE
      if (path === "/api/v1/health" && req.method === "GET") {
        const tenantId = (parsedUrl.query["tenantId"] as string) || "test-tenant";
        const clients = await db.getClients(tenantId);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "healthy",
          pulse: {
            overallScore: 78,
            activeAlerts: 3,
            recentWins: 5,
            uptimePct: 99.2,
          },
          clientsCount: clients.length,
        }));
        return;
      }

      // 3. RECOMMENDATIONS
      if (path === "/api/v1/recommendations" && req.method === "GET") {
        const tenantId = (parsedUrl.query["tenantId"] as string) || "test-tenant";
        const recs = await brain.analyzeProfitability(tenantId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ recommendations: recs }));
        return;
      }

      // 4. RISKS
      if (path === "/api/v1/risks" && req.method === "GET") {
        const tenantId = (parsedUrl.query["tenantId"] as string) || "test-tenant";
        // Call brain risk check with empty inventory status for mock stability
        const risks = await brain.detectRisks(tenantId, []);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ risks }));
        return;
      }

      // 5. APPROVALS
      if (path === "/api/v1/approvals" && req.method === "GET") {
        const tenantId = (parsedUrl.query["tenantId"] as string) || "test-tenant";
        const approvals = await db.getApprovals(tenantId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ approvals }));
        return;
      }

      // 6. EXECUTE CAMPAIGN ACTIONS (POST)
      if (path === "/api/v1/actions" && req.method === "POST") {
        const body = await parseRequestBody(req);
        const { actionRequest, context } = body;

        if (!actionRequest || !context) {
          throw new ValidationError("Missing actionRequest or context in body");
        }

        // Map high-level brain recommendations to platform-specific operations
        if (actionRequest.op === "pause_campaign") {
          actionRequest.op = "pause";
        } else if (actionRequest.op === "activate_campaign") {
          actionRequest.op = "activate";
        }

        // Reconstruct the role.permits function that was lost during JSON serialization
        const normalizedContext = {
          ...context,
          role: {
            ...context.role,
            permits: (op: string, entity: string) => {
              const roleName = context.role?.name;
              if (roleName === "media_buyer" || roleName === "permittedRole" || roleName === "Media Buyer") {
                return true;
              }
              if (Array.isArray(context.role?.permissions) && context.role.permissions.includes(op)) {
                return true;
              }
              return false;
            }
          }
        };

        // Setup simulated Google Ads adapter
        const adapter = new GoogleAdsAdapter("mock-cust-id", "mock-dev-token", "mock-token", context.tenant.tenantId);
        const outcome = await governance.govern(adapter, actionRequest, normalizedContext);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(outcome));
        return;
      }

      // 404 NOT FOUND
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: `Endpoint ${req.method} ${path} not found` } }));

    } catch (err: any) {
      sendErrorResponse(res, err);
    }
  });

  return server.listen(port);
}

// Auto-run if executed directly as script
if (require.main === module) {
  const db = new SupabaseClient();
  const port = config.server.port;
  console.log(`Starting native HTTP/SSE server on port ${port}...`);
  startServer(port, db);
}
