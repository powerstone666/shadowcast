import express from "express";
import healthRouter from "./routes/health.js";
import setupRouter from "./routes/setup.js";
import youtubeOAuthRouter from "./routes/youtubeOAuth.js";
import youtubeOverviewRouter from "./routes/youtubeOverview.js";
import { PgDbService } from "./services/dbService.js";

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

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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
app.use("/youtube/oauth", youtubeOAuthRouter);
app.use("/youtube/overview", youtubeOverviewRouter);

async function startServer(): Promise<void> {
  await dbService.getPool();

  app.listen(port, () => {
    console.log(`server running at ${port}`);
  });
}

void startServer();
