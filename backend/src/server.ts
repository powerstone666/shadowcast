import http from "node:http";
import express from "express";
import healthRouter from "./routes/health.js";
import setupRouter from "./routes/setup.js";
import orchestrationRouter from "./routes/orchestration.js";
import youtubeOAuthRouter from "./routes/youtubeOAuth.js";
import youtubeOverviewRouter from "./routes/youtubeOverview.js";
import { PgDbService } from "./services/dbService.js";
import { pipelineRealtimeService } from "./services/pipelineRealtimeService.js";
import { startScheduler } from "./services/schedulerService.js";

const app = express();
const dbService = new PgDbService();
const port = 3000;

app.use((req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL;
  const origin = req.headers.origin;

  if (frontendUrl && origin === frontendUrl) {
    res.setHeader("Access-Control-Allow-Origin", frontendUrl);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());
app.use("/health", healthRouter);
app.use("/setup", setupRouter);
app.use("/orchestration", orchestrationRouter);
app.use("/youtube/oauth", youtubeOAuthRouter);
app.use("/youtube/overview", youtubeOverviewRouter);

async function startServer(): Promise<void> {
  await dbService.getPool();
  const server = http.createServer(app);
  pipelineRealtimeService.attach(server);

  server.listen(port, () => {
    console.log(`server running at ${port}`);
  });

  startScheduler();
}

void startServer();
