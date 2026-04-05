"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWatcher = createWatcher;
const chokidar_1 = __importDefault(require("chokidar"));
function createWatcher(projectDir, onChange) {
    let debounceTimer = null;
    const watcher = chokidar_1.default.watch(projectDir, {
        ignored: [
            /(^|[\/\\])\../, // dotfiles
            '**/node_modules/**',
            '**/.git/**',
            '**/.devlens/**',
        ],
        persistent: true,
        ignoreInitial: true,
    });
    const debouncedOnChange = () => {
        if (debounceTimer)
            clearTimeout(debounceTimer);
        debounceTimer = setTimeout(onChange, 300);
    };
    watcher.on('change', debouncedOnChange);
    watcher.on('add', debouncedOnChange);
    watcher.on('unlink', debouncedOnChange);
    return watcher;
}
//# sourceMappingURL=watcher.js.map