import unusedImports from "eslint-plugin-unused-imports";
import reactCompiler from "eslint-plugin-react-compiler";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const reactCompilerRecommended = {
  ...reactCompiler.configs["recommended"],
  files: ["src/**/*.{js,jsx,ts,tsx,mdx}"],
  ignores: ["src/**/__tests__/**", "src/**/*.test.*", "tests/**"],
};

const eslintConfig = [
  reactCompilerRecommended,
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "public/**/*.js",
      "docs/reference/**",
      "archive/**",
    ],
  },
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
