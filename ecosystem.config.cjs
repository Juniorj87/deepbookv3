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
    },
    {
      name: "oracle-audit",
      script: "scripts/research/oracle-audit-service.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "10s",
      restart_delay: 5000,
      time: true,
      env: {
        NODE_ENV: "production",
        ORACLE_AUDIT_INTERVAL_MS: "60000",
        BTC_ORACLE_ID: "0x2101cdc11cac0c98ea2f15366dc5b2ea5541ed2844bcb7198d7c89a91a8feb9f",
        ETH_ORACLE_ID: "0x0991b671810f8b622313dc088719543f75a7c9b53a062a075ff5b7c15f166870",
        DEEP_ORACLE_ID: "0x865772c2353a5d0eff8da31052eb68be17976bb58d7af12c2e81664b15704b29",
      },
      error_file: "logs/oracle-audit.err.log",
      out_file: "logs/oracle-audit.out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    },
    {
      name: "metrics-collector",
      script: "scripts/research/metrics-service.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "10s",
      restart_delay: 5000,
      time: true,
      env: {
        NODE_ENV: "production",
        METRICS_INTERVAL_MS: "300000",
      },
      error_file: "logs/metrics-collector.err.log",
      out_file: "logs/metrics-collector.out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
