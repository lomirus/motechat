/** @type {import("stylelint").Config} */
export default {
  plugins: ["@stylistic/stylelint-plugin"],
  rules: {
    "@stylistic/indentation": 2,
    "@stylistic/block-opening-brace-newline-after": "always",
    "@stylistic/block-closing-brace-newline-before": "always",
    "@stylistic/block-closing-brace-newline-after": "always",
    "@stylistic/declaration-block-semicolon-newline-after": "always",
  },
}
