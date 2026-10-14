module.exports = {
  apps: [
    {
      name: 'furnix-estimates-api',
      cwd: 'apps/api',
      script: 'dist/server.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
