import { Router } from "express";
import { z } from "zod";

import { AgentConfigService } from "../services/agentConfigService.js";
import { GenreConfigService } from "../services/genreConfigService.js";
import { UserPreferencesService } from "../services/userPreferencesService.js";

const setupRouter = Router();
const agentConfigService = new AgentConfigService();
const genreConfigService = new GenreConfigService();
const userPreferencesService = new UserPreferencesService();
const agentConfigPayloadSchema = z.object({
  apiUrl: z.string().min(1),
  apiKey: z.string().min(1),
  modelName: z.string().min(1),
});
const genrePoolPayloadSchema = z.object({
  selectedGenres: z.array(z.string().min(1)),
});

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

    await agentConfigService.upsertConfig({
      roleKey: "selector",
      apiUrl: agent_url,
      apiKey: agent_api,
      modelName: agent_model,
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

setupRouter.get("/agent-configs", async (_req, res) => {
  try {
    const configs = await agentConfigService.listConfigs();
    res.status(200).json({
      configs,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load agent configs",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

setupRouter.put("/agent-configs/:roleKey", async (req, res) => {
  try {
    const roleKey = req.params.roleKey;
    const parsedPayload = agentConfigPayloadSchema.safeParse(req.body);

    if (!roleKey) {
      res.status(400).json({
        error: "roleKey is required",
      });
      return;
    }

    if (!parsedPayload.success) {
      res.status(400).json({
        error: "apiUrl, apiKey, and modelName are required",
        details: parsedPayload.error.flatten(),
      });
      return;
    }

    const config = await agentConfigService.upsertConfig({
      roleKey,
      ...parsedPayload.data,
    });

    res.status(200).json({
      config,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to save agent config",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

setupRouter.get("/genres", async (_req, res) => {
  try {
    const genrePool = await genreConfigService.getGenrePool();
    res.status(200).json(genrePool);
  } catch (error) {
    res.status(500).json({
      error: "Failed to load genre pool",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

setupRouter.put("/genres", async (req, res) => {
  try {
    const parsedPayload = genrePoolPayloadSchema.safeParse(req.body);

    if (!parsedPayload.success) {
      res.status(400).json({
        error: "selectedGenres is required",
        details: parsedPayload.error.flatten(),
      });
      return;
    }

    const genrePool = await genreConfigService.saveGenrePool(parsedPayload.data);
    res.status(200).json(genrePool);
  } catch (error) {
    res.status(500).json({
      error: "Failed to save genre pool",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Audio language preferences routes
setupRouter.get("/audio-language", async (_req, res) => {
  try {
    const languagePref = await userPreferencesService.getAudioLanguage();
    res.status(200).json(languagePref);
  } catch (error) {
    res.status(500).json({
      error: "Failed to load audio language preference",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

setupRouter.put("/audio-language", async (req, res) => {
  try {
    const { language } = req.body as { language?: string };

    if (!language || !["english", "hindi"].includes(language)) {
      res.status(400).json({
        error: "Language must be either 'english' or 'hindi'",
      });
      return;
    }

    const languagePref = await userPreferencesService.saveAudioLanguage(language as "english" | "hindi");
    res.status(200).json(languagePref);
  } catch (error) {
    res.status(500).json({
      error: "Failed to save audio language preference",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default setupRouter;
