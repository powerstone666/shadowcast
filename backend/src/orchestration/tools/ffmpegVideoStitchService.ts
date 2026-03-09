import { writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

type StitchVideosInput = {
  outputDir: string;
  segmentPaths: string[];
  signal?: AbortSignal;
};

export class FfmpegVideoStitchService {
  async stitchVideos(input: StitchVideosInput): Promise<string> {
    if (input.segmentPaths.length === 0) {
      throw new Error("At least one video segment is required for stitching");
    }

    const concatListPath = path.join(input.outputDir, "concat-list.txt");
    const outputPath = path.join(input.outputDir, "final-video.mp4");

    await writeFile(
      concatListPath,
      input.segmentPaths.map((segmentPath) => `file '${escapeForConcatFile(segmentPath)}'`).join("\n"),
      "utf-8",
    );

    return new Promise<string>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-c",
        "copy",
        outputPath,
      ]);

      let stderr = "";
      
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          const error = new Error(`ffmpeg failed with code ${code}: ${stderr}`);
          reject(wrapFfmpegError(error));
        }
      });

      ffmpeg.on("error", (err) => {
        reject(wrapFfmpegError(err));
      });

      // Handle abort signal
      if (input.signal) {
        if (input.signal.aborted) {
          ffmpeg.kill("SIGTERM");
          reject(new Error("FFmpeg stitching aborted"));
          return;
        }
        
        const abortHandler = () => {
          ffmpeg.kill("SIGTERM");
          reject(new Error("FFmpeg stitching aborted"));
        };
        input.signal.addEventListener("abort", abortHandler);
        
        // Clean up listener on completion
        ffmpeg.on("close", () => {
          input.signal?.removeEventListener("abort", abortHandler);
        });
        ffmpeg.on("error", () => {
          input.signal?.removeEventListener("abort", abortHandler);
        });
      }
    });
  }
}

function escapeForConcatFile(value: string): string {
  return value.replace(/'/g, "'\\''");
}

function wrapFfmpegError(error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message.includes("ENOENT")
      ? "ffmpeg is not installed or not available on PATH"
      : `ffmpeg failed to stitch video segments: ${error.message}`;
    return new Error(message);
  }

  return new Error("ffmpeg failed to stitch video segments");
}