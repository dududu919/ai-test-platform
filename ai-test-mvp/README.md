# AI Test MVP

This is a scaffold for a controlled test loop:

- repo analysis
- database analysis
- scenario generation
- Playwright execution
- result analysis

## Current state

- TypeScript project scaffold is in place
- CLI orchestration entry point is wired
- shared intermediate models exist
- analyzers, generator, runner, and analyst have scaffold implementations
- real LLM integration, real schema scanning, and real AST analysis are still placeholders

## Commands

```bash
npm install
npm run analyze
npm run generate
npm run run
npm run pipeline
```

## Run with the local demo app

Start the demo app first:

```bash
cd ../demo-app
npm start
```

Then run the test platform:

```bash
cd ../ai-test-mvp
npm run pipeline
```

## Direct report view

After `npm run pipeline`, open:

```text
reports/latest-report.html
```

You can also inspect:

- `reports/latest-report.json`
- `reports/repo-model.json`
- `reports/db-model.json`
- `scenarios/generated/scenarios.json`

## Layout

- `src/analyzers`: repo and database analysis
- `src/generator`: structured scenario generation
- `src/runner`: Playwright execution and DB assertions
- `src/analyst`: failure classification and report rendering
- `src/models`: shared data contracts
- `project.config.yaml`: manual project configuration
