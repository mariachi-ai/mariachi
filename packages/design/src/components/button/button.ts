import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

const variant = (name: string, v: { bg: string; fg: string; border: string; hoverBg: string; activeBg: string }) => ({
  bg: t.color(`${name} background`, v.bg),
  fg: t.color(`${name} text`, v.fg),
  border: t.color(`${name} border`, v.border),
  hoverBg: t.color(`${name} background on hover`, v.hoverBg),
  activeBg: t.color(`${name} background when pressed`, v.activeBg),
});

export const button = defineComponent({
  name: 'button',
  title: 'Button',
  category: 'actions',
  description: 'Triggers an action. Four variants, three sizes, icon-only and loading states.',
  useWhen: 'Any clickable action. Use a link (<a class="m-button">) when it navigates.',
  anatomy: {
    '.m-button': 'On <button> or <a>',
    '[data-variant]': 'primary | secondary (default) | ghost | danger',
    '[data-size]': 'sm | md (default) | lg',
    '[data-icon-only]': 'Square button holding only an icon; give it aria-label',
    '[aria-busy="true"]': 'Loading: hides the label and shows a spinner',
    ':disabled / [aria-disabled="true"]': 'Disabled',
  },
  tokens: {
    fontFamily: t.fontFamily('Label family', ref('font.body.family')),
    fontSize: t.length('Label size', ref('control.fontSize')),
    fontWeight: t.fontWeight('Label weight', ref('font.weight.medium')),
    textTransform: t.keyword('Label text-transform', 'none'),
    tracking: t.length('Label letter spacing', ref('font.tracking.normal')),
    radius: t.length('Corner radius', ref('radius.control')),
    borderWidth: t.length('Border width', ref('borderWidth.control')),
    shadow: t.shadow('Resting shadow', 'none'),
    hoverShadow: t.shadow('Shadow on hover', ref('components.button.shadow')),
    activeShadow: t.shadow('Shadow when pressed', ref('components.button.shadow')),
    hoverTransform: t.keyword('Transform on hover', 'none'),
    activeTransform: t.keyword('Transform when pressed', 'none'),
    gap: t.length('Space between icon and label', ref('space.2')),
    disabledOpacity: t.number('Opacity when disabled', '0.5'),
    height: {
      sm: t.length('Small height', ref('control.height.sm')),
      md: t.length('Default height', ref('control.height.md')),
      lg: t.length('Large height', ref('control.height.lg')),
    },
    paddingX: {
      sm: t.length('Small horizontal padding', ref('control.paddingX.sm')),
      md: t.length('Default horizontal padding', ref('control.paddingX.md')),
      lg: t.length('Large horizontal padding', ref('control.paddingX.lg')),
    },
    primary: variant('Primary', {
      bg: ref('color.accent.default'),
      fg: ref('color.accent.fg'),
      border: ref('color.accent.default'),
      hoverBg: ref('color.accent.hover'),
      activeBg: ref('color.accent.active'),
    }),
    secondary: variant('Secondary', {
      bg: ref('color.bg.surface'),
      fg: ref('color.fg.default'),
      border: ref('color.border.strong'),
      hoverBg: ref('color.bg.sunken'),
      activeBg: ref('color.border.muted'),
    }),
    ghost: variant('Ghost', {
      bg: 'transparent',
      fg: ref('color.fg.default'),
      border: 'transparent',
      hoverBg: ref('color.bg.sunken'),
      activeBg: ref('color.border.muted'),
    }),
    danger: variant('Danger', {
      bg: ref('color.danger.solid'),
      fg: ref('color.danger.onSolid'),
      border: ref('color.danger.solid'),
      hoverBg: 'color-mix(in oklab, var(--m-color-danger-solid) 88%, black)',
      activeBg: 'color-mix(in oklab, var(--m-color-danger-solid) 78%, black)',
    }),
  },
  contrast: [
    { fg: 'primary.fg', bg: 'primary.bg', min: 4.5 },
    { fg: 'secondary.fg', bg: 'secondary.bg', min: 4.5 },
    { fg: 'secondary.fg', bg: 'secondary.hoverBg', min: 4.5 },
    { fg: 'danger.fg', bg: 'danger.bg', min: 4.5 },
  ],
  a11y: [
    'Use <button type="button"> for actions and <a> for navigation; both get the same styles.',
    'Icon-only buttons need an aria-label.',
    'Prefer aria-disabled="true" over disabled when the button should stay focusable and explain why.',
    'aria-busy="true" hides the label visually but keeps it for screen readers.',
  ],
});
