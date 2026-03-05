import { Router } from "express";

import { AgentEnv } from "../agents/setup.js";
import type { YtCredentials } from "../services/keyConfig.js";

const setupRouter = Router();
const agentEnv = new AgentEnv();

setupRouter.post("/setcredentials", async (req, res) => {
  try {
    const { agent_url, agent_api, agent_model } = req.body as {
      agent_url?: string;
      agent_api?: string;
      agent_model?: string;
    };

    if (!agent_url || !agent_api || !agent_model) {
      res.status(400).json({
        error: "agent_url, agent_api, and agent_model are required",
      });
      return;
    }

    await agentEnv.setCedentaisl({
      agent_url,
      agent_api,
      agent_model,
    });

    res.status(200).json({
      message: "Credentials saved",
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to save credentials",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

setupRouter.get("/setytcredential", async (req, res) => {
  try {
    const clientId = process.env.YT_CLIENT_ID;
    const clientSecret = process.env.YT_CLIENT_SECRET;
    const redirectUri = process.env.YT_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      res.status(500).json({
        error: "Missing YT_CLIENT_ID, YT_CLIENT_SECRET, or YT_REDIRECT_URI",
      });
      return;
    }

    const code = typeof req.query.code === "string" ? req.query.code : undefined;

    // Step 1 of OAuth: redirect user to Google consent screen.
    if (!code) {
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.readonly");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("include_granted_scopes", "true");

      res.redirect(authUrl.toString());
      return;
    }

    // Step 2 of OAuth: exchange auth code for tokens.
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const tokenErrorText = await tokenResponse.text();
      res.status(502).json({
        error: "Failed to exchange OAuth code",
        details: tokenErrorText,
      });
      return;
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      token_type?: string;
      scope?: string;
      expires_in?: number;
    };

    if (!tokenData.access_token || !tokenData.refresh_token) {
      res.status(500).json({
        error: "OAuth token response missing access_token or refresh_token",
      });
      return;
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    const ytCredentials: YtCredentials = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type ?? "Bearer",
      expires_at: expiresAt,
    };

    if (tokenData.scope) {
      ytCredentials.scope = tokenData.scope;
    }

    await agentEnv.setytcredentials(ytCredentials);

    res.status(200).json({
      message: "YouTube OAuth credentials saved",
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to set YouTube credentials",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default setupRouter;
