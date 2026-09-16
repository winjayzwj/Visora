export function resolveWebOrigin(configuredOrigin, pageOrigin, development) {
    const value = configuredOrigin?.trim();
    let current;

    try {
        current = new URL(pageOrigin);
    } catch {
        return null;
    }

    if (!value) {
        return development ? null : current.origin;
    }

    try {
        const target = new URL(value);

        if (
            (target.protocol !== "http:" && target.protocol !== "https:") ||
            target.origin !== value ||
            target.protocol !== current.protocol ||
            target.hostname !== current.hostname
        ) {
            return null;
        }

        return target.origin;
    } catch {
        return null;
    }
}
