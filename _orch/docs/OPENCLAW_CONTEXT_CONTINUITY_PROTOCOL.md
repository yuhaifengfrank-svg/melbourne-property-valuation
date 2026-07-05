# OpenClaw Context Continuity Protocol

**Project:** AusHomeValue
**Purpose:** Preserve accurate project continuity when a model has a limited context window or a session is restarted.
**Priority:** Mandatory for every OpenClaw session working on this project.

## Core Rule

Chat history is temporary. Repository files and verified external state are the source of continuity.

Never rely on conversational memory alone for project status, deployment state, database state, pending work, or user decisions.

## Canonical Continuity Files

Read these files at the start of every AusHomeValue session:

1. `_orch/docs/OPENCLAW_CONTEXT_CONTINUITY_PROTOCOL.md`
2. `_orch/docs/HANDOVER.md`
3. `_orch/docs/PROJECT_STATUS.md`
4. `_orch/docs/NEXT_ACTION.md`
5. The current day's `~/.openclaw/workspace/memory/YYYY-MM-DD.md`, when available

Use `_orch/docs/HANDOVER.md` for durable technical handover, not personal memory. Use daily memory only as supplementary context.

## Mandatory Session Startup

Before changing code, running migrations, writing data, or deploying:

1. Confirm the project directory is exactly `/Users/FrankAI/Documents/澳洲房地产评估系统`.
2. Read the canonical continuity files listed above.
3. Run `git status --short --branch`.
4. Run `git log -5 --oneline --decorate`.
5. Identify the active branch, HEAD commit, uncommitted files, and any changes that may belong to another agent.
6. Verify time-sensitive claims such as Production deployment, Preview deployment, database branch, or API health using the relevant live system.
7. Mark each recovered claim as `VERIFIED`, `STALE`, or `UNKNOWN`.
8. Give the user a short recovery statement containing the current goal, verified state, discrepancies, and next safe action.

Do not silently trust a handover file when it conflicts with Git, Vercel, Neon, test output, or current files.

## Context Budget Management

DeepSeek context is limited to approximately 128k tokens. Manage it proactively:

1. Check session/context status after every major milestone and approximately every 20 to 30 minutes of tool-heavy work.
2. At 55% context usage, begin compressing tool output and avoid loading unrelated files.
3. At 65% context usage, write a complete checkpoint before starting another substantial task.
4. At 70% context usage, stop starting new implementation work. Finish the current safe atomic step, update the handover, and recommend a new session.
5. Before any manual restart, model switch, compaction, or expected timeout, write the checkpoint first.

Do not wait until 90% or until the model fails.

## Mandatory Checkpoint Triggers

Update the continuity files:

- after every completed phase or production-relevant decision;
- after a commit, push, PR, merge, migration, Preview deployment, or Production deployment;
- after discovering a blocker, regression, security issue, or data-quality problem;
- before changing branches or worktrees;
- before context reaches 70%;
- before ending work for the day;
- immediately when the user says "handover", "交接", "总结", or "新会话继续".

## Handover Content Requirements

Every update to `_orch/docs/HANDOVER.md` must include:

1. Timestamp with Australia/Melbourne timezone.
2. Current objective and approved scope.
3. Completed work with concrete evidence.
4. Current branch, exact HEAD commit, upstream relationship, and worktree path.
5. Dirty files separated into:
   - files changed by this session;
   - pre-existing or concurrently changed files;
   - untracked files requiring review.
6. Commands/tests run and exact pass/fail counts.
7. Preview and Production deployment IDs and URLs, when relevant.
8. Database environment used: local, Preview/Stage, or Production. Never include credentials.
9. Decisions made by the user, including product rules and rejected alternatives.
10. Known blockers, risks, assumptions, and unresolved questions.
11. The single next safe action.
12. The exact first command or file to inspect in the next session.
13. Explicit `DO NOT` items, especially deployment and database restrictions.

Do not claim completion without verification. Do not write vague entries such as "mostly done", "should work", or "continue later".

## Project Status and Next Action

- `_orch/docs/PROJECT_STATUS.md` describes the verified current system state. Remove or label stale claims.
- `_orch/docs/NEXT_ACTION.md` contains exactly one highest-priority action, its prerequisites, completion criteria, and stop conditions.
- When these files disagree, verify reality and update all affected files in the same checkpoint.

## New Session Recovery

In a new session:

1. Do not ask the user to repeat the whole project history.
2. Perform the Mandatory Session Startup.
3. Compare handover state with Git and live services.
4. Report discrepancies before acting.
5. Resume from the documented single next safe action only after prerequisites are satisfied.
6. Reuse existing branches and worktrees when verified; do not create duplicates unnecessarily.

## Concurrency Safety

Multiple agents may edit the repository simultaneously.

- Never revert changes you did not create.
- Re-check `git status` before and after every material edit.
- If files change during the session, treat them as concurrent work and isolate your task in a clean worktree.
- Never deploy from a shared dirty worktree.
- Record ownership of files changed by the session in the handover.

## Deployment and Database Safety

- Never deploy Production without explicit user approval in the current session.
- Never run a Production migration, destructive SQL, bulk update, or cleanup based only on handover notes.
- Verify the target Vercel project, environment, Neon project, branch, host, and database before any write.
- Use Preview/Stage first when available.
- Record a rollback point before deployment.
- Never store API keys, passwords, tokens, connection strings, cookies, or secret values in continuity files.

## Daily Closeout

At the end of each local workday:

1. Update `HANDOVER.md`, `PROJECT_STATUS.md`, and `NEXT_ACTION.md`.
2. Add a concise daily note to `~/.openclaw/workspace/memory/YYYY-MM-DD.md`.
3. Record commits, deployments, test results, blockers, and the next command.
4. Confirm whether the repository is clean or list every remaining dirty file by ownership.
5. Tell the user that the handover checkpoint has been written.

## Required Confirmation Format

After installing or refreshing this protocol, reply with:

```text
Context continuity protocol active.
Context checkpoint threshold: 65%.
Hard handover threshold: 70%.
Canonical project handover: _orch/docs/HANDOVER.md.
Production actions still require explicit user approval.
```
