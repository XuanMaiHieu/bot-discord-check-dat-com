/**
 * Tiến trình con vẽ poster báo cơm. Nhận 1 lô việc qua IPC, vẽ lần lượt,
 * gửi lại PNG rồi thoát - hệ điều hành thu hồi toàn bộ RAM thư viện vẽ đã dùng.
 * Không chạy trực tiếp file này; dùng renderPostersInChildProcess (poster-renderer.js).
 */
const { renderMealPoster } = require("./meal-poster");

process.once("message", async ({ jobs }) => {
    const results = [];
    for (const job of jobs) {
        try {
            results.push(await renderMealPoster(job));
        } catch (error) {
            console.error(`❌ Không vẽ được poster "${job?.dish}": ${error.message}`);
            results.push(null);
        }
    }
    process.send({ results }, () => process.exit(0));
});
