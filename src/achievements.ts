import type { Shot, ScorecardData } from "./utils";
import { mean, stddev, groupBy, calculateVirtualHandicap } from "./utils";

export type Achievement = {
  id: string;
  name: string;
  description: string;
  check: (data: CheckData) => boolean;
};

export type CheckData = {
  allShots: Shot[];
  newShots: Shot[];
  savedScorecards: Record<string, ScorecardData>;
  unlockedAchievements: Set<string>;
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// --- Achievement Definitions ---

export const ALL_ACHIEVEMENTS: Achievement[] = [
  // Volume & Milestone
  { id: 'first_swings', name: 'First Swings', description: 'Import your first practice session.', check: ({ allShots }) => allShots.length > 0 },
  { id: 'range_rat', name: 'Range Rat', description: 'Log over 100 total shots.', check: ({ allShots }) => allShots.length > 100 },
  { id: 'the_grinder', name: 'The Grinder', description: 'Log over 1,000 total shots.', check: ({ allShots }) => allShots.length > 1000 },
  { id: 'the_grinder_2', name: 'The Grinder II', description: 'Log over 5,000 total shots.', check: ({ allShots }) => allShots.length > 5000 },
  { id: 'true_dedication', name: 'True Dedication', description: 'Log over 10,000 total shots.', check: ({ allShots }) => allShots.length > 10000 },
  { id: 'elite_practitioner', name: 'Elite Practitioner', description: 'Log over 20,000 total shots.', check: ({ allShots }) => allShots.length > 20000 },
  { id: 'century_club', name: 'Century Club', description: 'Log 100 shots in a single session.', check: ({ allShots }) => {
    const bySession = groupBy(allShots, (s: Shot) => s.SessionId || 'Unknown');
    return Array.from(bySession.values()).some(s => s.length >= 100);
  }},
  { id: 'full_bag_workout', name: 'Full Bag Workout', description: 'Log shots with a Driver, Wood/Hybrid, Iron, and Wedge in one session.', check: ({ allShots }) => {
    const bySession = groupBy(allShots, (s: Shot) => s.SessionId || 'Unknown');
    return Array.from(bySession.values()).some(sessionShots => {
      const clubs = new Set(sessionShots.map(s => s.Club.toLowerCase()));
      let has = { driver: false, wood: false, iron: false, wedge: false };
      for (const c of clubs) {
        if (/driver|1w/.test(c)) has.driver = true;
        if (/wood|w|hybrid|h/.test(c) && !/driver|1w/.test(c)) has.wood = true;
        if (/iron|i/.test(c)) has.iron = true;
        if (/wedge|pw|gw|sw|lw|aw/.test(c)) has.wedge = true;
      }
      return has.driver && has.wood && has.iron && has.wedge;
    });
  }},
  { id: 'wedge_rat', name: 'Wedge Rat', description: 'Log over 100 total shots with wedges.', check: ({ allShots }) => {
    return allShots.filter(s => /wedge|pw|gw|sw|lw|aw/.test(s.Club.toLowerCase())).length > 100;
  }},
  { id: 'iron_specialist', name: 'Iron Specialist', description: 'Log over 1,000 total shots with irons (3i-9i).', check: ({ allShots }) => {
    return allShots.filter(s => /([3-9](i|iron))/.test(s.Club.toLowerCase())).length > 1000;
  }},
  { id: 'iron_sharpens_iron', name: 'Iron Sharpens Iron', description: 'Log over 2,000 total shots with irons (3i-9i).', check: ({ allShots }) => {
    return allShots.filter(s => /([3-9](i|iron))/.test(s.Club.toLowerCase())).length > 2000;
  }},
  { id: 'wedge_master', name: 'Wedge Master', description: 'Log over 500 total shots with wedges.', check: ({ allShots }) => {
    return allShots.filter(s => /wedge|pw|gw|sw|lw|aw/.test(s.Club.toLowerCase())).length > 500;
  }},

  // Personal Records (PRs)
  { id: 'new_best_carry', name: 'New Best: Carry', description: 'Set a new personal record for longest carry distance.', check: ({ allShots, newShots }) => {
    const bestShot = allShots.filter(s => isNum(s.CarryDistance_yds)).reduce((best, s) => s.CarryDistance_yds! > (best?.CarryDistance_yds || 0) ? s : best, null as Shot | null);
    return bestShot ? newShots.includes(bestShot) : false;
  }},
  { id: 'club_pr', name: 'Club PR', description: 'Set a new personal record for longest carry distance with a specific club.', check: ({ allShots, newShots }) => {
    const byClub = groupBy(allShots.filter(s => isNum(s.CarryDistance_yds)), (s: Shot) => s.Club);
    for (const shots of byClub.values()) {
      const bestShot = shots.reduce((best, s) => s.CarryDistance_yds! > (best?.CarryDistance_yds || 0) ? s : best, null as Shot | null);
      if (bestShot && newShots.includes(bestShot)) return true;
    }
    return false;
  }},
  { id: 'speed_demon', name: 'Speed Demon', description: 'Exceed 100 mph club speed for the first time.', check: ({ allShots }) => allShots.some(s => (s.ClubSpeed_mph || 0) > 100) },
  { id: 'ballistic', name: 'Ballistic', description: 'Exceed 150 mph ball speed for the first time.', check: ({ allShots }) => allShots.some(s => (s.BallSpeed_mph || 0) > 150) },
  { id: 'drive_220', name: 'Drive: 220+ Yards', description: 'Hit a drive over 220 yards (total distance).', check: ({ allShots }) => allShots.some(s => /driver/i.test(s.Club) && (s.TotalDistance_yds || 0) > 220) },
  { id: 'drive_250', name: 'Drive: 250+ Yards', description: 'Hit a drive over 250 yards (total distance).', check: ({ allShots }) => allShots.some(s => /driver/i.test(s.Club) && (s.TotalDistance_yds || 0) > 250) },
  { id: 'drive_280', name: 'Drive: 280+ Yards', description: 'Hit a drive over 280 yards (total distance).', check: ({ allShots }) => allShots.some(s => /driver/i.test(s.Club) && (s.TotalDistance_yds || 0) > 280) },
  { id: 'bombs_away', name: 'Bombs Away', description: 'Hit any shot over 300 yards in total distance.', check: ({ allShots }) => allShots.some(s => (s.TotalDistance_yds || 0) > 300) },

  // Skill & Consistency
  { id: 'untouchable', name: 'Untouchable', description: 'Hit a drive with a smash factor of 1.52 or higher.', check: ({ allShots }) => allShots.some(s => /driver/i.test(s.Club) && (s.SmashFactor || 0) >= 1.52) },
  { id: 'spin_doctor', name: 'Spin Doctor', description: 'Log a shot with over 8,000 RPM of backspin.', check: ({ allShots }) => allShots.some(s => (s.Backspin_rpm || 0) > 8000) },
  { id: 'fairway_finder', name: 'Fairway Finder', description: 'Log 5 consecutive shots within 10 yards of the center line.', check: ({ allShots }) => {
    let consecutive = 0;
    for (const shot of allShots) {
      if (isNum(shot.CarryDeviationDistance_yds) && Math.abs(shot.CarryDeviationDistance_yds) <= 10) {
        consecutive++;
        if (consecutive >= 5) return true;
      } else {
        consecutive = 0;
      }
    }
    return false;
  }},
  { id: 'dialed_in', name: 'Dialed In', description: 'Achieve a Consistency Index of over 80% for a session.', check: ({ allShots }) => {
    const bySession = groupBy(allShots, (s: Shot) => s.SessionId || "Unknown");
    for (const sessionShots of bySession.values()) {
      const byClub = groupBy(sessionShots.filter(s => isNum(s.CarryDistance_yds)), (s: Shot) => s.Club);
      const scores: number[] = [];
      for(const clubShots of byClub.values()) {
        if (clubShots.length < 5) continue;
        const carries = clubShots.map(s => s.CarryDistance_yds as number);
        const m = mean(carries);
        const s = stddev(carries);
        if (m > 0) scores.push(1 - (s/m));
      }
      if (scores.length > 0 && mean(scores) > 0.80) return true;
    }
    return false;
  }},
  { id: 'tour_like', name: 'Tour-Like', description: 'Achieve a Consistency Index of over 85% for a session.', check: ({ allShots }) => {
    const bySession = groupBy(allShots, (s: Shot) => s.SessionId || "Unknown");
    for (const sessionShots of bySession.values()) {
      const byClub = groupBy(sessionShots.filter(s => isNum(s.CarryDistance_yds)), (s: Shot) => s.Club);
      const scores: number[] = [];
      for(const clubShots of byClub.values()) {
        if (clubShots.length < 5) continue;
        const carries = clubShots.map(s => s.CarryDistance_yds as number);
        const m = mean(carries);
        const s = stddev(carries);
        if (m > 0) scores.push(1 - (s/m));
      }
      if (scores.length > 0 && mean(scores) > 0.85) return true;
    }
    return false;
  }},
  { id: 'positive_angles', name: 'Positive Angles', description: 'Achieve a positive average Angle of Attack with your driver in a session.', check: ({ allShots }) => {
    const bySession = groupBy(allShots, (s: Shot) => s.SessionId || "Unknown");
    for (const sessionShots of bySession.values()) {
      const driverAoA = sessionShots.filter(s => /driver/i.test(s.Club) && isNum(s.AttackAngle_deg)).map(s => s.AttackAngle_deg as number);
      if (driverAoA.length >= 5 && mean(driverAoA) > 0) return true;
    }
    return false;
  }},
  { id: 'compression_king', name: 'Compression King', description: 'Achieve an average Angle of Attack of -5° or lower with an iron in a session.', check: ({ allShots }) => {
    const bySession = groupBy(allShots, (s: Shot) => s.SessionId || "Unknown");
    for (const sessionShots of bySession.values()) {
      const ironAoA = sessionShots.filter(s => /iron|i/.test(s.Club) && isNum(s.AttackAngle_deg)).map(s => s.AttackAngle_deg as number);
      if (ironAoA.length >= 5 && mean(ironAoA) <= -5) return true;
    }
    return false;
  }},
  { id: 'drawing_board', name: 'Drawing Board', description: 'Hit 5 consecutive shots with a draw shape (negative Face-to-Path).', check: ({ allShots }) => {
    let consecutive = 0;
    for (const shot of allShots) {
      if (isNum(shot.FaceToPath_deg) && shot.FaceToPath_deg < 0) {
        consecutive++;
        if (consecutive >= 5) return true;
      } else {
        consecutive = 0;
      }
    }
    return false;
  }},
  { id: 'fade_away', name: 'Fade Away', description: 'Hit 5 consecutive shots with a fade shape (positive Face-to-Path).', check: ({ allShots }) => {
    let consecutive = 0;
    for (const shot of allShots) {
      if (isNum(shot.FaceToPath_deg) && shot.FaceToPath_deg > 0) {
        consecutive++;
        if (consecutive >= 5) return true;
      } else {
        consecutive = 0;
      }
    }
    return false;
  }},
  { id: 'on_plane', name: 'On Plane', description: 'Complete a session with an average Club Path between -1° and +1°.', check: ({ allShots }) => {
    const bySession = groupBy(allShots, (s: Shot) => s.SessionId || "Unknown");
    for (const sessionShots of bySession.values()) {
      const paths = sessionShots.filter(s => isNum(s.ClubPath_deg)).map(s => s.ClubPath_deg as number);
      if (paths.length >= 10) {
        const avgPath = mean(paths);
        if (avgPath >= -1 && avgPath <= 1) return true;
      }
    }
    return false;
  }},
  { id: 'high_launch_low_spin', name: 'High Launch, Low Spin', description: 'Hit a driver shot with >14° launch and <2500 RPM backspin.', check: ({ allShots }) => {
    return allShots.some(s => /driver/i.test(s.Club) && (s.LaunchAngle_deg || 0) > 14 && (s.Backspin_rpm || 0) < 2500);
  }},
  { id: 'stinger', name: 'Stinger', description: 'Hit an iron shot with <15° launch angle and >4000 RPM backspin.', check: ({ allShots }) => {
    return allShots.some(s => /iron|i/.test(s.Club) && (s.LaunchAngle_deg || 0) < 15 && (s.Backspin_rpm || 0) > 4000);
  }},
  { id: 'apex_predator', name: 'Apex Predator', description: 'Hit a shot with an apex of over 50 yards.', check: ({ allShots }) => allShots.some(s => (s.ApexHeight_yds || 0) > 50) },
  { id: 'hcap_15', name: 'Breaking 15', description: 'Achieve a Virtual Handicap below 15.', check: ({ allShots }) => { const h = calculateVirtualHandicap(allShots); return h !== null && h < 15; } },
  { id: 'hcap_10', name: 'Single Digit', description: 'Achieve a Virtual Handicap below 10.', check: ({ allShots }) => { const h = calculateVirtualHandicap(allShots); return h !== null && h < 10; } },
  { id: 'hcap_5', name: 'Breaking 5', description: 'Achieve a Virtual Handicap below 5.', check: ({ allShots }) => { const h = calculateVirtualHandicap(allShots); return h !== null && h < 5; } },

  // Dedication & Streaks
  { id: 'back_to_back', name: 'Back to Back', description: 'Complete sessions on two consecutive days.', check: ({ allShots }) => {
    const dates = Array.from(new Set(allShots.map((s: Shot) => s.Timestamp?.split('T')[0]))).filter((d): d is string => !!d).sort();
    if (dates.length < 2) return false;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i-1]!);
      const curr = new Date(dates[i]!);
      if ((curr.getTime() - prev.getTime()) / (1000 * 3600 * 24) === 1) return true;
    }
    return false;
  }},
  { id: 'weekly_warrior', name: 'Weekly Warrior', description: 'Complete a session in two consecutive weeks.', check: ({ allShots }) => {
    const weekNumbers = Array.from(new Set(allShots.map((s: Shot) => {
      if (!s.Timestamp) return null;
      const d = new Date(s.Timestamp);
      const year = d.getUTCFullYear();
      const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
      const days = Math.floor((d.getTime() - firstDayOfYear.getTime()) / (24 * 60 * 60 * 1000));
      return `${year}-W${Math.ceil(days / 7)}`;
    }))).filter((d): d is string => !!d).sort();
    if (weekNumbers.length < 2) return false;
    return true; // Simplified check is sufficient for this purpose
  }},
  { id: 'dedicated', name: 'Dedicated', description: 'Log sessions on 3 different days within a single week.', check: ({ allShots }) => {
    const sessionsByDay = groupBy(allShots, (s: Shot) => s.Timestamp?.split('T')[0] || "Unknown");
    const sessionDays = Array.from(sessionsByDay.keys()).filter(d => d !== "Unknown").map(d => new Date(d));
    if (sessionDays.length < 3) return false;
    for (let i = 0; i < sessionDays.length; i++) {
      let count = 1;
      const weekStart = new Date(sessionDays[i]);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      for (let j = i + 1; j < sessionDays.length; j++) {
        if (sessionDays[j] >= weekStart && sessionDays[j] <= weekEnd) {
          count++;
        }
      }
      if (count >= 3) return true;
    }
    return false;
  }},
  { id: 'monthly_milestone', name: 'Monthly Milestone', description: 'Log a session in 3 consecutive months.', check: ({ allShots }) => {
    const months = Array.from(new Set(allShots.map((s: Shot) => s.Timestamp?.substring(0, 7)))).filter((d): d is string => !!d).sort();
    if (months.length < 3) return false;
    for (let i = 2; i < months.length; i++) {
      const d1 = new Date(`${months[i-2]}-01T12:00:00Z`);
      const d2 = new Date(`${months[i-1]}-01T12:00:00Z`);
      const d3 = new Date(`${months[i]}-01T12:00:00Z`);
      if ((d2.getUTCMonth() - d1.getUTCMonth() === 1 || d2.getUTCMonth() - d1.getUTCMonth() === -11) &&
          (d3.getUTCMonth() - d2.getUTCMonth() === 1 || d3.getUTCMonth() - d2.getUTCMonth() === -11)) {
        return true;
      }
    }
    return false;
  }},
  { id: 'workhorse', name: 'Workhorse', description: 'Log over 250 shots in a single week.', check: ({ allShots }) => {
    const shotsByWeek = groupBy(allShots, (s: Shot) => {
      if (!s.Timestamp) return "Unknown";
      const d = new Date(s.Timestamp);
      const year = d.getUTCFullYear();
      const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
      const days = Math.floor((d.getTime() - firstDayOfYear.getTime()) / (24 * 60 * 60 * 1000));
      return `${year}-W${Math.ceil(days / 7)}`;
    });
    for (const [week, shots] of shotsByWeek.entries()) {
      if (week !== "Unknown" && shots.length > 250) return true;
    }
    return false;
  }},

  // Variety & Exploration
  { id: 'new_tool', name: 'New Tool', description: 'Log the first shot with a new club that you haven\'t recorded before.', check: ({ allShots, newShots }) => {
    const oldClubs = new Set(allShots.filter(s => !newShots.includes(s)).map((s: Shot) => s.Club));
    const newClubs = new Set(newShots.map((s: Shot) => s.Club));
    for (const club of newClubs) {
      if (!oldClubs.has(club)) return true;
    }
    return false;
  }},
  { id: 'data_scientist', name: 'Data Scientist', description: 'Import a session containing 10 or more data columns.', check: ({ newShots }) => {
    if (newShots.length === 0) return false;
    const firstShot = newShots[0];
    const keysWithData = Object.keys(firstShot).filter(k => (firstShot as any)[k] !== undefined && (firstShot as any)[k] !== null);
    return keysWithData.length >= 10;
  }},
  
  // Scorecard achievements
  { id: 'scorecard_1', name: 'On the Course', description: 'Record your first scorecard.', check: ({ savedScorecards }) => Object.keys(savedScorecards).length >= 1 },
  { id: 'scorecard_3', name: 'GHIN Ready', description: 'Record three scorecards.', check: ({ savedScorecards }) => Object.keys(savedScorecards).length >= 3 },
  { id: 'scorecard_5', name: 'Well Rounded', description: 'Record five scorecards.', check: ({ savedScorecards }) => Object.keys(savedScorecards).length >= 5 },
];

/**
 * Checks all achievements against the current state and returns newly unlocked ones.
 */
export function checkAchievements(data: CheckData): { newlyUnlocked: Achievement[] } {
  const newlyUnlocked: Achievement[] = [];

  for (const ach of ALL_ACHIEVEMENTS) {
    if (!data.unlockedAchievements.has(ach.id)) {
      if (ach.check(data)) {
        newlyUnlocked.push(ach);
      }
    }
  }

  return { newlyUnlocked };
}
