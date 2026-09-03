const fs = require("fs");
const path = require("path");

const ENV_FILE_PATH = path.join(__dirname, "..", ".env");

// Bọc giá trị trong dấu ngoặc kép nếu có khoảng trắng để dotenv parse đúng
function quoteIfNeeded(value) {
    if (/[\s"]/.test(value)) {
        return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
}

// Cập nhật (hoặc thêm mới) các biến trong file .env, đồng thời áp dụng vào process.env
function updateEnvFile(updates) {
    let content = "";
    try {
        content = fs.readFileSync(ENV_FILE_PATH, "utf8");
    } catch (error) {
        content = "";
    }

    const lines = content.split("\n");
    const remainingKeys = new Set(Object.keys(updates));

    const newLines = lines.map((line) => {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (!match) return line;

        const key = match[1];
        if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;

        remainingKeys.delete(key);
        return `${key}=${quoteIfNeeded(updates[key])}`;
    });

    for (const key of remainingKeys) {
        newLines.push(`${key}=${quoteIfNeeded(updates[key])}`);
    }

    while (newLines.length > 0 && newLines[newLines.length - 1] === "") {
        newLines.pop();
    }

    fs.writeFileSync(ENV_FILE_PATH, newLines.join("\n") + "\n", "utf8");

    for (const [key, value] of Object.entries(updates)) {
        process.env[key] = value;
    }
}

module.exports = { updateEnvFile, ENV_FILE_PATH };
