import { debug, getInput, setFailed } from '@actions/core';
import { context } from '@actions/github';
import DateActions, { FullIssue } from './dateActions';

async function main() {
    const OVERDUE_LABEL = 'overdue' || getInput('OVERDUE_LABEL');
    const DUE_TODAY_LABEL = 'due-today' || getInput('DUE_TODAY_LABEL');
    const DUE_SOON_LABEL = 'due-soon' || getInput('DUE_SOON_LABEL');
    const DUE_LATER_LABEL = 'due-later' || getInput('DUE_LATER_LABEL');
    const ALL_LABELS = [OVERDUE_LABEL, DUE_TODAY_LABEL, DUE_SOON_LABEL, DUE_LATER_LABEL];

    const REMINDER_WINDOW: number = 30 || parseInt(getInput('REMINDER_WINDOW'));
    const GITHUB_TOKEN: string = getInput('GITHUB_TOKEN');

    // Check if the token is set
    if (!GITHUB_TOKEN) {
        setFailed('GITHUB_TOKEN environment variable is not set.');
        return;
    }

    // Create the DateActions object
    const dateActions: DateActions = new DateActions(
        GITHUB_TOKEN,
        context.repo.repo,
        context.repo.owner,
    );

    const issues: FullIssue[] = await dateActions.getAllIssuesWithDueDate();
    for (const issue of issues) {
        const now: Date = new Date();
        const daysUntilDueDate: number = dateActions.getDaysUntilDate(issue.due_date);

        debug(
            `Issue: ${issue.number} | ` +
                `Now: ${now.toString()} | ` +
                `Due date: ${issue.due_date.toString()} ` +
                `Days until: ${daysUntilDueDate}`,
        );

        let comments: string[] = [];
        issue.reminders.forEach((reminder) => {
            // Check if today is equal to the reminder date.
            if (
                now.getFullYear() === reminder.getFullYear() &&
                now.getMonth() === reminder.getMonth() &&
                now.getDate() === reminder.getDate()
            ) {
                const hoursLeftUntilDueDate: number =
                    dateActions.getHoursUntilDate(issue.due_date) % 24;
                const minutesLeftUntilDueDate: number =
                    dateActions.getMinutesUntilDate(issue.due_date) % 60;
                const minutesLeftUntilReminder: number = dateActions.getMinutesUntilDate(reminder);

                // If the time is within the reminder window, comment on the issue.
                if (minutesLeftUntilReminder >= 0 && minutesLeftUntilReminder <= REMINDER_WINDOW) {
                    debug(
                        `Commenting on issue ${issue.number} since ` +
                            `there's still ${minutesLeftUntilReminder} until the reminder date.`,
                    );
                    const assignees: string = issue.assignees
                        .map((assignee) => '@' + assignee.login)
                        .join(', ');

                    comments.push(
                        `${assignees}\nThis issue is due in ` +
                            `${daysUntilDueDate} days ` +
                            `${hoursLeftUntilDueDate} hours ` +
                            `${minutesLeftUntilDueDate} minutes.`,
                    );
                }
            }
        });

        if (comments.length > 0) {
            dateActions.commentOnIssue(issue.number, comments[0]);
        }

        // Depending on the time until the due date, add to the issue a label
        // describing the time until the due date.
        // If the issue already has a label, remove it first.
        if (daysUntilDueDate < 0) {
            debug(`Issue ${issue.number} is being set to ${OVERDUE_LABEL}.`);
            await dateActions.setLabels(issue, ALL_LABELS, [OVERDUE_LABEL]);
        } else if (daysUntilDueDate == 0) {
            debug(`Issue ${issue.number} is being set to ${DUE_TODAY_LABEL}.`);
            await dateActions.setLabels(issue, ALL_LABELS, [DUE_TODAY_LABEL]);
        } else if (daysUntilDueDate <= 3) {
            debug(`Issue ${issue.number} is being set to ${DUE_SOON_LABEL}.`);
            await dateActions.setLabels(issue, ALL_LABELS, [DUE_SOON_LABEL]);
        } else {
            debug(`Issue ${issue.number} is being set to ${DUE_LATER_LABEL}.`);
            await dateActions.setLabels(issue, ALL_LABELS, [DUE_LATER_LABEL]);
        }
    }
}

main();
