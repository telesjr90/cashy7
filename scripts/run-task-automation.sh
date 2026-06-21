#!/usr/bin/env bash
set -euo pipefail

MAX_TASKS="${MAX_TASKS:-1}"
AUTO_COMMIT="${AUTO_COMMIT:-false}"
AUTO_PUSH="${AUTO_PUSH:-false}"

PROMPT_TEMPLATE="docs/automation/implementation_prompt_template.md"
RUNNER_PROMPT="docs/automation/.runner-current-prompt.md"
AGENT_OUTPUT="docs/automation/last-cursor-agent-output.log"

require_clean_tree() {
  local status
  status="$(git status --short)"
  if [[ -n "$status" ]]; then
    echo "$status"
    echo "Working tree is not clean. Stop before running next task."
    exit 1
  fi
}

active_task_json() {
  node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync("docs/automation/tasks.json", "utf8"));
const task = data.tasks.find(t => t.id === data.activeTaskId);
if (!task) process.exit(2);
console.log(JSON.stringify(task));
'
}

json_field() {
  local json="$1"
  local field="$2"
  node -e "const o = JSON.parse(process.argv[1]); console.log(o['$field'] ?? '')" "$json"
}

build_prompt() {
  local task_json="$1"
  local task_id prompt_path report_path json_report_path

  task_id="$(json_field "$task_json" id)"
  prompt_path="$(json_field "$task_json" promptPath)"
  report_path="$(json_field "$task_json" reportPath)"
  json_report_path="$(json_field "$task_json" jsonReportPath)"

  node - "$PROMPT_TEMPLATE" "$task_id" "$prompt_path" "$report_path" "$json_report_path" <<'NODE'
const fs = require("fs");
const [templatePath, taskId, promptPath, reportPath, jsonReportPath] = process.argv.slice(2);
let s = fs.readFileSync(templatePath, "utf8");
s = s.replaceAll("{{TASK_ID}}", taskId)
     .replaceAll("{{PROMPT_PATH}}", promptPath)
     .replaceAll("{{REPORT_PATH}}", reportPath)
     .replaceAll("{{JSON_REPORT_PATH}}", jsonReportPath);
console.log(s);
NODE
}

run_agent() {
  local prompt="$1"
  printf "%s" "$prompt" > "$RUNNER_PROMPT"

  echo "== Running Cursor Agent =="
  timeout 45m agent \
    --print \
    --output-format text \
    --trust \
    --workspace "$(pwd)" \
    "$(cat "$RUNNER_PROMPT")" | tee "$AGENT_OUTPUT"
}

for ((i=1; i<=MAX_TASKS; i++)); do
  echo "== Automation iteration $i / $MAX_TASKS =="

  require_clean_tree

  TASK_JSON="$(active_task_json || true)"
  if [[ -z "$TASK_JSON" ]]; then
    echo "No active task found. Automation complete."
    exit 0
  fi

  TASK_ID="$(json_field "$TASK_JSON" id)"
  TASK_TITLE="$(json_field "$TASK_JSON" title)"
  PROMPT_PATH="$(json_field "$TASK_JSON" promptPath)"
  REPORT_PATH="$(json_field "$TASK_JSON" reportPath)"
  JSON_REPORT_PATH="$(json_field "$TASK_JSON" jsonReportPath)"
  COMMIT_MESSAGE="$(json_field "$TASK_JSON" commitMessage)"
  REQUIRES_HUMAN_REVIEW="$(json_field "$TASK_JSON" requiresHumanReview)"

  echo "== Active task: $TASK_ID — $TASK_TITLE =="

  if [[ "$REQUIRES_HUMAN_REVIEW" == "true" ]]; then
    echo "Task requires human review. Stopping: $TASK_ID"
    exit 1
  fi

  if [[ ! -f "$PROMPT_PATH" ]]; then
    echo "Missing prompt file: $PROMPT_PATH"
    exit 1
  fi

  PROMPT="$(build_prompt "$TASK_JSON")"

  run_agent "$PROMPT"

  echo "== Independent validation =="
  ./scripts/validate-cashflow.sh

  echo "== Gate checks =="
  node scripts/test-task-gates.mjs "$TASK_ID"

  if [[ "$AUTO_COMMIT" != "true" ]]; then
    echo "AUTO_COMMIT=false. Stop here for review."
    exit 0
  fi

  echo "== Staging task files =="
  git add -u

  if [[ -f "$REPORT_PATH" ]]; then git add "$REPORT_PATH"; fi
  if [[ -f "$JSON_REPORT_PATH" ]]; then git add "$JSON_REPORT_PATH"; fi
  git add docs/automation/tasks.json docs/automation/task_queue.md docs/automation/task_prompts || true

  echo "== Staged diff =="
  git diff --cached --stat

  echo "== Commit =="
  git commit -m "$COMMIT_MESSAGE"

  if [[ "$AUTO_PUSH" == "true" ]]; then
    echo "== Push =="
    git push origin main
  fi
done

echo "Reached MAX_TASKS=$MAX_TASKS"
