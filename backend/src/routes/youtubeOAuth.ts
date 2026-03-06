import { Router } from "express";

import { YoutubeOAuthService } from "../services/ytOAuthService.js";

const OAUTH_STATE_COOKIE = "yt_oauth_state";
const STATE_TTL_SECONDS = 10 * 60;

const youtubeOAuthRouter = Router();
const youtubeOAuthService = new YoutubeOAuthService();

youtubeOAuthRouter.get("/start", (_req, res) => {
  try {
    const state = youtubeOAuthService.generateState();
    const authUrl = youtubeOAuthService.buildAuthorizationUrl(state);

    res.setHeader(
      "Set-Cookie",
      `${OAUTH_STATE_COOKIE}=${state}; Max-Age=${STATE_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax`,
    );
    res.redirect(authUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start YouTube OAuth";
    res.redirect(
      youtubeOAuthService.buildFrontendRedirect({
        section: "api-configuration",
        yt_oauth: "error",
        message,
      }),
    );
  }
});

youtubeOAuthRouter.get("/callback", async (req, res) => {
  const clearStateCookie = `${OAUTH_STATE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;

  try {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const error = typeof req.query.error === "string" ? req.query.error : undefined;
    const cookieState = readCookie(req.headers.cookie, OAUTH_STATE_COOKIE);

    if (!state || !cookieState || state !== cookieState) {
      res.setHeader("Set-Cookie", clearStateCookie);
      res.redirect(
        youtubeOAuthService.buildFrontendRedirect({
          section: "api-configuration",
          yt_oauth: "error",
          message: "OAuth state validation failed",
        }),
      );
      return;
    }

    if (error) {
      res.setHeader("Set-Cookie", clearStateCookie);
      res.redirect(
        youtubeOAuthService.buildFrontendRedirect({
          section: "api-configuration",
          yt_oauth: "error",
          message: error,
        }),
      );
      return;
    }

    if (!code) {
      res.setHeader("Set-Cookie", clearStateCookie);
      res.redirect(
        youtubeOAuthService.buildFrontendRedirect({
          section: "api-configuration",
          yt_oauth: "error",
          message: "Missing OAuth code",
        }),
      );
      return;
    }

    await youtubeOAuthService.exchangeCode(code);

    res.setHeader("Set-Cookie", clearStateCookie);
    res.redirect(
      youtubeOAuthService.buildFrontendRedirect({
          section: "api-configuration",
        yt_oauth: "success",
      }),
    );
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Failed to complete YouTube OAuth";

    res.setHeader("Set-Cookie", clearStateCookie);
    res.redirect(
      youtubeOAuthService.buildFrontendRedirect({
        section: "api-configuration",
        yt_oauth: "error",
        message,
      }),
    );
  }
});

youtubeOAuthRouter.get("/status", async (_req, res) => {
  try {
    const status = await youtubeOAuthService.getStatus();
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({
      connected: false,
      error: error instanceof Error ? error.message : "Failed to load YouTube OAuth status",
    });
  }
});

youtubeOAuthRouter.post("/refresh", async (_req, res) => {
  try {
    const status = await youtubeOAuthService.refreshConnection();
    res.status(200).json(status);
  } catch (error) {
    res.status(400).json({
      connected: false,
      error: error instanceof Error ? error.message : "Failed to refresh YouTube OAuth connection",
    });
  }
});

youtubeOAuthRouter.post("/disconnect", async (_req, res) => {
  try {
    await youtubeOAuthService.disconnect();
    res.status(200).json({
      connected: false,
    });
  } catch (error) {
    res.status(500).json({
      connected: false,
      error: error instanceof Error ? error.message : "Failed to disconnect YouTube OAuth",
    });
  }
});

function readCookie(cookieHeader: string | undefined, cookieName: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${cookieName}=`));
  return match ? decodeURIComponent(match.slice(cookieName.length + 1)) : undefined;
}

export default youtubeOAuthRouter;
