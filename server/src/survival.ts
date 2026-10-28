export const DAY_SECONDS = 10 * 60;
export const NIGHT_SECONDS = 5 * 60;
export const CYCLE_SECONDS = DAY_SECONDS + NIGHT_SECONDS;
export const FIRE_START_RADIUS = 320;
export const FIRE_MIN_RADIUS = 112;
export const FIRE_MAX_RADIUS = 560;
export const FIRE_DECAY_PER_SECOND = 0.22;
export const FIRE_STOKE_COST = 4;
export const FIRE_STOKE_GROWTH = 64;

export function dayNightAt(time: number) {
    const safeTime = Math.max(0, Number.isFinite(time) ? time : 0);
    const phase = safeTime % CYCLE_SECONDS;
    const night = phase >= DAY_SECONDS;
    return {
        night,
        phase,
        secondsLeft: Math.ceil(night ? CYCLE_SECONDS - phase : DAY_SECONDS - phase),
        nightIndex: Math.floor(safeTime / CYCLE_SECONDS),
    };
}

export function fireRadiusAt(radius: number, updatedAt: number, time: number) {
    const base = Math.max(FIRE_MIN_RADIUS, Math.min(FIRE_MAX_RADIUS, Number(radius) || FIRE_START_RADIUS));
    const elapsed = Math.max(0, (Number(time) || 0) - (Number(updatedAt) || 0));
    return Math.max(FIRE_MIN_RADIUS, base - elapsed * FIRE_DECAY_PER_SECOND);
}

export function insideFirelight(x: number, y: number, radius: number, centerX = 256, centerY = 256) {
    return Math.hypot(x - centerX, y - centerY) <= radius;
}

export function nightBuffed(x: number, y: number, time: number, radius: number) {
    return dayNightAt(time).night && !insideFirelight(x, y, radius);
}

export function constrainDarkspawn(x: number, y: number, radius: number, mobSize: number, centerX = 256, centerY = 256) {
    const dx = x - centerX, dy = y - centerY;
    const distance = Math.hypot(dx, dy);
    const minDistance = radius + Math.max(0, mobSize) + 4;
    if (distance >= minDistance)
        return { x, y, moved: false };
    const length = distance || 1;
    return { x: centerX + dx / length * minDistance, y: centerY + dy / length * minDistance, moved: true };
}
