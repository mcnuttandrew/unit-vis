# requires having https://github.com/YousefED/typescript-json-schema installed globally

typescript-json-schema "index.d.ts" "*" --ignoreErrors > ./showcase/assets/unit-vis-schema.json && node scripts/add-proper-reference.js
