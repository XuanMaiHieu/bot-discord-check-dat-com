module.exports = {
    apps: [
        {
            name: "bot-check-dat-com",

            // entry file
            script: "./bot.js",

            // thư mục project
            cwd: "/home/abc-dev-data/workspace/code/bot-check-dat-com",

            // chạy 1 instance (bot discord không scale cluster)
            exec_mode: "fork",
            instances: 1,

            // tự restart nếu crash
            autorestart: true,

            // KHÔNG watch file trên server
            watch: false,

            // giới hạn restart để tránh loop vô hạn
            max_restarts: 10,
            restart_delay: 5000,

            // kill nếu treo quá lâu
            kill_timeout: 5000,

            // env production
            env: {
                NODE_ENV: "production",
                TZ: "Asia/Ho_Chi_Minh"
            },

            // log tách riêng
            error_file: "./logs/err.log",
            out_file: "./logs/out.log",
            time: true
        }
    ]
};
