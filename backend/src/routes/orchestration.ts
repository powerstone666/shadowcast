import { Router } from "express";
import { z } from "zod";

import { isConflictError, isWorkflowTerminatedError } from "../orchestration/errors.js";
import { pipelineRealtimeService } from "../services/pipelineRealtimeService.js";
import { workflowCacheService } from "../services/workflowCacheService.js";
import { workflowControlService } from "../services/workflowControlService.js";
import {
  CouncilReviewWorkflow,
  councilReviewInputSchema,
} from "../orchestration/workflows/councilReviewWorkflow.js";
import {
  DirectorPlanWorkflow,
  directorPlanInputSchema,
} from "../orchestration/workflows/directorPlanWorkflow.js";
import { GenreSelectionWorkflow } from "../orchestration/workflows/genreSelectionWorkflow.js";
import { ScriptGenerationWorkflow } from "../orchestration/workflows/scriptGenerationWorkflow.js";
import {
  ThumbnailGenerationWorkflow,
  thumbnailGenerationInputSchema,
} from "../orchestration/workflows/thumbnailGenerationWorkflow.js";
import {
  YoutubePublishWorkflow,
  youtubePublishInputSchema,
} from "../orchestration/workflows/youtubePublishWorkflow.js";
import {
  VideoGenerationWorkflow,
  videoGenerationInputSchema,
} from "../orchestration/workflows/videoGenerationWorkflow.js";

const orchestrationRouter = Router();
const councilReviewWorkflow = new CouncilReviewWorkflow();
const directorPlanWorkflow = new DirectorPlanWorkflow();
const genreSelectionWorkflow = new GenreSelectionWorkflow();
const scriptGenerationWorkflow = new ScriptGenerationWorkflow();
const thumbnailGenerationWorkflow = new ThumbnailGenerationWorkflow();
const videoGenerationWorkflow = new VideoGenerationWorkflow();
const youtubePublishWorkflow = new YoutubePublishWorkflow();
const genreSelectionRequestSchema = z.object({
  userPreference: z.string().trim().min(1).optional(),
});
const runWorkflowRequestSchema = z.object({
  userPreference: z.string().trim().min(1).optional(),
});
const scriptGenerationRequestSchema = z.object({
  genre: z.string().trim().min(1),
  topic: z.string().trim().min(1),
  title: z.string().trim().min(1),
  userPreference: z.string().trim().min(1).optional(),
});

orchestrationRouter.post("/run-workflow", async (req, res) => {
  let runContext:
    | {
        runId: string;
        signal: AbortSignal;
      }
    | undefined;

  try {
    const parsedRequest = runWorkflowRequestSchema.safeParse(req.body ?? {});
    if (!parsedRequest.success) {
      res.status(400).json({
        error: "Invalid run-workflow payload",
        details: parsedRequest.error.flatten(),
      });
      return;
    }

    runContext = workflowControlService.startRun();
    pipelineRealtimeService.beginStage("genre_selection", "genre selection started");
    const genreSelectionResult = await genreSelectionWorkflow.run({
      userPreference: parsedRequest.data.userPreference,
    });
    workflowControlService.ensureNotTerminated();
    pipelineRealtimeService.appendLog(
      `genre rationale: ${summarizeText(genreSelectionResult.reason, 180)}`,
    );
    pipelineRealtimeService.appendLog(
      `topic selected: ${summarizeText(genreSelectionResult.topic, 140)}`,
    );
    pipelineRealtimeService.appendLog(
      `working title: ${summarizeText(genreSelectionResult.title, 140)}`,
    );
    if (genreSelectionResult.searchHighlights.length > 0) {
      pipelineRealtimeService.appendLog(
        `genre highlights: ${formatGenreHighlights(genreSelectionResult.searchHighlights)}`,
      );
    }
    pipelineRealtimeService.completeStage(
      "genre_selection",
      `genre selected: ${genreSelectionResult.selectedGenre.toLowerCase()}`,
    );

    pipelineRealtimeService.beginStage("script_generation", "script generation started");
    const scriptGenerationResult = await scriptGenerationWorkflow.run({
      genre: genreSelectionResult.selectedGenre,
      topic: genreSelectionResult.topic,
      title: genreSelectionResult.title,
      userPreference: parsedRequest.data.userPreference,
    });
    workflowControlService.ensureNotTerminated();
    pipelineRealtimeService.appendLog(`topic chosen: ${scriptGenerationResult.topic.toLowerCase()}`);
    pipelineRealtimeService.appendLog(
      `script title: ${summarizeText(scriptGenerationResult.title, 140)}`,
    );
    pipelineRealtimeService.appendLog(
      `script summary: ${summarizeText(scriptGenerationResult.summary, 180)}`,
    );
    pipelineRealtimeService.completeStage("script_generation", "script generated");

    pipelineRealtimeService.beginStage("council_review", "council review started");
    const councilReviewResult = await councilReviewWorkflow.run({
      genre: genreSelectionResult.selectedGenre,
      ...scriptGenerationResult,
    });
    workflowControlService.ensureNotTerminated();
    pipelineRealtimeService.appendLog(
      `council reviews: ${formatCouncilReviews(councilReviewResult.reviews)}`,
    );
    pipelineRealtimeService.completeStage(
      "council_review",
      `council score: ${councilReviewResult.averageScore}`,
    );
    if (councilReviewResult.revised) {
      pipelineRealtimeService.appendLog("script revised after council feedback");
    }

    pipelineRealtimeService.beginStage("director_plan", "director plan started");
    const directorPlanResult = await directorPlanWorkflow.run({
      genre: genreSelectionResult.selectedGenre,
      ...councilReviewResult.scriptPackage,
    });
    workflowControlService.ensureNotTerminated();
    pipelineRealtimeService.appendLog(
      `director breakdown: ${formatDirectorBreakdown(directorPlanResult.breakdown)}`,
    );
    pipelineRealtimeService.completeStage(
      "director_plan",
      `segment planning done: ${directorPlanResult.breakdown.length} segments`,
    );

    pipelineRealtimeService.beginStage("video_generation", "video generation started");
    const videoGenerationResult = await videoGenerationWorkflow.run({
      genre: genreSelectionResult.selectedGenre,
      ...councilReviewResult.scriptPackage,
      breakdown: directorPlanResult.breakdown,
    });
    workflowControlService.ensureNotTerminated();
    pipelineRealtimeService.appendLog(
      `video output: ${videoGenerationResult.stitchedVideoPath}`,
    );
    pipelineRealtimeService.completeStage(
      "video_generation",
      `video generation completed: ${videoGenerationResult.segments.length} segments`,
    );

    pipelineRealtimeService.beginStage("youtube_publish", "youtube publish started");
    const youtubePublishResult = await youtubePublishWorkflow.run({
      genre: genreSelectionResult.selectedGenre,
      title: councilReviewResult.scriptPackage.title,
      description: councilReviewResult.scriptPackage.description,
      summary: councilReviewResult.scriptPackage.summary,
      stitchedVideoPath: videoGenerationResult.stitchedVideoPath,
      videoTempDir: videoGenerationResult.tempDir,
    });
    workflowControlService.ensureNotTerminated();
    pipelineRealtimeService.completeStage(
      "youtube_publish",
      `upload completed: ${youtubePublishResult.videoId}`,
    );
    pipelineRealtimeService.appendLog(`youtube url: ${youtubePublishResult.videoUrl}`);
    await workflowCacheService.cleanCache();
    pipelineRealtimeService.appendLog("temporary artifacts cleaned up");

    res.status(200).json({
      genreSelection: genreSelectionResult,
      scriptGeneration: scriptGenerationResult,
      councilReview: councilReviewResult,
      directorPlan: directorPlanResult,
      videoGeneration: videoGenerationResult,
      youtubePublish: youtubePublishResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const activeStageKey = pipelineRealtimeService.getSnapshot().activeStageKey;

    if (isWorkflowTerminatedError(error)) {
      pipelineRealtimeService.terminateRun(message);
      res.status(409).json({
        error: message,
      });
      return;
    }

    if (activeStageKey) {
      pipelineRealtimeService.failStage(activeStageKey, message);
    }

    if (isConflictError(error)) {
      res.status(409).json({
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      error: message,
    });
  } finally {
    if (runContext) {
      await workflowControlService.finishRun(runContext.runId);
    }
  }
});

function summarizeText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function formatGenreHighlights(
  highlights: Array<{
    genre: string;
    headlines: string[];
  }>,
): string {
  return highlights
    .slice(0, 3)
    .map((item) => {
      const topHeadlines = item.headlines.slice(0, 2).map((headline) => summarizeText(headline, 60));
      return `${item.genre}: ${topHeadlines.join(" | ")}`;
    })
    .join(" || ");
}

function formatCouncilReviews(
  reviews: Array<{
    reviewer: string;
    score: number;
    reason: string;
  }>,
): string {
  return reviews
    .map(
      (review) =>
        `${review.reviewer} ${review.score}/10 - ${summarizeText(review.reason, 90)}`,
    )
    .join(" || ");
}

function formatDirectorBreakdown(
  breakdown: Array<{
    order: number;
    durationSec: number;
    beat: string;
  }>,
): string {
  return breakdown
    .map((segment) => `#${segment.order} ${segment.beat} (${segment.durationSec}s)`)
    .join(" | ");
}

orchestrationRouter.post("/terminate-workflow", async (_req, res) => {
  const terminationResult = await workflowControlService.terminateCurrentRun();

  if (!terminationResult.terminated) {
    res.status(409).json({
      error: "No workflow is currently running",
    });
    return;
  }

  pipelineRealtimeService.terminateRun("workflow termination requested");
  pipelineRealtimeService.appendLog(
    terminationResult.cleanedTempDirs > 0
      ? `cleanup completed: removed ${terminationResult.cleanedTempDirs} temp director${terminationResult.cleanedTempDirs === 1 ? "y" : "ies"}`
      : "cleanup completed: no temp artifacts were present",
  );
  res.status(200).json({
    terminated: true,
  });
});

orchestrationRouter.post("/genre-selection", async (req, res) => {
  try {
    const parsedRequest = genreSelectionRequestSchema.safeParse(req.body ?? {});
    if (!parsedRequest.success) {
      res.status(400).json({
        error: "Invalid genre-selection payload",
        details: parsedRequest.error.flatten(),
      });
      return;
    }

    pipelineRealtimeService.beginStage("genre_selection", "genre selection started");
    const result = await genreSelectionWorkflow.run({
      userPreference: parsedRequest.data.userPreference,
    });
    pipelineRealtimeService.completeStage(
      "genre_selection",
      `genre selected: ${result.selectedGenre.toLowerCase()}`,
    );

    res.status(200).json(result);
  } catch (error) {
    pipelineRealtimeService.failStage(
      "genre_selection",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (isConflictError(error)) {
      res.status(409).json({
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to run genre selection",
    });
  }
});

orchestrationRouter.post("/script-generation", async (req, res) => {
  try {
    const parsedRequest = scriptGenerationRequestSchema.safeParse(req.body ?? {});
    if (!parsedRequest.success) {
      res.status(400).json({
        error: "Invalid script-generation payload",
        details: parsedRequest.error.flatten(),
      });
      return;
    }

    pipelineRealtimeService.beginStage("script_generation", "script generation started");
    const result = await scriptGenerationWorkflow.run({
      genre: parsedRequest.data.genre,
      topic: parsedRequest.data.topic,
      title: parsedRequest.data.title,
      userPreference: parsedRequest.data.userPreference,
    });
    pipelineRealtimeService.appendLog(`topic chosen: ${result.topic.toLowerCase()}`);
    pipelineRealtimeService.completeStage("script_generation", "script generated");

    res.status(200).json(result);
  } catch (error) {
    pipelineRealtimeService.failStage(
      "script_generation",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (isConflictError(error)) {
      res.status(409).json({
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to run script generation",
    });
  }
});

orchestrationRouter.post("/council-review", async (req, res) => {
  try {
    const parsedRequest = councilReviewInputSchema.safeParse(req.body ?? {});
    if (!parsedRequest.success) {
      res.status(400).json({
        error: "Invalid council-review payload",
        details: parsedRequest.error.flatten(),
      });
      return;
    }

    pipelineRealtimeService.beginStage("council_review", "council review started");
    const result = await councilReviewWorkflow.run(parsedRequest.data);
    pipelineRealtimeService.completeStage(
      "council_review",
      `council score: ${result.averageScore}`,
    );
    if (result.revised) {
      pipelineRealtimeService.appendLog("script revised after council feedback");
    }

    res.status(200).json(result);
  } catch (error) {
    pipelineRealtimeService.failStage(
      "council_review",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (isConflictError(error)) {
      res.status(409).json({
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to run council review",
    });
  }
});

orchestrationRouter.post("/director-plan", async (req, res) => {
  try {
    const parsedRequest = directorPlanInputSchema.safeParse(req.body ?? {});
    if (!parsedRequest.success) {
      res.status(400).json({
        error: "Invalid director-plan payload",
        details: parsedRequest.error.flatten(),
      });
      return;
    }

    pipelineRealtimeService.beginStage("director_plan", "director plan started");
    const result = await directorPlanWorkflow.run(parsedRequest.data);
    pipelineRealtimeService.completeStage(
      "director_plan",
      `segment planning done: ${result.breakdown.length} segments`,
    );

    res.status(200).json(result);
  } catch (error) {
    pipelineRealtimeService.failStage(
      "director_plan",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (isConflictError(error)) {
      res.status(409).json({
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to run director plan",
    });
  }
});

orchestrationRouter.post("/video-generation", async (req, res) => {
  try {
    const parsedRequest = videoGenerationInputSchema.safeParse(req.body ?? {});
    if (!parsedRequest.success) {
      res.status(400).json({
        error: "Invalid video-generation payload",
        details: parsedRequest.error.flatten(),
      });
      return;
    }

    pipelineRealtimeService.beginStage("video_generation", "video generation started");
    const result = await videoGenerationWorkflow.run(parsedRequest.data);
    pipelineRealtimeService.completeStage(
      "video_generation",
      `video generation completed: ${result.segments.length} segments`,
    );

    res.status(200).json(result);
  } catch (error) {
    pipelineRealtimeService.failStage(
      "video_generation",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (isConflictError(error)) {
      res.status(409).json({
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to run video generation",
    });
  }
});

orchestrationRouter.post("/thumbnail-generation", async (req, res) => {
  try {
    const parsedRequest = thumbnailGenerationInputSchema.safeParse(req.body ?? {});
    if (!parsedRequest.success) {
      res.status(400).json({
        error: "Invalid thumbnail-generation payload",
        details: parsedRequest.error.flatten(),
      });
      return;
    }

    pipelineRealtimeService.beginStage("thumbnail_generation", "thumbnail generation started");
    const result = await thumbnailGenerationWorkflow.run(parsedRequest.data);
    pipelineRealtimeService.completeStage("thumbnail_generation", "thumbnail generated");

    res.status(200).json(result);
  } catch (error) {
    pipelineRealtimeService.failStage(
      "thumbnail_generation",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (isConflictError(error)) {
      res.status(409).json({
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to run thumbnail generation",
    });
  }
});

orchestrationRouter.post("/youtube-publish", async (req, res) => {
  try {
    const parsedRequest = youtubePublishInputSchema.safeParse(req.body ?? {});
    if (!parsedRequest.success) {
      res.status(400).json({
        error: "Invalid youtube-publish payload",
        details: parsedRequest.error.flatten(),
      });
      return;
    }

    pipelineRealtimeService.beginStage("youtube_publish", "youtube publish started");
    const result = await youtubePublishWorkflow.run(parsedRequest.data);
    pipelineRealtimeService.completeStage("youtube_publish", `upload completed: ${result.videoId}`);
    pipelineRealtimeService.appendLog("temporary artifacts cleaned up");

    res.status(200).json(result);
  } catch (error) {
    pipelineRealtimeService.failStage(
      "youtube_publish",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (isConflictError(error)) {
      res.status(409).json({
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to publish YouTube Short",
    });
  }
});

orchestrationRouter.all(/.*/, (_req, res) => {
  res.status(501).json({
    error: "Orchestration is not implemented",
  });
});

export default orchestrationRouter;
