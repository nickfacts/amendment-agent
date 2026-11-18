// ★ The Cursor SDK starts here.
// A cloud agent clones the study-build repo, works on a branch, runs the checks in its own VM,
// and opens a pull request. Follow-up turns go to the SAME agent, so fixes land on the same branch.
import { Agent } from "@cursor/sdk";

export type StudyAgent = Awaited<ReturnType<typeof Agent.create>>;

export interface TurnResult {
  status: string; // "finished" | "error" | "cancelled"
  text: string; // final assistant message: we ask for the PR description here
  branch?: string;
  prUrl?: string;
}

export async function createStudyAgent(opts: { apiKey: string; model: string; repoUrl: string }): Promise<StudyAgent> {
  return Agent.create({
    apiKey: opts.apiKey,
    model: { id: opts.model },
    cloud: {
      repos: [{ url: opts.repoUrl, startingRef: "main" }],
      autoCreatePR: true,
    },
  });
}

/** Send one turn and stream progress to the terminal. */
export async function runTurn(agent: StudyAgent, prompt: string, label: string): Promise<TurnResult> {
  console.log(`\n▶ ${label} (agent ${agent.agentId})`);
  const run = await agent.send(prompt);

  for await (const event of run.stream()) {
    switch (event.type) {
      case "status":
        console.log(`  [status] ${event.status}`);
        break;
      case "tool_call":
        console.log(`  [tool] ${event.name}: ${event.status}`);
        break;
      case "assistant":
        for (const block of event.message.content) {
          if (block.type === "text" && block.text.trim()) process.stdout.write(dim(block.text));
        }
        break;
    }
  }

  const result = await run.wait();
  const branch = result.git?.branches?.[0];
  console.log(`\n◀ ${label}: ${result.status}${branch ? ` on ${branch.branch}` : ""}`);
  return {
    status: result.status,
    text: result.result ?? "",
    branch: branch?.branch,
    prUrl: branch?.prUrl,
  };
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
