You are analyzing a software project to help configure an AI-powered development assistant.

Explore the project structure, source code, configuration files, and any documentation you find. Pay special attention to:
- README, CLAUDE.md, AGENTS.md, WORKFLOW.md, or any project documentation
- Build files: package.json, Cargo.toml, pyproject.toml, build.gradle, Gemfile, go.mod, Makefile, CMakeLists.txt, pom.xml, etc.
- Source code directories and their contents
- Test directories and existing test runner configuration
- Lint/format config: .eslintrc, ruff.toml, .golangci.yml, rubocop.yml, etc.
- CI/CD pipelines: .github/workflows, .gitlab-ci.yml, Jenkinsfile, etc.
- Configuration files: .env.example, docker-compose.yml, terraform/, etc.

Return a JSON object with exactly these fields:

{
  "description": "A concise 2-3 sentence description of what this project does, its purpose, and who it's for.",
  "language": "The primary programming language (e.g. typescript, python, rust, java, kotlin, ruby, go, swift, c++)",
  "domains": ["Array of relevant domain tags that apply to this project"],
  "stack": ["Array of key technologies, frameworks, and tools used"],
  "testCommand": "The exact shell command to run the test suite (e.g. 'pnpm test', 'pytest', 'go test ./...', 'cargo test'). Empty string if none detected.",
  "buildCommand": "The exact shell command to build the project (e.g. 'pnpm build', 'cargo build --release'). Empty string if none detected.",
  "lintCommand": "The exact shell command to run lint/typecheck (e.g. 'pnpm typecheck && pnpm lint', 'ruff check . && mypy src'). Empty string if none detected.",
  "hasCI": true,
  "suggestedAgents": ["Array of specialist agent names that would help develop this project"]
}

For "domains", choose from: frontend, backend, mobile, devops, database, ai-ml, security, testing, games, ecommerce, fintech, healthcare, education, saas, design, product, marketing, embedded, blockchain, spatial-computing, data-engineering.

For "suggestedAgents", choose from: frontend-developer, backend-architect, database-optimizer, security-engineer, devops-automator, mobile-app-builder, ai-engineer, ui-designer, ux-architect, code-reviewer, technical-writer, sre, data-engineer, software-architect, game-designer.

For "testCommand", "buildCommand", "lintCommand": derive from scripts in package.json, pyproject.toml, Makefile, or CI workflow steps. Prefer the command that a developer would run locally before committing.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.
