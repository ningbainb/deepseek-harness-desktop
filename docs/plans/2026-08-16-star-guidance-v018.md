# Website Star Guidance and v0.1.8 Content Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a restrained GitHub Star conversion path and bring the website and repository introduction up to date with desktop v0.1.8 without redesigning the existing UI.

**Architecture:** Extend the static HTML with a Star badge, a clearer Hero CTA, and a compact v0.1.8 feature section. Reuse the existing deferred GitHub hydration path to fetch repository stars and installer downloads with static fallbacks, then add focused CSS and validator coverage. Keep README content synchronized in Chinese and English.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js test runner, GitHub REST API, pnpm documentation checks.

---

### Task 1: Add validation coverage

**Files:**
- Modify: `scripts/validate-website.mjs`
- Modify: `scripts/validate-website.test.mjs`

**Step 1:** Add required markers for the Star CTA, star-count placeholder, download-count placeholder, and `latest-features` section.

**Step 2:** Add a fixture mutation test that proves missing Star guidance is rejected.

**Step 3:** Run `node --test scripts/validate-website.test.mjs` and confirm the new test fails before implementation.

### Task 2: Add restrained Star guidance and latest features

**Files:**
- Modify: `website/index.html`
- Modify: `website/styles.css`

**Step 1:** Add the header Star badge and replace the Hero GitHub label with a direct Star request while keeping download primary.

**Step 2:** Add a compact support line containing real fallback Star and download counts.

**Step 3:** Add the v0.1.8 feature section with four cards and update stale theme and release copy.

**Step 4:** Run `pnpm website:check` and confirm the HTML markers and local assets pass.

### Task 3: Hydrate real GitHub proof data

**Files:**
- Modify: `website/script.js`

**Step 1:** Fetch repository metadata during the existing idle hydration phase and update every Star count placeholder.

**Step 2:** Reuse the latest Release response to update installer download counts.

**Step 3:** Preserve static fallbacks when either request fails and keep all primary actions usable.

**Step 4:** Run `node --test scripts/validate-website.test.mjs` and `pnpm website:check`.

### Task 4: Synchronize the GitHub introduction

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`

**Step 1:** Update the stable version and direct download links to v0.1.8 in both languages.

**Step 2:** Add the v0.1.8 highlights and correct the bundled marketplace description.

**Step 3:** Run `pnpm docs:check` and confirm both root README files remain consistent.

### Task 5: Verify the complete experience

**Files:**
- Verify: `website/index.html`
- Verify: `website/styles.css`
- Verify: `website/script.js`

**Step 1:** Run `node --test scripts/validate-website.test.mjs`, `pnpm website:check`, `pnpm docs:check`, and `git diff --check`.

**Step 2:** Serve `website/` locally and inspect desktop and 390-pixel mobile views, including the Hero, v0.1.8 section, and Release section.

**Step 3:** Confirm there is no horizontal overflow, download remains the primary CTA, and reduced-motion behavior is preserved.

**Step 4:** Commit the verified files with a Conventional Commit message without emoji.
