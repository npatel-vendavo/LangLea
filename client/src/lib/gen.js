export const GEN_PRESETS = {
  quick: { label: 'Quick overview', topicMin: 3, topicMax: 5, subMin: 2, subMax: 3, itemMin: 1, itemMax: 2, desc: '3-5 topics, 2-3 subtopics, 1-2 items' },
  standard: { label: 'Standard', topicMin: 7, topicMax: 10, subMin: 5, subMax: 7, itemMin: 3, itemMax: 5, desc: '7-10 topics, 5-7 subtopics, 3-5 items' },
  deep: { label: 'Deep dive', topicMin: 10, topicMax: 15, subMin: 6, subMax: 8, itemMin: 4, itemMax: 6, desc: '10-15 topics, 6-8 subtopics, 4-6 items' }
}

export const GEN_LIMITS = {
  topic: { min: 2, max: 20 },
  sub: { min: 1, max: 12 },
  item: { min: 1, max: 12 }
}

export const DEFAULT_GEN = { preset: 'standard', ...GEN_PRESETS.standard }

export function buildGen(gen) {
  if (!gen) return DEFAULT_GEN
  if (gen.preset === 'custom') {
    return {
      preset: 'custom',
      topicMin: gen.topicMin, topicMax: gen.topicMax,
      subMin: gen.subMin, subMax: gen.subMax,
      itemMin: gen.itemMin, itemMax: gen.itemMax
    }
  }
  const preset = GEN_PRESETS[gen.preset] || GEN_PRESETS.standard
  return { preset: gen.preset || 'standard', ...preset }
}
