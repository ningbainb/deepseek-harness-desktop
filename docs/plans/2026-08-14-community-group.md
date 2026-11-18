# Community Group Entry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the desktop community immediately discoverable from the product site and repository README. The current community is QQ Group 2 (`1129522514`).

**Architecture:** Keep the download CTA first, then add a high-contrast community CTA beside it and a compact community link in the fixed header. Expand the existing community section into a two-column join card with the supplied QR image, verified Tencent short link, and copyable group number. Mirror the same information near the top of both README files.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Markdown, GitHub Pages.

---

### Task 1: Add the verified community asset and links

**Files:**
- Current asset: `website/assets/qq-group-1129522514.jpg`
- Modify: `website/index.html`

1. Preserve the supplied QR image without generative edits.
2. Use the [QQ Group 2 link](https://qm.qq.com/q/9hrcdaEYPC) in the fixed header and hero actions.
3. Add a dedicated community card with the QR image, group number, join link, and copy action.

### Task 2: Style and wire the community experience

**Files:**
- Modify: `website/styles.css`
- Modify: `website/script.js`

1. Add a pink-to-orange QQ accent that remains subordinate to the primary download button.
2. Make the join card responsive on desktop and mobile.
3. Reuse the copy feedback helper for the current group number (`1129522514`).

### Task 3: Update GitHub introduction and publish

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`

1. Add the group number, verified join link, and QR image near the top of both README files.
2. Run website validation and JavaScript syntax checks.
3. Verify links and layouts in a real browser.
4. Commit, push to `main`, wait for GitHub Pages, and verify the live result.
