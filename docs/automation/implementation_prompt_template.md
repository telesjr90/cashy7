You are implementing {{TASK_ID}}.

Repo:
~/projects/project_cashflow_auto

Read:
- .cursor/rules/cashflow-task-workflow.mdc
- docs/automation/task_queue.md
- docs/automation/tasks.json
- {{PROMPT_PATH}}

Use the project rules.
Do not expose or print .env values.
Do not commit credentials.
Do not put test credentials into source files.
Do not push.

Implement only {{TASK_ID}}.

Important automation requirements:
1. Keep the task narrow.
2. Preserve payment/cash rules unless the task explicitly changes them.
3. Preserve privacy.
4. Preserve Dashboard formulas unless the task explicitly changes them.
5. Do not add migrations unless the task explicitly allows them or inspection proves they are required.
6. Write both a markdown report and a JSON report.

After implementation:
1. Run:
   ./scripts/validate-cashflow.sh

2. Run browser smoke if the task requires it.

3. Write markdown report:
   {{REPORT_PATH}}

4. Write machine-readable JSON report:
   {{JSON_REPORT_PATH}}

The JSON report must be valid JSON with this shape:
{
  "taskId": "{{TASK_ID}}",
  "result": "PASS",
  "filesChanged": [],
  "migrationsCreated": [],
  "validation": {
    "typecheck": "PASS",
    "build": "PASS",
    "testRun": "PASS"
  },
  "browserSmoke": {
    "required": true,
    "result": "PASS"
  },
  "privacy": "PASS",
  "productRules": "PASS",
  "readyToCommit": true,
  "nextTaskId": ""
}

Do not commit.

Return a short summary only.
