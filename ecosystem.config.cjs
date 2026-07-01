module.exports = {
  apps: [
    {
      name: "oracle-feed",
      script: "scripts/services/multi-oracle-feed.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "10s",
      restart_delay: 5000,
      max_memory_restart: "500M",
      time: true,
      env: {
        NODE_ENV: "production",
      },
      error_file: "logs/oracle-feed.err.log",
      out_file: "logs/oracle-feed.out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    },
    {
      name: "oracle-trader",
      script: "dist/oracle-feed.cjs",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "10s",
      restart_delay: 10000,
      max_memory_restart: "500M",
      time: true,
      env: {
        NODE_ENV: "production",
      },
      error_file: "logs/oracle-trader.err.log",
      out_file: "logs/oracle-trader.out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    },
    {
      name: "dashboard-server",
      script: "serve.cjs",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
      restart_delay: 2000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
      error_file: "logs/dashboard-server.err.log",
      out_file: "logs/dashboard-server.out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    },
    {
      name: "research-platform",
      script: "scripts/research/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
      restart_delay: 3000,
      time: true,
      env: {
        NODE_ENV: "production",
        RESEARCH_PORT: "3003",
      },
      error_file: "logs/research-platform.err.log",
      out_file: "logs/research-platform.out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
