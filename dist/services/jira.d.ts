import { ExternalTask } from '../types';
interface JiraConfig {
    baseUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
}
export declare function createJiraClient(config: JiraConfig): {
    getIssues(jql?: string): Promise<ExternalTask[]>;
};
export {};
