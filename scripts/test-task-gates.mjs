import fs from "node:fs";
import { execSync } from "node:child_process";

const taskId = process.argv[2];

if (!taskId) {
  throw new Error("Usage: node scripts/test-task-gates.mjs <TASK_ID>");
}

const tasks = JSON.parse(fs.readFileSync("docs/automation/tasks.json", "utf8"));
const task = tasks.tasks.find((item) => item.id === taskId);

if (!task) {
  throw new Error(`Task not found in tasks.json: ${taskId}`);
}

if (!fs.existsSync(task.jsonReportPath)) {
  throw new Error(`Missing JSON report: ${task.jsonReportPath}`);
}

const report = JSON.parse(fs.readFileSync(task.jsonReportPath, "utf8"));

if (report.taskId !== taskId) {
  throw new Error(`Report taskId mismatch. Expected ${taskId}, got ${report.taskId}`);
}

if (report.result !== "PASS") {
  throw new Error(`Task result is not PASS: ${report.result}`);
}

if (report.readyToCommit !== true) {
  throw new Error("Task report says readyToCommit is not true");
}

if (
  report.validation?.typecheck !== "PASS" ||
  report.validation?.build !== "PASS" ||
  report.validation?.testRun !== "PASS"
) {
  throw new Error("Validation in JSON report is not PASS");
}

if (task.browserSmokeRequired === true && report.browserSmoke?.result !== "PASS") {
  throw new Error("Browser smoke required but did not pass");
}

const changedOutput = execSync("git diff --name-only", { encoding: "utf8" }).trim();
const changedFiles = changedOutput ? changedOutput.split(/\r?\n/) : [];

if (changedFiles.length === 0) {
  throw new Error("No changed files found to commit");
}

for (const file of changedFiles) {
  for (const suspicious of task.suspiciousFiles ?? []) {
    if (file.startsWith(suspicious) && task.allowMigrations !== true) {
      throw new Error(`Suspicious/unexpected file changed: ${file}`);
    }
  }
}

console.log(`Gate checks passed for ${taskId}`);
