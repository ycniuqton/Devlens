"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const path_1 = __importDefault(require("path"));
const server_1 = require("./server");
const pkg = require('../package.json');
const program = new commander_1.Command();
program
    .name('devlens')
    .description('Developer dashboard with real-time git diffs and task board')
    .version(pkg.version)
    .option('-p, --port <number>', 'Port to listen on', '4700')
    .option('--no-open', 'Do not open browser automatically')
    .option('--tunnel', 'Enable Cloudflare Tunnel for remote access')
    .option('-d, --dir <path>', 'Project directory to analyze', process.cwd())
    .action(async (opts) => {
    const options = {
        port: parseInt(opts.port, 10),
        projectDir: path_1.default.resolve(opts.dir),
        openBrowser: opts.open !== false,
        tunnel: opts.tunnel || false,
    };
    const { httpServer } = (0, server_1.createServer)(options);
    httpServer.listen(options.port, () => {
        const url = `http://localhost:${options.port}`;
        console.log(`\n  Devlens running at ${url}`);
        console.log(`  Watching: ${options.projectDir}\n`);
        if (options.openBrowser) {
            Promise.resolve().then(() => __importStar(require('open'))).then((mod) => mod.default(url)).catch(() => { });
        }
        if (options.tunnel) {
            Promise.resolve().then(() => __importStar(require('./services/tunnel'))).then((mod) => {
                mod.startTunnel(options.port).then((tunnelUrl) => {
                    console.log(`  Tunnel: ${tunnelUrl}\n`);
                });
            }).catch((err) => {
                console.log(`  Tunnel failed: ${err.message}\n`);
            });
        }
    });
});
program.parse();
//# sourceMappingURL=index.js.map