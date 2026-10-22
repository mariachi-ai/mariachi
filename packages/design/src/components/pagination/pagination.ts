import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const pagination = defineComponent({
  name: 'pagination',
  title: 'Pagination',
  category: 'navigation',
  description: 'Links between pages of a long list, with previous/next and an ellipsis for skipped ranges.',
  useWhen: 'Paged tables and lists where the user may jump to a page. Prefer "Load more" or cursor-based next/previous for feeds.',
  anatomy: {
    'nav.m-pagination': 'On <nav aria-label="Pagination">; holds a <ul>',
    '.m-pagination-item': 'A page link or button; aria-current="page" marks the current page',
    '[aria-disabled="true"]': 'A previous/next item with nowhere to go',
    '.m-pagination-ellipsis': 'Skipped pages (aria-hidden)',
  },
  tokens: {
    size: t.length('Item height and minimum width', ref('control.height.sm')),
    paddingX: t.length('Item horizontal padding', ref('space.2')),
    gap: t.length('Space between items', ref('space.1')),
    radius: t.length('Item radius', ref('radius.control')),
    fontSize: t.length('Item text size', ref('control.fontSize')),
    fontWeight: t.fontWeight('Item weight', ref('font.weight.medium')),
    fg: t.color('Item text', ref('color.fg.default')),
    border: t.color('Item border', 'transparent'),
    borderWidth: t.length('Item border width', ref('borderWidth.control')),
    hoverBg: t.color('Item background on hover', ref('color.bg.sunken')),
    currentBg: t.color('Current page background', ref('color.accent.default')),
    currentFg: t.color('Current page text', ref('color.accent.fg')),
    currentBorder: t.color('Current page border', ref('color.accent.default')),
    disabledOpacity: t.number('Opacity of disabled items', '0.5'),
  },
  contrast: [
    { fg: 'fg', bg: 'color.bg.canvas', min: 4.5 },
    { fg: 'fg', bg: 'hoverBg', min: 4.5 },
    { fg: 'currentFg', bg: 'currentBg', min: 4.5 },
  ],
  a11y: [
    'Wrap it in <nav aria-label="Pagination"> and use a list.',
    'Mark the current page with aria-current="page"; give previous/next links accessible names ("Previous page").',
    'Disabled previous/next items should be aria-disabled="true" links without href (or disabled buttons) so they are skipped by click but still announced.',
  ],
});
