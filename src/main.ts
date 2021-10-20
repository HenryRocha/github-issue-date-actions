import { debug, getInput, setFailed } from '@actions/core';
import { context } from '@actions/github';
import DateActions, { FullIssue } from './dateActions';

async function main() {
    const OVERDUE_LABEL = 'overdue';
    const DUE_TODAY_LABEL = 'due-today';
    const DUE_SOON_LABEL = 'due-soon';
    const DUE_LATER_LABEL = 'due-later';
    const ALL_LABELS = [OVERDUE_LABEL, DUE_TODAY_LABEL, DUE_SOON_LABEL, DUE_LATER_LABEL];

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
        const daysUntilDueDate: number = dateActions.getDaysLeftUntilDueDate(issue);

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
