import { ExternalTask } from '../types';

interface LinearConfig {
  apiKey: string;
  teamId?: string;
}

export function createLinearClient(config: LinearConfig) {
  async function query(graphql: string, variables: Record<string, any> = {}) {
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: graphql, variables }),
    });
    if (!res.ok) throw new Error(`Linear API error: ${res.status}`);
    const data: any = await res.json();
    if (data.errors) throw new Error(data.errors[0].message);
    return data.data;
  }

  function mapStatus(state: string): ExternalTask['status'] {
    const lower = state.toLowerCase();
    if (lower.includes('done') || lower.includes('completed') || lower.includes('canceled')) return 'completed';
    if (lower.includes('progress') || lower.includes('started') || lower.includes('review')) return 'in-progress';
    return 'pending';
  }

  function mapPriority(priority: number): ExternalTask['priority'] {
    if (priority <= 1) return 'high';
    if (priority >= 3) return 'low';
    return 'medium';
  }

  return {
    async getIssues(): Promise<ExternalTask[]> {
      const teamFilter = config.teamId ? `(filter: { team: { id: { eq: "${config.teamId}" } } })` : '';
      const data = await query(`
        query {
          issues${teamFilter} {
            nodes {
              id
              identifier
              title
              description
              url
              priority
              state { name }
              assignee { name }
            }
          }
        }
      `);
      return data.issues.nodes.map((issue: any) => ({
        id: issue.id,
        externalId: issue.identifier,
        title: issue.title,
        description: issue.description || '',
        status: mapStatus(issue.state?.name || 'Backlog'),
        priority: mapPriority(issue.priority),
        source: 'linear' as const,
        url: issue.url,
        assignee: issue.assignee?.name,
      }));
    },
  };
}
