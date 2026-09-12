import { readdir } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const entries = await readdir(root, { withFileTypes: true })

const rules = [
  {
    name: 'patch file',
    test: (file) => file.endsWith('.patch'),
    target: 'patches/ for durable patches, otherwise do not commit it',
  },
  {
    name: 'temporary underscore script',
    test: (file) => /^_.+\.(?:mjs|cjs|js|ts)$/i.test(file),
    target: 'scripts/archive/<scope>/ or scripts/',
  },
  {
    name: 'diagnostic or verification script',
    test: (file) => /^(?:capture|diagnose|verify)-.+\.(?:mjs|cjs|js|ts)$/i.test(file),
    target: 'scripts/archive/<version>/<kind>/ or scripts/',
  },
  {
    name: 'dated bug report',
    test: (file) => /^bug-report-.+\.md$/i.test(file),
    target: 'docs/archive/bug-reports/',
  },
  {
    name: 'root image asset',
    test: (file) => /\.(?:png|jpe?g|gif|webp|svg)$/i.test(file),
    target: 'gallery/, gallery/archive/, or gallery/releases/<version>/',
  },
]

const violations = []
for (const entry of entries) {
  if (!entry.isFile()) continue
  for (const rule of rules) {
    if (rule.test(entry.name)) {
      violations.push(`${entry.name}: ${rule.name}; move to ${rule.target}`)
      break
    }
  }
}

if (violations.length > 0) {
  console.error('repository hygiene check failed:')
  for (const violation of violations) console.error(`  ${violation}`)
  process.exit(1)
}

console.log('repository hygiene check passed')
