import { getInput, setFailed } from '@actions/core';
import { context } from '@actions/github';
import DateActions, { IssueWithDueDate } from './dateActions';

async function main() {
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

    const issues: IssueWithDueDate[] = await dateActions.getAllIssuesWithDueDate();
    for (const issue of issues) {
        const timeUntilDueDate: number = dateActions.getDaysLeftUntilDueDate(issue);

        // Depending on the time until the due date, add to the issue a label
        // describing the time until the due date.
        // If the issue already has a label, remove it first.
        if (timeUntilDueDate <= 0) {
            await dateActions.addLabel(issue, 'overdue');
        } else if (timeUntilDueDate <= 3) {
            await dateActions.addLabel(issue, 'due-soon');
        } else if (timeUntilDueDate <= 7) {
            await dateActions.addLabel(issue, 'due-later');
        }
    }
}

main();
