import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const usage = defineComponent({
  name: 'usage',
  title: 'Usage meter',
  category: 'ai',
  description: 'Token or cost usage against a budget: a label row, a bar and a footer, coloured by how close the budget is.',
  useWhen: 'Showing token budgets, context-window fill, credits or spend against a limit.',
  anatomy: {
    '.m-usage': 'The meter; set style="--m-usage-value: 42%" to fill the bar',
    '[data-level]': 'ok (default) | warn | over',
    '.m-usage-header': 'Label and amount on one row',
    '.m-usage-label': 'What is being measured',
    '.m-usage-amount': 'Used / budget, in tabular numbers',
    '.m-usage-bar': 'The bar (role="meter" with aria-valuenow, -min, -max)',
    '.m-usage-footer': 'Secondary details: cost, reset date',
  },
  tokens: {
    value: t.length('How full the bar is; set inline per meter', '0%'),
    height: t.length('Bar height', '0.5rem'),
    radius: t.length('Bar radius', ref('radius.full')),
    gap: t.length('Space between rows', ref('space.2')),
    fontSize: t.length('Text size', ref('font.size.sm')),
    track: t.color('Unfilled track', ref('color.bg.sunken')),
    trackBorder: t.color('Track border', ref('color.border.default')),
    trackBorderWidth: t.length('Track border width', '0px'),
    okFill: t.color('Fill when within budget', ref('color.accent.text')),
    warnFill: t.color('Fill when close to the budget', ref('color.warning.fg')),
    overFill: t.color('Fill when over budget', ref('color.danger.fg')),
    labelFg: t.color('Label text', ref('color.fg.default')),
    labelWeight: t.fontWeight('Label weight', ref('font.weight.medium')),
    amountFg: t.color('Amount text', ref('color.fg.muted')),
    footerFg: t.color('Footer text', ref('color.fg.subtle')),
  },
  contrast: [
    { fg: 'okFill', bg: 'track', min: 3 },
    { fg: 'warnFill', bg: 'track', min: 3 },
    { fg: 'overFill', bg: 'track', min: 3 },
    { fg: 'labelFg', bg: 'color.bg.surface', min: 4.5 },
    { fg: 'amountFg', bg: 'color.bg.surface', min: 4.5 },
    { fg: 'footerFg', bg: 'color.bg.surface', min: 4.5 },
  ],
  a11y: [
    'Give .m-usage-bar role="meter" with aria-valuenow, aria-valuemin, aria-valuemax and an aria-label (or use a native <meter>).',
    'Always show the amount as text; the warn and over colours are a second signal, not the only one.',
    'When the level changes to over, tell the user what happens next ("Requests are paused until Nov 1").',
  ],
});
