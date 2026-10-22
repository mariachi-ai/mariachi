import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const card = defineComponent({
  name: 'card',
  title: 'Card',
  category: 'layout',
  description: 'A surface that groups related content, with optional header, body and footer.',
  useWhen: 'Grouping a unit of content: a summary, a settings group, a list item that links somewhere.',
  anatomy: {
    '.m-card': 'The surface (<article>, <section>, <div>, or <a> when the whole card links)',
    '.m-card-header': 'Title and description, optionally with actions on the right',
    '.m-card-title': 'Heading (use a real <h2>/<h3>)',
    '.m-card-description': 'Muted supporting text under the title',
    '.m-card-body': 'Main content',
    '.m-card-footer': 'Actions, aligned to the end',
    '[data-variant]': 'elevated (default) | outline | sunken',
    '[data-size]': 'sm | md (default) | lg: padding',
    '[data-interactive]': 'Hover lift for clickable cards (implied on a.m-card)',
  },
  tokens: {
    bg: t.color('Background', ref('color.bg.surface')),
    fg: t.color('Text', ref('color.fg.default')),
    border: t.color('Border colour', ref('color.border.default')),
    borderWidth: t.length('Border width', ref('borderWidth.container')),
    radius: t.length('Corner radius', ref('radius.container')),
    shadow: t.shadow('Resting shadow', ref('shadow.md')),
    gap: t.length('Space between header, body and footer', ref('space.4')),
    padding: {
      sm: t.length('Small padding', ref('space.4')),
      md: t.length('Default padding', ref('space.6')),
      lg: t.length('Large padding', ref('space.8')),
    },
    titleFamily: t.fontFamily('Title family', ref('font.heading.family')),
    titleSize: t.length('Title size', ref('font.size.lg')),
    titleWeight: t.fontWeight('Title weight', ref('font.heading.weight')),
    descriptionFg: t.color('Description text', ref('color.fg.muted')),
    descriptionSize: t.length('Description size', ref('font.size.sm')),
    hoverShadow: t.shadow('Shadow on hover (interactive cards)', ref('shadow.lg')),
    hoverBorder: t.color('Border on hover (interactive cards)', ref('color.border.strong')),
    hoverTransform: t.keyword('Transform on hover (interactive cards)', 'translateY(-2px)'),
    outline: {
      bg: t.color('Outline variant background', 'transparent'),
      border: t.color('Outline variant border', ref('color.border.default')),
    },
    sunken: {
      bg: t.color('Sunken variant background', ref('color.bg.sunken')),
      border: t.color('Sunken variant border', ref('color.border.muted')),
    },
  },
  contrast: [
    { fg: 'fg', bg: 'bg', min: 4.5 },
    { fg: 'descriptionFg', bg: 'bg', min: 4.5 },
    { fg: 'fg', bg: 'outline.bg', min: 4.5 },
    { fg: 'fg', bg: 'sunken.bg', min: 4.5 },
    { fg: 'descriptionFg', bg: 'sunken.bg', min: 4.5 },
  ],
  a11y: [
    'Give the card title a real heading element at the right level for the page outline.',
    'For a fully clickable card use <a class="m-card"> around short content; do not nest other links or buttons inside it.',
    'Interactive cards get the global focus ring; do not remove it.',
  ],
});
