"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function loadConfig(projectDir) {
    const configFile = path_1.default.join(projectDir, '.devlens', 'config.json');
    if (!fs_1.default.existsSync(configFile)) {
        return {};
    }
    return JSON.parse(fs_1.default.readFileSync(configFile, 'utf-8'));
}
function saveConfig(projectDir, config) {
    const devlensDir = path_1.default.join(projectDir, '.devlens');
    if (!fs_1.default.existsSync(devlensDir)) {
        fs_1.default.mkdirSync(devlensDir, { recursive: true });
    }
    const configFile = path_1.default.join(devlensDir, 'config.json');
    fs_1.default.writeFileSync(configFile, JSON.stringify(config, null, 2));
}
//# sourceMappingURL=config.js.map