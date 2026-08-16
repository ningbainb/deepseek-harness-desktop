# Search Indexing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 补齐官网搜索索引信号、部署到 GitHub Pages，并向可用的主要搜索入口提交正式 URL。

**Architecture:** 继续使用 `website/` 静态站点，通过 HTML 元数据、JSON-LD、XML sitemap、llms.txt 与 IndexNow 文件提供发现信号。扩展现有 Node 校验脚本，保证后续发布不会意外删除关键 SEO 标记。

**Tech Stack:** HTML5、JSON-LD、XML Sitemap、Node.js 内置测试、GitHub Pages、IndexNow、站长平台。

---

### Task 1: Add machine-readable discovery signals

**Files:**
- Modify: `website/index.html`
- Create: `website/sitemap.xml`
- Create: `website/robots.txt`
- Create: `website/llms.txt`
- Create: `website/<indexnow-key>.txt`

**Steps:**
1. Add canonical, robots, Open Graph, Twitter Card and JSON-LD metadata.
2. Add a visible FAQ matching the structured data.
3. Add the sitemap, AI-readable project summary and IndexNow ownership file.
4. Parse the HTML, JSON-LD and XML locally.

### Task 2: Prevent SEO regressions

**Files:**
- Modify: `scripts/validate-website.mjs`
- Modify: `scripts/validate-website.test.mjs`

**Steps:**
1. Add failing assertions for the required SEO markers and discovery files.
2. Extend the validator with minimal checks.
3. Run `node --test scripts/validate-website.test.mjs` and `pnpm website:check`.

### Task 3: Publish and verify

**Files:**
- Commit the files above on `codex/search-indexing`.

**Steps:**
1. Run focused tests, `git diff --check` and repository policy checks.
2. Push the branch, merge it to `main`, and wait for GitHub Pages.
3. Verify the public HTML, sitemap, llms.txt and IndexNow key URL.

### Task 4: Submit indexing requests

**Files:**
- No repository files.

**Steps:**
1. Submit the canonical homepage to IndexNow.
2. Submit the sitemap and URL in accessible Google, Bing and Chinese webmaster platforms.
3. Record completed submissions and any platform blocked by account verification.
