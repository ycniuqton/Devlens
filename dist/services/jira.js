"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJiraClient = createJiraClient;
function createJiraClient(config) {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    async function fetchJira(endpoint) {
        const url = `${config.baseUrl}/rest/api/3${endpoint}`;
        const res = await fetch(url, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
            },
        });
        if (!res.ok)
            throw new Error(`Jira API error: ${res.status}`);
        return res.json();
    }
    function mapStatus(jiraStatus) {
        const lower = jiraStatus.toLowerCase();
        if (lower.includes('done') || lower.includes('closed') || lower.includes('resolved'))
            return 'completed';
        if (lower.includes('progress') || lower.includes('review'))
            return 'in-progress';
        return 'pending';
    }
    function mapPriority(jiraPriority) {
        const lower = jiraPriority.toLowerCase();
        if (lower.includes('high') || lower.includes('critical') || lower.includes('blocker'))
            return 'high';
        if (lower.includes('low') || lower.includes('trivial'))
            return 'low';
        return 'medium';
    }
    return {
        async getIssues(jql) {
            const query = jql || `project = ${config.projectKey} AND status != Done ORDER BY updated DESC`;
            const data = await fetchJira(`/search?jql=${encodeURIComponent(query)}&maxResults=50`);
            return data.issues.map((issue) => ({
                id: issue.id,
                externalId: issue.key,
                title: issue.fields.summary,
                description: issue.fields.description?.content?.[0]?.content?.[0]?.text || '',
                status: mapStatus(issue.fields.status.name),
                priority: mapPriority(issue.fields.priority?.name || 'Medium'),
                source: 'jira',
                url: `${config.baseUrl}/browse/${issue.key}`,
                assignee: issue.fields.assignee?.displayName,
            }));
        },
    };
}
//# sourceMappingURL=jira.js.map