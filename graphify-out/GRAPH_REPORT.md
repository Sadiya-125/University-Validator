# Graph Report - .  (2026-07-24)

## Corpus Check
- Corpus is ~1,098 words - fits in a single context window. You may not need a graph.

## Summary
- 90 nodes · 77 edges · 17 communities (9 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 173,061 input · 0 output

## Community Hubs (Navigation)
- Dev Dependencies
- TypeScript Compiler Options
- Project Onboarding Docs
- TypeScript Type References
- Package Metadata & Scripts
- Core Framework Dependencies
- Root Layout Component
- TypeScript Lib Targets
- ESLint Configuration
- Next.js Configuration
- PostCSS Configuration
- File Icon Asset
- Globe Icon Asset
- Next.js Logo Asset
- Vercel Logo Asset
- Window Icon Asset

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `include` - 7 edges
3. `Next.js Project (create-next-app bootstrapped)` - 6 edges
4. `scripts` - 5 edges
5. `lib` - 4 edges
6. `Next.js Breaking Changes Notice` - 3 edges
7. `next` - 2 edges
8. `react` - 2 edges
9. `react-dom` - 2 edges
10. `@tailwindcss/postcss` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Breaking Changes Notice` --conceptually_related_to--> `Next.js Project (create-next-app bootstrapped)`  [INFERRED]
  AGENTS.md → README.md
- `CLAUDE.md project instructions` --references--> `Next.js Breaking Changes Notice`  [EXTRACTED]
  CLAUDE.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Repository onboarding/instruction documents** — claude_md_config, agents_breaking_changes_notice, readme_nextjs_project [INFERRED 0.75]

## Communities (17 total, 8 thin omitted)

### Community 0 - "Dev Dependencies"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+9 more)

### Community 1 - "TypeScript Compiler Options"
Cohesion: 0.13
Nodes (15): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, module, moduleResolution (+7 more)

### Community 2 - "Project Onboarding Docs"
Cohesion: 0.20
Nodes (10): Next.js Breaking Changes Notice, node_modules/next/dist/docs guide location, CLAUDE.md project instructions, app/page.tsx, create-next-app, Getting Started: run the development server, Geist font family, next/font optimization (+2 more)

### Community 3 - "TypeScript Type References"
Cohesion: 0.20
Nodes (9): **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx, exclude (+1 more)

### Community 4 - "Package Metadata & Scripts"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 5 - "Core Framework Dependencies"
Cohesion: 0.29
Nodes (7): next, dependencies, next, react, react-dom, react, react-dom

### Community 6 - "Root Layout Component"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 7 - "TypeScript Lib Targets"
Cohesion: 0.50
Nodes (4): dom, dom.iterable, esnext, lib

## Knowledge Gaps
- **60 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `eslintConfig`, `nextConfig` (+55 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Dev Dependencies` to `Package Metadata & Scripts`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `compilerOptions` connect `TypeScript Compiler Options` to `TypeScript Type References`, `TypeScript Lib Targets`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Core Framework Dependencies` to `Package Metadata & Scripts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `geistSans`, `geistMono`, `metadata` to the rest of the system?**
  _60 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dev Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `TypeScript Compiler Options` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._