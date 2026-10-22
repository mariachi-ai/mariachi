import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const dialog = defineComponent({
  name: 'dialog',
  title: 'Dialog',
  category: 'overlays',
  description: 'A modal window on the native <dialog> element, with header, body, footer and an animated backdrop.',
  useWhen: 'Focused tasks or confirmations that block the page until dismissed. Prefer inline UI when the user may need the page behind it.',
  anatomy: {
    '.m-dialog': 'On <dialog>; open with showModal() or <button commandfor="id" command="show-modal">',
    '.m-dialog-header': 'Title row, with an optional close button at the end',
    '.m-dialog-title': 'Heading; point aria-labelledby at it',
    '.m-dialog-description': 'Optional muted text under the title',
    '.m-dialog-body': 'Scrolls when content is taller than the viewport',
    '.m-dialog-footer': 'Actions, aligned to the end',
    '[data-size]': 'sm | md (default) | lg: width',
    '[data-static]': 'Renders inline (docs and previews), on a <div role="dialog">',
  },
  tokens: {
    bg: t.color('Background', ref('color.bg.raised')),
    fg: t.color('Text', ref('color.fg.default')),
    border: t.color('Border colour', ref('color.border.default')),
    borderWidth: t.length('Border width', ref('borderWidth.container')),
    radius: t.length('Corner radius', ref('radius.container')),
    shadow: t.shadow('Shadow', ref('shadow.overlay')),
    padding: t.length('Padding', ref('space.6')),
    gap: t.length('Space between header, body and footer', ref('space.4')),
    backdrop: t.color('Backdrop (scrim) colour', ref('color.bg.overlay')),
    width: {
      sm: t.length('Small width', '24rem'),
      md: t.length('Default width', '32rem'),
      lg: t.length('Large width', '48rem'),
    },
    titleFamily: t.fontFamily('Title family', ref('font.heading.family')),
    titleSize: t.length('Title size', ref('font.size.xl')),
    titleWeight: t.fontWeight('Title weight', ref('font.heading.weight')),
    descriptionFg: t.color('Description text', ref('color.fg.muted')),
    enterTransform: t.keyword('Transform the dialog animates from when opening', 'translateY(0.5rem) scale(0.98)'),
  },
  contrast: [
    { fg: 'fg', bg: 'bg', min: 4.5 },
    { fg: 'descriptionFg', bg: 'bg', min: 4.5 },
  ],
  a11y: [
    'Open it with showModal() (or command="show-modal") so focus is trapped, the page is inert and Escape closes it.',
    'Point aria-labelledby at the title, and aria-describedby at the description when there is one.',
    'Give the close button an aria-label; a <form method="dialog"> button closes it without JavaScript.',
    'Put initial focus on the least destructive action with the autofocus attribute.',
  ],
});
