import { debug } from '@actions/core';
import { getOctokit } from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// Creating custom types for the GitHub API.
type GetIssueResponse = RestEndpointMethodTypes['issues']['get']['response'];
type Issue = GetIssueResponse['data'];
type ListIssuesForRepoResponse = RestEndpointMethodTypes['issues']['listForRepo']['response'];

export type FullIssue = Issue & {
    due_date: Date;
    reminders: Date[];
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
    public async getAllIssuesWithDueDate(): Promise<FullIssue[]> {
        const issues: Issue[] = await this.getAllOpenIssues();

        let issuesWithDueDate: FullIssue[] = [];
        for (const issue of issues) {
            const issueHeader: string = issue.body.split('---')[0];
            const dueDate: Date | null = this.extractDueDate(issueHeader);
            if (dueDate) {
                const reminders: Date[] = this.extractReminders(issueHeader);
                let newIssue: FullIssue = issue as FullIssue;
                newIssue.due_date = dueDate;
                newIssue.reminders = reminders;
                debug(
                    `Issue ${issue.number} has due date ${dueDate.toUTCString()}, ` +
                        `reminders:\n${reminders}`,
                );
                issuesWithDueDate.push(newIssue);
            }
        }

        return issuesWithDueDate;
    }

    /**
     * Extract's the due date from the issue body. The due date is expected to be in format YYYY-MM-DD.
     * @param bodyHeader
     * @returns The due date or null if the due date is not found.
     */
    private extractDueDate(bodyHeader: string): Date | null {
        const regex: RegExp = /\s*due-date: (\d{4}-\d{2}-\d{2})\s*/;
        const match: RegExpMatchArray | null = bodyHeader.match(regex);

        if (match) {
            const dueDate: string = match[1];
            const dueTime: string = this.extractDueTime(bodyHeader);
            const timeZone: string = this.extractTimeZone(bodyHeader);

            if (dueTime && timeZone) {
                return new Date(`${dueDate} ${dueTime} ${timeZone}`);
            }

            if (dueTime) {
                return new Date(`${dueDate} ${dueTime}`);
            }

            if (timeZone) {
                return new Date(`${dueDate} ${timeZone}`);
            }

            return new Date(dueDate);
        }

        return null;
    }

    /**
     * Extract's the due time from the issue body. The due time is expected to be in format HH:MM.
     * @param bodyHeader the body of the issue.
     * @returns The due time or null if the due time is not found.
     */
    private extractDueTime(bodyHeader: string): string | null {
        const regex: RegExp = /\s*due-time: (\d{2}:\d{2})\s*/;
        const match: RegExpMatchArray | null = bodyHeader.match(regex);

        if (match) {
            return match[1];
        }

        return null;
    }

    /**
     * Extract's the time zone from the issue body. The time zone is expected to be in format UTC[+|-]HH:MM.
     * @param bodyHeader the body of the issue.
     * @returns The due time or null if the due time is not found.
     */
    private extractTimeZone(bodyHeader: string): string | null {
        const regex: RegExp = /\s*time-zone: (UTC[+|-]\d{2}:\d{2})\s*/;
        const match: RegExpMatchArray | null = bodyHeader.match(regex);

        if (match) {
            return match[1];
        }
    }

    /**
     * Extract's the reminders from the issue body. It is possible to specify the time unit
     * in the reminder, multiple times. The reminders are expected to be in the following format:
     * reminders: 1m 2h 3d 4w
     * @param bodyHeader the body of the issue.
     * @returns The due time or null if the due time is not found.
     */
    private extractReminders(bodyHeader: string): Date[] | null {
        const regex: RegExp = /\s*reminders:( \d+(m|h|d|w))+\s*/;
        const match: RegExpMatchArray | null = bodyHeader.match(regex);

        if (match) {
            const remindersStr: string = match[1];

            const regexTimes: RegExp = /\s*\d+(m|h|d|w)+\s*/;
            const matches: RegExpMatchArray | null = remindersStr.match(regexTimes);

            if (matches) {
                let reminders: Date[] = [];
                for (const reminderStr of matches) {
                    let reminder: Date = new Date();

                    try {
                        if (reminderStr.includes('m')) {
                            const minutes: number = parseInt(reminderStr.replace('m', ''), 10);
                            reminder = new Date(reminder.getTime() - minutes * 60 * 1000);
                        }

                        if (reminderStr.includes('h')) {
                            const hours: number = parseInt(reminderStr.replace('h', ''), 10);
                            reminder = new Date(reminder.getTime() - hours * 60 * 60 * 1000);
                        }

                        if (reminderStr.includes('d')) {
                            const days: number = parseInt(reminderStr.replace('d', ''), 10);
                            reminder = new Date(reminder.getTime() - days * 24 * 60 * 60 * 1000);
                        }

                        if (reminderStr.includes('w')) {
                            const weeks: number = parseInt(reminderStr.replace('w', ''), 10);
                            reminder = new Date(
                                reminder.getTime() - weeks * 7 * 24 * 60 * 60 * 1000,
                            );
                        }

                        debug(`Found reminder: ${reminderStr} result is ${reminder.toString()}`);
                        reminders.push(reminder);
                    } catch (error) {
                        debug(`Error parsing reminder: ${reminderStr}`);
                    }
                }

                return reminders;
            }
        }
    }

    /**
     * Calculates the time left until the due date, taking into account time zones.
     * @param issue issue with a due date.
     * @returns Time until due date.
     */
    public getTimeLeftUntilDueDate(issue: FullIssue): number {
        const dueDate: Date = issue.due_date;
        const now: Date = new Date();

        debug(`Issue: ${issue.number} Now: ${now.toString()} | Due date: ${dueDate.toString()}`);

        return dueDate.getTime() - now.getTime();
    }

    /**
     * Calculates the time left until the due date.
     * @param issue issue with a due date.
     * @returns Number of days until due date.
     */
    public getDaysLeftUntilDueDate(issue: FullIssue): number {
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
    public getMinutesLeftUntilDueDate(issue: FullIssue): number {
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
        const originalLabels: string[] = issue.labels.map((label: any) => label.name);
        debug(`Original labels for issue ${issue.number}:\n${originalLabels}`);

        // Remove labels in the 'labelsToRemove' array.
        let labelsToSet: string[] = originalLabels.filter(
            (label: string) => !labelsToRemove.includes(label),
        );
        debug(`Filtered labels for issue ${issue.number}:\n${labelsToSet}`);

        // Add labels in the 'labelsToKeep' array.
        labelsToSet = labelsToSet.concat(labelsToAdd);
        debug(`Setting labels for issue ${issue.number}:\n${labelsToSet}`);

        await this.octo.rest.issues.setLabels({
            owner: this.repositoryOwner,
            repo: this.repository,
            issue_number: issue.number,
            labels: labelsToSet,
        });
    }
}
