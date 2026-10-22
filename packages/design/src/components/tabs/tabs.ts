import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const tabs = defineComponent({
  name: 'tabs',
  title: 'Tabs',
  category: 'navigation',
  description: 'Switches between panels of related content. Styled from ARIA state, so any script (or the optional behaviors) just toggles attributes.',
  useWhen: 'Two to about seven peer views of the same object. Use links in a navbar when each view has its own URL.',
  anatomy: {
    '.m-tabs': 'Wrapper',
    '.m-tab-list': 'role="tablist" (add aria-label)',
    '.m-tab': 'role="tab" button; aria-selected="true" marks the active one, aria-controls points at its panel',
    '.m-tab-panel': 'role="tabpanel"; hide inactive panels with the hidden attribute',
    '[data-variant] on .m-tabs': 'underline (default) | pill',
    '[aria-disabled="true"] on .m-tab': 'Disabled tab',
  },
  tokens: {
    gap: t.length('Space between the tab list and the panel', ref('space.4')),
    listGap: t.length('Space between tabs', ref('space.1')),
    listBorder: t.color('Underline variant: baseline under the tab list', ref('color.border.default')),
    listBorderWidth: t.length('Underline variant: baseline width', ref('borderWidth.thin')),
    height: t.length('Tab height', ref('control.height.md')),
    paddingX: t.length('Tab horizontal padding', ref('control.paddingX.md')),
    fontSize: t.length('Tab label size', ref('control.fontSize')),
    fontWeight: t.fontWeight('Tab label weight', ref('font.weight.medium')),
    textTransform: t.keyword('Tab label text-transform', 'none'),
    fg: t.color('Inactive tab text', ref('color.fg.muted')),
    hoverFg: t.color('Tab text on hover', ref('color.fg.default')),
    activeFg: t.color('Selected tab text', ref('color.fg.default')),
    indicator: t.color('Underline variant: selected indicator', ref('color.accent.default')),
    indicatorWidth: t.length('Underline variant: indicator thickness', ref('borderWidth.thick')),
    pill: {
      listBg: t.color('Pill variant: track background', ref('color.bg.sunken')),
      listRadius: t.length('Pill variant: track radius', ref('radius.control')),
      listPadding: t.length('Pill variant: track padding', ref('space.1')),
      radius: t.length('Pill variant: tab radius', ref('radius.sm')),
      activeBg: t.color('Pill variant: selected tab background', ref('color.bg.surface')),
      activeShadow: t.shadow('Pill variant: selected tab shadow', ref('shadow.sm')),
    },
  },
  contrast: [
    { fg: 'fg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'activeFg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'fg', bg: 'pill.listBg', min: 4.5 },
    { fg: 'activeFg', bg: 'pill.activeBg', min: 4.5 },
  ],
  a11y: [
    'Use role="tablist", role="tab" and role="tabpanel"; link each tab to its panel with aria-controls and each panel back with aria-labelledby.',
    'Only the selected tab is in the tab order (tabindex="0"); the others get tabindex="-1" and arrow keys move between them (the optional behaviors script does this).',
    'Give the tab list an aria-label describing what the tabs switch between.',
  ],
});
