import { defineComponent } from '../../contract/component';
import { ref, t } from '../../contract/tokens';

export const kbd = defineComponent({
  name: 'kbd',
  title: 'Keyboard key',
  category: 'content',
  description: 'A key or key combination, drawn as a keycap.',
  useWhen: 'Documenting shortcuts (Ctrl + K) in help text, menus and tooltips.',
  anatomy: {
    '.m-kbd': 'On a <kbd>; nest one per key for combinations',
  },
  tokens: {
    fontFamily: t.fontFamily('Key font', ref('font.family.mono')),
    fontSize: t.length('Key text size', ref('font.size.xs')),
    fontWeight: t.fontWeight('Key text weight', ref('font.weight.medium')),
    bg: t.color('Keycap background', ref('color.bg.surface')),
    fg: t.color('Keycap text', ref('color.fg.default')),
    border: t.color('Keycap border', ref('color.border.strong')),
    borderWidth: t.length('Keycap border width', ref('borderWidth.thin')),
    radius: t.length('Keycap radius', ref('radius.sm')),
    shadow: t.shadow('Keycap shadow (the key\'s depth)', 'inset 0 -1px 0 var(--m-color-border-strong)'),
    height: t.length('Keycap height', '1.5em'),
    paddingX: t.length('Keycap horizontal padding', ref('space.1')),
  },
  contrast: [{ fg: 'fg', bg: 'bg', min: 4.5 }],
  a11y: [
    'Use a real <kbd> so the semantics survive copying and reader modes.',
    'Spell out symbols that screen readers skip: write "Ctrl" rather than "⌃", or add aria-label="Command".',
  ],
});
