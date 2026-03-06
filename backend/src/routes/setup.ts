import { Router } from "express";

import { AgentEnv } from "../agents/setup.js";

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

export default setupRouter;
