import { rm } from "node:fs/promises";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import { ConflictError } from "../errors.js";
import { ContentMetadataService } from "../../services/contentMetadataService.js";
import {
  YoutubeOAuthService,
  type YoutubePublishResult,
} from "../../services/ytOAuthService.js";
import { Logger } from "../../utils/commonUtils.js";

export const youtubePublishInputSchema = z.object({
  genre: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  stitchedVideoPath: z.string().trim().min(1),
  videoTempDir: z.string().trim().min(1),
});

type YoutubePublishInput = z.infer<typeof youtubePublishInputSchema>;

export type YoutubePublishWorkflowResult = YoutubePublishResult & {
  contentSaved: true;
  cleanedUp: true;
};

const YoutubePublishState = Annotation.Root({
  genre: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  title: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  description: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  summary: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  stitchedVideoPath: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  videoTempDir: Annotation<string>({
    reducer: (_, right) => right,
    default: () => "",
  }),
  publishResult: Annotation<YoutubePublishResult | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
  result: Annotation<YoutubePublishWorkflowResult | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
});

type YoutubePublishStateType = typeof YoutubePublishState.State;

export class YoutubePublishWorkflow {
  private readonly graph;
  private readonly logger = new Logger("youtube-publish-workflow");

  constructor(
    private readonly youtubeOAuthService = new YoutubeOAuthService(),
    private readonly contentMetadataService = new ContentMetadataService(),
  ) {
    this.graph = this.buildGraph();
  }

  async run(input: YoutubePublishInput): Promise<YoutubePublishWorkflowResult> {
    const finalState = await this.graph.invoke({
      genre: input.genre.trim(),
      title: input.title.trim(),
      description: input.description.trim(),
      summary: input.summary.trim(),
      stitchedVideoPath: input.stitchedVideoPath.trim(),
      videoTempDir: input.videoTempDir.trim(),
    });

    if (!finalState.result) {
      throw new Error("YouTube publish workflow did not produce a result");
    }

    return finalState.result;
  }

  private buildGraph() {
    return new StateGraph(YoutubePublishState)
      .addNode("validateInput", async (state) => this.validateInput(state))
      .addNode("publishToYoutube", async (state) => this.publishToYoutube(state))
      .addNode("saveContent", async (state) => this.saveContent(state))
      .addNode("cleanupTempFiles", async (state) => this.cleanupTempFiles(state))
      .addNode("formatResult", async (state) => this.formatResult(state))
      .addEdge(START, "validateInput")
      .addEdge("validateInput", "publishToYoutube")
      .addEdge("publishToYoutube", "saveContent")
      .addEdge("saveContent", "cleanupTempFiles")
      .addEdge("cleanupTempFiles", "formatResult")
      .addEdge("formatResult", END)
      .compile();
  }

  private async validateInput(
    state: YoutubePublishStateType,
  ): Promise<Partial<YoutubePublishStateType>> {
    this.logger.info("Validating publish input", { title: state.title });
    if (!state.genre) {
      throw new ConflictError("Genre is required");
    }

    if (!state.title) {
      throw new ConflictError("Title is required");
    }

    if (!state.description) {
      throw new ConflictError("Description is required");
    }

    if (!state.summary) {
      throw new ConflictError("Summary is required");
    }

    if (!state.stitchedVideoPath) {
      throw new ConflictError("Stitched video path is required");
    }

    if (!state.videoTempDir) {
      throw new ConflictError("Video temp directory is required");
    }

    this.logger.info("Publish input validated successfully");
    return {};
  }

  private async publishToYoutube(
    state: YoutubePublishStateType,
  ): Promise<Partial<YoutubePublishStateType>> {
    this.logger.info("Publishing to YouTube", { videoPath: state.stitchedVideoPath });
    const upload = await this.youtubeOAuthService.uploadShort({
      videoPath: state.stitchedVideoPath,
      title: state.title,
      description: state.description,
    });
    this.logger.info("Video uploaded successfully", { videoId: upload.videoId });

    // YouTube Shorts do not support custom thumbnails via the API — skip silently.
    this.logger.info("Skipping thumbnail upload (not supported for YouTube Shorts)");

    return {
      publishResult: {
        ...upload,
        thumbnailUrl: "",
      },
    };
  }

  private async saveContent(
    state: YoutubePublishStateType,
  ): Promise<Partial<YoutubePublishStateType>> {
    if (!state.publishResult) {
      throw new Error("Cannot save content without publish result");
    }

    await this.contentMetadataService.savePublishedContent({
      title: state.title,
      summary: state.summary,
      genre: state.genre,
      youtubeVideoId: state.publishResult.videoId,
      viewCount: 0, // Initial view count, will be updated later
      publishedAt: state.publishResult.publishedAt,
    });

    return {};
  }

  private async cleanupTempFiles(
    state: YoutubePublishStateType,
  ): Promise<Partial<YoutubePublishStateType>> {
    this.logger.info("Cleaning up temporary files", { videoDir: state.videoTempDir });
    await rm(state.videoTempDir, { recursive: true, force: true });
    this.logger.info("Cleanup completed");

    return {};
  }

  private async formatResult(
    state: YoutubePublishStateType,
  ): Promise<Partial<YoutubePublishStateType>> {
    if (!state.publishResult) {
      throw new Error("YouTube publish result is missing");
    }

    return {
      result: {
        ...state.publishResult,
        contentSaved: true,
        cleanedUp: true,
      },
    };
  }
}
