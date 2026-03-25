import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { registerCommandCenterRoutes } from "./routes-command-center";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startWorker, registerHandler } from "./services/JobQueueService";
import { runExtraction } from "./services/ContractExtractionService";
import { runNewsScan } from "./services/NewsService";
import { runDeliverableGen } from "./services/DeliverableService";
import { runSanctionsScan, computeHHI, screenSupplier } from "./services/SanctionsService";
import { runAlertScan, getAlerts, getAlertCounts } from "./services/AlertService";
import { runPortfolioSnapshot, getPortfolioSummary, ensurePortfolioSnapshotIndex } from "./services/PortfolioService";
import { refreshFxRates, analyzeExposure, ensureFxIndex } from "./services/FxService";
import { runTariffLookup } from "./services/TariffLookupService";
import { runCategoryBrief } from "./services/CategoryBriefService";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Register Command Center routes
  registerCommandCenterRoutes(app);

  // Start BullMQ worker (connects to Redis if available, falls back to inline)
  startWorker();

  // Register job handlers
  registerHandler("contract_extract", async (payload, progressCb) => {
    return runExtraction(payload as Parameters<typeof runExtraction>[0], progressCb);
  });

  registerHandler("news_scan", async (payload, progressCb) => {
    return runNewsScan(payload, progressCb);
  });

  registerHandler("deliverable_gen", async (payload, progressCb) => {
    return runDeliverableGen(payload as Record<string, unknown>, progressCb);
  });

  registerHandler("sanctions_scan", async (payload, progressCb) => {
    return runSanctionsScan(payload as Record<string, unknown>, progressCb);
  });

  registerHandler("alert_scan", async (payload, progressCb) => {
    return runAlertScan(payload as Record<string, unknown>, progressCb);
  });

  registerHandler("portfolio_snapshot", async (payload, progressCb) => {
    return runPortfolioSnapshot(payload as Record<string, unknown>, progressCb);
  });

  // Ensure unique index for portfolio snapshots
  ensurePortfolioSnapshotIndex();
  ensureFxIndex();

  registerHandler("tariff_lookup", async (payload, progressCb) => {
    return runTariffLookup(Number(payload.engagement_id), progressCb);
  });

  registerHandler("category_brief", async (payload, progressCb) => {
    return runCategoryBrief(payload as Record<string, unknown>, progressCb);
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
