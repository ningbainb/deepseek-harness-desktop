import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  defaultSkillRoots,
  discoverSkills,
  importSkill,
  parseSkillFrontmatter,
} from '../src/extensions/skills.mjs'

const validSkill = (name, description = 'A useful skill') => `---\nname: ${name}\ndescription: ${description}\n---\n\n# Instructions\n`

test('skill frontmatter requires kebab-case name and a description', () => {
  assert.deepEqual(parseSkillFrontmatter(validSkill('good-skill')), {
    name: 'good-skill',
    description: 'A useful skill',
  })
  assert.throws(() => parseSkillFrontmatter(validSkill('BadSkill')), /kebab-case/)
  assert.throws(() => parseSkillFrontmatter('no frontmatter'), /frontmatter/)
  assert.deepEqual(parseSkillFrontmatter(validSkill('chinese-description', '处理中文文档')), {
    name: 'chinese-description',
    description: '处理中文文档',
  })
})

test('skill discovery follows official root precedence and reports shadows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-skills-'))
  try {
    const projectRoot = join(root, 'project')
    const dshHome = join(root, 'dsh-home')
    const agentsHome = join(root, 'agents-home')
    const projectSkill = join(projectRoot, '.dsh', 'skills', 'shared')
    const userSkill = join(dshHome, 'skills', 'shared')
    await mkdir(projectSkill, { recursive: true })
    await mkdir(userSkill, { recursive: true })
    await writeFile(join(projectSkill, 'SKILL.md'), validSkill('shared', 'Project copy'))
    await writeFile(join(userSkill, 'SKILL.md'), validSkill('shared', 'User copy'))

    const result = await discoverSkills({ roots: defaultSkillRoots({ projectRoot, dshHome, agentsHome }) })
    const entries = result.skills.filter((skill) => skill.name === 'shared')
    assert.equal(entries.length, 2)
    assert.equal(entries[0].description, 'Project copy')
    assert.equal(entries[1].shadowedBy, entries[0].path)
    assert.match(result.diagnostics[0].error, /duplicate skill name "shared".*project-dsh/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('skill discovery reports missing manifests and ignored symbolic-link entries', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-skill-diagnostics-'))
  try {
    const projectRoot = join(root, 'project')
    const skillRoot = join(projectRoot, '.dsh', 'skills')
    await mkdir(join(skillRoot, 'missing-manifest'), { recursive: true })
    const target = join(root, 'linked-skill')
    await mkdir(target)
    await writeFile(join(target, 'SKILL.md'), validSkill('linked-skill'))
    try {
      await symlink(target, join(skillRoot, 'linked-skill'), process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      if (error?.code === 'EPERM') return context.skip('Windows symbolic-link creation requires Developer Mode')
      throw error
    }

    const result = await discoverSkills({ roots: defaultSkillRoots({
      projectRoot,
      dshHome: join(root, 'dsh-home'),
      agentsHome: join(root, 'agents-home'),
    }) })
    assert.equal(result.skills.length, 0)
    assert.ok(result.diagnostics.some((item) => /missing SKILL\.md/u.test(item.error)))
    assert.ok(result.diagnostics.some((item) => /ignores symbolic links/u.test(item.error)))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('skill import copies a valid bundle without overwriting and rejects symbolic links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-skill-import-'))
  try {
    const source = join(root, 'source')
    const target = join(root, 'target')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'SKILL.md'), validSkill('imported-skill'))
    await writeFile(join(source, 'reference.md'), 'reference')
    const imported = await importSkill({ sourceDirectory: source, targetRoot: target })
    assert.equal(imported.name, 'imported-skill')
    assert.equal(await readFile(join(target, 'imported-skill', 'reference.md'), 'utf8'), 'reference')
    await assert.rejects(importSkill({ sourceDirectory: source, targetRoot: target }), /already exists/)

    const unsafe = join(root, 'unsafe')
    await mkdir(unsafe)
    await writeFile(join(unsafe, 'SKILL.md'), validSkill('unsafe-skill'))
    const outside = join(root, 'outside')
    await mkdir(outside)
    await symlink(outside, join(unsafe, 'escape'), 'junction')
    await assert.rejects(importSkill({ sourceDirectory: unsafe, targetRoot: target }), /symbolic links/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
