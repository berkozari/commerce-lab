/** Keep pagination URLs canonical and avoid non-integer/overflow query input. */
export function readOrderPage(raw: string | null): number {
    if (!raw || !/^[1-9]\d*$/.test(raw)) return 1;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : 1;
}

export function totalOrderPages(total: number, limit: number): number {
    return Math.max(1, Math.ceil(total / Math.max(1, limit)));
}
