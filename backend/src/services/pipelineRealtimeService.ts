import type { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import {
  TestConnectService,
  type ConnectionTestMode,
  type ConnectionTestRoleKey,
} from "./testconnect.js";

export const PIPELINE_STAGES = [
  { key: "genre_selection", label: "Genre Selection" },
  { key: "script_generation", label: "Script Generation" },
  { key: "council_review", label: "Council Review" },
  { key: "director_plan", label: "Director Plan" },
  { key: "cameraman_plan", label: "Cameraman Plan" },
  { key: "video_generation", label: "Video Generation" },
  { key: "youtube_publish", label: "YouTube Publish" },
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]["key"];

export type PipelineLogEntry = {
  id: string;
  timestamp: string;
  message: string;
};

export type PipelineRealtimeSnapshot = {
  started: boolean;
  isRunning: boolean;
  runOutcome: "completed" | "failed" | "terminated" | null;
  activeStageKey: PipelineStageKey | null;
  completedStageKeys: PipelineStageKey[];
  lastCompletedStageKey: PipelineStageKey | null;
  logs: PipelineLogEntry[];
};

type PipelineEvent =
  | { type: "snapshot"; payload: PipelineRealtimeSnapshot }
  | { type: "pong"; payload: { timestamp: string } };

const MAX_LOGS = 200;
const FIRST_STAGE_KEY: PipelineStageKey = PIPELINE_STAGES[0].key;
const LAST_STAGE_KEY: PipelineStageKey = getLastStageKey();

export class PipelineRealtimeService {
  private wss: WebSocketServer | null = null;
  private readonly testConnectService = new TestConnectService((message) => {
    this.appendLog(message);
  });
  private snapshot: PipelineRealtimeSnapshot = {
    started: false,
    isRunning: false,
    runOutcome: null,
    activeStageKey: null,
    completedStageKeys: [],
    lastCompletedStageKey: null,
    logs: [],
  };

  attach(server: HttpServer): void {
    if (this.wss) {
      return;
    }

    this.wss = new WebSocketServer({
      server,
      path: "/ws/pipeline",
    });

    this.wss.on("connection", (socket: WebSocket) => {
      this.send(socket, {
        type: "snapshot",
        payload: this.snapshot,
      });

      socket.on("message", (rawMessage: Buffer) => {
        this.handleMessage(socket, rawMessage.toString());
      });
    });
  }

  beginStage(stageKey: PipelineStageKey, message?: string): void {
    if (!this.snapshot.started || stageKey === FIRST_STAGE_KEY) {
      this.snapshot = {
        started: true,
        isRunning: true,
        runOutcome: null,
        activeStageKey: stageKey,
        completedStageKeys: [],
        lastCompletedStageKey: null,
        logs: [],
      };

      this.appendLog("pipeline started");
    } else {
      this.snapshot = {
        ...this.snapshot,
        started: true,
        isRunning: true,
        runOutcome: null,
        activeStageKey: stageKey,
      };
    }

    this.appendLog(message ?? `${formatStageLabel(stageKey)} started`);
  }

  completeStage(stageKey: PipelineStageKey, message?: string): void {
    const completedStageKeys = Array.from(
      new Set([...this.snapshot.completedStageKeys, stageKey]),
    ) as PipelineStageKey[];

    this.snapshot = {
      ...this.snapshot,
      isRunning: false,
      runOutcome: stageKey === LAST_STAGE_KEY ? "completed" : null,
      activeStageKey: null,
      completedStageKeys,
      lastCompletedStageKey: stageKey,
    };

    this.appendLog(message ?? `${formatStageLabel(stageKey)} completed`);
  }

  failStage(stageKey: PipelineStageKey, message: string): void {
    this.snapshot = {
      ...this.snapshot,
      isRunning: false,
      runOutcome: "failed",
      activeStageKey: null,
    };

    this.appendLog(`${formatStageLabel(stageKey)} failed: ${message}`);
  }

  terminateRun(message: string): void {
    // Idempotent — the terminate route and the in-flight request's catch block
    // both call this; whichever arrives second must not reset the snapshot again.
    if (this.snapshot.runOutcome === "terminated") {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      started: false,
      isRunning: false,
      runOutcome: "terminated",
      activeStageKey: null,
      completedStageKeys: [],
      lastCompletedStageKey: null,
    };

    this.appendLog(message);
  }

  appendLog(message: string): void {
    this.snapshot = {
      ...this.snapshot,
      logs: [
        ...this.snapshot.logs,
        {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          message,
        },
      ].slice(-MAX_LOGS),
    };
    this.broadcastSnapshot();
  }

  getSnapshot(): PipelineRealtimeSnapshot {
    return this.snapshot;
  }

  private handleMessage(socket: WebSocket, message: string): void {
    try {
      const payload = JSON.parse(message) as {
        type?: string;
        mode?: ConnectionTestMode;
        roleKey?: ConnectionTestRoleKey;
      };
      if (payload.type === "ping") {
        this.send(socket, {
          type: "pong",
          payload: {
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      if (payload.type === "test_connection") {
        void this.testConnectService.runAllChecks(
          payload.mode,
          payload.roleKey,
        );
      }
    } catch {
      // ignore malformed client messages
    }
  }

  private broadcastSnapshot(): void {
    if (!this.wss) {
      return;
    }

    const event: PipelineEvent = {
      type: "snapshot",
      payload: this.snapshot,
    };

    for (const client of this.wss.clients) {
      if (client.readyState === client.OPEN) {
        this.send(client, event);
      }
    }
  }

  private send(socket: WebSocket, event: PipelineEvent): void {
    socket.send(JSON.stringify(event));
  }
}

function formatStageLabel(stageKey: PipelineStageKey): string {
  return (
    PIPELINE_STAGES.find((stage) => stage.key === stageKey)?.label ?? stageKey
  );
}

export const pipelineRealtimeService = new PipelineRealtimeService();

function getLastStageKey(): PipelineStageKey {
  const lastStage = PIPELINE_STAGES[PIPELINE_STAGES.length - 1];
  if (!lastStage) {
    throw new Error("PIPELINE_STAGES must contain at least one stage");
  }

  return lastStage.key;
}
