import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default defineConfig([
    { ignores: ["**/*.mjs", "**/*.js"] },
    ...obsidianmd.configs.recommended,
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tsparser,
            parserOptions: { project: "./tsconfig.json" },
            globals: {
                ...globals.browser,
                console: "readonly",
            },
        },

        // You can add your own configuration to override or add rules
    },
]);
