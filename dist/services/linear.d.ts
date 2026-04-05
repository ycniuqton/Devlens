import { ExternalTask } from '../types';
interface LinearConfig {
    apiKey: string;
    teamId?: string;
}
export declare function createLinearClient(config: LinearConfig): {
    getIssues(): Promise<ExternalTask[]>;
};
export {};
