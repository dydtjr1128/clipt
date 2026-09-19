import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['.output/', '.wxt/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // 사용자에게 보이는 문자열은 t()로만 가져온다 (i18n 강제)
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/\\S/]',
          message: '화면 문자열은 t("key")로 가져와야 합니다.',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(title|alt|placeholder|aria-label|aria-valuetext)$/] > Literal',
          message: '화면 문자열 속성은 t("key")로 가져와야 합니다.',
        },
      ],
    },
  },
  {
    // Node에서 실행하는 빌드 스크립트
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  prettier,
);
