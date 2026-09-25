/**
 * Tiến trình con vẽ ảnh (poster báo cơm, bảng giá). Nhận 1 lô việc qua IPC, vẽ
 * lần lượt, gửi lại PNG rồi thoát - hệ điều hành thu hồi toàn bộ RAM thư viện vẽ đã dùng.
 * Không chạy trực tiếp file này; dùng renderPostersInChildProcess (poster-renderer.js).
 *
 * Mỗi việc: { type: "meal" | "fuel" | "gold", ...dữ liệu } (thiếu type = poster báo cơm)
 */
const RENDERERS = {
    meal: (job) => require("./meal-poster").renderMealPoster(job),
    fuel: (job) => require("./price-posters").renderFuelPoster(job),
    gold: (job) => require("./price-posters").renderGoldPoster(job),
};

process.once("message", async ({ jobs }) => {
    const results = [];
    for (const job of jobs) {
        try {
            results.push(await RENDERERS[job.type || "meal"](job));
        } catch (error) {
            console.error(`❌ Không vẽ được ảnh ${job?.type || "meal"} "${job?.dish || ""}": ${error.message}`);
            results.push(null);
        }
    }
    process.send({ results }, () => process.exit(0));
});
