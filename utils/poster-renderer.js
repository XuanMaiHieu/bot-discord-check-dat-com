/**
 * Vẽ poster trong tiến trình con tồn tại ngắn.
 *
 * Thư viện vẽ (@napi-rs/canvas) giữ lại RAM sau mỗi đợt vẽ và tăng dần theo
 * ngày (đo thử: 111MB -> 524MB sau 20 đợt x 30 poster). Bot chạy liên tục qua pm2
 * nên không vẽ trong tiến trình chính: mỗi đợt bật 1 tiến trình con, vẽ xong thì
 * tắt, hệ điều hành thu hồi hết bộ nhớ.
 */
const path = require("path");
const { fork } = require("child_process");

const WORKER_PATH = path.join(__dirname, "poster-worker.js");
const RENDER_TIMEOUT_MS = 120 * 1000;

/**
 * @param {Array<object>} jobs - Tham số renderMealPoster: { dish, name, date, tomorrow },
 *        hoặc { type: "fuel" | "gold", ...view } (xem poster-worker.js)
 * @returns {Promise<Array<Buffer|null>>} PNG theo đúng thứ tự jobs; null = poster đó vẽ lỗi.
 *          Reject nếu tiến trình con lỗi / quá thời gian (nơi gọi tự dùng thẻ chữ).
 */
function renderPostersInChildProcess(jobs) {
    if (jobs.length === 0) return Promise.resolve([]);

    return new Promise((resolve, reject) => {
        // serialization "advanced" truyền được Date và dữ liệu nhị phân qua IPC
        const child = fork(WORKER_PATH, [], {
            serialization: "advanced",
            stdio: ["ignore", "inherit", "inherit", "ipc"],
        });

        let settled = false;
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            callback(value);
        };

        const timer = setTimeout(() => {
            child.kill();
            finish(reject, new Error(`Vẽ poster quá ${RENDER_TIMEOUT_MS / 1000} giây`));
        }, RENDER_TIMEOUT_MS);

        child.once("message", ({ results }) => {
            finish(
                resolve,
                results.map((png) => (png ? Buffer.from(png.buffer, png.byteOffset, png.byteLength) : null))
            );
        });
        child.once("error", (error) => finish(reject, error));
        child.once("exit", (code) => {
            finish(reject, new Error(`Tiến trình vẽ poster thoát bất thường (code ${code})`));
        });

        child.send({ jobs });
    });
}

module.exports = { renderPostersInChildProcess };
