/** Run via npm run worker. No workflow nodes are executed. */
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processAnalysis } from "../worker/process";
export { processAnalysis };

const redisURL = process.env.REDIS_URL;
if (!redisURL)
  throw new Error("REDIS_URL is required for the analysis worker.");
const connection = new IORedis(redisURL, { maxRetriesPerRequest: null });
const worker = new Worker("workflow-analysis", processAnalysis, {
  connection,
  concurrency: 2,
  lockDuration: 60000,
});
worker.on("failed", (job) =>
  console.error("Workflow analysis job failed", job?.id),
);
worker.on("error", () =>
  console.error("Workflow analysis worker connection error"),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await worker.close();
  await connection.quit();
}
process.once("SIGTERM", () => {
  void close();
});
process.once("SIGINT", () => {
  void close();
});
