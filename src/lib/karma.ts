const KEY_POINTS = "em_karma_points";
const KEY_STREAK = "em_karma_streak";
const KEY_LAST = "em_karma_last_date";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getKarma(): { points: number; streak: number } {
  return {
    points: parseInt(localStorage.getItem(KEY_POINTS) ?? "0", 10),
    streak: parseInt(localStorage.getItem(KEY_STREAK) ?? "0", 10),
  };
}

export function recordCompletion(): { points: number; streak: number } {
  const today = todayStr();
  const last = localStorage.getItem(KEY_LAST);
  const points = parseInt(localStorage.getItem(KEY_POINTS) ?? "0", 10) + 10;

  let streak = parseInt(localStorage.getItem(KEY_STREAK) ?? "0", 10);
  if (last === today) {
    // same day — only add points, streak unchanged
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    streak = last === yesterday.toISOString().slice(0, 10) ? streak + 1 : 1;
    localStorage.setItem(KEY_LAST, today);
  }

  localStorage.setItem(KEY_POINTS, String(points));
  localStorage.setItem(KEY_STREAK, String(streak));
  return { points, streak };
}
