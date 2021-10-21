import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

// Creating custom types for the GitHub API.
export type ListIssuesForRepoResponse =
    RestEndpointMethodTypes['issues']['listForRepo']['response'];

// Defining the issue types.
export type Issue = RestEndpointMethodTypes['issues']['get']['response']['data'];

export type FullIssue = Issue & {
    due_date: Date;
    reminders: Date[];
};
