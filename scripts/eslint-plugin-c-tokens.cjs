/** @type {import('eslint').Rule.RuleModule} */
const colorLiteralPattern =
  /#([0-9a-fA-F]{3,8})\b|\brgb\s*\(|\brgba\s*\(|\bhsl\s*\(|-\[#/g;

const noRawColorLiteral = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw hex/rgb/hsl color literals and Tailwind arbitrary color classes (C-TOKENS)",
    },
    schema: [],
    messages: {
      forbidden:
        "Raw color literal is forbidden (C-TOKENS). Use CSS variables from styles/tokens.css and semantic Tailwind classes.",
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    const text = sourceCode.getText();

    return {
      Program() {
        for (const match of text.matchAll(colorLiteralPattern)) {
          const index = match.index ?? 0;
          const loc = sourceCode.getLocFromIndex(index);
          context.report({
            loc: {
              start: loc,
              end: sourceCode.getLocFromIndex(index + match[0].length),
            },
            messageId: "forbidden",
          });
        }
      },
    };
  },
};

/** @type {import('eslint').ESLint.Plugin} */
module.exports = {
  rules: {
    "no-raw-color-literal": noRawColorLiteral,
  },
};
