module.exports = {
  env: {
    es2021: true,
    node: true,
  },
  extends: "standard-with-typescript",
  overrides: [
    {
      env: {
        node: true,
      },
      files: [".eslintrc.{js,cjs}"],
      parserOptions: {
        sourceType: "script",
      },
    },
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "n/no-callback-literal": "off",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-floating-promises": "off",
    "@typescript-eslint/strict-boolean-expressions": "off",
    "@typescript-eslint/no-var-requires": "off",
    "no-constant-condition": "off",
    "no-callback-literal": "off",
    "@typescript-eslint/ban-types": "off",
    "@typescript-eslint/no-extraneous-class": "off",
    "@typescript-eslint/naming-convention": [
      "error",
      {
        selector: "variable",
        format: ["camelCase", "PascalCase", "UPPER_CASE", "snake_case"],
      },
    ],
    "@typescript-eslint/quotes": [
      "error",
      "double",
      {
        avoidEscape: true,
      },
    ],
    "@typescript-eslint/semi": ["error", "always"],
    "@typescript-eslint/comma-dangle": ["error", "always-multiline"],
    "@typescript-eslint/space-before-function-paren": "off",
    "@typescript-eslint/member-delimiter-style": "off",
    "@typescript-eslint/promise-function-async": "off",
    "@typescript-eslint/consistent-type-imports": "off",
    "@typescript-eslint/return-await": "off",
    "@typescript-eslint/indent": "off",
    "import/first": "off",
    "import/no-named-default": "off",
    "no-new": "off",
  },
};
