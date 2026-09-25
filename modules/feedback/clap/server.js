/**
 * Web server nhỏ cho trang pháo tay (quét QR trên thẻ cảm ơn).
 *
 *   GET  /c/<mã>        trang vỗ tay
 *   POST /c/<mã>/clap   { count } -> { accepted, total }
 *
 * <mã> là chuỗi ngẫu nhiên lưu trong data/feedback/clap-secret.txt, để bot quét
 * cổng trên internet không vô tình spam. Không đọc được dữ liệu nào khác của bot,
 * không lưu IP (pháo tay ẩn danh).
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const store = require("../store");

const PAGE = fs.readFileSync(path.join(__dirname, "page.html"), "utf8");

const MAX_BODY_BYTES = 1024;
const CLAPS_PER_MINUTE_PER_IP = 200;
const NOTIFY_MIN_INTERVAL_MS = 60 * 1000; // admin nhận tối đa 1 tin / phút
const NOTIFY_GATHER_MS = 15 * 1000; // chờ gom cả tràng vỗ tay rồi mới báo

function loadSecret(dataDir) {
    const file = path.join(dataDir, "clap-secret.txt");
    try {
        const secret = fs.readFileSync(file, "utf8").trim();
        if (secret) return secret;
    } catch (error) {
        // chưa có: tạo mới bên dưới
    }
    const secret = crypto.randomBytes(6).toString("base64url");
    fs.writeFileSync(file, secret, "utf8");
    return secret;
}

// Giới hạn số cú vỗ tay mỗi IP mỗi phút (chỉ giữ trong bộ nhớ)
function createRateLimiter() {
    const windows = new Map(); // ip -> { start, used }
    return function allow(ip, requested) {
        const now = Date.now();
        let w = windows.get(ip);
        if (!w || now - w.start > 60 * 1000) {
            w = { start: now, used: 0 };
            windows.set(ip, w);
        }
        const accepted = Math.max(0, Math.min(requested, CLAPS_PER_MINUTE_PER_IP - w.used));
        w.used += accepted;
        if (windows.size > 5000) windows.clear(); // chặn phình bộ nhớ
        return accepted;
    };
}

// Gom pháo tay rồi DM admin (ẩn danh)
function createNotifier(ctx) {
    let pending = 0;
    let timer = null;
    let lastSentAt = 0;

    async function flush() {
        timer = null;
        const count = pending;
        pending = 0;
        if (count === 0) return;
        lastSentAt = Date.now();
        try {
            await ctx.client.users
                .fetch(ctx.adminId)
                .then((admin) =>
                    admin.send(`👏 Có người vừa gửi **${count}** tràng pháo tay cho admin! _(tổng: ${store.getClapTotal()})_`)
                );
        } catch (error) {
            console.error("❌ Không DM được admin về pháo tay:", error.message);
        }
    }

    return function add(count) {
        pending += count;
        if (timer) return;
        const wait = Math.max(NOTIFY_GATHER_MS, lastSentAt + NOTIFY_MIN_INTERVAL_MS - Date.now());
        timer = setTimeout(flush, wait);
        timer.unref?.();
    };
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error("body too large"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
    res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
}

/**
 * Bật server. Trả về { url, close } (url = link trong QR).
 * @param {object} ctx
 * @param {object} options - { port, publicUrl }
 */
function startClapServer(ctx, { port, publicUrl }) {
    const secret = loadSecret(ctx.dataDir("feedback"));
    const pagePath = `/c/${secret}`;
    const allow = createRateLimiter();
    const notify = createNotifier(ctx);

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, "http://localhost");

            if (req.method === "GET" && url.pathname === pagePath) {
                const html = PAGE.replace("__CLAP_ENDPOINT__", `${pagePath}/clap`).replace(
                    "__CLAP_TOTAL__",
                    String(store.getClapTotal())
                );
                send(res, 200, html, "text/html; charset=utf-8");
                return;
            }

            if (req.method === "POST" && url.pathname === `${pagePath}/clap`) {
                const body = JSON.parse((await readBody(req)) || "{}");
                const requested = Math.floor(Number(body.count));
                if (!Number.isFinite(requested) || requested <= 0) {
                    send(res, 400, "bad count");
                    return;
                }
                const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
                const accepted = allow(ip, Math.min(requested, CLAPS_PER_MINUTE_PER_IP));
                const total = accepted > 0 ? store.addClaps(accepted) : store.getClapTotal();
                if (accepted > 0) notify(accepted);
                send(res, 200, JSON.stringify({ accepted, total }), "application/json");
                return;
            }

            send(res, 404, "👏 Không có gì ở đây cả");
        } catch (error) {
            send(res, 400, "bad request");
        }
    });

    server.on("error", (error) => {
        console.error(`❌ Web pháo tay không chạy được ở cổng ${port}: ${error.message}`);
    });
    server.listen(port, "0.0.0.0", () => {
        console.log(`👏 Web pháo tay: cổng ${port}, link QR ${publicUrl.replace(/\/$/, "")}${pagePath}`);
    });

    return { url: `${publicUrl.replace(/\/$/, "")}${pagePath}`, close: () => server.close() };
}

module.exports = { startClapServer };
