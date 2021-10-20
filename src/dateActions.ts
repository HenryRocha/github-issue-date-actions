import { getOctokit } from '@actions/github';
import { debug } from '@actions/core';
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
     * @returns An array of issues with due date defined.
     */
    public async getAllIssuesWithDueDate(): Promise<IssueWithDueDate[]> {
        const issues: Issue[] = await this.getAllOpenIssues();

        let issuesWithDueDate: IssueWithDueDate[] = [];
        for (const issue of issues) {
            const dueDate: Date | null = this.extractDueDate(issue.body.split('---')[0]);
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
     * @returns The due date or null if the due date is not found.
     */
    private extractDueDate(body: string): Date | null {
        const regex: RegExp = /\s*due-date: (\d{4}-\d{2}-\d{2})\s*/;
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
     * @param body the body of the issue.
     * @returns The due time or null if the due time is not found.
     */
    private extractDueTime(body: string): string | null {
        const regex: RegExp = /\s*due-time: (\d{2}:\d{2})\s*/;
        const match: RegExpMatchArray | null = body.match(regex);

        if (match) {
            return match[1];
        }

        return null;
    }

    /**
     * Calculates the time left until the due date.
     * @param issue issue with a due date.
     * @returns Time until due date.
     */
    public getTimeLeftUntilDueDate(issue: IssueWithDueDate): number {
        const dueDate: Date = issue.due_date;
        const now: Date = new Date();

        return dueDate.getTime() - now.getTime();
    }

    /**
     * Calculates the time left until the due date.
     * @param issue issue with a due date.
     * @returns Number of days until due date.
     */
    public getDaysLeftUntilDueDate(issue: IssueWithDueDate): number {
        const minutesLeft: number = this.getMinutesLeftUntilDueDate(issue);

        const daysLeft: number = Math.floor(minutesLeft / (60 * 24));
        debug(
            'Days and minutes left until due date' +
                ` for issue ${issue.number} ${daysLeft} ${minutesLeft}.`,
        );

        return daysLeft;
    }

    /**
     * Calculates the number of minutes left until the due date.
     * @param issue issue with a due date.
     * @returns Number of minutes until due date.
     */
    public getMinutesLeftUntilDueDate(issue: IssueWithDueDate): number {
        return Math.floor(this.getTimeLeftUntilDueDate(issue) / (1000 * 60));
    }

    /**
     * Add a label to the given issue.
     * @param issueNumber the number of the issue.
     * @param label the label to add.
     */
    public async addLabel(issue: Issue, label: string): Promise<void> {
        await this.octo.rest.issues.addLabels({
            owner: this.repositoryOwner,
            repo: this.repository,
            issue_number: issue.number,
            labels: [label],
        });
    }

    /**
     * Removes a label from the given issue.
     * @param issueNumber the number of the issue.
     * @param label the label to remove.
     */
    public async removeLabel(issue: Issue, label: string): Promise<void> {
        await this.octo.rest.issues.removeLabel({
            owner: this.repositoryOwner,
            repo: this.repository,
            issue_number: issue.number,
            name: label,
        });
    }

    /**
     * Sets the labels on the given issue.
     * @param issueNumber the number of the issue.
     * @param labelsToRemove list labels to remove from the issue.
     * @param labelsToAdd list labels to add to the issue.
     */
    public async setLabels(
        issue: Issue,
        labelsToRemove: string[],
        labelsToAdd: string[],
    ): Promise<void> {
        // Remove labels in the 'labelsToRemove' array.
        let labelsToSet: string[] = issue.labels
            .map((label: any) => label.name)
            .filter((label: string) => !labelsToRemove.includes(label));

        // Add labels in the 'labelsToKeep' array.
        labelsToSet.concat(labelsToAdd);

        await this.octo.rest.issues.setLabels({
            owner: this.repositoryOwner,
            repo: this.repository,
            issue_number: issue.number,
            labels: labelsToSet,
        });
    }
}
