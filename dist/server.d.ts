import http from 'http';
import { ServerOptions } from './types';
export declare function createServer(options: ServerOptions): {
    app: import("express-serve-static-core").Express;
    httpServer: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    wss: import("ws").Server<typeof import("ws"), typeof http.IncomingMessage>;
};
