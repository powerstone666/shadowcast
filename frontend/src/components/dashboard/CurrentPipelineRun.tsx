import { useState } from "react";
import { createPortal } from "react-dom";
import { pipelineStages } from "../../data";
import type { PipelineRealtimeSnapshot } from "../../types";
import { sectionTitleClass, surfaceClass } from "../../ui";

function CurrentPipelineRun({
  pipelineState,
  isStartingWorkflow,
  isTerminatingWorkflow,
  onRunWorkflow,
  onTerminateWorkflow,
}: {
  pipelineState: PipelineRealtimeSnapshot;
  isStartingWorkflow: boolean;
  isTerminatingWorkflow: boolean;
  onRunWorkflow: (note?: string) => void;
  onTerminateWorkflow: () => void;
}) {
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [note, setNote] = useState("");

  const completedStageKeys = new Set(pipelineState.completedStageKeys);
  const activeStageIndex = pipelineStages.findIndex(
    (stage) => stage.key === pipelineState.activeStageKey,
  );
  const activeStage =
    activeStageIndex >= 0 ? pipelineStages[activeStageIndex] : null;
  const completedCount = pipelineStages.filter((stage) =>
    completedStageKeys.has(stage.key),
  ).length;
  const progressCount =
    completedCount + (pipelineState.isRunning && activeStage ? 1 : 0);
  const progressWidth = `${(progressCount / pipelineStages.length) * 100}%`;
  const canRunWorkflow = !pipelineState.isRunning && !isStartingWorkflow;
  const canTerminateWorkflow =
    pipelineState.isRunning && !isTerminatingWorkflow;
  const statusLabel =
    pipelineState.isRunning && activeStage
      ? activeStage.label
      : pipelineState.runOutcome === "failed"
        ? "Workflow failed"
        : pipelineState.runOutcome === "terminated"
          ? "Workflow terminated"
          : pipelineState.runOutcome === "completed"
            ? "Workflow completed"
            : pipelineState.started
              ? "Waiting for next stage"
              : "Not started";

  return (
    <article className={`${surfaceClass} px-8 py-7`}>
      {isNoteModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/5 p-4 animate-in fade-in duration-200">
            <div className="w-120 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-4xl bg-white border border-[#f0e9df] transform transition-all animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-bold text-[#3b2d21] mb-2">
                Workflow Note
              </h3>
              <p className="text-[13px] text-[#7a7167] mb-6 leading-relaxed">
                Add a note to influence the genre and topic selection. Leave blank
                to let the AI decide entirely.
              </p>
              <div className="relative mb-6">
                <textarea
                  className="w-full resize-none rounded-2xl border border-[#e6decb] bg-transparent p-4 text-[14px] text-[#3b2d21] placeholder-[#a99c8f] focus:border-[#cc7440] focus:outline-none focus:ring-1 focus:ring-[#cc7440] min-h-35 transition-all duration-200"
                  placeholder="e.g. A funny piece about black hole theory..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsNoteModalOpen(false);
                    setNote("");
                  }}
                  className="rounded-full px-6 py-2.5 text-sm font-semibold border border-[#e6decb] bg-white text-[#b65a33] hover:bg-[#fdfbf9] transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setIsNoteModalOpen(false)}
                  className="rounded-full px-6 py-2.5 text-sm font-semibold bg-[#cc7440] text-white hover:bg-[#b65a33] shadow-md shadow-[#cc7440]/20 transition-all duration-200"
                >
                  Save Note
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <div className="flex items-center justify-between gap-4">
        <h2 className={sectionTitleClass}>Current Pipeline Run</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsNoteModalOpen(true)}
            className="rounded-full px-5 py-3 text-sm font-semibold border border-[rgba(204,116,64,0.2)] bg-[rgba(255,255,255,0.6)] text-[#cc7440] hover:bg-white transition-colors"
          >
            {note ? "Edit Note" : "Add Note"}
          </button>
          <button
            type="button"
            onClick={() => onRunWorkflow(note)}
            disabled={!canRunWorkflow}
            className={`rounded-full px-5 py-3 text-sm font-semibold ${
              canRunWorkflow
                ? "bg-[#cc7440] text-[#fff7ef] hover:bg-[#b65a33] transition-colors"
                : "bg-[rgba(204,116,64,0.18)] text-[#fff7ef]/70"
            }`}
          >
            {isStartingWorkflow ? "Running..." : "Run Workflow"}
          </button>
          {pipelineState.isRunning ? (
            <button
              type="button"
              onClick={onTerminateWorkflow}
              disabled={!canTerminateWorkflow}
              className={`rounded-full px-5 py-3 text-sm font-semibold ${
                canTerminateWorkflow
                  ? "border border-[rgba(204,116,64,0.28)] bg-white text-[#b65a33]"
                  : "border border-[rgba(182,90,51,0.14)] bg-[rgba(255,255,255,0.55)] text-[#b65a33]/60"
              }`}
            >
              {isTerminatingWorkflow ? "Terminating..." : "Terminate Workflow"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {pipelineStages.map((stage, index) => {
          const state = completedStageKeys.has(stage.key)
            ? "complete"
            : stage.key === pipelineState.activeStageKey
              ? "active"
              : "idle";

          return (
            <div key={stage.key} className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                  state === "complete"
                    ? "border-[#cc7440] bg-[#cc7440] text-[#fff7ef]"
                    : state === "active"
                      ? "border-[#cc7440] bg-[rgba(204,116,64,0.12)] text-[#cc7440]"
                      : "border-[rgba(88,66,45,0.14)] bg-[rgba(255,255,255,0.5)] text-[#8c7c70]"
                }`}
              >
                {index + 1}
              </div>
              <span className="text-sm font-medium text-[#5a4a3d]">
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-6">
        <div className="h-3 overflow-hidden rounded-full bg-[rgba(88,66,45,0.08)]">
          <div
            className="h-full rounded-full bg-[#cc7440]"
            style={{ width: progressWidth }}
          />
        </div>
        <p className="mt-3 text-sm text-[#7a7167]">
          Active stage: {statusLabel}
        </p>
      </div>
    </article>
  );
}

export default CurrentPipelineRun;
