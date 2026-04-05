"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGitService = createGitService;
const simple_git_1 = __importDefault(require("simple-git"));
function createGitService(projectDir) {
    const git = (0, simple_git_1.default)(projectDir);
    return {
        async getDiff(filter) {
            if (filter === 'staged') {
                return git.diff(['--cached']);
            }
            if (filter === 'unstaged') {
                return git.diff();
            }
            // All: combine unstaged + staged
            const unstaged = await git.diff();
            const staged = await git.diff(['--cached']);
            return [unstaged, staged].filter(Boolean).join('\n');
        },
        async getStatus() {
            const status = await git.status();
            const files = [];
            for (const f of status.modified) {
                files.push({ path: f, status: 'modified', staged: false });
            }
            for (const f of status.not_added) {
                files.push({ path: f, status: 'untracked', staged: false });
            }
            for (const f of status.deleted) {
                files.push({ path: f, status: 'deleted', staged: false });
            }
            for (const f of status.created) {
                files.push({ path: f, status: 'added', staged: true });
            }
            for (const f of status.staged) {
                if (!files.some(x => x.path === f)) {
                    files.push({ path: f, status: 'modified', staged: true });
                }
            }
            for (const f of status.renamed) {
                files.push({ path: f.to, status: 'renamed', staged: true });
            }
            return files;
        },
        async getLog(limit = 20) {
            const log = await git.log({ maxCount: limit });
            return log.all.map((entry) => ({
                hash: entry.hash.substring(0, 8),
                message: entry.message,
                author: entry.author_name,
                date: entry.date,
            }));
        },
        async isRepo() {
            return git.checkIsRepo();
        },
    };
}
//# sourceMappingURL=git.js.map