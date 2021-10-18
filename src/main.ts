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
    // const octokit: Octokit = github.getOctokit(GITHUB_TOKEN);
    const dateActions: DateActions = new DateActions(
        GITHUB_TOKEN,
        context.repo.repo,
        context.repo.owner,
    );

    const issues: IssueWithDueDate[] = await dateActions.getAllIssuesWithDueDate();
    console.log(issues);
}

main();
