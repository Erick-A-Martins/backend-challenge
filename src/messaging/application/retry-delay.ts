export function retryDelaySeconds(receiveCount: number, baseSeconds: number, maxSeconds: number): number {
    const exponent = Math.max(receiveCount - 1, 0);
    return Math.min(baseSeconds * 2 ** exponent, maxSeconds);
}
