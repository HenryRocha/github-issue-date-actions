import { getOctokit } from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// Creating custom types for the GitHub API.
type GetIssueResponse = RestEndpointMethodTypes['issues']['get']['response'];
type Issue = GetIssueResponse['data'];
type ListIssuesForRepoResponse = RestEndpointMethodTypes['issues']['listForRepo']['response'];

export type IssueWithDueDate = Issue & {
    due_date: Date;
};

export default class DateActions {
    private readonly octo: InstanceType<typeof GitHub>;
    private readonly repository: string;
    private readonly repositoryOwner: string;

    constructor(GITHUB_TOKEN: string, repository: string, repositoryOwner: string) {
        this.octo = getOctokit(GITHUB_TOKEN);
        this.repository = repository;
        this.repositoryOwner = repositoryOwner;
    }

    /**
     * Returns the issues that are open.
     * @returns An array of issues.
     */
    private async getAllOpenIssues(): Promise<Issue[]> {
        const listIssuesResponse: ListIssuesForRepoResponse =
            await this.octo.rest.issues.listForRepo({
                owner: this.repositoryOwner,
                repo: this.repository,
                state: 'open',
            });

        // Filter out all the issues that have the 'pull_request' key.
        // Needed because this endpoint returns both issues and pull requests.
        // See https://docs.github.com/en/rest/reference/issues#list-repository-issues
        return listIssuesResponse.data.filter((issue: Issue) => !issue.pull_request);
    }

    /**
     * Returns the issue.
     * @param issueNumber The issue number.
     * @returns The issue.
     */
    private async getIssue(issueNumber: number): Promise<Issue> {
        const issueResponse: GetIssueResponse = await this.octo.rest.issues.get({
            owner: this.repositoryOwner,
            repo: this.repository,
            issue_number: issueNumber,
        });

        return issueResponse.data;
    }

    /**
     * Get all issues with due date defined.
     */
    public async getAllIssuesWithDueDate(): Promise<IssueWithDueDate[]> {
        const issues: Issue[] = await this.getAllOpenIssues();

        let issuesWithDueDate: IssueWithDueDate[] = [];
        for (const issue of issues) {
            const dueDate: Date | null = this.extractDueDate(issue.body);
            if (dueDate) {
                let newIssue: IssueWithDueDate = issue as IssueWithDueDate;
                newIssue.due_date = dueDate;
                issuesWithDueDate.push(newIssue);
            }
        }

        return issuesWithDueDate;
    }

    /**
     * Extract's the due date from the issue body. The due date is expected to be in format YYYY-MM-DD.
     * It is also expected that the due date is defined inside an HTML comment.
     * @param body
     */
    private extractDueDate(body: string): Date | null {
        const regex: RegExp = /<!--\s*due: (\d{4}-\d{2}-\d{2})\s*-->/;
        const match: RegExpMatchArray | null = body.match(regex);

        if (match) {
            const dueDate: string = match[1];
            const dueTime: string = this.extractDueTime(body);

            if (dueTime) {
                return new Date(`${dueDate} ${dueTime}`);
            }

            return new Date(dueDate);
        }

        return null;
    }

    /**
     * Extract's the due time from the issue body. The due time is expected to be in format HH:MM.
     * It is also expected that the due time is defined inside an HTML comment.
     * @param body
     */
    private extractDueTime(body: string): string {
        const regex: RegExp = /<!--\s*due-time: (\d{2}:\d{2})\s*-->/;
        const match: RegExpMatchArray | null = body.match(regex);

        if (match) {
            return match[1];
        }

        return '';
    }
}
