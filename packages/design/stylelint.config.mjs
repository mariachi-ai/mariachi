/**
 * Design-library CSS rules. Components read tokens only: no colour literals anywhere, and no raw
 * lengths for radius, shadows or font sizes inside components. Custom properties are either
 * contract tokens (`--m-*`) or private to a rule (`--_*`).
 */
const colorFunctions = ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'];

export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': colorFunctions,
    'custom-property-pattern': ['^(m-[a-z0-9-]+|_[a-z0-9-]+|shiki-[a-z0-9-]+)$', { message: 'Use --m-* tokens or --_* private properties' }],
    'selector-class-pattern': ['^m-[a-z0-9-]+$', { message: 'Classes are prefixed m-' }],
    'keyframes-name-pattern': ['^m-[a-z0-9-]+$', { message: 'Keyframes are prefixed m-' }],
    'declaration-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'no-descending-specificity': null,
    'selector-no-vendor-prefix': null,
    'property-no-vendor-prefix': null,
    'declaration-block-no-redundant-longhand-properties': null,
  },
  overrides: [
    {
      files: ['src/components/**/*.css'],
      rules: {
        'declaration-property-value-disallowed-list': [
          {
            '/^border(-.*)?-radius$/': ['/\\d(px|rem|em)/'],
            'box-shadow': ['/\\d(px|rem|em)/'],
            'font-size': ['/^\\d/'],
          },
          { message: 'Use a token for radius, shadow and font size' },
        ],
      },
    },
  ],
};
