import { getOctokit } from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { FullIssue, Issue, ListIssuesForRepoResponse } from './types';

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
                const reminders: Date[] = this.extractReminders(issueHeader, dueDate);
                let newIssue: FullIssue = issue as FullIssue;
                newIssue.due_date = dueDate;
                newIssue.reminders = reminders;
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
    private extractReminders(bodyHeader: string, issueDueDate: Date): Date[] | null {
        const regex: RegExp = /\s*reminders:( \d+(m|h|d|w))+\s*/g;
        const match: RegExpMatchArray | null = bodyHeader.match(regex);

        if (match) {
            const remindersStr: string = match[0];

            const regexTimes: RegExp = /\s*\d+(m|h|d|w)+\s*/g;
            const matches: RegExpMatchArray | null = remindersStr.match(regexTimes);

            if (matches) {
                let reminders: Date[] = [];
                for (const reminderStr of matches) {
                    let reminder: Date = issueDueDate;

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

                        reminders.push(reminder);
                    } catch (error) {
                        console.warn(`Error parsing reminder: ${reminderStr}`);
                    }
                }

                return reminders;
            }
        }
    }

    /**
     * Sets the labels on the given issue.
     * @param issueNumber the number of the issue.
     * @param labelsToRemove list labels to remove from the issue.
     * @param labelsToAdd list labels to add to the issue.
     */
    public async setIssueLabels(
        issue: Issue,
        labelsToRemove: string[],
        labelsToAdd: string[],
    ): Promise<void> {
        console.info(`Adding ${labelsToAdd} to issue #${issue.number}.`);

        const originalLabels: string[] = issue.labels.map((label: any) => label.name);

        // Remove labels in the 'labelsToRemove' array.
        let labelsToSet: string[] = originalLabels.filter(
            (label: string) => !labelsToRemove.includes(label),
        );

        // Add labels in the 'labelsToKeep' array.
        labelsToSet = labelsToSet.concat(labelsToAdd);

        // If the labels to set are the same as the original labels, no need to update.
        if (labelsToSet.every((label: string) => originalLabels.includes(label))) {
            console.info(`Not updating labels for issue #${issue.number}, no changes.`);
            return;
        }

        await this.octo.rest.issues.setLabels({
            owner: this.repositoryOwner,
            repo: this.repository,
            issue_number: issue.number,
            labels: labelsToSet,
        });
    }

    /**
     * Comments on the given issue.
     * @param issueNumber the number of the issue.
     * @param comment what to comment.
     */
    public async commentOnIssue(issueNumber: number, comment: string): Promise<void> {
        await this.octo.rest.issues.createComment({
            owner: this.repositoryOwner,
            repo: this.repository,
            issue_number: issueNumber,
            body: comment,
        });
    }
}
