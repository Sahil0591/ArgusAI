# Graph Report - ArgusAI  (2026-09-19)

## Corpus Check
- Corpus is ~2,769 words - fits in a single context window. You may not need a graph.

## Summary
- 127 nodes · 125 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.96)
- Token cost: 2,100 input · 320 output

## Community Hubs (Navigation)
- TypeScript App Config
- Dev Dependencies & Types
- TypeScript Node Config
- Social Platform Icons
- Frontend Entry & Tooling
- React App Components
- Brand Identity & Favicon
- Package DevDeps Config
- Vite Frontend Build
- Oxlint Rules
- Build Scripts
- React Framework Assets
- TS Config References
- DockVoice Package

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 18 edges
2. `compilerOptions` - 15 edges
3. `Favicon Icon` - 7 edges
4. `Web Frontend README (React + TypeScript + Vite)` - 6 edges
5. `Icon Set` - 6 edges
6. `scripts` - 5 edges
7. `rules` - 3 edges
8. `react` - 3 edges
9. `Hero Image` - 3 edges
10. `Bottom Layer (Purple/Violet Accented Rounded Rectangle)` - 3 edges

## Surprising Connections (you probably didn't know these)
- `ArgusAI Root README` --related_to--> `Web Frontend README (React + TypeScript + Vite)`  [INFERRED]
  README.md → web/README.md
- `Web Frontend Entry HTML` --implements--> `React + TypeScript + Vite Stack`  [INFERRED]
  web/index.html → web/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Web Frontend Technology Stack** — web_index, react_typescript_vite_stack, main_tsx_entrypoint [INFERRED 0.85]

## Communities (15 total, 3 thin omitted)

### Community 0 - "TypeScript App Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 1 - "Dev Dependencies & Types"
Cohesion: 0.12
Nodes (16): @google/genai, oxlint, @types/node, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react (+8 more)

### Community 2 - "TypeScript Node Config"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 3 - "Social Platform Icons"
Cohesion: 0.18
Nodes (11): Bluesky (Social Platform), Discord (Communication Platform), GitHub (Code Hosting Platform), Bluesky Icon, Discord Icon, Documentation Icon, GitHub Icon, Icon Set (+3 more)

### Community 4 - "Frontend Entry & Tooling"
Cohesion: 0.25
Nodes (9): src/main.tsx React Entry Module, Oxlint Linting Configuration, React Compiler Disabled by Design, React + TypeScript + Vite Stack, ArgusAI Root README, @vitejs/plugin-react (Oxc-based), @vitejs/plugin-react-swc (SWC-based), Web Frontend Entry HTML (+1 more)

### Community 5 - "React App Components"
Cohesion: 0.28
Nodes (7): react, react-dom, App(), web_src_assets_hero, web_src_assets_react, web_src_assets_vite, web_src_index

### Community 6 - "Brand Identity & Favicon"
Cohesion: 0.29
Nodes (8): ArgusAI Brand, Cyan Accent Color #47bfff, Deep Purple Glow Color #7e14ff, Lavender Highlight Color #ede6ff, Primary Purple Color #863bff, Layered Gaussian Blur Glow Effect, Favicon Icon, Lightning Bolt Shape

### Community 7 - "Package DevDeps Config"
Cohesion: 0.25
Nodes (8): devDependencies, oxlint, @types/node, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react

### Community 8 - "Vite Frontend Build"
Cohesion: 0.43
Nodes (7): ArgusAI Web Frontend, Vite, Layered Isometric Design Concept, Hero Image, Bottom Layer (Purple/Violet Accented Rounded Rectangle), Top Layer (Transparent/White Rounded Rectangle), Vite Logo

### Community 9 - "Oxlint Rules"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 10 - "Build Scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, preview

### Community 11 - "React Framework Assets"
Cohesion: 1.00
Nodes (3): Web Frontend, React, React Logo SVG

## Knowledge Gaps
- **78 isolated node(s):** `dockvoice`, `$schema`, `plugins`, `react/rules-of-hooks`, `react/only-export-components` (+73 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 85 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Package DevDeps Config` to `Dev Dependencies & Types`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `react` connect `React App Components` to `Dev Dependencies & Types`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `Favicon Icon` (e.g. with `ArgusAI Brand` and `Cyan Accent Color #47bfff`) actually correct?**
  _`Favicon Icon` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `dockvoice`, `$schema`, `plugins` to the rest of the system?**
  _78 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `TypeScript App Config` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Dev Dependencies & Types` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `TypeScript Node Config` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._