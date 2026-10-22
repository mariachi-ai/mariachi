// The explorer follows the design library's CSS rules (tokens only), with x- classes for its own shell.
import design from '../design/stylelint.config.mjs';

export default {
  ...design,
  rules: {
    ...design.rules,
    'selector-class-pattern': ['^((m|x)-[a-z0-9-]+|mermaid)$', { message: 'Explorer classes are prefixed x- (library classes m-; mermaid is the library the diagrams need)' }],
  },
  overrides: [],
};
