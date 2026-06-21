import fs from "node:fs";

const tasksPath = "docs/automation/tasks.json";
const queuePath = "docs/automation/task_queue.md";

const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
const activeTaskId = tasks.activeTaskId;

if (!activeTaskId) {
  throw new Error("No activeTaskId in tasks.json");
}

const activeIndex = tasks.tasks.findIndex((task) => task.id === activeTaskId);

if (activeIndex === -1) {
  throw new Error(`Active task not found in tasks.json: ${activeTaskId}`);
}

const activeTask = tasks.tasks[activeIndex];

if (!fs.existsSync(activeTask.jsonReportPath)) {
  throw new Error(`Missing result JSON for active task: ${activeTask.jsonReportPath}`);
}

const report = JSON.parse(fs.readFileSync(activeTask.jsonReportPath, "utf8"));

if (report.taskId !== activeTaskId) {
  throw new Error(`Result taskId mismatch. Expected ${activeTaskId}, got ${report.taskId}`);
}

if (report.result !== "PASS") {
  throw new Error(`Active task is not PASS. Current result: ${report.result}`);
}

if (report.readyToCommit !== true) {
  throw new Error("Active task result is PASS but readyToCommit is not true.");
}

activeTask.status = "completed";

let nextTask = null;

if (report.nextTaskId) {
  nextTask = tasks.tasks.find((task) => task.id === report.nextTaskId) ?? null;
}

if (!nextTask) {
  nextTask = tasks.tasks.slice(activeIndex + 1).find((task) => task.status === "queued") ?? null;
}

if (!nextTask) {
  tasks.activeTaskId = null;
} else {
  nextTask.status = "active";
  tasks.activeTaskId = nextTask.id;

  if (!fs.existsSync(nextTask.promptPath)) {
    throw new Error(`Next task prompt is missing: ${nextTask.promptPath}`);
  }
}

fs.writeFileSync(tasksPath, `${JSON.stringify(tasks, null, 2)}\n`);

if (fs.existsSync(queuePath)) {
  const updatedQueue = updateTaskQueue(
    fs.readFileSync(queuePath, "utf8"),
    activeTask,
    nextTask
  );
  fs.writeFileSync(queuePath, updatedQueue);
}

console.log(
  nextTask
    ? `Advanced ${activeTaskId} -> ${nextTask.id}`
    : `Completed ${activeTaskId}; no next queued task found`
);

function updateTaskQueue(content, completedTask, nextTask) {
  const lines = content.split("\n");
  const activeLineIndex = findSectionContentLine(lines, "## Active task");
  const nextTasksStart = lines.findIndex((line) => line === "## Next tasks");
  const completedStart = lines.findIndex((line) => line === "## Completed");

  if (activeLineIndex === -1 || completedStart === -1) {
    console.warn("task_queue.md format not recognized; skipping queue update.");
    return content;
  }

  const activeLine = lines[activeLineIndex].trim();

  if (activeLine && !activeLine.includes(completedTask.id)) {
    console.warn(
      `task_queue.md active line does not match ${completedTask.id}; skipping queue update.`
    );
    return content;
  }

  const completedEntry = `- ${completedTask.id} — ${completedTask.title}`;
  const insertAt = findCompletedInsertIndex(lines, completedStart);

  if (!lines.slice(completedStart, insertAt).some((line) => line.trim() === completedEntry)) {
    lines.splice(insertAt, 0, completedEntry);
  }

  if (nextTask) {
    lines[activeLineIndex] = `${nextTask.id} — ${nextTask.title}`;

    if (nextTasksStart !== -1) {
      const nextTasksEnd = completedStart === -1 ? lines.length : completedStart;
      for (let i = nextTasksStart + 1; i < nextTasksEnd; i += 1) {
        const line = lines[i];
        if (line.startsWith("- ") && line.includes(nextTask.id)) {
          lines.splice(i, 1);
          break;
        }
      }
    }
  } else {
    lines[activeLineIndex] = "None";
  }

  return lines.join("\n");
}

function findSectionContentLine(lines, heading) {
  const headingIndex = lines.findIndex((line) => line === heading);
  if (headingIndex === -1) {
    return -1;
  }

  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      break;
    }
    if (line.trim()) {
      return i;
    }
  }

  return -1;
}

function findCompletedInsertIndex(lines, completedStart) {
  let insertAt = completedStart + 1;

  while (insertAt < lines.length && lines[insertAt].trim() === "") {
    insertAt += 1;
  }

  return insertAt;
}
