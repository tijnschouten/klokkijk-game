(() => {
  const GameConfig = {
    questionCount: 10,
    maxQuestionTimeMs: 12000,
    storageKey: "klokkijk:progress:v3",
    maxStoredRoundsPerPlayer: 30,
    practiceRecentLimit: 8,
  };

  const LEVEL_SCORE_FACTORS = {
    1: 0.85,
    2: 0.92,
    3: 1.0,
    4: 1.08,
    5: 1.15,
  };

  const AVAILABLE_AVATARS = [
    "🐱",
    "🦊",
    "🐼",
    "🐸",
    "🦁",
    "🐯",
    "🐵",
    "🐨",
    "🐊",
    "🦈",
    "🐬",
    "🐙",
    "🐳",
    "🦀",
  ];

  const DistractorKind = {
    HAND_SWAP: "handSwap",
    NEAR_MINUTE: "nearMinute",
    HOUR_REFERENCE: "hourReference",
    REFERENCE_ANCHOR_CONFUSION: "referenceAnchorConfusion",
    FALLBACK: "fallback",
  };

  const clampMod = (value, mod) => ((value % mod) + mod) % mod;
  const pad2 = (value) => String(value).padStart(2, "0");

  const shuffle = (items) => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const addMinutes = (time, delta) => {
    const total = clampMod(time.hour24 * 60 + time.minute + delta, 24 * 60);
    return {
      hour24: Math.floor(total / 60),
      minute: total % 60,
    };
  };

  const withHourShift = (time, hourShift) => ({
    hour24: clampMod(time.hour24 + hourShift, 24),
    minute: time.minute,
  });

  const hourTo12 = (hour24) => {
    const h = clampMod(hour24, 12);
    return h === 0 ? 12 : h;
  };

  const minuteStepToLevel = (minuteStep) => {
    if (minuteStep === 60) return 1;
    if (minuteStep === 30) return 2;
    if (minuteStep === 15) return 3;
    return 4;
  };

  const levelToMinuteStep = (level) => {
    if (level === 1) return 60;
    if (level === 2) return 30;
    if (level === 3) return 15;
    return 5;
  };

  const TimeFormatterNL = {
    toDigital(time) {
      return `${pad2(time.hour24)}:${pad2(time.minute)}`;
    },

    toText(time) {
      const m = time.minute;
      const hNow = hourTo12(time.hour24);
      const hNext = hourTo12(time.hour24 + 1);

      if (m === 0) return `${hNow} uur`;
      if (m === 15) return `kwart over ${hNow}`;
      if (m === 30) return `half ${hNext}`;
      if (m === 45) return `kwart voor ${hNext}`;
      if (m < 15) return `${m} over ${hNow}`;
      if (m < 30) return `${30 - m} voor half ${hNext}`;
      if (m < 45) return `${m - 30} over half ${hNext}`;
      return `${60 - m} voor ${hNext}`;
    },

    toTextWithAnchorConfusion(time) {
      const m = time.minute;
      const hNow = hourTo12(time.hour24);
      const hNext = hourTo12(time.hour24 + 1);

      if (m === 0) return `${hNext} uur`;
      if (m === 15) return `kwart over ${hNext}`;
      if (m === 30) return `half ${hNow}`;
      if (m === 45) return `kwart voor ${hNow}`;
      if (m < 15) return `${m} over ${hNext}`;
      if (m < 30) return `${30 - m} voor half ${hNow}`;
      if (m < 45) return `${m - 30} over half ${hNow}`;
      return `${60 - m} voor ${hNow}`;
    },

    anchorHint(time) {
      const m = time.minute;
      if (m === 0 || m < 15 || m === 15) {
        return "Bij 'over' kijk je naar het huidige uur.";
      }
      if (m >= 30) {
        return "Bij 'half' en 'voor' kijk je naar het volgende uur.";
      }
      return "Bij 'voor half' kijk je al naar het volgende uur.";
    },
  };

  const formatMsToSec = (ms) => `${(ms / 1000).toFixed(1)}s`;

  const LearningPath = {
    maxPhase: 5,

    phaseLabel(phase) {
      const labels = {
        1: "Level 1: analoog met cijfers (hele/halve uren)",
        2: "Level 2: analoog met cijfers (tot kwartieren)",
        3: "Level 3: digitaal erbij (tot kwartieren)",
        4: "Level 4: analoog zonder cijfers (5-minuten)",
        5: "Level 5: alles gemixt (5-minuten)",
      };
      return labels[phase] || labels[1];
    },

    getQuestionSpec(phase, index) {
      if (phase === 1) {
        return { type: "analog", minuteStep: index < 5 ? 60 : 30, clockFace: "withNumbers" };
      }
      if (phase === 2) {
        return { type: "analog", minuteStep: index < 4 ? 30 : 15, clockFace: "withNumbers" };
      }
      if (phase === 3) {
        return {
          type: index % 2 === 0 ? "analog" : "digital",
          minuteStep: 15,
          clockFace: "withNumbers",
        };
      }
      if (phase === 4) {
        return {
          type: index % 2 === 0 ? "analog" : "digital",
          minuteStep: 5,
          clockFace: "withoutNumbers",
        };
      }
      return {
        type: Math.random() < 0.5 ? "analog" : "digital",
        minuteStep: 5,
        clockFace: Math.random() < 0.5 ? "withNumbers" : "withoutNumbers",
      };
    },
  };

  const ProgressStore = {
    createDefaultPlayer(displayName, avatar, id) {
      return {
        id,
        displayName,
        avatar,
        highestUnlockedPhase: 1,
        selectedPhase: 1,
        totalRounds: 0,
        lastPlayedAt: null,
        phaseStats: {},
        stats: {
          bestScoreRaw: 0,
          bestScoreNormalized: 0,
          bestAccuracy: 0,
          bestAvgResponseMs: null,
          totalTimeouts: 0,
          totalAnswers: 0,
          totalCorrect: 0,
          totalResponseMs: 0,
          rounds: [],
          practice: {
            sessions: 0,
            answers: 0,
            correct: 0,
            byKind: {},
            byType: { analog: 0, digital: 0 },
          },
        },
      };
    },

    generatePlayerId(displayName) {
      const base = displayName.trim().toLowerCase().replace(/\s+/g, "-") || "speler";
      return `${base}-${Date.now().toString(36).slice(-6)}`;
    },

    normalizeLegacyPhaseStats(phaseStats = {}) {
      const out = {};
      Object.keys(phaseStats).forEach((phaseKey) => {
        const stat = phaseStats[phaseKey] || {};
        out[phaseKey] = {
          attempts: stat.attempts || 0,
          bestAccuracy: stat.bestAccuracy || 0,
          lastAccuracy: stat.lastAccuracy || 0,
          completed: Boolean(stat.completed || (stat.bestAccuracy || 0) >= 80),
          bestScoreRaw: stat.bestScoreRaw || 0,
          bestScoreNorm: stat.bestScoreNorm || 0,
          bestAvgResponseMs:
            typeof stat.bestAvgResponseMs === "number" ? stat.bestAvgResponseMs : null,
        };
      });
      return out;
    },

    normalizePlayerShape(player) {
      const normalized = { ...player };
      normalized.id = normalized.id || this.generatePlayerId(normalized.displayName || "speler");
      normalized.displayName = normalized.displayName || "Speler";
      normalized.avatar = normalized.avatar || AVAILABLE_AVATARS[0];

      const migratedPhase = normalized.highestUnlockedPhase || normalized.currentPhase || 1;
      normalized.highestUnlockedPhase = Math.min(LearningPath.maxPhase, Math.max(1, migratedPhase));
      normalized.selectedPhase = Math.min(
        normalized.highestUnlockedPhase,
        Math.max(1, normalized.selectedPhase || normalized.highestUnlockedPhase)
      );

      normalized.totalRounds = normalized.totalRounds || 0;
      normalized.lastPlayedAt = normalized.lastPlayedAt || null;
      normalized.phaseStats = this.normalizeLegacyPhaseStats(normalized.phaseStats || {});
      normalized.stats = {
        bestScoreRaw: normalized.stats?.bestScoreRaw || normalized.stats?.bestScore || 0,
        bestScoreNormalized: normalized.stats?.bestScoreNormalized || 0,
        bestAccuracy: normalized.stats?.bestAccuracy || 0,
        bestAvgResponseMs:
          typeof normalized.stats?.bestAvgResponseMs === "number"
            ? normalized.stats.bestAvgResponseMs
            : null,
        totalTimeouts: normalized.stats?.totalTimeouts || 0,
        totalAnswers: normalized.stats?.totalAnswers || 0,
        totalCorrect: normalized.stats?.totalCorrect || 0,
        totalResponseMs: normalized.stats?.totalResponseMs || 0,
        rounds: Array.isArray(normalized.stats?.rounds) ? normalized.stats.rounds : [],
        practice: {
          sessions: normalized.stats?.practice?.sessions || 0,
          answers: normalized.stats?.practice?.answers || 0,
          correct: normalized.stats?.practice?.correct || 0,
          byKind: normalized.stats?.practice?.byKind || {},
          byType: normalized.stats?.practice?.byType || { analog: 0, digital: 0 },
        },
      };

      delete normalized.currentPhase;
      return normalized;
    },

    migrate(raw) {
      if (Array.isArray(raw.players)) {
        return {
          version: 3,
          selectedPlayerId: raw.selectedPlayerId || "",
          players: raw.players.map((p) => this.normalizePlayerShape(p)),
        };
      }

      const legacyProfiles = raw.profiles || {};
      const legacyKeys = Object.keys(legacyProfiles);
      const players = legacyKeys.map((key, idx) => {
        const lp = legacyProfiles[key] || {};
        const migrated = this.normalizePlayerShape({
          id: key,
          displayName: lp.displayName || key,
          avatar: AVAILABLE_AVATARS[idx % AVAILABLE_AVATARS.length],
          highestUnlockedPhase: lp.highestUnlockedPhase || lp.currentPhase || 1,
          selectedPhase: lp.selectedPhase || lp.currentPhase || 1,
          totalRounds: lp.totalRounds || 0,
          lastPlayedAt: lp.lastPlayedAt || null,
          phaseStats: lp.phaseStats || {},
          stats: {
            bestScoreRaw: 0,
            bestScoreNormalized: 0,
            bestAccuracy: 0,
            bestAvgResponseMs: null,
            totalTimeouts: 0,
            totalAnswers: 0,
            totalCorrect: 0,
            totalResponseMs: 0,
            rounds: [],
            practice: {
              sessions: 0,
              answers: 0,
              correct: 0,
              byKind: {},
              byType: { analog: 0, digital: 0 },
            },
          },
        });
        return migrated;
      });

      let selectedPlayerId = "";
      if (raw.lastProfileKey && players.some((p) => p.id === raw.lastProfileKey)) {
        selectedPlayerId = raw.lastProfileKey;
      } else if (players.length > 0) {
        selectedPlayerId = players[0].id;
      }

      return {
        version: 3,
        selectedPlayerId,
        players,
      };
    },

    loadRaw() {
      try {
        const text = localStorage.getItem(GameConfig.storageKey);
        if (text) {
          const parsed = JSON.parse(text);
          const migrated = this.migrate(parsed);
          this.saveRaw(migrated);
          return migrated;
        }

        const v2Text = localStorage.getItem("klokkijk:progress:v2");
        if (v2Text) {
          const v2 = JSON.parse(v2Text);
          const migrated = this.migrate(v2);
          this.saveRaw(migrated);
          return migrated;
        }

        const legacyText = localStorage.getItem("klokkijk:progress:v1");
        if (legacyText) {
          const legacy = JSON.parse(legacyText);
          const migrated = this.migrate(legacy);
          this.saveRaw(migrated);
          return migrated;
        }

        return { version: 3, selectedPlayerId: "", players: [] };
      } catch (error) {
        return { version: 3, selectedPlayerId: "", players: [] };
      }
    },

    saveRaw(data) {
      localStorage.setItem(GameConfig.storageKey, JSON.stringify(data));
    },

    listPlayers() {
      const data = this.loadRaw();
      return { selectedPlayerId: data.selectedPlayerId, players: data.players };
    },

    findPlayerByName(displayName) {
      const data = this.loadRaw();
      return data.players.find((p) => p.displayName.toLowerCase() === displayName.toLowerCase()) || null;
    },

    addPlayer(displayName, avatar) {
      const name = displayName.trim();
      if (!name) {
        return { error: "Naam is verplicht." };
      }

      const existing = this.findPlayerByName(name);
      if (existing) {
        this.setSelectedPlayer(existing.id);
        return { player: existing, existed: true };
      }

      const data = this.loadRaw();
      const player = this.createDefaultPlayer(name, avatar, this.generatePlayerId(name));
      data.players.push(player);
      data.selectedPlayerId = player.id;
      this.saveRaw(data);
      return { player, existed: false };
    },

    setSelectedPlayer(playerId) {
      const data = this.loadRaw();
      if (data.players.some((p) => p.id === playerId)) {
        data.selectedPlayerId = playerId;
        this.saveRaw(data);
      }
    },

    getSelectedPlayer() {
      const data = this.loadRaw();
      if (!data.selectedPlayerId) return null;
      return data.players.find((p) => p.id === data.selectedPlayerId) || null;
    },

    getPlayer(playerId) {
      const data = this.loadRaw();
      return data.players.find((p) => p.id === playerId) || null;
    },

    getSummary(playerId) {
      const player = this.getPlayer(playerId);
      if (!player) {
        return {
          exists: false,
          displayName: "",
          avatar: "🐱",
          selectedPhase: 1,
          highestUnlockedPhase: 1,
          completedPhases: [],
          totalRounds: 0,
          lastAccuracy: null,
        };
      }

      const stats = player.phaseStats[String(player.selectedPhase)] || null;
      const completedPhases = Object.entries(player.phaseStats)
        .filter(([, phaseStat]) => phaseStat.completed)
        .map(([phaseKey]) => Number(phaseKey));

      return {
        exists: true,
        displayName: player.displayName,
        avatar: player.avatar,
        selectedPhase: player.selectedPhase,
        highestUnlockedPhase: player.highestUnlockedPhase,
        completedPhases,
        totalRounds: player.totalRounds,
        lastAccuracy: stats ? stats.lastAccuracy : null,
      };
    },

    updatePlayer(updatedPlayer) {
      const data = this.loadRaw();
      const idx = data.players.findIndex((p) => p.id === updatedPlayer.id);
      if (idx >= 0) {
        data.players[idx] = this.normalizePlayerShape(updatedPlayer);
        this.saveRaw(data);
      }
    },

    setSelectedPhase(playerId, selectedPhase) {
      const player = this.getPlayer(playerId);
      if (!player) return 1;
      const phase = Math.max(1, Math.floor(selectedPhase));
      if (phase <= player.highestUnlockedPhase) {
        player.selectedPhase = phase;
        this.updatePlayer(player);
      }
      return player.selectedPhase;
    },

    normalizeScoreForLevel(rawScore, level) {
      const factor = LEVEL_SCORE_FACTORS[level] || 1;
      return Math.round(rawScore / factor);
    },

    getLevelLeaderboard(level) {
      const data = this.loadRaw();
      return data.players
        .map((player) => {
          const levelStat = player.phaseStats?.[String(level)] || null;
          return {
            playerId: player.id,
            avatar: player.avatar,
            displayName: player.displayName,
            bestScoreNorm: levelStat?.bestScoreNorm || 0,
            bestScoreRaw: levelStat?.bestScoreRaw || 0,
            bestAccuracy: levelStat?.bestAccuracy || 0,
            bestAvgResponseMs: levelStat?.bestAvgResponseMs ?? null,
            completed: Boolean(levelStat?.completed),
          };
        })
        .filter((entry) => entry.bestScoreNorm > 0)
        .sort((a, b) => {
          if (b.bestScoreNorm !== a.bestScoreNorm) return b.bestScoreNorm - a.bestScoreNorm;
          if (b.bestAccuracy !== a.bestAccuracy) return b.bestAccuracy - a.bestAccuracy;
          const aSpeed =
            typeof a.bestAvgResponseMs === "number" ? a.bestAvgResponseMs : Number.POSITIVE_INFINITY;
          const bSpeed =
            typeof b.bestAvgResponseMs === "number" ? b.bestAvgResponseMs : Number.POSITIVE_INFINITY;
          if (aSpeed !== bSpeed) return aSpeed - bSpeed;
          return a.displayName.localeCompare(b.displayName);
        });
    },

    getLeaderboardAllTime() {
      const all = [];
      for (let level = 1; level <= LearningPath.maxPhase; level += 1) {
        const top = this.getLevelLeaderboard(level)[0];
        if (!top) continue;
        all.push({ ...top, level });
      }
      return all;
    },

    getOverallLeaderboard() {
      const data = this.loadRaw();
      return data.players
        .map((player) => {
          const levelEntries = [];
          for (let level = 1; level <= LearningPath.maxPhase; level += 1) {
            const levelStat = player.phaseStats?.[String(level)];
            if (!levelStat || (levelStat.bestScoreNorm || 0) <= 0) continue;
            levelEntries.push({
              scoreNorm: levelStat.bestScoreNorm || 0,
              bestAccuracy: levelStat.bestAccuracy || 0,
            });
          }

          const levelsPlayed = levelEntries.length;
          const totalNorm = levelEntries.reduce((sum, entry) => sum + entry.scoreNorm, 0);
          const avgNorm = levelsPlayed > 0 ? Math.round(totalNorm / levelsPlayed) : 0;
          const avgAccuracy =
            levelsPlayed > 0
              ? Math.round(levelEntries.reduce((sum, entry) => sum + entry.bestAccuracy, 0) / levelsPlayed)
              : 0;
          const completedLevels = Object.values(player.phaseStats || {}).filter((stat) => stat?.completed)
            .length;

          return {
            playerId: player.id,
            avatar: player.avatar,
            displayName: player.displayName,
            levelsPlayed,
            completedLevels,
            totalNorm,
            avgNorm,
            avgAccuracy,
          };
        })
        .filter((entry) => entry.levelsPlayed > 0)
        .sort((a, b) => {
          if (b.totalNorm !== a.totalNorm) return b.totalNorm - a.totalNorm;
          if (b.completedLevels !== a.completedLevels) return b.completedLevels - a.completedLevels;
          if (b.avgNorm !== a.avgNorm) return b.avgNorm - a.avgNorm;
          if (b.avgAccuracy !== a.avgAccuracy) return b.avgAccuracy - a.avgAccuracy;
          return a.displayName.localeCompare(b.displayName);
        });
    },

    getPlayerRecords(playerId, level) {
      const player = this.getPlayer(playerId);
      if (!player) {
        return {
          bestScoreRaw: 0,
          bestScoreNormalized: 0,
          bestAccuracy: 0,
          bestAvgResponseMs: null,
        };
      }
      const levelStat = player.phaseStats?.[String(level)] || null;
      return {
        bestScoreRaw: levelStat?.bestScoreRaw || 0,
        bestScoreNormalized: levelStat?.bestScoreNorm || 0,
        bestAccuracy: levelStat?.bestAccuracy || 0,
        bestAvgResponseMs: levelStat?.bestAvgResponseMs ?? null,
      };
    },

    getPracticeInsights(playerId) {
      const player = this.getPlayer(playerId);
      const practice = player?.stats?.practice;
      if (!practice) {
        return {
          sessions: 0,
          answers: 0,
          correctRate: 0,
          weakestKinds: [],
          strongKinds: [],
        };
      }
      const byKindEntries = Object.entries(practice.byKind || {});
      byKindEntries.sort((a, b) => b[1] - a[1]);
      return {
        sessions: practice.sessions || 0,
        answers: practice.answers || 0,
        correctRate:
          practice.answers > 0 ? Math.round((practice.correct / practice.answers) * 100) : 0,
        weakestKinds: byKindEntries.slice(0, 2).map(([kind]) => kind),
        strongKinds: byKindEntries.slice(-2).map(([kind]) => kind),
      };
    },

    recordPracticeAnswer(playerId, payload) {
      const player = this.getPlayer(playerId);
      if (!player) return;
      const practice = player.stats.practice || {
        sessions: 0,
        answers: 0,
        correct: 0,
        byKind: {},
        byType: { analog: 0, digital: 0 },
      };

      if (payload.startSession) {
        practice.sessions += 1;
      }
      practice.answers += 1;
      if (payload.isCorrect) practice.correct += 1;
      const kind = payload.errorKind || "other";
      practice.byKind[kind] = (practice.byKind[kind] || 0) + 1;
      const qType = payload.questionType || "analog";
      practice.byType[qType] = (practice.byType[qType] || 0) + 1;

      player.stats.practice = practice;
      this.updatePlayer(player);
    },

    recordRound(playerId, phase, roundResult) {
      const player = this.getPlayer(playerId);
      if (!player) return null;
      const leaderboardBefore = this.getLevelLeaderboard(phase);
      const previousRankIndex = leaderboardBefore.findIndex((entry) => entry.playerId === playerId);

      const phaseKey = String(phase);
      const phaseStats = player.phaseStats[phaseKey] || {
        attempts: 0,
        bestAccuracy: 0,
        lastAccuracy: 0,
        completed: false,
        bestScoreRaw: 0,
        bestScoreNorm: 0,
        bestAvgResponseMs: null,
      };

      phaseStats.attempts += 1;
      phaseStats.lastAccuracy = roundResult.accuracy;
      phaseStats.bestAccuracy = Math.max(phaseStats.bestAccuracy, roundResult.accuracy);
      phaseStats.completed = Boolean(phaseStats.completed || roundResult.accuracy >= 80);
      player.phaseStats[phaseKey] = phaseStats;

      player.totalRounds += 1;
      player.lastPlayedAt = new Date().toISOString();
      const scoreNorm = this.normalizeScoreForLevel(roundResult.totalScore, phase);
      const newRounds = [
        ...(player.stats.rounds || []),
        {
          ts: player.lastPlayedAt,
          level: phase,
          scoreRaw: roundResult.totalScore,
          scoreNorm,
          accuracy: roundResult.accuracy,
          avgMs: roundResult.avgResponseMs,
          timeouts: roundResult.timeouts,
        },
      ].slice(-GameConfig.maxStoredRoundsPerPlayer);
      player.stats.rounds = newRounds;

      const newRecords = {
        scoreRaw: roundResult.totalScore > (phaseStats.bestScoreRaw || 0),
        scoreNorm: scoreNorm > (phaseStats.bestScoreNorm || 0),
        accuracy: roundResult.accuracy > (phaseStats.bestAccuracy || 0),
        speed:
          (typeof phaseStats.bestAvgResponseMs !== "number" ||
            roundResult.avgResponseMs < phaseStats.bestAvgResponseMs) &&
          roundResult.correct > 0,
      };

      phaseStats.bestScoreRaw = Math.max(phaseStats.bestScoreRaw || 0, roundResult.totalScore);
      phaseStats.bestScoreNorm = Math.max(phaseStats.bestScoreNorm || 0, scoreNorm);
      if (newRecords.speed) {
        phaseStats.bestAvgResponseMs = roundResult.avgResponseMs;
      }
      player.stats.bestScoreRaw = Math.max(player.stats.bestScoreRaw || 0, roundResult.totalScore);
      player.stats.bestScoreNormalized = Math.max(player.stats.bestScoreNormalized || 0, scoreNorm);
      player.stats.bestAccuracy = Math.max(player.stats.bestAccuracy || 0, roundResult.accuracy);
      if (newRecords.speed) {
        player.stats.bestAvgResponseMs =
          typeof player.stats.bestAvgResponseMs === "number"
            ? Math.min(player.stats.bestAvgResponseMs, roundResult.avgResponseMs)
            : roundResult.avgResponseMs;
      }
      player.phaseStats[phaseKey] = phaseStats;
      player.stats.totalTimeouts += roundResult.timeouts;
      player.stats.totalAnswers += GameConfig.questionCount;
      player.stats.totalCorrect += roundResult.correct;
      player.stats.totalResponseMs += roundResult.totalResponseMs;

      let unlockedNext = false;
      if (
        phaseStats.completed &&
        phase === player.highestUnlockedPhase &&
        player.highestUnlockedPhase < LearningPath.maxPhase
      ) {
        player.highestUnlockedPhase += 1;
        unlockedNext = true;
      }

      if (player.selectedPhase > player.highestUnlockedPhase) {
        player.selectedPhase = player.highestUnlockedPhase;
      } else if (unlockedNext && player.selectedPhase === phase) {
        player.selectedPhase = phase + 1;
      }

      this.updatePlayer(player);
      const leaderboardAfter = this.getLevelLeaderboard(phase);
      const currentRankIndex = leaderboardAfter.findIndex((entry) => entry.playerId === playerId);

      return {
        unlockedNext,
        nextPhase: Math.min(phase + 1, player.highestUnlockedPhase),
        selectedPhase: player.selectedPhase,
        highestUnlockedPhase: player.highestUnlockedPhase,
        phaseCompleted: phaseStats.completed,
        roundScoreNorm: scoreNorm,
        newRecords: {
          score: newRecords.scoreNorm || newRecords.scoreRaw,
          accuracy: newRecords.accuracy,
          speed: newRecords.speed,
        },
        ranking: {
          previousRank: previousRankIndex >= 0 ? previousRankIndex + 1 : null,
          currentRank: currentRankIndex >= 0 ? currentRankIndex + 1 : null,
        },
        player,
      };
    },

    resetPlayerProgress(playerId) {
      const player = this.getPlayer(playerId);
      if (!player) return;
      player.highestUnlockedPhase = 1;
      player.selectedPhase = 1;
      player.totalRounds = 0;
      player.lastPlayedAt = null;
      player.phaseStats = {};
      player.stats = {
        bestScoreRaw: 0,
        bestScoreNormalized: 0,
        bestAccuracy: 0,
        bestAvgResponseMs: null,
        totalTimeouts: 0,
        totalAnswers: 0,
        totalCorrect: 0,
        totalResponseMs: 0,
        rounds: [],
        practice: {
          sessions: 0,
          answers: 0,
          correct: 0,
          byKind: {},
          byType: { analog: 0, digital: 0 },
        },
      };
      this.updatePlayer(player);
    },
  };

  const ClockRenderer = {
    drawAnalog(canvas, time, showNumbers) {
      const ctx = canvas.getContext("2d");
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(cx, cy) - 10;

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(cx, cy);

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#4a5a53";
      ctx.stroke();

      for (let i = 0; i < 60; i += 1) {
        const angle = (i * Math.PI) / 30;
        const isHourTick = i % 5 === 0;
        const inner = isHourTick ? radius - 20 : radius - 12;
        const outer = radius - 4;
        ctx.beginPath();
        ctx.moveTo(inner * Math.cos(angle), inner * Math.sin(angle));
        ctx.lineTo(outer * Math.cos(angle), outer * Math.sin(angle));
        ctx.lineWidth = isHourTick ? 3 : 1.5;
        ctx.strokeStyle = "#2a3e34";
        ctx.stroke();
      }

      if (showNumbers) {
        ctx.fillStyle = "#1a2d24";
        ctx.font = "24px Trebuchet MS";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let n = 1; n <= 12; n += 1) {
          const angle = ((n - 3) * Math.PI) / 6;
          const tr = radius - 38;
          ctx.fillText(String(n), tr * Math.cos(angle), tr * Math.sin(angle));
        }
      }

      const minuteAngle = ((time.minute * Math.PI) / 30) - Math.PI / 2;
      const hourAngle =
        (((time.hour24 % 12) + time.minute / 60) * Math.PI) / 6 - Math.PI / 2;

      drawHand(ctx, hourAngle, radius * 0.48, 8, "#2b3f35");
      drawHand(ctx, minuteAngle, radius * 0.72, 6, "#607068");

      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#23372d";
      ctx.fill();

      ctx.restore();
    },
  };

  function drawHand(ctx, angle, length, width, color) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(length * Math.cos(angle), length * Math.sin(angle));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  const QuestionGenerator = {
    choosePracticeSpec(insights = {}, options = {}) {
      const basePhase = options.phase || 5;
      const baseSpec = LearningPath.getQuestionSpec(basePhase, Math.floor(Math.random() * 10));
      const weak = insights.weakestKinds?.[0] || "";
      const baseType = baseSpec.type;
      const baseStep = baseSpec.minuteStep;
      const baseFace = baseSpec.clockFace;
      if (weak === DistractorKind.HAND_SWAP) {
        return { type: "analog", minuteStep: Math.min(baseStep, 5), clockFace: baseFace };
      }
      if (weak === DistractorKind.REFERENCE_ANCHOR_CONFUSION) {
        return {
          type: Math.random() < 0.5 ? "analog" : "digital",
          minuteStep: Math.min(baseStep, 15),
          clockFace: "withNumbers",
        };
      }
      if (weak === DistractorKind.NEAR_MINUTE) {
        return {
          type: Math.random() < 0.5 ? "analog" : "digital",
          minuteStep: Math.min(baseStep, 5),
          clockFace: baseFace,
        };
      }
      if (weak === DistractorKind.HOUR_REFERENCE) {
        return {
          type: Math.random() < 0.5 ? "analog" : "digital",
          minuteStep: Math.min(baseStep, 15),
          clockFace: "withNumbers",
        };
      }
      return { type: baseType, minuteStep: baseStep, clockFace: baseFace };
    },

    createPracticeQuestion(questionIndex, insights = {}, options = {}) {
      const spec = this.choosePracticeSpec(insights, options);
      const level = minuteStepToLevel(spec.minuteStep);
      const time = this.generateTime(spec.minuteStep);
      const optionPayload = this.generateOptions({
        type: spec.type,
        level,
        time,
        minuteStep: spec.minuteStep,
      });
      return {
        id: `p-${questionIndex + 1}`,
        type: spec.type,
        level,
        time,
        clockFace: spec.clockFace,
        requiredMisconceptionKinds: [DistractorKind.REFERENCE_ANCHOR_CONFUSION],
        options: optionPayload.options,
        correctIndex: optionPayload.correctIndex,
        distractorMeta: optionPayload.distractorMeta,
      };
    },

    createQuestion(questionIndex, phase) {
      const spec = LearningPath.getQuestionSpec(phase, questionIndex);
      const type = spec.type;
      const minuteStep = spec.minuteStep;
      const level = minuteStepToLevel(minuteStep);
      const clockFace = spec.clockFace;
      const time = this.generateTime(minuteStep);

      const optionPayload = this.generateOptions({ type, level, time, minuteStep });

      return {
        id: `q-${questionIndex + 1}`,
        type,
        level,
        time,
        clockFace,
        requiredMisconceptionKinds: [DistractorKind.REFERENCE_ANCHOR_CONFUSION],
        options: optionPayload.options,
        correctIndex: optionPayload.correctIndex,
        distractorMeta: optionPayload.distractorMeta,
      };
    },

    signatureFor(question) {
      return `${question.type}:${question.time.hour24}:${question.time.minute}:${question.clockFace}`;
    },

    rebuildWithTime(question, time) {
      const minuteStep = levelToMinuteStep(question.level);
      const optionPayload = this.generateOptions({
        type: question.type,
        level: question.level,
        time,
        minuteStep,
      });
      return {
        ...question,
        time,
        options: optionPayload.options,
        correctIndex: optionPayload.correctIndex,
        distractorMeta: optionPayload.distractorMeta,
      };
    },

    forceUniqueVariant(question, usedSignatures) {
      const step = levelToMinuteStep(question.level);
      for (let delta = step; delta < 24 * 60; delta += step) {
        const shiftedTime = addMinutes(question.time, delta);
        const candidate = this.rebuildWithTime(question, shiftedTime);
        const signature = this.signatureFor(candidate);
        if (!usedSignatures.has(signature)) {
          return candidate;
        }
      }
      return question;
    },

    generateTime(minuteStep) {
      const hour24 = Math.floor(Math.random() * 24);
      const minuteSlotCount = 60 / minuteStep;
      const minute = Math.floor(Math.random() * minuteSlotCount) * minuteStep;
      return { hour24, minute };
    },

    generateOptions({ type, time, minuteStep }) {
      const correctText = TimeFormatterNL.toText(time);
      const pool = [{ text: correctText, kind: "correct", time }];
      const byText = new Set([correctText]);
      const add = (candidate) => {
        if (!candidate || byText.has(candidate.text)) return false;
        byText.add(candidate.text);
        pool.push(candidate);
        return true;
      };

      const referenceAnchor = this.createReferenceAnchorConfusionCandidate(time);
      add(referenceAnchor);

      let handSwapAdded = false;
      if (type === "analog") {
        const swapped = this.createHandSwapCandidate(time, minuteStep);
        if (swapped && add(swapped)) {
          handSwapAdded = true;
        }
      }

      add(this.createNearMinuteCandidate(time, minuteStep));
      add(this.createHourReferenceCandidate(time, type));

      if (type === "analog" && !handSwapAdded) {
        add(this.createFallbackCandidate(time, "handSwapFallback"));
      }

      const fallbackGenerators = [
        () => this.createNearMinuteCandidate(time, 5),
        () => this.createFallbackCandidate(time, "offset+20", 20),
        () => this.createFallbackCandidate(time, "offset-20", -20),
        () => this.createFallbackCandidate(time, "offset+35", 35),
        () => this.createHourReferenceCandidate(time, "digital"),
      ];

      let safety = 0;
      while (pool.length < 4 && safety < 20) {
        const generator = fallbackGenerators[safety % fallbackGenerators.length];
        add(generator());
        safety += 1;
      }

      while (pool.length < 4) {
        add(this.createFallbackCandidate(time, `force-${pool.length}`, 5 * pool.length));
      }

      const finalPool = shuffle(pool.slice(0, 4));

      const enforceDistractor = (kind, candidateFactory) => {
        if (finalPool.some((entry) => entry.kind === kind)) return;
        const replacement = candidateFactory();
        if (!replacement || replacement.text === correctText) return;
        const existingText = finalPool.map((entry) => entry.text);
        if (existingText.includes(replacement.text)) return;
        const idx = finalPool.findIndex((entry) => entry.kind !== "correct");
        if (idx >= 0) finalPool[idx] = replacement;
      };

      enforceDistractor(
        DistractorKind.REFERENCE_ANCHOR_CONFUSION,
        () => this.createReferenceAnchorConfusionCandidate(time)
      );

      if (type === "analog") {
        enforceDistractor(DistractorKind.HAND_SWAP, () => {
          return this.createHandSwapCandidate(time, minuteStep) || this.createFallbackCandidate(time, "enforced-hand", 25);
        });
      }

      return {
        options: finalPool.map((entry) => entry.text),
        correctIndex: finalPool.findIndex((entry) => entry.kind === "correct"),
        distractorMeta: finalPool
          .map((entry, index) => ({
            optionIndex: index,
            kind: entry.kind === "correct" ? null : entry.kind,
          }))
          .filter((entry) => entry.kind !== null),
      };
    },

    createReferenceAnchorConfusionCandidate(time) {
      const text = TimeFormatterNL.toTextWithAnchorConfusion(time);
      if (text === TimeFormatterNL.toText(time)) {
        return null;
      }
      return {
        text,
        kind: DistractorKind.REFERENCE_ANCHOR_CONFUSION,
        time,
      };
    },

    createHandSwapCandidate(time, minuteStep) {
      const realHour12 = hourTo12(time.hour24);
      const minuteAsHourNumber = Math.round(time.minute / 5);
      const swappedHour12 = minuteAsHourNumber === 0 ? 12 : minuteAsHourNumber;

      const hourHandPosition = (realHour12 % 12) + time.minute / 60;
      const swappedMinuteRaw = clampMod(Math.round(hourHandPosition * 5), 60);
      const roundedMinute = Math.round(swappedMinuteRaw / minuteStep) * minuteStep;
      const swappedMinute = roundedMinute === 60 ? 0 : roundedMinute;

      const base = time.hour24 >= 12 ? 12 : 0;
      const swappedHour24 = base + (swappedHour12 % 12);
      const candidate = { hour24: clampMod(swappedHour24, 24), minute: swappedMinute };

      if (TimeFormatterNL.toText(candidate) === TimeFormatterNL.toText(time)) {
        return null;
      }

      return {
        text: TimeFormatterNL.toText(candidate),
        kind: DistractorKind.HAND_SWAP,
        time: candidate,
      };
    },

    createNearMinuteCandidate(time, minuteStep) {
      let delta = minuteStep;
      if (minuteStep === 60) delta = 30;
      if (minuteStep === 5) delta = Math.random() < 0.5 ? 5 : 10;

      const candidate = addMinutes(time, Math.random() > 0.5 ? delta : -delta);
      return {
        text: TimeFormatterNL.toText(candidate),
        kind: DistractorKind.NEAR_MINUTE,
        time: candidate,
      };
    },

    createHourReferenceCandidate(time, type) {
      let candidate;
      if (time.minute === 0) {
        candidate = addMinutes(time, 30);
      } else if (time.minute < 30) {
        candidate = withHourShift(time, 1);
      } else {
        candidate = withHourShift(time, -1);
      }

      if (type === "digital" && time.minute >= 15 && time.minute <= 45) {
        candidate = addMinutes(time, 30 - 2 * (time.minute - 30));
      }

      return {
        text: TimeFormatterNL.toText(candidate),
        kind: DistractorKind.HOUR_REFERENCE,
        time: candidate,
      };
    },

    createFallbackCandidate(time, label, minuteOffset = 25) {
      const candidate = addMinutes(time, minuteOffset);
      return {
        text: TimeFormatterNL.toText(candidate),
        kind: DistractorKind.FALLBACK,
        time: candidate,
        label,
      };
    },
  };

  class GameState {
    constructor(config) {
      this.config = config;
      this.reset();
    }

    reset() {
      this.currentIndex = 0;
      this.correct = 0;
      this.incorrect = 0;
      this.currentStreak = 0;
      this.bestStreak = 0;
      this.totalScore = 0;
      this.responseTimes = [];
      this.timeouts = 0;
      this.totalResponseMs = 0;
      this.questions = [];
      this.phase = 1;
      this.playerId = "";
      this.profileName = "Speler";
      this.profileAvatar = "🐱";
      this.mode = "challenge";
      this.practiceRecentSignatures = [];
      this.practiceContext = {
        difficultyMode: "auto",
        highestUnlockedPhase: 1,
      };
    }

    initRound({ playerId, profileName, profileAvatar, phase }) {
      this.reset();
      this.mode = "challenge";
      this.phase = phase;
      this.playerId = playerId;
      this.profileName = profileName;
      this.profileAvatar = profileAvatar;
      this.questions = [];
      const used = new Set();
      for (let idx = 0; idx < this.config.questionCount; idx += 1) {
        let attempts = 0;
        let q = QuestionGenerator.createQuestion(idx, phase);
        let signature = QuestionGenerator.signatureFor(q);
        while (used.has(signature) && attempts < 250) {
          q = QuestionGenerator.createQuestion(idx, phase);
          signature = QuestionGenerator.signatureFor(q);
          attempts += 1;
        }
        if (used.has(signature)) {
          q = QuestionGenerator.forceUniqueVariant(q, used);
          signature = QuestionGenerator.signatureFor(q);
        }
        if (used.has(signature)) {
          continue;
        }
        used.add(signature);
        this.questions.push(q);
      }

      while (this.questions.length < this.config.questionCount) {
        const idx = this.questions.length;
        let q = QuestionGenerator.createQuestion(idx, phase);
        q = QuestionGenerator.forceUniqueVariant(q, used);
        const signature = QuestionGenerator.signatureFor(q);
        if (used.has(signature)) break;
        used.add(signature);
        this.questions.push(q);
      }

      while (this.questions.length < this.config.questionCount) {
        const idx = this.questions.length;
        this.questions.push(QuestionGenerator.createQuestion(idx, phase));
      }
    }

    initPractice({ playerId, profileName, profileAvatar, insights, difficultyMode, highestUnlockedPhase }) {
      this.reset();
      this.mode = "practice";
      this.phase = 5;
      this.playerId = playerId;
      this.profileName = profileName;
      this.profileAvatar = profileAvatar;
      this.practiceContext = {
        difficultyMode: difficultyMode || "auto",
        highestUnlockedPhase: Math.max(1, highestUnlockedPhase || 1),
      };
      this.pushPracticeQuestion(insights);
    }

    getPracticeTargetPhase() {
      const mode = this.practiceContext.difficultyMode;
      const highest = this.practiceContext.highestUnlockedPhase;
      if (mode === "easy") {
        return Math.random() < 0.5 ? 1 : 2;
      }
      if (mode === "medium") {
        return Math.random() < 0.5 ? 3 : 4;
      }
      if (mode === "hard") {
        return 5;
      }
      if (mode === "player_level") {
        return Math.min(5, highest);
      }
      const startPhase = Math.max(1, highest - 2);
      const growth = Math.floor(this.currentIndex / 5);
      return Math.min(5, startPhase + growth);
    }

    pushPracticeQuestion(insights) {
      let attempts = 0;
      const targetPhase = this.getPracticeTargetPhase();
      let question = QuestionGenerator.createPracticeQuestion(this.currentIndex, insights, {
        phase: targetPhase,
      });
      let signature = QuestionGenerator.signatureFor(question);
      while (this.practiceRecentSignatures.includes(signature) && attempts < 100) {
        question = QuestionGenerator.createPracticeQuestion(this.currentIndex + attempts + 1, insights, {
          phase: targetPhase,
        });
        signature = QuestionGenerator.signatureFor(question);
        attempts += 1;
      }
      this.questions.push(question);
      this.practiceRecentSignatures.push(signature);
      if (this.practiceRecentSignatures.length > GameConfig.practiceRecentLimit) {
        this.practiceRecentSignatures.shift();
      }
    }

    currentQuestion() {
      return this.questions[this.currentIndex];
    }

    answerCurrent(selectedIndex, elapsedMs, isTimeout = false) {
      const question = this.currentQuestion();
      const boundedMs = Math.max(0, Math.min(this.config.maxQuestionTimeMs, elapsedMs));
      const isCorrect = !isTimeout && selectedIndex === question.correctIndex;
      const speedBonus = Math.round(
        ((this.config.maxQuestionTimeMs - boundedMs) / this.config.maxQuestionTimeMs) * 50
      );

      let gainedPoints = 0;
      if (isCorrect) {
        this.correct += 1;
        this.currentStreak += 1;
        this.bestStreak = Math.max(this.bestStreak, this.currentStreak);
        const streakBonus = Math.min(50, this.currentStreak * 10);
        gainedPoints = 100 + Math.max(0, speedBonus) + streakBonus;
        this.totalScore += gainedPoints;
      } else {
        this.incorrect += 1;
        this.currentStreak = 0;
        if (isTimeout) {
          this.timeouts += 1;
        }
      }

      this.responseTimes.push(boundedMs);
      this.totalResponseMs += boundedMs;

      const metaByIndex = {};
      question.distractorMeta.forEach((item) => {
        metaByIndex[item.optionIndex] = item.kind;
      });

      return {
        isCorrect,
        isTimeout,
        gainedPoints,
        elapsedMs: boundedMs,
        correctAnswer: question.options[question.correctIndex],
        errorKind: isCorrect ? "correct" : isTimeout ? "timeout" : metaByIndex[selectedIndex] || "other",
        questionType: question.type,
      };
    }

    moveNext() {
      this.currentIndex += 1;
      return this.currentIndex < this.config.questionCount;
    }

    result() {
      const total = this.config.questionCount;
      const accuracy = Math.round((this.correct / total) * 100);
      const avgResponseMs = this.responseTimes.length
        ? Math.round(this.totalResponseMs / this.responseTimes.length)
        : 0;
      return {
        phase: this.phase,
        playerId: this.playerId,
        profileName: this.profileName,
        profileAvatar: this.profileAvatar,
        correct: this.correct,
        incorrect: this.incorrect,
        accuracy,
        bestStreak: this.bestStreak,
        totalScore: this.totalScore,
        avgResponseMs,
        timeouts: this.timeouts,
        totalResponseMs: this.totalResponseMs,
      };
    }
  }

  class UIController {
    constructor(gameState) {
      this.game = gameState;
      this.answerLocked = false;
      this.selectedAvatar = AVAILABLE_AVATARS[0];
      this.activePlayerId = "";
      this.selectedPhase = 1;
      this.lastRoundPhase = 1;
      this.selectedMode = "challenge";
      this.selectedPracticeDifficulty = "auto";
      this.timerInterval = null;
      this.questionStartMs = 0;
      this.questionDeadlineMs = 0;
      this.pendingContinue = false;
      this.lastAnswerResult = null;

      this.startScreen = document.getElementById("start-screen");
      this.gameScreen = document.getElementById("game-screen");
      this.endScreen = document.getElementById("end-screen");

      this.playersList = document.getElementById("players-list");
      this.modeChallengeBtn = document.getElementById("mode-challenge-btn");
      this.modePracticeBtn = document.getElementById("mode-practice-btn");
      this.practiceControls = document.getElementById("practice-controls");
      this.practiceDifficultySelect = document.getElementById("practice-difficulty");
      this.profileSummary = document.getElementById("profile-summary");
      this.phaseMapWrap = document.getElementById("phase-map-wrap");
      this.phaseMap = document.getElementById("phase-map");
      this.openStatsBtn = document.getElementById("open-stats-btn");
      this.statsSheet = document.getElementById("stats-sheet");
      this.statsSheetOverlay = document.getElementById("stats-sheet-overlay");
      this.closeStatsBtn = document.getElementById("close-stats-btn");
      this.overallLeaderboardList = document.getElementById("overall-leaderboard-list");
      this.overallLeaderboardMyRank = document.getElementById("overall-leaderboard-my-rank");
      this.leaderboardList = document.getElementById("leaderboard-list");
      this.leaderboardMyRank = document.getElementById("leaderboard-my-rank");
      this.recordBestScore = document.getElementById("record-best-score");
      this.recordBestAccuracy = document.getElementById("record-best-accuracy");
      this.recordBestSpeed = document.getElementById("record-best-speed");
      this.practiceInsightsEl = document.getElementById("practice-insights");
      this.addPlayerModal = document.getElementById("add-player-modal");
      this.playersModal = document.getElementById("players-modal");
      this.playersModalList = document.getElementById("players-modal-list");
      this.avatarPicker = document.getElementById("avatar-picker");
      this.newPlayerNameInput = document.getElementById("new-player-name");
      this.addPlayerBtn = document.getElementById("add-player-btn");
      this.closePlayerModalBtn = document.getElementById("close-player-modal-btn");
      this.closePlayersModalBtn = document.getElementById("close-players-modal-btn");
      this.playersModalAddBtn = document.getElementById("players-modal-add-btn");

      this.startBtn = document.getElementById("start-btn");
      this.resetProgressBtn = document.getElementById("reset-progress-btn");
      this.nextPhaseBtn = document.getElementById("next-phase-btn");
      this.restartBtn = document.getElementById("restart-btn");
      this.backToMapBtn = document.getElementById("back-to-map-btn");
      this.stopSessionBtn = document.getElementById("stop-session-btn");

      this.progressEl = document.getElementById("progress");
      this.scoreEl = document.getElementById("score");
      this.streakEl = document.getElementById("streak");
      this.timerEl = document.getElementById("timer");
      this.continueBtn = document.getElementById("continue-btn");
      this.companionBubble = document.getElementById("companion-bubble");
      this.companionAvatarEl = document.querySelector(".companion-avatar");
      this.optionsEl = document.getElementById("options");

      this.canvas = document.getElementById("analog-clock");
      this.digital = document.getElementById("digital-clock");

      this.summaryPhase = document.getElementById("summary-phase");
      this.summaryScore = document.getElementById("summary-score");
      this.summaryAccuracy = document.getElementById("summary-accuracy");
      this.summaryStreak = document.getElementById("summary-streak");
      this.summaryTime = document.getElementById("summary-time");
      this.summaryScoreNorm = document.getElementById("summary-score-norm");
      this.summaryRank = document.getElementById("summary-rank");
      this.summaryRecords = document.getElementById("summary-records");
      this.summaryProgressNote = document.getElementById("summary-progress-note");

      this.addPlayerBtn.addEventListener("click", () => this.handleAddPlayer());
      this.modeChallengeBtn.addEventListener("click", () => this.setMode("challenge"));
      this.modePracticeBtn.addEventListener("click", () => this.setMode("practice"));
      this.openStatsBtn.addEventListener("click", () => this.openStatsSheet());
      this.closeStatsBtn.addEventListener("click", () => this.closeStatsSheet());
      this.statsSheetOverlay.addEventListener("click", () => this.closeStatsSheet());
      this.practiceDifficultySelect.addEventListener("change", () => {
        this.selectedPracticeDifficulty = this.practiceDifficultySelect.value;
      });
      this.closePlayerModalBtn.addEventListener("click", () => this.closeAddPlayerModal());
      this.closePlayersModalBtn.addEventListener("click", () => this.closePlayersModal());
      this.playersModalAddBtn.addEventListener("click", () => {
        this.closePlayersModal();
        this.openAddPlayerModal();
      });
      this.startBtn.addEventListener("click", () => this.startGame());
      this.resetProgressBtn.addEventListener("click", () => this.resetProgress());
      this.continueBtn.addEventListener("click", () => this.handleContinueAfterReview());
      this.nextPhaseBtn.addEventListener("click", () => this.startNextPhase());
      this.restartBtn.addEventListener("click", () => this.startGameAtPhase(this.lastRoundPhase));
      this.backToMapBtn.addEventListener("click", () => {
        this.renderStartState();
        this.showScreen(this.startScreen);
      });
      this.stopSessionBtn.addEventListener("click", () => {
        this.stopQuestionTimer();
        this.pendingContinue = false;
        this.answerLocked = false;
        this.continueBtn.classList.add("hidden");
        this.setCompanionFeedback("", "neutral");
        this.renderStartState();
        this.showScreen(this.startScreen);
      });

      this.newPlayerNameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.handleAddPlayer();
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !this.statsSheet.classList.contains("hidden")) {
          this.closeStatsSheet();
          return;
        }
        if (event.key === "Escape" && !this.playersModal.classList.contains("hidden")) {
          this.closePlayersModal();
          return;
        }
        if (!this.pendingContinue) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.handleContinueAfterReview();
        }
      });
      this.addPlayerModal.addEventListener("click", (event) => {
        if (event.target === this.addPlayerModal) {
          this.closeAddPlayerModal();
        }
      });
      this.playersModal.addEventListener("click", (event) => {
        if (event.target === this.playersModal) {
          this.closePlayersModal();
        }
      });

      this.renderAvatarPicker();
      this.renderStartState();
    }

    setMode(mode) {
      this.selectedMode = mode;
      this.modeChallengeBtn.classList.toggle("active", mode === "challenge");
      this.modePracticeBtn.classList.toggle("active", mode === "practice");
      this.practiceControls.classList.toggle("hidden", mode !== "practice");
      this.phaseMapWrap.classList.toggle("hidden", mode !== "challenge");
      this.renderProfileSummary();
    }

    showScreen(target) {
      [this.startScreen, this.gameScreen, this.endScreen].forEach((el) => {
        el.classList.toggle("active", el === target);
      });
    }

    renderAvatarPicker() {
      this.avatarPicker.innerHTML = "";
      AVAILABLE_AVATARS.forEach((avatar) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "avatar-btn";
        if (avatar === this.selectedAvatar) btn.classList.add("selected");
        btn.textContent = avatar;
        btn.addEventListener("click", () => {
          this.selectedAvatar = avatar;
          this.renderAvatarPicker();
        });
        this.avatarPicker.appendChild(btn);
      });
    }

    renderPlayersList() {
      const { players, selectedPlayerId } = ProgressStore.listPlayers();
      if (!this.activePlayerId && selectedPlayerId) {
        this.activePlayerId = selectedPlayerId;
      }
      if (!this.activePlayerId && players.length > 0) {
        this.activePlayerId = players[0].id;
      }

      this.playersList.innerHTML = "";
      const maxVisiblePlayers = 3;
      let visiblePlayers = players.slice(0, maxVisiblePlayers);
      if (
        this.activePlayerId &&
        players.length > maxVisiblePlayers &&
        !visiblePlayers.some((p) => p.id === this.activePlayerId)
      ) {
        const activePlayer = players.find((p) => p.id === this.activePlayerId);
        if (activePlayer) {
          visiblePlayers = [...visiblePlayers.slice(0, maxVisiblePlayers - 1), activePlayer];
        }
      }

      visiblePlayers.forEach((player) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "player-btn";
        if (player.id === this.activePlayerId) btn.classList.add("selected");

        const avatarEl = document.createElement("span");
        avatarEl.className = "player-avatar";
        avatarEl.textContent = player.avatar;
        const nameEl = document.createElement("span");
        nameEl.className = "player-name";
        nameEl.textContent = player.displayName;

        btn.appendChild(avatarEl);
        btn.appendChild(nameEl);
        btn.addEventListener("click", () => {
          this.activePlayerId = player.id;
          ProgressStore.setSelectedPlayer(player.id);
          this.renderStartState();
        });
        this.playersList.appendChild(btn);
      });

      const utilityBtn = document.createElement("button");
      utilityBtn.type = "button";
      utilityBtn.className = "player-btn add-new";
      if (players.length > maxVisiblePlayers) {
        utilityBtn.classList.add("player-btn-more");
        utilityBtn.innerHTML = `<span class="player-avatar">+${players.length - visiblePlayers.length}</span><span class="player-name">Meer</span>`;
        utilityBtn.title = "Meer spelers";
        utilityBtn.addEventListener("click", () => this.openPlayersModal());
      } else {
        utilityBtn.innerHTML = `<span class="player-avatar">+</span><span class="player-name">Nieuw</span>`;
        utilityBtn.title = "Nieuwe speler toevoegen";
        utilityBtn.addEventListener("click", () => this.openAddPlayerModal());
      }
      this.playersList.appendChild(utilityBtn);

      this.startBtn.disabled = !this.activePlayerId;
    }

    renderPlayersModalList() {
      const { players } = ProgressStore.listPlayers();
      this.playersModalList.innerHTML = "";
      players.forEach((player) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "player-btn";
        if (player.id === this.activePlayerId) btn.classList.add("selected");
        const avatarEl = document.createElement("span");
        avatarEl.className = "player-avatar";
        avatarEl.textContent = player.avatar;
        const nameEl = document.createElement("span");
        nameEl.className = "player-name";
        nameEl.textContent = player.displayName;
        btn.appendChild(avatarEl);
        btn.appendChild(nameEl);
        btn.addEventListener("click", () => {
          this.activePlayerId = player.id;
          ProgressStore.setSelectedPlayer(player.id);
          this.closePlayersModal();
          this.renderStartState();
        });
        this.playersModalList.appendChild(btn);
      });
    }

    openPlayersModal() {
      this.renderPlayersModalList();
      this.playersModal.classList.remove("hidden");
      this.playersModal.setAttribute("aria-hidden", "false");
    }

    closePlayersModal() {
      this.playersModal.classList.add("hidden");
      this.playersModal.setAttribute("aria-hidden", "true");
    }

    openAddPlayerModal() {
      this.newPlayerNameInput.value = "";
      this.selectedAvatar = AVAILABLE_AVATARS[0];
      this.renderAvatarPicker();
      this.addPlayerModal.classList.remove("hidden");
      this.addPlayerModal.setAttribute("aria-hidden", "false");
      this.newPlayerNameInput.focus();
    }

    closeAddPlayerModal() {
      this.addPlayerModal.classList.add("hidden");
      this.addPlayerModal.setAttribute("aria-hidden", "true");
    }

    renderStartState() {
      this.closeStatsSheet();
      this.closePlayersModal();
      this.renderPlayersList();
      this.renderProfileSummary();
    }

    renderProfileSummary() {
      if (!this.activePlayerId) {
        this.profileSummary.textContent = "Voeg eerst een speler toe om te starten.";
        this.phaseMap.innerHTML = "";
        this.phaseMapWrap.classList.toggle("hidden", this.selectedMode !== "challenge");
        this.startBtn.textContent =
          this.selectedMode === "practice" ? "Start vrij oefenen" : "Start ronde";
        this.renderScorePanels();
        this.renderPracticeInsights();
        return;
      }

      const summary = ProgressStore.getSummary(this.activePlayerId);
      this.selectedPhase = summary.selectedPhase;
      ProgressStore.setSelectedPhase(this.activePlayerId, this.selectedPhase);

      const phaseLabel = LearningPath.phaseLabel(this.selectedPhase);
      const accuracyText =
        summary.lastAccuracy === null
          ? "Nog geen score in geselecteerde level"
          : `Laatste score in geselecteerde level: ${summary.lastAccuracy}%`;

      this.profileSummary.textContent =
        `${summary.avatar} ${summary.displayName} - ${phaseLabel} - ` +
        `Vrijgespeeld t/m level ${summary.highestUnlockedPhase} - ${accuracyText}`;

      this.startBtn.textContent =
        this.selectedMode === "practice"
          ? "Start vrij oefenen"
          : `Start level ${this.selectedPhase}`;
      this.renderPhaseMap(summary);
      this.phaseMapWrap.classList.toggle("hidden", this.selectedMode !== "challenge");
      this.renderScorePanels();
      this.renderPracticeInsights();
    }

    openStatsSheet() {
      this.renderScorePanels();
      this.renderPracticeInsights();
      this.statsSheet.classList.remove("hidden");
      this.statsSheet.setAttribute("aria-hidden", "false");
    }

    closeStatsSheet() {
      this.statsSheet.classList.add("hidden");
      this.statsSheet.setAttribute("aria-hidden", "true");
    }

    renderScorePanels() {
      const overallLeaderboard = ProgressStore.getOverallLeaderboard();
      this.overallLeaderboardList.innerHTML = "";
      overallLeaderboard.slice(0, 7).forEach((entry, idx) => {
        const li = document.createElement("li");
        li.textContent =
          `#${idx + 1} ${entry.avatar} ${entry.displayName} - Totaal: ${entry.totalNorm} p - ` +
          `Levels: ${entry.levelsPlayed}/${LearningPath.maxPhase}`;
        this.overallLeaderboardList.appendChild(li);
      });
      if (overallLeaderboard.length === 0) {
        const li = document.createElement("li");
        li.textContent = "Nog geen algemene scores.";
        this.overallLeaderboardList.appendChild(li);
      }

      const leaderboard = ProgressStore.getLevelLeaderboard(this.selectedPhase);
      this.leaderboardList.innerHTML = "";
      leaderboard.slice(0, 5).forEach((entry, idx) => {
        const li = document.createElement("li");
        li.textContent = `#${idx + 1} ${entry.avatar} ${entry.displayName} - ${entry.bestScoreNorm} p`;
        this.leaderboardList.appendChild(li);
      });
      if (leaderboard.length === 0) {
        const li = document.createElement("li");
        li.textContent = `Nog geen scores voor level ${this.selectedPhase}.`;
        this.leaderboardList.appendChild(li);
      }

      if (!this.activePlayerId) {
        this.overallLeaderboardMyRank.textContent = "";
        this.leaderboardMyRank.textContent = "";
        this.recordBestScore.textContent = "Beste score: -";
        this.recordBestAccuracy.textContent = "Beste nauwkeurigheid: -";
        this.recordBestSpeed.textContent = "Snelste gemiddelde tijd: -";
        return;
      }

      const overallRank = overallLeaderboard.findIndex((entry) => entry.playerId === this.activePlayerId);
      this.overallLeaderboardMyRank.textContent =
        overallRank >= 0
          ? `Jouw algemene rank: #${overallRank + 1} van ${overallLeaderboard.length}`
          : "Nog geen algemene rank.";

      const rank = leaderboard.findIndex((entry) => entry.playerId === this.activePlayerId);
      this.leaderboardMyRank.textContent =
        rank >= 0
          ? `Jouw rank (level ${this.selectedPhase}): #${rank + 1} van ${leaderboard.length}`
          : `Nog geen rank voor level ${this.selectedPhase}.`;

      const records = ProgressStore.getPlayerRecords(this.activePlayerId, this.selectedPhase);
      this.recordBestScore.textContent =
        `Beste score (level ${this.selectedPhase}): ${records.bestScoreRaw} p (ranking: ${records.bestScoreNormalized} p)`;
      this.recordBestAccuracy.textContent = `Beste nauwkeurigheid: ${records.bestAccuracy}%`;
      this.recordBestSpeed.textContent =
        `Snelste gemiddelde tijd: ${
          typeof records.bestAvgResponseMs === "number" ? formatMsToSec(records.bestAvgResponseMs) : "-"
        }`;
    }

    renderPracticeInsights() {
      if (!this.activePlayerId) {
        this.practiceInsightsEl.textContent = "Nog geen oefeninzichten.";
        return;
      }
      const insights = ProgressStore.getPracticeInsights(this.activePlayerId);
      const toLabel = (kind) => {
        const map = {
          handSwap: "wijzers omgewisseld",
          referenceAnchorConfusion: "uuranker (half/voor/over)",
          nearMinute: "minuten-inschatting",
          hourReference: "uurverwijzing",
          timeout: "tijdsdruk",
          other: "overig",
          correct: "goed beantwoorde patronen",
        };
        return map[kind] || kind;
      };
      const weak =
        insights.weakestKinds.length > 0
          ? insights.weakestKinds.map(toLabel).join(", ")
          : "nog geen";
      const strong =
        insights.strongKinds.length > 0 ? insights.strongKinds.map(toLabel).join(", ") : "nog geen";
      this.practiceInsightsEl.textContent =
        `Sessies: ${insights.sessions} - Juist: ${insights.correctRate}% - Meer oefenen: ${weak} - Gaat al goed: ${strong}.`;
    }

    getStarsForLevel(level, summary) {
      if (!summary.completedPhases.includes(level)) return "";
      const records = ProgressStore.getPlayerRecords(this.activePlayerId, level);
      const maxNorm = Math.round((2000 / (LEVEL_SCORE_FACTORS[level] || 1)));
      const ratio = maxNorm > 0 ? records.bestScoreNormalized / maxNorm : 0;
      let stars = 1;
      if (ratio >= 0.9) stars = 3;
      else if (ratio >= 0.75) stars = 2;
      return "⭐".repeat(stars);
    }

    renderPhaseMap(summary) {
      this.phaseMap.innerHTML = "";
      for (let phase = 1; phase <= LearningPath.maxPhase; phase += 1) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "phase-node";
        const unlocked = phase <= summary.highestUnlockedPhase;
        const completed = summary.completedPhases.includes(phase);
        const selected = phase === this.selectedPhase;

        if (completed) btn.classList.add("completed");
        if (!unlocked) btn.classList.add("locked");
        if (selected) btn.classList.add("selected");

        const statusLabel = completed ? "Klaar" : unlocked ? "Open" : "Dicht";
        const stars = this.getStarsForLevel(phase, summary);
        const levelLeaderboard = ProgressStore.getLevelLeaderboard(phase);
        const topPlayerId = levelLeaderboard[0]?.playerId || null;
        const crown = topPlayerId && this.activePlayerId === topPlayerId ? " 👑" : "";
        btn.textContent = `Level ${phase}${crown}\n${statusLabel}${stars ? ` ${stars}` : ""}`;
        btn.title = LearningPath.phaseLabel(phase);
        btn.disabled = !unlocked;

        btn.addEventListener("click", () => {
          if (!unlocked) return;
          this.selectedPhase = phase;
          ProgressStore.setSelectedPhase(this.activePlayerId, phase);
          this.renderProfileSummary();
        });

        this.phaseMap.appendChild(btn);
      }
    }

    handleAddPlayer() {
      const name = this.newPlayerNameInput.value.trim();
      const result = ProgressStore.addPlayer(name, this.selectedAvatar);
      if (result.error) {
        this.profileSummary.textContent = result.error;
        return;
      }

      this.activePlayerId = result.player.id;
      this.selectedPhase = result.player.selectedPhase;
      this.newPlayerNameInput.value = "";
      this.closeAddPlayerModal();
      this.renderStartState();
      this.profileSummary.textContent = result.existed
        ? `${result.player.avatar} ${result.player.displayName} bestaat al en is geselecteerd.`
        : `${result.player.avatar} ${result.player.displayName} toegevoegd.`;
    }

    startGame() {
      this.closeStatsSheet();
      const player = ProgressStore.getPlayer(this.activePlayerId);
      if (!player) {
        this.profileSummary.textContent = "Kies eerst een speler.";
        return;
      }

      if (this.selectedMode === "practice") {
        const insights = ProgressStore.getPracticeInsights(player.id);
        this.game.initPractice({
          playerId: player.id,
          profileName: player.displayName,
          profileAvatar: player.avatar,
          insights,
          difficultyMode: this.selectedPracticeDifficulty,
          highestUnlockedPhase: player.highestUnlockedPhase,
        });
      } else {
        const startPhase = Math.max(1, Math.min(this.selectedPhase, player.highestUnlockedPhase));
        this.selectedPhase = startPhase;
        ProgressStore.setSelectedPhase(player.id, startPhase);
        this.game.initRound({
          playerId: player.id,
          profileName: player.displayName,
          profileAvatar: player.avatar,
          phase: startPhase,
        });
        this.lastRoundPhase = startPhase;
      }

      this.answerLocked = false;
      this.pendingContinue = false;
      this.lastAnswerResult = null;
      this.continueBtn.classList.add("hidden");
      this.stopSessionBtn.classList.remove("hidden");
      this.setCompanionFeedback("", "neutral");
      this.showScreen(this.gameScreen);
      this.renderCurrentQuestion();
    }

    startGameAtPhase(phase) {
      const player = ProgressStore.getPlayer(this.activePlayerId);
      if (!player) return;
      this.selectedPhase = Math.max(1, Math.min(phase, player.highestUnlockedPhase));
      this.startGame();
    }

    startNextPhase() {
      this.startGameAtPhase(this.lastRoundPhase + 1);
    }

    renderCurrentQuestion() {
      const q = this.game.currentQuestion();
      this.answerLocked = false;
      this.pendingContinue = false;
      this.lastAnswerResult = null;
      this.continueBtn.classList.add("hidden");
      this.setCompanionFeedback("", "neutral");

      if (this.game.mode === "practice") {
        this.progressEl.textContent = `Vrij oefenen - Vraag ${this.game.currentIndex + 1}`;
        this.scoreEl.textContent = `Juist: ${this.game.correct}`;
        this.streakEl.textContent = `Fout: ${this.game.incorrect}`;
        this.stopQuestionTimer();
        this.timerEl.textContent = "Geen timer";
        this.timerEl.classList.remove("warning");
      } else {
        this.progressEl.textContent = `Vraag ${this.game.currentIndex + 1}/${this.game.config.questionCount} - Level ${this.game.phase}`;
        this.scoreEl.textContent = `Punten: ${this.game.totalScore}`;
        this.streakEl.textContent = `Streak: ${this.game.currentStreak}`;
        this.startQuestionTimer();
      }

      this.renderClock(q);
      this.renderOptions(q);
    }

    renderClock(question) {
      this.canvas.classList.remove("visible");
      this.digital.classList.remove("visible");

      if (question.type === "analog") {
        ClockRenderer.drawAnalog(this.canvas, question.time, question.clockFace === "withNumbers");
        this.canvas.classList.add("visible");
      } else {
        this.digital.textContent = TimeFormatterNL.toDigital(question.time);
        this.digital.classList.add("visible");
      }
    }

    renderOptions(question) {
      this.optionsEl.innerHTML = "";
      question.options.forEach((optionText, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "option-btn";
        btn.textContent = optionText;
        btn.addEventListener("click", () => this.submitAnswer(index, false));
        this.optionsEl.appendChild(btn);
      });
    }

    startQuestionTimer() {
      this.stopQuestionTimer();
      this.questionStartMs = Date.now();
      this.questionDeadlineMs = this.questionStartMs + this.game.config.maxQuestionTimeMs;
      this.updateTimerUI(this.game.config.maxQuestionTimeMs);

      this.timerInterval = setInterval(() => {
        const remainingMs = this.questionDeadlineMs - Date.now();
        if (remainingMs <= 0) {
          this.updateTimerUI(0);
          this.submitAnswer(null, true);
          return;
        }
        this.updateTimerUI(remainingMs);
      }, 100);
    }

    stopQuestionTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }

    updateTimerUI(remainingMs) {
      const seconds = Math.ceil(remainingMs / 1000);
      this.timerEl.textContent = `Timer: ${seconds}s`;
      this.timerEl.classList.toggle("warning", remainingMs <= 4000);
    }

    submitAnswer(selectedIndex, isTimeout) {
      if (this.answerLocked || this.pendingContinue) return;
      this.answerLocked = true;
      this.stopQuestionTimer();

      const elapsedMs = Date.now() - this.questionStartMs;
      const result = this.game.answerCurrent(selectedIndex, elapsedMs, isTimeout);
      const question = this.game.currentQuestion();
      const buttons = Array.from(this.optionsEl.querySelectorAll("button"));

      buttons.forEach((btn, idx) => {
        btn.disabled = true;
        if (idx === question.correctIndex) {
          btn.classList.add("correct");
        } else if (!isTimeout && idx === selectedIndex && !result.isCorrect) {
          btn.classList.add("wrong");
        }
      });

      if (this.game.mode === "practice") {
        this.scoreEl.textContent = `Juist: ${this.game.correct}`;
        this.streakEl.textContent = `Fout: ${this.game.incorrect}`;
      } else {
        this.scoreEl.textContent = `Punten: ${this.game.totalScore}`;
        this.streakEl.textContent = `Streak: ${this.game.currentStreak}`;
      }

      if (this.game.mode === "practice") {
        ProgressStore.recordPracticeAnswer(this.game.playerId, {
          startSession: this.game.currentIndex === 0,
          isCorrect: result.isCorrect,
          errorKind: result.errorKind,
          questionType: result.questionType,
        });
      }

      const elapsedSec = (result.elapsedMs / 1000).toFixed(1);
      if (result.isCorrect) {
        this.gameScreen.classList.add("success-burst");
        setTimeout(() => this.gameScreen.classList.remove("success-burst"), 420);
        const okText =
          this.game.mode === "practice"
            ? `Top! ${elapsedSec}s. Goed gezien.`
            : `Top! ${elapsedSec}s snel. +${result.gainedPoints} punten!`;
        this.setCompanionFeedback(okText, "happy");
        setTimeout(() => this.proceedToNextQuestion(), 1200);
      } else if (result.isTimeout) {
        this.setCompanionFeedback(
          `Tijd op. Juiste antwoord: ${result.correctAnswer}. ${TimeFormatterNL.anchorHint(question.time)}`,
          "timeout"
        );
        this.pendingContinue = true;
        this.continueBtn.classList.remove("hidden");
        this.continueBtn.focus();
      } else {
        this.setCompanionFeedback(
          `Jammer. Juiste antwoord: ${result.correctAnswer}. ${TimeFormatterNL.anchorHint(question.time)}`,
          "sad"
        );
        this.pendingContinue = true;
        this.continueBtn.classList.remove("hidden");
        this.continueBtn.focus();
      }
      this.lastAnswerResult = result;
    }

    handleContinueAfterReview() {
      if (!this.pendingContinue) return;
      this.pendingContinue = false;
      this.continueBtn.classList.add("hidden");
      this.proceedToNextQuestion();
    }

    proceedToNextQuestion() {
      if (this.game.mode === "practice") {
        this.game.currentIndex += 1;
        const insights = ProgressStore.getPracticeInsights(this.game.playerId);
        this.game.pushPracticeQuestion(insights);
        this.renderCurrentQuestion();
        return;
      }
      const hasNext = this.game.moveNext();
      if (hasNext) {
        this.renderCurrentQuestion();
      } else {
        this.renderEndScreen();
      }
    }

    renderEndScreen() {
      const result = this.game.result();
      this.lastRoundPhase = result.phase;
      const progressUpdate = ProgressStore.recordRound(result.playerId, result.phase, result);

      this.summaryPhase.textContent =
        `Speler: ${result.profileAvatar} ${result.profileName} - ${LearningPath.phaseLabel(result.phase)}`;
      this.summaryScore.textContent =
        `Totaalscore: ${result.totalScore} punten (${result.correct}/${this.game.config.questionCount} goed)`;
      this.summaryScoreNorm.textContent = progressUpdate
        ? `Ranking score (genormaliseerd): ${progressUpdate.roundScoreNorm} p`
        : "";
      this.summaryAccuracy.textContent = `Nauwkeurigheid: ${result.accuracy}%`;
      this.summaryStreak.textContent = `Beste streak: ${result.bestStreak}`;
      this.summaryTime.textContent = `Gemiddelde reactietijd: ${formatMsToSec(result.avgResponseMs)} (timeouts: ${result.timeouts})`;

      if (progressUpdate?.ranking?.currentRank) {
        const prev = progressUpdate.ranking.previousRank;
        const cur = progressUpdate.ranking.currentRank;
        const deltaText =
          typeof prev === "number"
            ? prev > cur
              ? ` (+${prev - cur})`
              : prev < cur
                ? ` (-${cur - prev})`
                : " (geen wijziging)"
            : "";
        this.summaryRank.textContent = `All-time rank level ${result.phase}: #${cur}${deltaText}`;
      } else {
        this.summaryRank.textContent = "";
      }

      if (progressUpdate?.newRecords) {
        const badges = [];
        if (progressUpdate.newRecords.score) badges.push("nieuw score-record");
        if (progressUpdate.newRecords.accuracy) badges.push("nieuw accuracy-record");
        if (progressUpdate.newRecords.speed) badges.push("nieuw snelheid-record");
        this.summaryRecords.textContent =
          badges.length > 0 ? `Records: ${badges.join(", ")}.` : "Geen nieuw persoonlijk record deze ronde.";
      } else {
        this.summaryRecords.textContent = "";
      }

      if (progressUpdate && progressUpdate.unlockedNext) {
        this.summaryProgressNote.textContent =
          `Top! Nieuw level vrijgespeeld: ${LearningPath.phaseLabel(progressUpdate.nextPhase)}.`;
      } else {
        this.summaryProgressNote.textContent = "Haal 80% of meer om het volgende level vrij te spelen.";
      }

      const canGoNext = progressUpdate && result.phase < progressUpdate.highestUnlockedPhase;
      this.nextPhaseBtn.classList.toggle("hidden", !canGoNext);

      this.renderStartState();
      this.showScreen(this.endScreen);
    }

    resetProgress() {
      if (!this.activePlayerId) return;
      const player = ProgressStore.getPlayer(this.activePlayerId);
      if (!player) return;
      ProgressStore.resetPlayerProgress(this.activePlayerId);
      this.selectedPhase = 1;
      this.renderStartState();
      this.profileSummary.textContent = `Voortgang van ${player.avatar} ${player.displayName} is gereset.`;
    }

    setCompanionFeedback(text, mood) {
      this.companionBubble.textContent = text;
      this.companionBubble.classList.toggle("hidden", !text);
      this.companionAvatarEl.classList.remove("happy", "sad", "timeout", "neutral");
      this.companionAvatarEl.classList.add(mood || "neutral");
      if (mood === "happy") {
        this.companionAvatarEl.textContent = "😺";
      } else if (mood === "sad") {
        this.companionAvatarEl.textContent = "😿";
      } else if (mood === "timeout") {
        this.companionAvatarEl.textContent = "🙀";
      } else {
        this.companionAvatarEl.textContent = "🐱";
      }
    }
  }

  function runSelfTests() {
    const checks = [];
    const expect = (label, condition) => checks.push({ label, ok: Boolean(condition) });

    expect(
      "Formatter 23:55 -> 5 voor 12",
      TimeFormatterNL.toText({ hour24: 23, minute: 55 }) === "5 voor 12"
    );
    expect(
      "Formatter 00:05 -> 5 over 12",
      TimeFormatterNL.toText({ hour24: 0, minute: 5 }) === "5 over 12"
    );
    expect(
      "Anchor confusion 15:30 -> half 3",
      TimeFormatterNL.toTextWithAnchorConfusion({ hour24: 15, minute: 30 }) === "half 3"
    );

    const options = QuestionGenerator.generateOptions({
      type: "analog",
      level: 2,
      time: { hour24: 15, minute: 30 },
      minuteStep: 30,
    });

    expect("4 unieke opties", new Set(options.options).size === 4 && options.options.length === 4);
    expect("Correct index geldig", options.correctIndex >= 0 && options.correctIndex < 4);
    expect(
      "Bevat anchor confusion",
      options.distractorMeta.some((d) => d.kind === DistractorKind.REFERENCE_ANCHOR_CONFUSION)
    );
    expect(
      "Bevat handSwap of fallback",
      options.distractorMeta.some(
        (d) => d.kind === DistractorKind.HAND_SWAP || d.kind === DistractorKind.FALLBACK
      )
    );

    const testGame = new GameState(GameConfig);
    testGame.initRound({
      playerId: "test",
      profileName: "Test",
      profileAvatar: "🐱",
      phase: 3,
    });
    const signatures = testGame.questions.map((q) => QuestionGenerator.signatureFor(q));
    expect(
      "Geen dubbele vragen in ronde",
      new Set(signatures).size === testGame.questions.length
    );

    const failures = checks.filter((c) => !c.ok);
    if (failures.length > 0) {
      console.warn("Self-tests gefaald:", failures);
    } else {
      console.info("Self-tests ok", checks.length);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    runSelfTests();
    const gameState = new GameState(GameConfig);
    new UIController(gameState);
  });
})();
