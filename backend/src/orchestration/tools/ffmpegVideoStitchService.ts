import { writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type StitchVideosInput = {
  outputDir: string;
  segmentPaths: string[];
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

    try {
      await execFileAsync("ffmpeg", [
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
    } catch (error) {
      throw wrapFfmpegError(error);
    }

    return outputPath;
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
