const POLICIES = Object.freeze({
  project: { outcomes: ['started', 'succeeded', 'failed'], details: ['create', 'connect'] },
  attachment: { outcomes: ['started', 'succeeded', 'failed', 'cancelled'], details: ['file'] },
  'dock-setting': { outcomes: ['opened', 'failed'], details: ['relay', 'value-mode', 'personal-prompt', 'memory', 'particle-theme', 'describe-image'] },
})

export function normalizeFeatureEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'detail,feature,outcome') throw new TypeError('invalid feature event')
  const policy = Object.hasOwn(POLICIES, value.feature) ? POLICIES[value.feature] : undefined
  if (!policy?.outcomes.includes(value.outcome) || !policy.details.includes(value.detail)) throw new TypeError('invalid feature event')
  return Object.freeze({ feature: value.feature, outcome: value.outcome, detail: value.detail })
}

export const FEATURE_EVENT_POLICY = Object.freeze(Object.fromEntries(Object.entries(POLICIES).map(([feature, policy]) => [
  `feature_${feature.replaceAll('-', '_')}`, Object.freeze({ outcomes: new Set(policy.outcomes), details: new Set(policy.details), buckets: new Set(['none']) }),
])))
