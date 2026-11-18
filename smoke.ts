import { Agent } from "@cursor/sdk";

const agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2.5" },
  cloud: {
    repos: [{ url: process.env.REPO_URL!, startingRef: "main" }],
    autoCreatePR: true,
  },
});
console.log("agent:", agent.agentId);

const run = await agent.send(
  "Add a 'Smoke test' section to README.md with one sentence saying this repo verifies the Cursor SDK setup."
);

for await (const event of run.stream()) {
  if (event.type === "assistant") {
    for (const block of event.message.content)
      if (block.type === "text") process.stdout.write(block.text);
  } else if (event.type === "tool_call") {
    console.log(`\n[tool] ${event.name}: ${event.status}`);
  } else if (event.type === "status") {
    console.log(`\n[status] ${event.status}`);
  }
}

const result = await run.wait();
console.log("\nstatus:", result.status);
for (const b of result.git?.branches ?? []) console.log(b.branch, b.prUrl ?? "(no PR url)");

await agent.close();
