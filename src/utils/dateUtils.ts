/**
 * Calculates the time left until the given date.
 * @param start start date.
 * @param end end date. Default is current date.
 * @returns Time until due date.
 */
export function getTimeUntilDate(start: Date, end: Date = new Date()): number {
    return start.getTime() - end.getTime();
}

/**
 * Calculates the minutes left until the given date.
 * @param start start date.
 * @param end end date. Default is current date.
 * @returns Minutes until due date.
 */
export function getMinutesUntilDate(date: Date, end: Date = new Date()): number {
    return Math.floor(getTimeUntilDate(date, end) / (1000 * 60));
}

/**
 * Calculates the hours left until the given date.
 * @param start start date.
 * @param end end date. Default is current date.
 * @returns hours until due date.
 */
export function getHoursUntilDate(date: Date, end: Date = new Date()): number {
    return Math.floor(getMinutesUntilDate(date, end) / 60);
}

/**
 * Calculates the days left until the given date.
 * @param start start date.
 * @param end end date. Default is current date.
 * @returns days until due date.
 */
export function getDaysUntilDate(date: Date, end: Date = new Date()): number {
    return Math.floor(getMinutesUntilDate(date, end) / (60 * 24));
}
