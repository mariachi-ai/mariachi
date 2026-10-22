import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const thinking = defineComponent({
  name: 'thinking',
  title: 'Thinking',
  category: 'ai',
  description: "A collapsible block for a model's reasoning, de-emphasised so the answer stays the focus.",
  useWhen: 'Showing extended thinking or chain-of-thought summaries above an assistant reply.',
  anatomy: {
    'details.m-thinking': 'The collapsible block; add open to expand it by default',
    'summary': 'Holds .m-thinking-label and .m-thinking-duration',
    '.m-thinking-label': '"Thinking…" while running, "Thought for 12s" when done',
    '.m-thinking-duration': 'Optional elapsed time or token count',
    '.m-thinking-body': 'The reasoning text',
    '[data-state="running"]': 'Pulses the label while the model is thinking',
  },
  tokens: {
    fg: t.color('Reasoning text', ref('color.fg.muted')),
    summaryFg: t.color('Summary text', ref('color.fg.muted')),
    summaryWeight: t.fontWeight('Summary weight', ref('font.weight.medium')),
    durationFg: t.color('Duration text', ref('color.fg.subtle')),
    fontSize: t.length('Text size', ref('font.size.sm')),
    fontStyle: t.keyword('Reasoning font-style', 'normal'),
    rule: t.color('Rule beside the reasoning', ref('color.border.default')),
    ruleWidth: t.length('Rule width', ref('borderWidth.thick')),
    gap: t.length('Space between summary and body', ref('space.2')),
    indent: t.length('Body indent from the rule', ref('space.3')),
    radius: t.length('Summary focus/hover radius', ref('radius.sm')),
    hoverBg: t.color('Summary background on hover', ref('color.bg.sunken')),
    pulseDuration: t.duration('Running pulse period', 'calc(var(--m-motion-duration-slow) * 5)'),
  },
  contrast: [
    { fg: 'fg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'summaryFg', bg: 'hoverBg', min: 4.5 },
    { fg: 'durationFg', bg: 'color.bg.canvas', min: 4.5 },
  ],
  a11y: [
    'Native <details>/<summary> gives keyboard toggling and an expanded state for free.',
    'Keep the label meaningful when collapsed ("Thought for 12s"), not just "Details".',
    'While running, set aria-busy="true" on the block; the pulse stops under reduced motion.',
  ],
});
