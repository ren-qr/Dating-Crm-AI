# Phase 1 Agent Eval Results

`pnpm eval:agent` executes the deterministic Runtime/Gateway/Executor harness against
`../phase1-backoffice.json` and writes the current JSON and Markdown reports here.
Generated reports are intentionally ignored because they contain run timestamps.

`phase1-deterministic.example.json` and `.md` are the checked-in result from the
current deterministic run: 60 scenarios, 72 turns, and no failures. The executable
suite also runs direct T37-T42 action and model-context security boundary assertions.
