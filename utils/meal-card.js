/**
 * Dựng thẻ hiển thị món ăn bằng Discord Components V2 (Container viền màu,
 * chữ cỡ # to nhất Discord cho phép).
 * Tin V2 phải gửi kèm flags: MessageFlags.IsComponentsV2 và không có `content`,
 * nên thông báo đẩy chỉ hiện tên bot (đã chấp nhận, ưu tiên giao diện thẻ).
 */
const {
    ContainerBuilder,
    ButtonBuilder,
    ButtonStyle,
    SeparatorSpacingSize,
    escapeMarkdown,
} = require("discord.js");
const {
    formatShortDay,
    formatLongDay,
    getWeekdayColor,
    isWeekend,
    startOfDay,
} = require("./workdays");
const { isEmptyMeal } = require("./meal-sheet");
const { getDishEmoji } = require("./dish-emoji");

// customId của nút "📅 Xem cả tuần" (đăng ký trong commands/meal.js)
const MEAL_WEEK_BUTTON_ID = "meal:week";

const EMPTY_MEAL_EMOJI = "⚪";

// Tối đa số người hiển thị khi /abcom khớp nhiều tên (giới hạn 40 component / 4000 ký tự)
const MAX_PEOPLE_IN_CARD = 10;

// Tên món lấy từ sheet: gộp xuống dòng, chặn ký tự markdown làm vỡ định dạng
function cleanDish(dish) {
    return escapeMarkdown(String(dish ?? "").replace(/\s+/g, " ").trim());
}

function cleanText(text) {
    return escapeMarkdown(String(text ?? "").trim());
}

function upper(text) {
    return String(text ?? "").toLocaleUpperCase("vi-VN");
}

function isSameDay(a, b) {
    return startOfDay(a).getTime() === startOfDay(b).getTime();
}

// "🍖 Bắp giò luộc" hoặc "⚪ Chưa đặt cơm"
function dishHeadline(value) {
    return isEmptyMeal(value)
        ? `${EMPTY_MEAL_EMOJI} Chưa đặt cơm`
        : `${getDishEmoji(value)} ${cleanDish(value)}`;
}

// Dạng gọn cho danh sách: "🍗 Gà rang lá chanh" hoặc "⚪ _chưa đặt_"
function dishInline(value) {
    return isEmptyMeal(value)
        ? `${EMPTY_MEAL_EMOJI} _chưa đặt_`
        : `${getDishEmoji(value)} ${cleanDish(value)}`;
}

function makeupBadge(date) {
    return date && isWeekend(date) ? " · 🛠️ LÀM BÙ" : "";
}

function addText(container, content) {
    return container.addTextDisplayComponents((t) => t.setContent(content));
}

function addDivider(container) {
    return container.addSeparatorComponents((s) =>
        s.setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
}

function buildWeekButton() {
    return new ButtonBuilder()
        .setCustomId(MEAL_WEEK_BUTTON_ID)
        .setLabel("Xem cả tuần")
        .setEmoji("📅")
        .setStyle(ButtonStyle.Secondary);
}

/**
 * Thẻ báo cơm lúc 12h.
 * @param {object} p
 * @param {string} p.name - Tên người đặt
 * @param {Date} p.date - Ngày hôm nay
 * @param {string} p.food - Món hôm nay
 * @param {{date: Date, value: string}|null} p.tomorrow - Món ngày mai; null = không hiện dòng này
 * @param {string|null} p.posterFileName - Tên file poster đính kèm. Có poster thì thẻ
 *        gồm poster + nút; không có thì thẻ ghi đầy đủ thông tin bằng chữ.
 */
function buildDailyMealCard({ name, date, food, tomorrow = null, posterFileName = null }) {
    const container = new ContainerBuilder().setAccentColor(getWeekdayColor(date));

    if (posterFileName) {
        container.addMediaGalleryComponents((g) =>
            g.addItems((item) =>
                item
                    .setURL(`attachment://${posterFileName}`)
                    .setDescription(`Cơm trưa ${formatLongDay(date)}: ${String(food).trim()} - ${String(name).trim()}`)
            )
        );
    } else {
        addText(container, `-# 🍽️ CƠM TRƯA HÔM NAY · ${upper(formatLongDay(date))}${makeupBadge(date)}`);
        addText(container, `# ${dishHeadline(food)}`);
        addText(container, `-# 👤 ${cleanText(name)}`);

        if (tomorrow) {
            addDivider(container);
            const tomorrowText = isEmptyMeal(tomorrow.value)
                ? `${EMPTY_MEAL_EMOJI} **chưa đặt cơm** — nhớ đặt nhé!`
                : `**${dishInline(tomorrow.value)}**`;
            addText(container, `⏭️ Ngày mai · ${formatShortDay(tomorrow.date)}: ${tomorrowText}`);
        }
    }

    container.addActionRowComponents((row) => row.setComponents(buildWeekButton()));
    return container;
}

/**
 * Thẻ thực đơn các ngày tới (/abcom không nhập ngày, nút "Xem cả tuần").
 * @param {object} p
 * @param {string} p.name
 * @param {Array<{date: Date, value: string}>} p.meals - Từ getUpcomingMeals
 * @param {Date} p.today
 * @param {string} p.sheetName
 * @param {number} p.rowNumber
 */
function buildUpcomingMealsCard({ name, meals, today = new Date(), sheetName, rowNumber }) {
    const container = new ContainerBuilder().setAccentColor(getWeekdayColor(today));
    addText(container, `-# 🍽️ THỰC ĐƠN · ${upper(cleanText(name))}`);

    const allPast = meals.length > 0 && meals.every((m) => startOfDay(m.date) < startOfDay(today));

    if (meals.length === 0) {
        addText(container, "## 📭 Sheet chưa có dữ liệu ngày nào");
    } else if (allPast) {
        // Sheet đã hết ngày (chưa đổi sang tab mới): chỉ liệt kê các ngày gần nhất
        addText(container, "## 🕘 Sheet chưa có ngày nào từ hôm nay trở đi");
        addDivider(container);
        addText(
            container,
            "-# Các ngày gần nhất trên sheet:\n" +
            meals.map((m) => `**${formatShortDay(m.date)}** · ${dishInline(m.value)}`).join("\n")
        );
    } else {
        const [first, ...rest] = meals;
        const firstLabel = isSameDay(first.date, today)
            ? `👉 Hôm nay · ${formatShortDay(first.date)}`
            : `⏭️ Ngày gần nhất · ${formatShortDay(first.date)}`;

        addText(container, `## ${firstLabel}${makeupBadge(first.date)}\n# ${dishHeadline(first.value)}`);

        if (rest.length > 0) {
            addDivider(container);
            addText(
                container,
                rest.map((m) => `**${formatShortDay(m.date)}** · ${dishInline(m.value)}`).join("\n")
            );
        }
    }

    if (sheetName) {
        addText(container, `-# 📄 ${cleanText(sheetName)}${rowNumber ? ` · dòng ${rowNumber}` : ""}`);
    }
    return container;
}

/**
 * Thẻ món của 1 ngày cụ thể (/abcom có nhập day).
 * @param {object} p
 * @param {string} p.name
 * @param {Date|null} p.date - null nếu không đọc được ngày (hiện nguyên dayLabel)
 * @param {string} p.dayLabel - Ngày người dùng nhập
 * @param {string} p.value
 * @param {string} p.position - Ô trên sheet, vd "S8"
 */
function buildSingleDayMealCard({ name, date, dayLabel, value, position }) {
    const container = new ContainerBuilder().setAccentColor(
        date ? getWeekdayColor(date) : getWeekdayColor(new Date())
    );
    const dayText = date ? formatLongDay(date) : cleanText(dayLabel);

    addText(container, `-# 🍽️ MÓN NGÀY ${upper(dayText)}${makeupBadge(date)} · ${upper(cleanText(name))}`);
    addText(container, `# ${dishHeadline(value)}`);
    if (position) addText(container, `-# 📄 Ô ${cleanText(position)}`);
    return container;
}

/**
 * Thẻ khi /abcom khớp nhiều người.
 * @param {object} p
 * @param {string} p.query
 * @param {Date} p.today
 * @param {Array} p.people - [{ name, meals }] hoặc [{ name, date, dayLabel, value }]
 */
function buildMultipleMealsCard({ query, today = new Date(), people }) {
    const container = new ContainerBuilder().setAccentColor(getWeekdayColor(today));
    addText(container, `-# 🔎 TÌM THẤY ${people.length} NGƯỜI KHỚP "${upper(cleanText(query))}"`);

    for (const person of people.slice(0, MAX_PEOPLE_IN_CARD)) {
        addDivider(container);

        let body;
        if (person.meals) {
            body = person.meals.length
                ? person.meals
                    .map((m) => {
                        const line = `**${formatShortDay(m.date)}** · ${dishInline(m.value)}`;
                        return isSameDay(m.date, today) ? `👉 ${line}` : line;
                    })
                    .join("\n")
                : "_Không có dữ liệu các ngày tới_";
        } else {
            const dayText = person.date ? formatShortDay(person.date) : cleanText(person.dayLabel);
            body = `**${dayText}** · ${dishInline(person.value)}`;
        }

        addText(container, `### 👤 ${cleanText(person.name)}\n${body}`);
    }

    const hidden = people.length - MAX_PEOPLE_IN_CARD;
    if (hidden > 0) {
        addText(container, `-# … và ${hidden} người khác, nhập tên cụ thể hơn để xem`);
    }
    return container;
}

/**
 * Thẻ nhắc đứng dậy lúc 12h: lời nhắc cỡ chữ # kèm GIF.
 * @param {object} p
 * @param {string} p.message - Không cần markdown, thẻ tự làm to
 * @param {string|null} p.gifUrl
 * @param {string} [p.footer] - Dòng chữ nhỏ dưới GIF (bỏ trống = không có)
 * @param {Date} p.date
 */
function buildStandupCard({ message, gifUrl, footer = null, date = new Date() }) {
    const container = new ContainerBuilder().setAccentColor(getWeekdayColor(date));
    addText(container, `# ${message}`);
    if (gifUrl) {
        container.addMediaGalleryComponents((g) => g.addItems((item) => item.setURL(gifUrl)));
    }
    if (footer) addText(container, `-# ${footer}`);
    return container;
}

module.exports = {
    MEAL_WEEK_BUTTON_ID,
    getDishEmoji,
    buildDailyMealCard,
    buildUpcomingMealsCard,
    buildSingleDayMealCard,
    buildMultipleMealsCard,
    buildStandupCard,
};
