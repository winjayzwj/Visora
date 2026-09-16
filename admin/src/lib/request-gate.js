export function createRequestGate() {
    let revision = 0;

    return {
        issue() {
            revision += 1;
            return revision;
        },
        invalidate() {
            revision += 1;
        },
        current() {
            return revision;
        },
        isCurrent(ticket) {
            return ticket === revision;
        },
    };
}
