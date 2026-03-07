import cron from "node-cron";
import { Logger } from "../utils/commonUtils.js";
import { workflowControlService } from "./workflowControlService.js";
import { pipelineRealtimeService } from "./pipelineRealtimeService.js";
import { GenreSelectionWorkflow } from "../orchestration/workflows/genreSelectionWorkflow.js";
import { ScriptGenerationWorkflow } from "../orchestration/workflows/scriptGenerationWorkflow.js";
import { CouncilReviewWorkflow } from "../orchestration/workflows/councilReviewWorkflow.js";
import { DirectorPlanWorkflow } from "../orchestration/workflows/directorPlanWorkflow.js";
import { VideoGenerationWorkflow } from "../orchestration/workflows/videoGenerationWorkflow.js";
import { YoutubePublishWorkflow } from "../orchestration/workflows/youtubePublishWorkflow.js";

const logger = new Logger("scheduler");

// Three daily upload slots (server local time).
// Adjust timezone via TZ env var on the server if needed.
//   Slot 1: 07:00 — morning commute
//   Slot 2: 12:00 — lunch break
//   Slot 3: 19:00 — peak evening
const SCHEDULE_SLOTS = [
  { cron: "0 7 * * *",  label: "morning (07:00)"  },
  { cron: "0 12 * * *", label: "lunch (12:00)"    },
  { cron: "0 19 * * *", label: "evening (19:00)"  },
];

const genreSelectionWorkflow  = new GenreSelectionWorkflow();
const scriptGenerationWorkflow = new ScriptGenerationWorkflow();
const councilReviewWorkflow    = new CouncilReviewWorkflow();
const directorPlanWorkflow     = new DirectorPlanWorkflow();
const videoGenerationWorkflow  = new VideoGenerationWorkflow();
const youtubePublishWorkflow   = new YoutubePublishWorkflow();

async function runScheduledPipeline(): Promise<void> {
  let runContext: { runId: string; signal: AbortSignal } | undefined;

  try {
    runContext = workflowControlService.startRun();
  } catch {
    logger.info("Scheduled run skipped — pipeline already running");
    return;
  }

  logger.info("Scheduled pipeline run started", { runId: runContext.runId });

  try {
    pipelineRealtimeService.beginStage("genre_selection", "genre selection started");
    const genreSelectionResult = await genreSelectionWorkflow.run({ userPreference: undefined });
    workflowControlService.ensureNotTerminated();
    pipelineRealtimeService.completeStage(
      "genre_selection",
      `genre selected: ${genreSelectionResult.selectedGenre.toLowerCase()}`,
    );

    pipelineRealtimeService.beginStage("script_generation", "script generation started");
    const scriptGenerationResult = await scriptGenerationWorkflow.run({
      genre: genreSelectionResult.selectedGenre,
      topic: genreSelectionResult.topic,
      title: genreSelectionResult.title,
    });
    workflowControlService.ensureNotTerminated();
    pipelineRealtimeService.completeStage("script_generation", "script generated");

    pipelineRealtimeService.beginStage("council_review", "council review started");
    const councilReviewResult = await councilReviewWorkflow.run({
      genre: genreSelectionResult.selectedGenre,
      topic: scriptGenerationResult.topic,
      title: scriptGenerationResult.title,
      description: scriptGenerationResult.description,
      story: scriptGenerationResult.story,
      summary: scriptGenerationResult.summary,
    });
    workflowControlService.ensureNotTerminated();
    pipelineRealtimeService.completeStage("council_review", "council review completed");

    pipelineRealtimeService.beginStage("director_plan", "director plan started");
    const directorPlanResult = await directorPlanWorkflow.run({
      genre: genreSelectionResult.selectedGenre,
      topic: councilReviewResult.scriptPackage.topic,
      title: councilReviewResult.scriptPackage.title,
      description: councilReviewResult.scriptPackage.description,
      story: councilReviewResult.scriptPackage.story,
      summary: councilReviewResult.scriptPackage.summary,
    });
    workflowControlService.ensureNotTerminated();
    pipelineRealtimeService.completeStage("director_plan", "director plan completed");

    pipelineRealtimeService.beginStage("video_generation", "video generation started");
    const videoGenerationResult = await videoGenerationWorkflow.run({
      genre: genreSelectionResult.selectedGenre,
      topic: councilReviewResult.scriptPackage.topic,
      title: councilReviewResult.scriptPackage.title,
      description: councilReviewResult.scriptPackage.description,
      story: councilReviewResult.scriptPackage.story,
      summary: councilReviewResult.scriptPackage.summary,
      breakdown: directorPlanResult.breakdown,
    });
    workflowControlService.ensureNotTerminated();
    pipelineRealtimeService.completeStage(
      "video_generation",
      `video generation completed: ${videoGenerationResult.segments.length} segments`,
    );

    pipelineRealtimeService.beginStage("youtube_publish", "youtube publish started");
    await youtubePublishWorkflow.run({
      genre: genreSelectionResult.selectedGenre,
      title: councilReviewResult.scriptPackage.title,
      description: councilReviewResult.scriptPackage.description,
      summary: councilReviewResult.scriptPackage.summary,
      stitchedVideoPath: videoGenerationResult.stitchedVideoPath,
      videoTempDir: videoGenerationResult.tempDir,
    });
    pipelineRealtimeService.completeStage("youtube_publish", "published to youtube");

    logger.info("Scheduled pipeline run completed successfully", { runId: runContext.runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Scheduled pipeline run failed", { runId: runContext.runId, error: message });
    pipelineRealtimeService.appendLog(`Scheduled run failed: ${message}`);
  } finally {
    await workflowControlService.finishRun(runContext.runId);
  }
}

export function startScheduler(): void {
  for (const slot of SCHEDULE_SLOTS) {
    cron.schedule(slot.cron, () => {
      logger.info(`Scheduler triggered: ${slot.label}`);
      void runScheduledPipeline();
    });
    logger.info(`Scheduled upload slot registered: ${slot.label}`);
  }
}
