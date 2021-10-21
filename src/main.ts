import { getInput, setFailed } from '@actions/core';
import { context } from '@actions/github';
import { get } from 'env-var';
import DateActions from './dateActions/dateActions';
import { FullIssue } from './dateActions/types';
import { getDaysUntilDate, getMinutesUntilDate } from './utils/dateUtils';

async function main() {
    // Issue labels.
    const OVERDUE_LABEL = 'overdue' || getInput('OVERDUE_LABEL');
    const DUE_TODAY_LABEL = 'due-today' || getInput('DUE_TODAY_LABEL');
    const DUE_SOON_LABEL = 'due-soon' || getInput('DUE_SOON_LABEL');
    const DUE_LATER_LABEL = 'due-later' || getInput('DUE_LATER_LABEL');
    const ALL_LABELS = [OVERDUE_LABEL, DUE_TODAY_LABEL, DUE_SOON_LABEL, DUE_LATER_LABEL];

    // How far in the future a reminder has to be to trigger a comment.
    // In minutes.
    const REMINDER_WINDOW: number = 30 || parseInt(getInput('REMINDER_WINDOW'));

    // GitHub token to use for API calls.
    const GITHUB_TOKEN: string = getInput('GITHUB_TOKEN') || get('GITHUB_TOKEN').asString();

    // Check if the token is set.
    if (!GITHUB_TOKEN) {
        setFailed('GITHUB_TOKEN environment variable is not set.');
        return;
    }

    const now: Date = new Date();
    console.info(`Current time: ${now.toISOString()}`);

    // Create the DateActions object
    const dateActions: DateActions = new DateActions(
        GITHUB_TOKEN,
        context.repo.repo,
        context.repo.owner,
    );

    const issues: FullIssue[] = await dateActions.getAllIssuesWithDueDate();
    for (const issue of issues) {
        console.info(`Issue #${issue.number} -> Due date: ${issue.due_date.toISOString()}`);

        const daysUntilDueDate: number = getDaysUntilDate(issue.due_date, now);

        let reminderStrs: string = issue.reminders
            .map((reminder) => reminder.toISOString())
            .join('\n\t');
        console.debug(`Issue #${issue.number} has reminders:\n\t${reminderStrs}`);

        let comments: string[] = [];
        issue.reminders.forEach((reminder) => {
            // Check if today is equal to the reminder date.
            if (
                now.getFullYear() === reminder.getFullYear() &&
                now.getMonth() === reminder.getMonth() &&
                now.getDate() === reminder.getDate()
            ) {
                // If the time is within the reminder window, comment on the issue.
                const minutesLeftUntilReminder: number = getMinutesUntilDate(reminder, now);
                if (minutesLeftUntilReminder >= 0 && minutesLeftUntilReminder <= REMINDER_WINDOW) {
                    console.debug(
                        `Reminder ${reminder.toISOString()}, ` +
                            `for issue #${issue.number}, is within reminder ` +
                            `range (${minutesLeftUntilReminder}/${REMINDER_WINDOW})m.`,
                    );
                    const assignees: string = issue.assignees
                        .map((assignee) => '@' + assignee.login)
                        .join(', ');

                    const minutesLeftUntilDueDate: number = getMinutesUntilDate(issue.due_date);

                    comments.push(
                        `${assignees}\nThis issue is due in ` +
                            `${daysUntilDueDate} days ` +
                            `${Math.floor(minutesLeftUntilDueDate / 60)} hours ` +
                            `${minutesLeftUntilDueDate % 60} minutes.`,
                    );
                }
            }
        });

        // This is needed so we don't comment on the same issue multiple times at once.
        if (comments.length > 0) {
            console.info(`Commenting on issue #${issue.number}:\n-->\n${comments[0]}\n<--`);
            dateActions.commentOnIssue(issue.number, comments[0]);
        }

        // Depending on the time until the due date, add to the issue a label
        // describing the time until the due date.
        // If the issue already has a label, remove it first.
        if (daysUntilDueDate < 0) {
            await dateActions.setIssueLabels(issue, ALL_LABELS, [OVERDUE_LABEL]);
        } else if (daysUntilDueDate == 0) {
            await dateActions.setIssueLabels(issue, ALL_LABELS, [DUE_TODAY_LABEL]);
        } else if (daysUntilDueDate <= 3) {
            await dateActions.setIssueLabels(issue, ALL_LABELS, [DUE_SOON_LABEL]);
        } else {
            await dateActions.setIssueLabels(issue, ALL_LABELS, [DUE_LATER_LABEL]);
        }
    }
}

main();
