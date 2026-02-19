module.exports = {
  overrides: [
    {
      files: ['*.cjs'],
      env: { node: true, commonjs: true },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'import/no-commonjs': 'off',
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
  ],
};
