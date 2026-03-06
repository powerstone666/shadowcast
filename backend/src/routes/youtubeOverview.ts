import { Router } from "express";

import { YoutubeOAuthService } from "../services/ytOAuthService.js";

const youtubeOverviewRouter = Router();
const youtubeOAuthService = new YoutubeOAuthService();

youtubeOverviewRouter.get("/", async (_req, res) => {
  try {
    const overview = await youtubeOAuthService.getOverview();
    res.status(200).json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load YouTube overview";
    const statusCode = message === "YouTube OAuth connection not found" ? 400 : 500;

    res.status(statusCode).json({
      connected: false,
      error: message,
    });
  }
});

export default youtubeOverviewRouter;

