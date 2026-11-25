import { isLessonAccessible, isUnlocked } from './access.js?v=20261124-course-navigation-any-order-02';
import { cloneDatabase, createFreshDatabase, loadSqlModule } from './database.js?v=20261125-fast-query-preview-01';
import { saveQueryHistory } from './tools.js?v=20261122-platform-tracks-sequence-02';
import { resetSingleTaskProgress, wasBrowserReload } from './progress-state.mjs?v=20261125-refresh-and-preview-fix-01';
import { compareResults } from './sql-answer-checker.mjs?v=20261124-answer-based-checker-03';
import { getFirstAvailableQuestion, getNextCourseTopic, getNextUnsolvedQuestionAfter, getSharedEditorDraft, hasRequiredSemicolon, normalizeSharedEditorDraft } from './sql-practice-flow.mjs?v=20261125-global-auto-advance-01';

const PROGRESS_KEY = 'querypath-progress-v2';
const GAMIFICATION_KEY = 'querypath-gamification-v1';
const SELECTED_QUESTION_KEY = 'querypath-selected-question-v1';
const QUERY_DRAFTS_KEY = 'codebolt-sql-question-drafts-v1'; // Legacy per-question drafts; used only for migration.
const SHARED_QUERY_KEY = 'codebolt-sql-shared-editor-v1';
const XP_PER_QUESTION = 25;
const DAILY_PRACTICE_BONUS = 10;
const LEVELS = [
  { level: 1, name: 'SQL Rookie', minXP: 0 },
  { level: 2, name: 'Query Explorer', minXP: 100 },
  { level: 3, name: 'Data Learner', minXP: 250 },
  { level: 4, name: 'SQL Builder', minXP: 450 },
  { level: 5, name: 'Database Pro', minXP: 700 },
  { level: 6, name: 'SQL Master', minXP: 1000 }
];
let lessons = [];
let filteringQuestions = [];
let currentLessonIndex = 0;
let currentQuestionId = null;
let db = null;
let activeTableName = null;
let activeTableNames = [];
let activeCreatedTable = null;
let activeTutorialGroupIndex = 0;
let openRequest = 0;
let progressData = {};
let questionDrafts = {};
let sharedEditorDraft = '';
let sharedEditorDraftLoaded = false;
let gamificationData = createDefaultGamification();
let hintVisible = false;
let solutionVisible = false;
let autoAdvanceTimer = null;
let autoCheckTimer = null;
let autoCheckVersion = 0;
let queryPreviewTimer = null;
let queryPreviewVersion = 0;
let queryPreviewVisible = false;
const AUTO_CHECK_DELAY_MS = 750;
const QUERY_PREVIEW_DELAY_MS = 20;
let navigationVersion = 0;
let currentTopicSlug = 'select-statement';

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function createDefaultGamification() {
  return { xp: 0, streak: 0, bestStreak: 0, lastActiveDate: null, lastDailyBonusDate: null, awardedQuestionIds: [] };
}

function loadGamification() {
  try {
    const saved = JSON.parse(localStorage.getItem(GAMIFICATION_KEY) || 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      gamificationData = {
        ...createDefaultGamification(),
        xp: Number.isFinite(saved.xp) && saved.xp >= 0 ? Math.floor(saved.xp) : 0,
        streak: Number.isInteger(saved.streak) && saved.streak >= 0 ? saved.streak : 0,
        bestStreak: Number.isInteger(saved.bestStreak) && saved.bestStreak >= 0 ? saved.bestStreak : 0,
        lastActiveDate: typeof saved.lastActiveDate === 'string' ? saved.lastActiveDate : null,
        lastDailyBonusDate: typeof saved.lastDailyBonusDate === 'string' ? saved.lastDailyBonusDate : null,
        awardedQuestionIds: Array.isArray(saved.awardedQuestionIds) ? saved.awardedQuestionIds.filter((id) => typeof id === 'string') : []
      };
    } else {
      gamificationData = createDefaultGamification();
    }
  } catch (error) {
    gamificationData = createDefaultGamification();
    console.warn('Codeora rewards could not be read from localStorage.', error);
  }
}

function saveGamification() {
  try {
    localStorage.setItem(GAMIFICATION_KEY, JSON.stringify(gamificationData));
    window.QueryPathAccount?.saveAccountState?.();
  } catch (error) {
    console.warn('Codeora rewards could not be saved to localStorage.', error);
  }
  renderDashboard();
  renderAchievements();
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBetweenDateKeys(olderKey, newerKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(olderKey || '') || !/^\d{4}-\d{2}-\d{2}$/.test(newerKey || '')) return null;
  const [oy, om, od] = olderKey.split('-').map(Number);
  const [ny, nm, nd] = newerKey.split('-').map(Number);
  return Math.round((Date.UTC(ny, nm - 1, nd) - Date.UTC(oy, om - 1, od)) / 86400000);
}

function syncHistoricalXP() {
  // Existing solved questions receive their one-time XP when upgrading from the earlier course build.
  let changed = false;
  getAllCourseQuestions().forEach((question) => {
    if (getQuestionProgress(question.id).status === 'solved' && !gamificationData.awardedQuestionIds.includes(question.id)) {
      gamificationData.awardedQuestionIds.push(question.id);
      gamificationData.xp += XP_PER_QUESTION;
      changed = true;
    }
  });
  if (changed) saveGamification();
}

function awardCorrectAnswer(question) {
  let earned = 0;
  if (!gamificationData.awardedQuestionIds.includes(question.id)) {
    gamificationData.awardedQuestionIds.push(question.id);
    gamificationData.xp += XP_PER_QUESTION;
    earned += XP_PER_QUESTION;
  }

  const today = localDateKey();
  if (gamificationData.lastActiveDate !== today) {
    const gap = daysBetweenDateKeys(gamificationData.lastActiveDate, today);
    if (gap === 1) gamificationData.streak += 1;
    else if (gap === null || gap > 1) gamificationData.streak = 1;
    gamificationData.bestStreak = Math.max(gamificationData.bestStreak, gamificationData.streak);
    gamificationData.lastActiveDate = today;
    if (gamificationData.lastDailyBonusDate !== today) {
      gamificationData.xp += DAILY_PRACTICE_BONUS;
      earned += DAILY_PRACTICE_BONUS;
      gamificationData.lastDailyBonusDate = today;
    }
  }
  saveGamification();
  return earned;
}

function getCourseStats() {
  const allQuestions = getAllCourseQuestions();
  const solved = allQuestions.filter((question) => getQuestionProgress(question.id).status === 'solved').length;
  const freeTotal = allQuestions.filter((question) => isUnlocked(question)).length;
  const lessonsStarted = lessons.filter((lesson, index) => getLessonQuestions(index).some((question) => getQuestionProgress(question.id).status !== 'not started')).length;
  const freeLessonsCompleted = lessons.filter((lesson, index) => {
    const freeQuestions = getLessonQuestions(index).filter((question) => isUnlocked(question));
    return freeQuestions.length > 0 && freeQuestions.every((question) => getQuestionProgress(question.id).status === 'solved');
  }).length;
  return { solved, freeTotal, lessonsStarted, freeLessonsCompleted };
}

function getFreeTaskCount(lesson) {
  return lesson.questions.filter((question) => question.free === true).length;
}

function getFreeTaskSolvedCount(lesson) {
  return lesson.questions.filter((question) => question.free === true && getQuestionProgress(question.id).status === 'solved').length;
}

function isLessonUnlocked(index) {
  // Every lesson is directly accessible. Premium restrictions apply to individual
  // questions through isUnlocked(question), never to the lesson sequence.
  return isLessonAccessible(index, lessons.length);
}

function getAchievementState(stats) {
  const definitions = [
    { id: 'first-query', icon: '✦', title: 'First Step', detail: 'Solve your first SQL question.', unlocked: stats.solved >= 1, progress: Math.min(stats.solved, 1), target: 1 },
    { id: 'five-queries', icon: '⌘', title: 'Finding Your Flow', detail: 'Solve 5 questions.', unlocked: stats.solved >= 5, progress: Math.min(stats.solved, 5), target: 5 },
    { id: 'ten-queries', icon: '◈', title: 'Query Curious', detail: 'Solve 10 questions.', unlocked: stats.solved >= 10, progress: Math.min(stats.solved, 10), target: 10 },
    { id: 'five-lessons', icon: '▤', title: 'Path Explorer', detail: 'Start learning in 5 different lessons.', unlocked: stats.lessonsStarted >= 5, progress: Math.min(stats.lessonsStarted, 5), target: 5 },
    { id: 'quarter-way', icon: '◎', title: 'Data Pathfinder', detail: 'Solve 25 questions.', unlocked: stats.solved >= 25, progress: Math.min(stats.solved, 25), target: 25 },
    { id: 'free-finish', icon: '★', title: 'Free Track Finisher', detail: `Complete all ${stats.freeTotal} free questions.`, unlocked: stats.solved >= stats.freeTotal, progress: Math.min(stats.solved, stats.freeTotal), target: stats.freeTotal },
    { id: 'streak-three', icon: '🔥', title: 'Three-Day Spark', detail: 'Practice on 3 consecutive days.', unlocked: gamificationData.bestStreak >= 3, progress: Math.min(gamificationData.bestStreak, 3), target: 3 },
    { id: 'streak-seven', icon: '🏆', title: 'Week of Wisdom', detail: 'Practice on 7 consecutive days.', unlocked: gamificationData.bestStreak >= 7, progress: Math.min(gamificationData.bestStreak, 7), target: 7 }
  ];
  return definitions;
}

function renderDashboard() {
  if (!lessons.length) return;
  const root = $('#dashboard-content');
  const currentLevelIndex = Math.max(0, LEVELS.findIndex((level, index) => {
    const next = LEVELS[index + 1];
    return gamificationData.xp >= level.minXP && (!next || gamificationData.xp < next.minXP);
  }));
  const currentLevel = LEVELS[currentLevelIndex];
  const nextLevel = LEVELS[currentLevelIndex + 1];
  const levelStart = currentLevel.minXP;
  const levelEnd = nextLevel ? nextLevel.minXP : currentLevel.minXP + 1;
  const levelPercent = nextLevel ? Math.max(0, Math.min(100, Math.round(((gamificationData.xp - levelStart) / (levelEnd - levelStart)) * 100))) : 100;
  const stats = getCourseStats();
  const solvedPercent = stats.freeTotal ? Math.round((stats.solved / stats.freeTotal) * 100) : 0;
  const levelName = $('#dashboard-level-name');
  const levelTitle = $('#level-progress-title');
  const levelCaption = $('#level-progress-caption');
  const levelValue = $('#level-progress-value');
  const levelFill = $('#level-progress-fill');
  if (levelName) levelName.textContent = currentLevel.name;
  if (levelTitle) levelTitle.textContent = `Level ${currentLevel.level} · ${currentLevel.name}`;
  if (levelCaption) levelCaption.textContent = nextLevel ? `${nextLevel.minXP - gamificationData.xp} XP to ${nextLevel.name}` : 'Highest level reached';
  if (levelValue) levelValue.textContent = `${levelPercent}%`;
  if (levelFill) levelFill.style.width = `${levelPercent}%`;

  let currentLessonTitle = 'Not started';
  try {
    const savedQuestionId = localStorage.getItem(SELECTED_QUESTION_KEY);
    const savedSelection = savedQuestionId ? getQuestionById(savedQuestionId) : null;
    if (savedSelection) currentLessonTitle = lessons[savedSelection.lessonIndex].title;
  } catch {}
  if (root) {
    root.innerHTML = `
      <article class="dashboard-stat stat-completed"><span>QUESTIONS SOLVED</span><strong>${stats.solved}<small> / ${stats.freeTotal}</small></strong><div class="mini-progress"><i style="width:${solvedPercent}%"></i></div><small>${solvedPercent}% of the free learning track</small></article>
      <article class="dashboard-stat stat-xp"><span>TOTAL EXPERIENCE</span><strong>${gamificationData.xp.toLocaleString('en-IN')}<small> XP</small></strong><small>+${XP_PER_QUESTION} XP for each new solved question</small></article>
      <article class="dashboard-stat stat-streak"><span>DAILY STREAK</span><strong>${gamificationData.streak}<small> day${gamificationData.streak === 1 ? '' : 's'}</small></strong><small>Best streak: ${gamificationData.bestStreak} day${gamificationData.bestStreak === 1 ? '' : 's'}</small></article>
      <article class="dashboard-stat stat-current"><span>CURRENT LESSON</span><strong class="current-lesson-name">${escapeHtml(currentLessonTitle)}</strong><small>Your most recently opened lesson</small></article>
      <article class="dashboard-stat stat-lessons"><span>LESSONS STARTED</span><strong>${stats.lessonsStarted}<small> / 10</small></strong><small>${stats.freeLessonsCompleted} lessons with all free questions solved</small></article>
    `;
  }

  const homeSolved = $('#home-solved');
  const homeXP = $('#home-xp');
  const homeStreak = $('#home-streak');
  if (homeSolved) homeSolved.textContent = `${stats.solved} / ${stats.freeTotal}`;
  if (homeXP) homeXP.textContent = `${gamificationData.xp.toLocaleString('en-IN')} XP`;
  if (homeStreak) homeStreak.textContent = `${gamificationData.streak} days`;

  const rewardXP = $('#rewards-total-xp');
  const rewardLevel = $('#rewards-level-name');
  const rewardStreak = $('#rewards-best-streak');
  if (rewardXP) rewardXP.textContent = gamificationData.xp.toLocaleString('en-IN');
  if (rewardLevel) rewardLevel.textContent = currentLevel.name;
  if (rewardStreak) rewardStreak.textContent = `${gamificationData.bestStreak} days`;
}

function renderAchievements() {
  if (!lessons.length) return;
  const achievementRoot = $('#achievement-grid');
  if (!achievementRoot) return;
  const achievements = getAchievementState(getCourseStats());
  const unlockedCount = achievements.filter((item) => item.unlocked).length;
  const countLabel = $('#achievement-count');
  if (countLabel) countLabel.textContent = `${unlockedCount} / ${achievements.length} unlocked`;
  achievementRoot.innerHTML = achievements.map((item) => `
    <article class="achievement-card ${item.unlocked ? 'unlocked' : 'locked'}">
      <span class="achievement-icon" aria-hidden="true">${item.icon}</span>
      <div class="achievement-copy"><b>${item.title}</b><p>${item.detail}</p><div class="achievement-track"><i style="width:${Math.round((item.progress / item.target) * 100)}%"></i></div><small>${item.progress} / ${item.target}</small></div>
      <span class="achievement-status">${item.unlocked ? 'EARNED' : 'LOCKED'}</span>
    </article>
  `).join('');
}

function renderLessonsCatalog() {
  const root = $('#lesson-catalog');
  if (!root || !lessons.length) return;
  root.innerHTML = lessons.map((lesson, index) => {
    const lessonQuestions = getLessonQuestions(index);
    const solved = lessonQuestions.filter((question) => getQuestionProgress(question.id).status === 'solved').length;
    const available = lessonQuestions.filter((question) => isUnlocked(question)).length;
    const percent = available ? Math.round((solved / available) * 100) : 0;
    return `
      <article class="catalog-card">
        <div class="catalog-card-top"><span class="catalog-number">LESSON ${String(index + 1).padStart(2, '0')}</span><span class="catalog-status">${solved}/${available} free done</span></div>
        <h2>${escapeHtml(lesson.title)}</h2>
        <p>${escapeHtml(lesson.subtitle)}</p>
        <div class="catalog-progress"><span style="width:${percent}%"></span></div>
        <div class="catalog-card-bottom"><small>${available} free · ${lessonQuestions.length - available} premium locked</small><a class="page-button" href="practice.html?lesson=${index}">Open lesson <span aria-hidden="true">→</span></a></div>
      </article>
    `;
  }).join('');
}

function renderHomePage() {
  const startLink = $('#home-continue');
  if (startLink) {
    startLink.href = 'practice.html?lesson=0';
    startLink.innerHTML = 'Begin Lesson 1: SELECT queries 101 <span aria-hidden="true">›</span>';
  }
}

function renderExplanationPage() {
  const root = $('#explanation-content');
  if (!root || !lessons.length) return;
  const params = new URLSearchParams(window.location.search);
  let questionId = params.get('question');
  if (!questionId) {
    try { questionId = localStorage.getItem(SELECTED_QUESTION_KEY); } catch {}
  }
  let selection = questionId ? getQuestionById(questionId) : null;
  if (!selection) selection = { question: lessons[0].questions[0], lessonIndex: 0, questionIndex: 0 };
  currentQuestionId = selection.question.id;
  currentLessonIndex = selection.lessonIndex;
  const { question, lessonIndex, questionIndex } = selection;
  const lesson = lessons[lessonIndex];
  if (!isUnlocked(question)) {
    root.innerHTML = `<div class="page-hero"><p class="eyebrow">GUIDED LEARNING</p><h1>Premium explanation</h1><p>This question's explanation is part of the Premium track. Choose an available free question to view its walkthrough.</p><a class="page-button" href="practice.html?lesson=${lessonIndex}&question=${encodeURIComponent(question.id)}">Open practice page →</a></div>`;
    return;
  }
  root.innerHTML = `
    <div class="page-hero"><p class="eyebrow">LESSON ${String(lessonIndex + 1).padStart(2, '0')} · QUESTION ${questionIndex + 1}</p><h1>${escapeHtml(question.text)}</h1><p>${escapeHtml(lesson.title)} · ${escapeHtml(lesson.subtitle)}</p><a class="page-button" href="practice.html?lesson=${lessonIndex}&question=${encodeURIComponent(question.id)}">Practice this question →</a></div>
    <div class="concept"><b>LESSON CONCEPT</b><br>${escapeHtml(lesson.concept)}</div>
    ${getQuestionLearningContent(question)}
  `;
  renderExpectedOutput(question.id);
}

function getQuestionLearningContent(question) {
  const explanation = question.explanation || 'Identify the table, selected columns and any condition that controls the result.';
  const example = question.example || 'SELECT column_name FROM table_name;';
  return `
    <details class="learning-panel" id="guided-explanation" open>
      <summary><span><small>GUIDED EXPLANATION</small><b>Understand the idea before you query</b></span><span class="learning-chevron">−</span></summary>
      <div class="learning-panel-body">
        <div class="learning-explanation"><b>THE CONCEPT</b><p>${escapeHtml(explanation)}</p></div>
        <div class="learning-example"><div><b>SYNTAX EXAMPLE</b><span>A reusable pattern</span></div><pre><code>${escapeHtml(example)}</code></pre></div>
        <div class="learning-expected"><div class="learning-output-heading"><b>EXPECTED OUTPUT</b><span>Based on the sample database</span></div><div id="expected-output" class="expected-output"><p class="dashboard-loading">Preparing a sample result…</p></div></div>
      </div>
    </details>
  `;
}

async function renderExpectedOutput(questionId) {
  const selection = getQuestionById(questionId);
  if (!selection || !isUnlocked(selection.question)) return;
  const output = $('#expected-output');
  if (!output) return;
  try {
    const sampleDb = await createFreshDatabase();
    if (currentQuestionId !== questionId) {
      sampleDb.close();
      return;
    }
    let results;
    if (selection.question.type === 'state') {
      sampleDb.run(selection.question.solution);
      results = sampleDb.exec(selection.question.displayVerify || selection.question.verify);
    } else {
      results = sampleDb.exec(selection.question.solution);
    }
    sampleDb.close();
    const liveOutput = $('#expected-output');
    if (currentQuestionId === questionId && liveOutput) liveOutput.innerHTML = renderResultSets(results);
  } catch (error) {
    const liveOutput = $('#expected-output');
    if (currentQuestionId === questionId && liveOutput) liveOutput.textContent = `Example output is unavailable: ${error.message}`;
  }
}

function getQuestionById(id) {
  for (let lessonIndex = 0; lessonIndex < lessons.length; lessonIndex += 1) {
    const questionIndex = lessons[lessonIndex].questions.findIndex((question) => question.id === id);
    if (questionIndex !== -1) {
      return { question: lessons[lessonIndex].questions[questionIndex], lessonIndex, questionIndex };
    }
  }
  const filteringQuestionIndex = filteringQuestions.findIndex((question) => question.id === id);
  if (filteringQuestionIndex !== -1) {
    return {
      question: filteringQuestions[filteringQuestionIndex],
      lessonIndex: 4,
      questionIndex: lessons[4].questions.length + filteringQuestionIndex
    };
  }
  return null;
}

function getLessonQuestions(lessonIndex) {
  const baseQuestions = lessons[lessonIndex]?.questions || [];
  return lessonIndex === 4 ? [...baseQuestions, ...filteringQuestions] : baseQuestions;
}

function getAllCourseQuestions() {
  return lessons.flatMap((lesson, index) => getLessonQuestions(index));
}

function getQuestionProgress(id) {
  const entry = progressData[id];
  return {
    status: entry?.status === 'solved' || entry?.status === 'attempted' ? entry.status : 'not started',
    attempts: Number.isInteger(entry?.attempts) && entry.attempts > 0 ? entry.attempts : 0,
    wrongAttempts: Number.isInteger(entry?.wrongAttempts) && entry.wrongAttempts > 0 ? entry.wrongAttempts : 0
  };
}

function loadQuestionDrafts() {
  // New behaviour: one shared SQL editor value for every question. Keep the old
  // per-question map only so existing learners can migrate their current draft.
  try {
    const sharedSaved = localStorage.getItem(SHARED_QUERY_KEY);
    if (sharedSaved !== null) {
      sharedEditorDraft = normalizeSharedEditorDraft(sharedSaved);
      sharedEditorDraftLoaded = true;
    } else {
      const saved = JSON.parse(localStorage.getItem(QUERY_DRAFTS_KEY) || '{}');
      questionDrafts = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
      sharedEditorDraft = '';
      sharedEditorDraftLoaded = false;
    }
  } catch (error) {
    questionDrafts = {};
    sharedEditorDraft = '';
    sharedEditorDraftLoaded = false;
    console.warn('Saved SQL editor text could not be read from localStorage.', error);
  }
}

function saveSharedEditorDraft(sql) {
  sharedEditorDraft = normalizeSharedEditorDraft(sql);
  sharedEditorDraftLoaded = true;
  try {
    localStorage.setItem(SHARED_QUERY_KEY, sharedEditorDraft);
  } catch (error) {
    console.warn('Shared SQL editor text could not be saved.', error);
  }
}

function saveCurrentQuestionDraft() {
  const textarea = $('#query');
  if (textarea) saveSharedEditorDraft(textarea.value);
}

function getSavedQuestionDraft(questionId) {
  if (!sharedEditorDraftLoaded) {
    const question = getQuestionById(questionId)?.question;
    const legacyFallback = question && getQuestionProgress(questionId).status === 'solved'
      ? question.solution
      : '';
    sharedEditorDraft = getSharedEditorDraft(null, questionDrafts, questionId, legacyFallback);
    sharedEditorDraftLoaded = true;
    try {
      localStorage.setItem(SHARED_QUERY_KEY, sharedEditorDraft);
    } catch (error) {
      console.warn('Legacy SQL answer could not be migrated to the shared editor.', error);
    }
  }
  return sharedEditorDraft;
}

function loadProgress() {
  try {
    const saved = localStorage.getItem(PROGRESS_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      progressData = parsed;
    }
  } catch (error) {
    progressData = {};
    console.warn('Codeora progress could not be read from localStorage.', error);
  }
  updateProgress();
}

function initializeProgressRecords() {
  const normalized = {};
  getAllCourseQuestions().forEach((question) => {
    const saved = progressData[question.id];
    normalized[question.id] = {
      status: saved?.status === 'solved' || saved?.status === 'attempted' ? saved.status : 'not started',
      attempts: Number.isInteger(saved?.attempts) && saved.attempts > 0 ? saved.attempts : 0,
      wrongAttempts: Number.isInteger(saved?.wrongAttempts) && saved.wrongAttempts > 0 ? saved.wrongAttempts : 0,
      updatedAt: typeof saved?.updatedAt === 'string' ? saved.updatedAt : null
    };
  });
  progressData = normalized;
  saveProgress();
}

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressData));
    window.QueryPathAccount?.saveAccountState?.();
  } catch (error) {
    console.warn('Codeora progress could not be saved to localStorage.', error);
  }
  updateProgress();
}

function recordAttempt(question, correct) {
  const previous = getQuestionProgress(question.id);
  if (previous.status === 'solved') return 0;
  const earnedXP = correct ? awardCorrectAnswer(question) : 0;
  progressData[question.id] = {
    status: correct || previous.status === 'solved' ? 'solved' : 'attempted',
    attempts: previous.attempts + 1,
    wrongAttempts: previous.wrongAttempts + (correct ? 0 : 1),
    updatedAt: new Date().toISOString()
  };
  saveProgress();
  nav();
  renderQuestionList();
  return earnedXP;
}

function updateProgress() {
  let solved = 0;
  getAllCourseQuestions().forEach((question) => {
    if (getQuestionProgress(question.id).status === 'solved') solved += 1;
  });
  const counter = $('#progress');
  if (counter) counter.textContent = `${solved} / ${getAllCourseQuestions().length}`;
  lessons.forEach((lesson, index) => {
    const lessonQuestions = getLessonQuestions(index);
    const count = lessonQuestions.filter((question) => getQuestionProgress(question.id).status === 'solved').length;
    const fill = $(`#lesson-progress-${index}`);
    const label = $(`#lesson-progress-label-${index}`);
    if (fill) fill.style.width = `${lessonQuestions.length ? (count / lessonQuestions.length) * 100 : 0}%`;
    if (label) label.textContent = `${count}/${lessonQuestions.length} solved`;
  });
  renderDashboard();
  if (document.body.dataset.page === 'practice') {
    renderInteractiveTutorial();
    refreshFinishLessonButton();
  }
}

function nav() {
  const navRoot = $('#nav');
  if (!navRoot || !lessons.length) return;
  navRoot.innerHTML = lessons.map((item, index) => {
    const lessonQuestions = getLessonQuestions(index);
    const solved = lessonQuestions.filter((question) => getQuestionProgress(question.id).status === 'solved').length;
    const unlocked = isLessonUnlocked(index);
    return `
      <button type="button" class="lesson-link ${index === currentLessonIndex ? 'active' : ''} ${unlocked ? '' : 'locked'}" ${unlocked ? '' : 'disabled aria-disabled="true"'}
        aria-current="${index === currentLessonIndex ? 'page' : 'false'}"
        data-action="open-lesson" data-lesson-index="${index}">
        <span class="lesson-link-title">${String(index + 1).padStart(2, '0')}　${escapeHtml(item.title)}</span>
        <span class="lesson-progress-track"><span id="lesson-progress-${index}" style="width:${lessonQuestions.length ? (solved / lessonQuestions.length) * 100 : 0}%"></span></span>
        <span class="lesson-progress-label" id="lesson-progress-label-${index}">${solved}/${lessonQuestions.length} solved</span>
      </button>
    `;
  }).join('');
}

function renderSolutions() {
  const root = $('#solution-library');
  if (!root || !lessons.length) return;

  const allQuestions = getAllCourseQuestions();
  const freeCount = allQuestions.filter((question) => isUnlocked(question)).length;
  const premiumCount = allQuestions.filter((question) => !isUnlocked(question)).length;

  root.innerHTML = `
    <div class="solutions-heading">
      <p class="eyebrow">REFERENCE LIBRARY</p>
      <h2 id="solutions-title">SQL Solutions</h2>
      <p class="solutions-intro">Browse the reference query for every practice question, grouped by lesson.</p>
      <div class="solution-counts">
        <span class="solution-count-free">${freeCount} FREE SOLUTIONS</span>
        <span class="solution-count-premium">${premiumCount} PREMIUM LOCKED</span>
      </div>
    </div>
    <div class="solution-lessons">
      ${lessons.map((lesson, lessonIndex) => {
        const lessonQuestions = getLessonQuestions(lessonIndex);
        const lessonFreeCount = lessonQuestions.filter((question) => isUnlocked(question)).length;
        const lessonPremiumCount = lessonQuestions.length - lessonFreeCount;
        return `
          <details class="solution-lesson" ${lessonIndex === 0 ? 'open' : ''}>
            <summary>
              <span class="solution-lesson-title">${String(lessonIndex + 1).padStart(2, '0')} · ${escapeHtml(lesson.title)}</span>
              <span class="solution-lesson-meta">${lessonFreeCount} free · ${lessonPremiumCount} premium</span>
            </summary>
            <div class="solution-question-list">
              ${lessonQuestions.map((question, questionIndex) => {
                const unlocked = isUnlocked(question);
                return `
                  <article class="solution-card ${unlocked ? 'solution-card-free' : 'solution-card-locked'}">
                    <div class="solution-card-heading">
                      <span class="solution-qnum">Q${String(questionIndex + 1).padStart(2, '0')}</span>
                      <p>${escapeHtml(question.text)}</p>
                      <span class="solution-access ${unlocked ? 'free' : 'premium'}">${unlocked ? 'FREE' : '🔒 PREMIUM'}</span>
                    </div>
                    ${unlocked ? `
                      <div class="solution-code-label">REFERENCE SQL</div>
                      <pre class="solution-code"><code>${escapeHtml(question.solution)}</code></pre>
                      <a class="solution-practice-link" href="practice.html?lesson=${lessonIndex}&question=${encodeURIComponent(question.id)}">Practice this question →</a>
                    ` : `
                      <div class="solution-premium-lock">
                        <b>Premium solution</b>
                        <p>This answer is reserved for Premium subscribers. Account and subscription verification are not connected yet.</p>
                      </div>
                    `}
                  </article>
                `;
              }).join('')}
            </div>
          </details>
        `;
      }).join('')}
    </div>
    <p class="solutions-notice">Premium solutions are hidden in this library. This is currently a front-end lock only; secure access requires server-side login and subscription verification.</p>
  `;
}

function renderQuestionList() {
  const freeRoot = $('#free-task-list');
  const premiumRoot = $('#premium-task-list');
  if (!freeRoot || !premiumRoot || !lessons.length) return;
  const topicQuestions = getActiveTopicQuestions();
  const freeQuestions = topicQuestions.filter((question) => isUnlocked(question));
  const premiumQuestions = topicQuestions.filter((question) => !isUnlocked(question));
  const freeSolved = freeQuestions.filter((question) => getQuestionProgress(question.id).status === 'solved').length;
  const summary = $('#task-progress-count');
  if (summary) {
    const complete = freeQuestions.length > 0 && freeSolved === freeQuestions.length;
    summary.textContent = freeQuestions.length ? `${freeSolved} / ${freeQuestions.length} complete` : 'Premium questions only';
    summary.classList.toggle('complete', complete);
  }
  const renderTask = (question, index, locked = false) => {
    const state = getQuestionProgress(question.id);
    const selected = question.id === currentQuestionId;
    const marker = locked ? '🔒' : state.status === 'solved' ? '<span class="task-check-mark" aria-hidden="true">✓</span>' : '';
    const lockedLabel = `Premium question ${index + 1}. Locked.`;
    return `<button type="button" class="task-choice ${selected ? 'active' : ''} ${state.status === 'solved' ? 'done' : ''} ${locked ? 'locked' : ''}" data-action="${locked ? '' : 'select-question'}" data-question-id="${escapeHtml(question.id)}" ${locked ? `disabled aria-disabled="true" aria-label="${lockedLabel}" title="Premium question"` : ''} aria-current="${selected ? 'true' : 'false'}">
      <span class="task-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="task-text">${escapeHtml(question.text)}</span>
      <span class="task-state" aria-label="${locked ? 'Premium task' : state.status === 'solved' ? 'Completed' : ''}">${marker}</span>
    </button>`;
  };
  freeRoot.innerHTML = freeQuestions.map((question, index) => renderTask(question, index)).join('') || '<p class="task-empty">No free tasks in this topic.</p>';
  premiumRoot.innerHTML = premiumQuestions.map((question, index) => renderTask(question, freeQuestions.length + index, true)).join('') || '<p class="task-empty">No premium tasks in this topic.</p>';
}

const SQL_TOPIC_GROUPS = [
  { title: 'Foundation · Basic SQL Queries', topics: [
    { slug: 'select-statement', title: 'SELECT Statement', lessonIndex: 0, description: 'SELECT reads information from a table. Choose the columns you need after SELECT and identify the source table with FROM. The first lesson uses a simple school table with student names, teachers, marks and classes.', example: 'SELECT student, teacher\nFROM school;' },
    { slug: 'where-clause', title: 'WHERE Clause', lessonIndex: 1, description: 'WHERE keeps only the students whose marks, teacher or class match the condition you choose.', example: 'SELECT student, marks\nFROM school\nWHERE marks > 80;' },
    { slug: 'like-operator', title: 'LIKE Operator', lessonIndex: 4, questionIds: ['l4-text-q4', 'l4-text-q5', 'l4-text-q6', 'l4-text-q7'], description: 'Use LIKE and NOT LIKE inside WHERE to find text that matches a pattern. The % wildcard matches any number of characters and _ matches exactly one character.', example: "SELECT student\nFROM school\nWHERE student LIKE 'A%';" },
    { slug: 'order-by', title: 'ORDER BY', lessonIndex: 2, description: 'ORDER BY puts student results in a clear order. Use ASC for lowest-to-highest marks or A to Z, and DESC for highest-to-lowest.', example: 'SELECT student, marks\nFROM school\nORDER BY marks DESC;' },
    { slug: 'distinct-limit', title: 'DISTINCT & LIMIT', lessonIndex: 3, description: 'DISTINCT shows each teacher or class only once. LIMIT controls how many result rows are displayed.', example: 'SELECT DISTINCT teacher\nFROM school\nLIMIT 5;' }
  ]},
  { title: 'Foundation · Database & Table Basics (DDL)', topics: [
    { slug: 'creating-databases', title: 'Creating Databases', lessonIndex: 9, description: 'CREATE DATABASE creates a new database in systems that support it. SQLite uses a database file, so database creation is handled when that file is opened.', example: 'CREATE TABLE departments (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n);' },
    { slug: 'creating-tables', title: 'Creating Tables', lessonIndex: 9, description: 'CREATE TABLE defines a new table and its columns. Each column has a name and a data type.', example: 'CREATE TABLE books (\n  id INTEGER PRIMARY KEY,\n  title TEXT NOT NULL\n);' },
    { slug: 'data-types', title: 'Data Types in SQL', lessonIndex: 9, description: 'Data types describe the kind of value a column stores, such as integers, text, decimal numbers or dates.', example: 'CREATE TABLE products (\n  id INTEGER,\n  name TEXT,\n  price REAL\n);' },
    { slug: 'constraints', title: 'Constraints', lessonIndex: 9, description: 'Constraints protect data quality. Common examples include PRIMARY KEY, NOT NULL, UNIQUE, CHECK and FOREIGN KEY.', example: 'CREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  email TEXT UNIQUE NOT NULL\n);' }
  ]},
  { title: 'Foundation · Data Manipulation (DML)', topics: [
    { slug: 'insert-into', title: 'INSERT INTO', lessonIndex: 8, description: 'INSERT INTO adds rows to a table. List the columns, then provide values in the same order.', example: "INSERT INTO students (name, age, city)\nVALUES ('Asha', 21, 'Delhi');" },
    { slug: 'update-statement', title: 'UPDATE Statement', lessonIndex: 8, description: 'UPDATE changes values in existing rows. Use WHERE to target the rows you intend to change.', example: "UPDATE students\nSET city = 'Jaipur'\nWHERE id = 1;" },
    { slug: 'delete-statement', title: 'DELETE Statement', lessonIndex: 8, description: 'DELETE removes selected rows. Without a WHERE clause, every row in the table may be removed.', example: 'DELETE FROM students\nWHERE id = 3;' },
    { slug: 'truncate-delete', title: 'TRUNCATE vs DELETE', lessonIndex: 8, description: 'DELETE can remove selected rows and supports WHERE. TRUNCATE removes all rows in systems that implement it; SQLite does not support TRUNCATE TABLE.', example: 'DELETE FROM students;' }
  ]},
  { title: 'Foundation · Filtering & Conditions', topics: [
    { slug: 'logical-operators', title: 'AND, OR, NOT Operators', lessonIndex: 4, questionIds: ['l4-text-q10', 'l4-logical-q2', 'l4-logical-q3', 'l4-logical-q4', 'l4-logical-q5', 'l4-logical-q6', 'l4-logical-q7', 'l4-logical-q8', 'l4-logical-q9', 'l4-logical-q10'], description: 'AND requires every condition to be true, OR accepts either condition, and NOT reverses a condition.', example: 'SELECT student, marks FROM school\nWHERE marks > 80 AND class = 5;' },
    { slug: 'between-in-like', title: 'BETWEEN & IN', lessonIndex: 4, questionIds: ['l4-text-q8', 'l4-text-q9', 'l4-range-q3', 'l4-range-q4', 'l4-range-q5', 'l4-range-q6', 'l4-range-q7', 'l4-range-q8', 'l4-range-q9', 'l4-range-q10'], description: 'BETWEEN checks whether a value falls inside a range. IN and NOT IN check whether a value belongs to a list.', example: "SELECT student, marks FROM school\nWHERE marks BETWEEN 70 AND 90;" },
    { slug: 'text-constraints', title: 'Text Comparisons (=, !=, <>)', lessonIndex: 4, questionIds: ['l4-text-q1', 'l4-text-q2', 'l4-text-q3', 'l4-compare-q4', 'l4-compare-q5', 'l4-compare-q6', 'l4-compare-q7', 'l4-compare-q8', 'l4-compare-q9', 'l4-compare-q10'], description: 'Compare text values exactly with =, or find values that are different with != and <>. These comparisons are case-sensitive by default in this SQLite lesson.', example: "SELECT student, teacher FROM school\nWHERE teacher = 'Neha';" }
  ]},
  { title: 'Intermediate & Advanced · Aggregate Functions', topics: [
    { slug: 'count-sum-avg', title: 'COUNT(), SUM(), AVG()', lessonIndex: 6, description: 'COUNT counts rows or values, SUM adds numeric values, and AVG calculates their average.', example: 'SELECT COUNT(*) AS students,\n       SUM(age) AS total_age,\n       AVG(age) AS average_age\nFROM students;' },
    { slug: 'min-max', title: 'MIN(), MAX()', lessonIndex: 6, description: 'MIN returns the smallest value and MAX returns the largest value in a column.', example: 'SELECT MIN(age) AS youngest,\n       MAX(age) AS oldest\nFROM students;' },
    { slug: 'group-by', title: 'GROUP BY', lessonIndex: 7, description: 'GROUP BY collects rows that share the same value so aggregate functions can return one summary per group.', example: 'SELECT city, COUNT(*) AS student_count\nFROM students\nGROUP BY city;' },
    { slug: 'having-clause', title: 'HAVING Clause', lessonIndex: 7, description: 'HAVING filters groups after GROUP BY. WHERE filters individual rows before grouping.', example: 'SELECT city, COUNT(*) AS student_count\nFROM students\nGROUP BY city\nHAVING COUNT(*) > 1;' }
  ]},
  { title: 'Intermediate & Advanced · Joins', topics: [
    { slug: 'inner-join', title: 'INNER JOIN', lessonIndex: 5, description: 'INNER JOIN returns rows where the join condition matches in both tables.', example: 'SELECT students.name, enrollments.status\nFROM students\nINNER JOIN enrollments\n  ON students.id = enrollments.student_id;' },
    { slug: 'left-join', title: 'LEFT JOIN', lessonIndex: 5, description: 'LEFT JOIN keeps every row from the left table and adds matching values from the right table. Unmatched right-side values become NULL.', example: 'SELECT students.name, enrollments.status\nFROM students\nLEFT JOIN enrollments\n  ON students.id = enrollments.student_id;' },
    { slug: 'right-join', title: 'RIGHT JOIN', lessonIndex: 5, description: 'RIGHT JOIN keeps every row from the right table and includes matching rows from the left table. SQLite versions before 3.39 do not support RIGHT JOIN.', example: 'SELECT students.name, enrollments.status\nFROM enrollments\nLEFT JOIN students\n  ON students.id = enrollments.student_id;' },
    { slug: 'full-join', title: 'FULL JOIN', lessonIndex: 5, description: 'FULL OUTER JOIN keeps matched rows and unmatched rows from both tables. It can be emulated in older SQLite versions with a UNION of left joins.', example: 'SELECT students.name, enrollments.status\nFROM students\nFULL OUTER JOIN enrollments\n  ON students.id = enrollments.student_id;' }
  ]},
  { title: 'Advanced SQL', topics: [
    { slug: 'subqueries', title: 'Subqueries', lessonIndex: 7, description: 'A subquery is a query nested inside another query. It can provide a value or a set of rows for the outer query.', example: 'SELECT name FROM students\nWHERE age > (SELECT AVG(age) FROM students);' },
    { slug: 'window-functions', title: 'Window Functions', lessonIndex: 6, description: 'Window functions calculate values across related rows without collapsing them into one row per group.', example: 'SELECT name, city, age,\n       AVG(age) OVER (PARTITION BY city) AS city_avg\nFROM students;' },
    { slug: 'ctes', title: 'Common Table Expressions (CTE)', lessonIndex: 7, description: 'A CTE gives a named result to a query using WITH. It can make multi-step SQL easier to read.', example: 'WITH city_counts AS (\n  SELECT city, COUNT(*) AS total\n  FROM students GROUP BY city\n)\nSELECT * FROM city_counts;' },
    { slug: 'optimization', title: 'Optimization', lessonIndex: 4, description: 'Query optimization starts with selecting only needed columns, filtering early, checking query plans and adding useful indexes.', example: 'CREATE INDEX idx_students_city\nON students(city);' },
    { slug: 'import-export', title: 'Import/Export of files', lessonIndex: 9, description: 'Database tools commonly import CSV files into tables and export query results for analysis. The exact command depends on the database system and client.', example: '.mode csv\n.import students.csv students' }
  ]}
];

const SQL_TOPICS = SQL_TOPIC_GROUPS.flatMap((group) => group.topics);
const TOPIC_BY_SLUG = Object.fromEntries(SQL_TOPICS.map((topic) => [topic.slug, topic]));

function getQuestionsForTopic(topic = TOPIC_BY_SLUG[currentTopicSlug], fallbackLessonIndex = currentLessonIndex) {
  if (Array.isArray(topic?.questionIds)) {
    return topic.questionIds.map((id) => getQuestionById(id)?.question).filter(Boolean);
  }
  return lessons[fallbackLessonIndex]?.questions || [];
}

function getActiveTopicQuestions() {
  return getQuestionsForTopic(TOPIC_BY_SLUG[currentTopicSlug], currentLessonIndex);
}

function getActiveFreeQuestions() {
  return getActiveTopicQuestions().filter((question) => isUnlocked(question));
}

function getActiveFreeTaskCount() {
  return getActiveFreeQuestions().length;
}

function getActiveFreeTaskSolvedCount() {
  return getActiveFreeQuestions().filter((question) => getQuestionProgress(question.id).status === 'solved').length;
}
function getDefaultTopicForLesson(index) {
  if (index === 4 && TOPIC_BY_SLUG['logical-operators']) return TOPIC_BY_SLUG['logical-operators'];
  if (index === 9 && TOPIC_BY_SLUG['creating-tables']) return TOPIC_BY_SLUG['creating-tables'];
  return SQL_TOPICS.find((topic) => topic.lessonIndex === index) || SQL_TOPICS[0];
}

function getTopicSlugForQuestion(questionId, lessonIndex) {
  const explicitlyMappedTopic = SQL_TOPICS.find((topic) =>
    topic.lessonIndex === lessonIndex && Array.isArray(topic.questionIds) && topic.questionIds.includes(questionId)
  );
  if (explicitlyMappedTopic) return explicitlyMappedTopic.slug;

  const activeTopic = TOPIC_BY_SLUG[currentTopicSlug];
  if (activeTopic?.lessonIndex === lessonIndex && !Array.isArray(activeTopic.questionIds)) {
    return activeTopic.slug;
  }
  return getDefaultTopicForLesson(lessonIndex).slug;
}

function renderInteractiveTutorial() {
  const root = $('#interactive-topics');
  if (!root || !lessons.length) return;
  const safeGroupIndex = Math.max(0, Math.min(SQL_TOPIC_GROUPS.length - 1, activeTutorialGroupIndex));
  activeTutorialGroupIndex = safeGroupIndex;
  const group = SQL_TOPIC_GROUPS[safeGroupIndex];
  root.innerHTML = `
    <div class="tutorial-menu-head">
      <div><span class="tutorial-menu-eyebrow">ALL LESSONS</span><strong>Lessons</strong></div>
      <button type="button" class="tutorial-close" data-action="close-tutorial" aria-label="Close lessons">×</button>
    </div>
    <div class="tutorial-menu-layout">
      <div class="tutorial-section-list" role="list" aria-label="Lesson sections">
        ${SQL_TOPIC_GROUPS.map((item, index) => `
          <button type="button" class="tutorial-section-option ${index === safeGroupIndex ? 'active' : ''}" data-action="select-tutorial-section" data-group-index="${index}" aria-pressed="${index === safeGroupIndex}">
            <span class="tutorial-section-number">${String(index + 1).padStart(2, '0')}</span>
            <span>${escapeHtml(item.title)}</span>
            <span class="tutorial-section-chevron" aria-hidden="true">›</span>
          </button>`).join('')}
      </div>
      <section class="tutorial-topic-panel" aria-label="Topics in selected section">
        <div class="tutorial-topic-heading"><span>SECTION ${String(safeGroupIndex + 1).padStart(2, '0')}</span><h2>${escapeHtml(group.title)}</h2></div>
        <div class="tutorial-topic-options">
          ${group.topics.map((topic, index) => {
            const selected = currentTopicSlug === topic.slug;
            return `<button type="button" class="tutorial-topic-option ${selected ? 'active' : ''}" data-action="open-topic" data-topic-slug="${topic.slug}" aria-current="${selected ? 'page' : 'false'}">
              <span class="tutorial-topic-number">${String(index + 1).padStart(2, '0')}</span>
              <span>${escapeHtml(topic.title)}</span>
              <span aria-hidden="true">›</span>
            </button>`;
          }).join('')}
        </div>
      </section>
    </div>`;
}

function setTutorialMenuOpen(isOpen) {
  const root = $('#interactive-topics');
  const trigger = $('#tutorial-toggle');
  if (!root || !trigger) return;
  if (isOpen) {
    const activeGroupIndex = SQL_TOPIC_GROUPS.findIndex((group) => group.topics.some((topic) => topic.slug === currentTopicSlug));
    if (activeGroupIndex >= 0) activeTutorialGroupIndex = activeGroupIndex;
    renderInteractiveTutorial();
  }
  root.hidden = !isOpen;
  trigger.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    const activeSection = $('.tutorial-section-option.active', root) || $('.tutorial-section-option', root);
    activeSection?.focus({ preventScroll: true });
  }
}

// Handle the tutorial menu locally so selecting a section cannot be swallowed by
// the page-level outside-click handler. The menu contents are re-rendered, but
// this listener stays attached to the persistent nav element.
const tutorialMenuRoot = $('#interactive-topics');
tutorialMenuRoot?.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const sectionButton = target.closest('.tutorial-section-option');
  if (sectionButton && tutorialMenuRoot.contains(sectionButton)) {
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = Number.parseInt(sectionButton.dataset.groupIndex || '', 10);
    if (Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < SQL_TOPIC_GROUPS.length) {
      activeTutorialGroupIndex = nextIndex;
      renderInteractiveTutorial();
      $('.tutorial-section-option.active', tutorialMenuRoot)?.focus({ preventScroll: true });
    }
    return;
  }

  const topicButton = target.closest('.tutorial-topic-option');
  if (topicButton && tutorialMenuRoot.contains(topicButton)) {
    event.preventDefault();
    event.stopPropagation();
    const topic = TOPIC_BY_SLUG[topicButton.dataset.topicSlug];
    if (topic) {
      setTutorialMenuOpen(false);
      openLesson(topic.lessonIndex, true, null, topic.slug);
    }
    return;
  }

  const closeButton = target.closest('[data-action="close-tutorial"]');
  if (closeButton && tutorialMenuRoot.contains(closeButton)) {
    event.preventDefault();
    event.stopPropagation();
    setTutorialMenuOpen(false);
    $('#tutorial-toggle')?.focus();
  }
});


const LESSON_DISPLAY_TITLES = ['SELECT Statement', 'WHERE Clause', 'ORDER BY', 'DISTINCT & LIMIT', 'Filtering & Conditions', 'Joins', 'Aggregate Functions', 'GROUP BY and HAVING', 'Data Manipulation', 'Database & Table Basics'];

const LESSON_READING = [
  [
    {
      "title": "What does SELECT do?",
      "text": "SELECT asks the school database to show the columns you choose. FROM tells SQL which table contains the information. Our beginner table is called school and stores each student's name, teacher, marks and class.",
      "code": "SELECT student, teacher\nFROM school;",
      "label": "Show student and teacher names"
    },
    {
      "title": "Show every column",
      "text": "Use an asterisk (*) when you want to see every column in the table. This is useful when you are first exploring the data.",
      "code": "SELECT *\nFROM school;",
      "label": "Show all school information"
    }
  ],
  [
    {
      "title": "Filter marks with WHERE",
      "text": "WHERE keeps only rows that match a condition. Use > to find marks above a number, < for marks below a number, and = to find an exact value.",
      "code": "SELECT student, marks\nFROM school\nWHERE marks > 80;",
      "label": "Find students scoring above 80"
    },
    {
      "title": "Filter by teacher",
      "text": "You can also use WHERE with text. Put text values inside single quotes.",
      "code": "SELECT student, teacher\nFROM school\nWHERE teacher = 'Neha';",
      "label": "Find students taught by Neha"
    }
  ],
  [
    {
      "title": "Sort marks from highest to lowest",
      "text": "ORDER BY sorts the rows using the column you choose. DESC means descending, so the highest marks appear first.",
      "code": "SELECT student, marks\nFROM school\nORDER BY marks DESC;",
      "label": "Show the highest marks first"
    },
    {
      "title": "Sort names from A to Z",
      "text": "ASC means ascending. With text, this sorts names alphabetically from A to Z.",
      "code": "SELECT student\nFROM school\nORDER BY student ASC;",
      "label": "Sort student names alphabetically"
    }
  ],
  [
    {
      "title": "Show each teacher once",
      "text": "DISTINCT removes repeated values from the result. It is useful when you want to see the list of teachers without duplicates.",
      "code": "SELECT DISTINCT teacher\nFROM school;",
      "label": "List unique teacher names"
    },
    {
      "title": "Limit the number of rows",
      "text": "LIMIT keeps the result short by returning only the number of rows you request.",
      "code": "SELECT student, marks\nFROM school\nLIMIT 3;",
      "label": "Show only three students"
    }
  ],
  [
    {
      "title": "Combine conditions with AND",
      "text": "AND requires both conditions to be true. Here, a student must have more than 80 marks and be in class 5.",
      "code": "SELECT student, marks, class\nFROM school\nWHERE marks > 80 AND class = 5;",
      "label": "Match both conditions"
    },
    {
      "title": "Use OR and LIKE",
      "text": "OR accepts a row when either condition is true. LIKE searches text patterns; the percent sign (%) represents any sequence of characters.",
      "code": "SELECT student, teacher\nFROM school\nWHERE teacher LIKE 'N%';",
      "label": "Find teachers whose name starts with N"
    }
  ],
  [
    {
      "title": "Connect related tables",
      "text": "A JOIN combines rows from two tables. The ON condition tells the database which values link the records, commonly an id in one table and a related foreign key in another.",
      "code": "SELECT students.name, enrollments.course_id\nFROM students\nJOIN enrollments\n  ON students.id = enrollments.student_id;",
      "label": "Join students and enrollments"
    },
    {
      "title": "Understand matching rows",
      "text": "An INNER JOIN returns only records where the join condition matches in both tables. Clear table names make it easier to understand where each selected column comes from.",
      "code": "SELECT students.name, enrollments.status\nFROM students\nINNER JOIN enrollments\n  ON students.id = enrollments.student_id;",
      "label": "Use an explicit INNER JOIN"
    }
  ],
  [
    {
      "title": "Calculate summaries",
      "text": "Aggregate functions calculate one summary from many rows. COUNT counts rows, AVG calculates an average, MIN and MAX find boundary values, and SUM adds numeric values.",
      "code": "SELECT COUNT(*) AS student_count\nFROM students;",
      "label": "Count records"
    },
    {
      "title": "Average and range",
      "text": "Aggregate functions can be applied to numeric columns. The result is a summary value rather than one output row for every original record.",
      "code": "SELECT AVG(age) AS average_age,\n       MIN(age) AS youngest,\n       MAX(age) AS oldest\nFROM students;",
      "label": "Calculate several summaries"
    }
  ],
  [
    {
      "title": "Create groups with GROUP BY",
      "text": "GROUP BY collects rows that share the same value. You can then calculate a summary for each group, such as the number of students in each city.",
      "code": "SELECT city, COUNT(*) AS student_count\nFROM students\nGROUP BY city;",
      "label": "Count rows in each group"
    },
    {
      "title": "Filter groups with HAVING",
      "text": "WHERE filters individual rows before grouping. HAVING filters the grouped results after aggregate calculations have been made.",
      "code": "SELECT city, COUNT(*) AS student_count\nFROM students\nGROUP BY city\nHAVING COUNT(*) > 1;",
      "label": "Keep groups that meet a rule"
    }
  ],
  [
    {
      "title": "Add new records with INSERT",
      "text": "INSERT INTO adds a new row. Name the destination columns and provide a value for each one. The values must match the order of the columns you listed.",
      "code": "INSERT INTO students (name, age, city)\nVALUES ('Asha', 21, 'Delhi');",
      "label": "Insert one student"
    },
    {
      "title": "Change or remove records",
      "text": "UPDATE changes values in existing rows and DELETE removes rows. Use a WHERE condition to target the intended records; leaving it out can affect every row in the table.",
      "code": "UPDATE students\nSET city = 'Jaipur'\nWHERE id = 1;",
      "label": "Update a specific row"
    }
  ],
  [
    {
      "title": "Define a table structure",
      "text": "CREATE TABLE makes a new table and defines its columns. Each column has a name and a data type, such as INTEGER for whole numbers or TEXT for character data.",
      "code": "CREATE TABLE books (\n  id INTEGER PRIMARY KEY,\n  title TEXT\n);",
      "label": "Create a simple table"
    },
    {
      "title": "Use a primary key",
      "text": "A PRIMARY KEY identifies each row uniquely. It helps other tables refer to the correct record and prevents two rows from sharing the same key value.",
      "code": "CREATE TABLE courses (\n  id INTEGER PRIMARY KEY,\n  title TEXT NOT NULL,\n  lesson_count INTEGER\n);",
      "label": "Add a primary key and columns"
    }
  ]
];

function getLessonDisplayTitle(index, item) {
  return `SQL Lesson ${index + 1}: ${LESSON_DISPLAY_TITLES[index] || item.title}`;
}

function renderLessonReading(item, index) {
  const topic = TOPIC_BY_SLUG[currentTopicSlug] || getDefaultTopicForLesson(index);
  const basicTopicIndex = SQL_TOPIC_GROUPS[0].topics.findIndex((entry) => entry.slug === topic.slug);
  const displayedLessonNumber = basicTopicIndex >= 0 ? basicTopicIndex + 1 : index + 1;
  if (topic.slug === 'like-operator') {
    return `
      <section class="lesson-reading">
        <article class="reading-column">
          <header class="lesson-heading">
            <p class="lesson-kicker">FOUNDATION · BASIC SQL QUERIES</p>
            <h1>SQL Lesson 3: Queries with text patterns</h1>
          </header>
          <p>Use <b>LIKE</b> and <b>NOT LIKE</b> inside a <b>WHERE</b> clause to search text. Unlike an exact comparison, LIKE can match a pattern instead of one complete word.</p>
          <section class="reading-section">
            <h2>LIKE and NOT LIKE</h2>
            <div class="operator-table-scroll" role="region" aria-label="SQL LIKE operators" tabindex="0">
              <table class="operator-reference-table">
                <thead><tr><th>Operator</th><th>What it does</th><th>Example</th></tr></thead>
                <tbody>
                  <tr><td><code>LIKE</code></td><td>Finds text that matches a pattern. SQLite LIKE is case-insensitive for ordinary ASCII letters by default.</td><td><code>teacher LIKE 'NEHA'</code></td></tr>
                  <tr><td><code>NOT LIKE</code></td><td>Finds text that does not match the pattern.</td><td><code>teacher NOT LIKE 'NEHA'</code></td></tr>
                  <tr><td><code>%</code></td><td>Matches a sequence of zero or more characters. Use it only with LIKE or NOT LIKE.</td><td><code>student LIKE '%AT%'</code></td></tr>
                  <tr><td><code>_</code></td><td>Matches exactly one character. Use it only with LIKE or NOT LIKE.</td><td><code>student LIKE 'AN_'</code></td></tr>
                </tbody>
              </table>
            </div>
          </section>
          <section class="reading-section">
            <h2>How the wildcards work</h2>
            <p><b>Percent (%):</b> it can represent no characters, one character or many characters. <code>LIKE '%AT%'</code> can match <code>AT</code>, <code>ATTIC</code>, <code>CAT</code> or <code>BATS</code>.</p>
            <p><b>Underscore (_):</b> it represents exactly one character. <code>LIKE 'AN_'</code> matches <code>AND</code>, but not <code>AN</code>.</p>
            <div class="syntax-card"><small>Names that begin with A and have five characters</small><pre><code>SELECT student
FROM school
WHERE student LIKE 'A____';</code></pre></div>
            <div class="syntax-card"><small>Find names containing AT</small><pre><code>SELECT student
FROM school
WHERE student LIKE '%AT%';</code></pre></div>
          </section>
          <aside class="did-you-know" aria-label="Did you know">
            <h2>Did you know?</h2>
            <p>Text values must be quoted. Prefer single quotes for text, such as <code>teacher LIKE 'NEHA'</code>. LIKE case sensitivity can vary between database systems; this lesson uses SQLite, where LIKE is case-insensitive for ordinary ASCII letters by default.</p>
          </aside>
        </article>
      </section>
    `;
  }
  if (topic.slug === 'between-in-like') {
    return `
      <section class="lesson-reading">
        <article class="reading-column">
          <header class="lesson-heading">
            <p class="lesson-kicker">FOUNDATION · FILTERING &amp; CONDITIONS</p>
            <h1>BETWEEN and IN</h1>
          </header>
          <p>Keep these two filtering tools in this section. BETWEEN checks a range, while IN and NOT IN check a list of possible values.</p>
          <section class="reading-section">
            <h2>Range and list operators</h2>
            <div class="operator-table-scroll" role="region" aria-label="SQL BETWEEN and IN operators" tabindex="0">
              <table class="operator-reference-table">
                <thead><tr><th>Operator</th><th>What it does</th><th>Example</th></tr></thead>
                <tbody>
                  <tr><td><code>BETWEEN</code></td><td>Matches values from the lower boundary to the upper boundary, including both ends.</td><td><code>marks BETWEEN 70 AND 90</code></td></tr>
                  <tr><td><code>IN (...)</code></td><td>Matches a value if it appears in the list.</td><td><code>teacher IN ('Neha', 'Ravi')</code></td></tr>
                  <tr><td><code>NOT IN (...)</code></td><td>Matches a value if it does not appear in the list.</td><td><code>teacher NOT IN ('Neha', 'Ravi')</code></td></tr>
                </tbody>
              </table>
            </div>
          </section>
          <section class="reading-section">
            <h2>Examples</h2>
            <div class="syntax-card"><small>Find marks from 70 to 90, including both</small><pre><code>SELECT student, marks
FROM school
WHERE marks BETWEEN 70 AND 90;</code></pre></div>
            <div class="syntax-card"><small>Find students taught by Neha or Ravi</small><pre><code>SELECT student, teacher
FROM school
WHERE teacher IN ('Neha', 'Ravi');</code></pre></div>
          </section>
        </article>
      </section>
    `;
  }
  if (topic.slug === 'text-constraints') {
    return `
      <section class="lesson-reading">
        <article class="reading-column">
          <header class="lesson-heading">
            <p class="lesson-kicker">FOUNDATION · FILTERING &amp; CONDITIONS</p>
            <h1>Text comparisons</h1>
          </header>
          <p>When a column contains text, use these operators in WHERE to compare a complete text value. LIKE pattern matching is taught separately in Foundation · Basic SQL Queries.</p>
          <section class="reading-section">
            <h2>Exact text comparison operators</h2>
            <div class="operator-table-scroll" role="region" aria-label="SQL exact text comparison operators" tabindex="0">
              <table class="operator-reference-table">
                <thead><tr><th>Operator</th><th>What it does</th><th>Example</th></tr></thead>
                <tbody>
                  <tr><td><code>=</code></td><td>Checks for an exact, case-sensitive text match under the default SQLite collation.</td><td><code>teacher = 'Neha'</code></td></tr>
                  <tr><td><code>!=</code></td><td>Checks that the text is not equal to the value.</td><td><code>teacher != 'Neha'</code></td></tr>
                  <tr><td><code>&lt;&gt;</code></td><td>Another way to write not equal. It means the same as !=.</td><td><code>student &lt;&gt; 'Aarav'</code></td></tr>
                </tbody>
              </table>
            </div>
          </section>
          <aside class="did-you-know" aria-label="Did you know">
            <h2>Did you know?</h2>
            <p>Text values (string literals) must be quoted. Prefer single quotes in SQL, such as <code>teacher = 'Neha'</code>. Double quotes are normally used for table or column names in standard SQL, not for text values.</p>
          </aside>
        </article>
      </section>
    `;
  }
  return `
    <section class="lesson-reading">
      <article class="reading-column">
        <header class="lesson-heading">
          <p class="lesson-kicker">LESSON ${String(displayedLessonNumber).padStart(2, '0')} / ${lessons.length}</p>
          <h1>${escapeHtml(topic.title)}</h1>
        </header>
        <p>${escapeHtml(topic.description)}</p>
        ${topic.slug === 'select-statement' ? `
          <section class="reading-section">
            <h2>How SELECT chooses school information</h2>
            <p><b>SELECT</b> names the fields you want to see. <b>FROM</b> names the table that stores them. In this lesson, the sample table is <b>school</b>, with columns for student ID, student name, teacher, marks and class.</p>
            <div class="syntax-card"><small>Choose student details</small><pre><code>SELECT student, teacher
FROM school;</code></pre></div>
            <h2>Choose more than one column</h2>
            <p>Write each required column after SELECT and separate the names with commas. The result follows the same column order that you write in the query.</p>
            <div class="syntax-card"><small>Show student and teacher names</small><pre><code>SELECT student, marks
FROM school;</code></pre></div>
            <h2>Return every school field</h2>
            <p>Use the asterisk (<b>*</b>) when you need every column from the selected table. For school, that means all five fields are returned.</p>
            <div class="syntax-card"><small>Return all school information</small><pre><code>SELECT *
FROM school;</code></pre></div>
          </section>` : `
          <section class="reading-section">
            <h2>${escapeHtml(topic.title)} · Example</h2>
            <p>Read the query from top to bottom. The keywords describe the operation, and the table and column names identify the data it uses.</p>
            <div class="syntax-card"><small>SQL example</small><pre><code>${escapeHtml(topic.example)}</code></pre></div>
          </section>`}
      </article>
    </section>
  `;
}

function render() {
  const item = lessons[currentLessonIndex];
  const selection = getQuestionById(currentQuestionId);
  const question = selection?.question;
  const unlocked = question ? isUnlocked(question) : false;
  const activeFreeQuestions = getActiveFreeQuestions();
  const freeTotal = activeFreeQuestions.length;
  const freeSolved = activeFreeQuestions.filter((entry) => getQuestionProgress(entry.id).status === 'solved').length;
  const topic = TOPIC_BY_SLUG[currentTopicSlug] || getDefaultTopicForLesson(currentLessonIndex);

  document.title = `${topic.title} · CodeBolt`;
  $('#lesson').innerHTML = `
    <section class="exercise-board" aria-label="SQL lesson exercise">
      <div class="exercise-left">
        <div class="course-panel-heading table-heading-row"><h2 id="table-heading">Table: ${escapeHtml(activeTableNames.length ? activeTableNames.join(', ') : activeTableName || 'sample data')}</h2><small>Look at the table</small></div>
        <div id="schema-viewer" class="table-preview">Preparing the sample table…</div>
        <section class="practice-area" aria-label="SQL query editor">
          <label class="editor-label" for="query">SQL query</label>
          <textarea id="query" class="editor" spellcheck="false" aria-label="Write your SQL query" placeholder="Write your SQL query here…" disabled></textarea>
          <div class="editor-footer">
            <p id="answer-message" class="answer-message" role="status" aria-live="polite" hidden></p>
            <div class="editor-footer-actions">
              <button type="button" class="course-button primary check-answer-button" id="check-answer-button" data-action="submit-answer">Check answer</button>
              <button type="button" class="course-button secondary reset-button" id="reset-current-task-button">Reset progress</button>
            </div>
          </div>
          <p class="auto-check-note">End every SQL query with a semicolon (;) to solve it · Auto-check is on · Enter makes a new line.</p>
        </section>
      </div>

      <aside class="exercise-right" aria-label="Lesson tasks">
        <div class="task-panel">
          <div class="course-panel-heading task-panel-heading"><h2>${escapeHtml(topic.title)}</h2><small id="task-progress-count">${freeSolved} / ${freeTotal} complete</small></div>
          <div class="task-groups">
            <section class="task-group"><h3>Free <span>· ${freeTotal}</span></h3><div id="free-task-list" class="task-list"></div></section>
            <section class="task-group premium-task-group"><h3>Premium <span>· ${Math.max(0, getActiveTopicQuestions().length - freeTotal)}</span></h3><div id="premium-task-list" class="task-list"></div></section>
          </div>
        </div>
        <div class="task-footer">
          <div class="stuck-copy task-stuck-copy">
            <p>Stuck? Read this task's <a href="#solution-panel" data-action="show-task-solution">Solution</a>.</p>
            <p class="continue-note">You can open any lesson at any time from the Lessons menu. Premium questions stay locked.</p>
          </div>
          <div id="solution-panel" class="solution-panel" hidden></div>
          <button type="button" id="finish-lesson-button" class="finish-lesson" data-action="finish-lesson" disabled>Solve all tasks to continue</button>
        </div>
      </aside>
    </section>

    ${renderLessonReading(item, currentLessonIndex)}
  `;
  const queryEditor = $('#query');
  if (queryEditor) queryEditor.value = getSavedQuestionDraft(currentQuestionId);
  renderInteractiveTutorial();
  renderQuestionList();
  // Keep the last valid shared-query result visible while a question is
  // re-rendered. openLesson will refresh it against the newly loaded database.
  if (!queryPreviewVisible) renderSchemaViewer();
  refreshFinishLessonButton();

  // The editor is re-rendered on every task navigation, so bind the reset action
  // directly to the current button instead of relying on document-level delegation.
  const resetButton = $('#reset-current-task-button');
  if (resetButton) {
    resetButton.addEventListener('click', async () => {
      resetButton.disabled = true;
      try {
        await resetCurrentTaskProgress();
      } catch (error) {
        console.error('Could not reset the current Codeora task:', error);
        const message = $('#answer-message');
        if (message) {
          message.hidden = false;
          message.className = 'answer-message bad';
          message.textContent = `Could not reset this task: ${error.message || 'Unknown error'}`;
        }
        resetButton.disabled = false;
      }
    });
  }
}

function cancelQueryPreview() {
  queryPreviewVersion += 1;
  if (queryPreviewTimer !== null) {
    window.clearTimeout(queryPreviewTimer);
    queryPreviewTimer = null;
  }
}

/** Show the exact result columns returned by the user's SELECT / WITH query. */
function renderQueryResultsInSchemaViewer(resultSets) {
  const root = $('#schema-viewer');
  const heading = $('#table-heading');
  const tabularResults = Array.isArray(resultSets)
    ? resultSets.filter((resultSet) => Array.isArray(resultSet?.columns) && Array.isArray(resultSet?.values))
    : [];
  if (!root || !tabularResults.length) return false;

  if (heading) heading.textContent = 'Query result';
  root.innerHTML = `
    <section class="table-preview-unit query-result-preview">
      <p class="table-caption">Result of your SQL query · showing selected columns only</p>
      ${renderResultSets(tabularResults)}
    </section>
  `;
  queryPreviewVisible = true;
  return true;
}

/** Identify simple, single-statement SELECT queries that are safe to preview
 * directly against the already-loaded database without cloning or reseeding it.
 */
function isSingleReadOnlySelect(sql) {
  const normalized = String(sql || '').trim();
  if (!/^SELECT\b/i.test(normalized)) return false;
  const withoutTerminator = normalized.replace(/;\s*$/, '');
  // Only a single SELECT is safe to run against the learner's working DB.
  // Multiple statements and all writes run against an isolated snapshot.
  return !withoutTerminator.includes(';');
}

async function applyQueryPreview(sql, previewVersion = queryPreviewVersion, selectedQuestionId = currentQuestionId) {
  const sourceDb = db;
  if (!sourceDb || !sql || !hasRequiredSemicolon(sql)) return false;

  let isolatedDb = null;
  try {
    let resultSets;
    let previewSource = sourceDb;
    if (isSingleReadOnlySelect(sql)) {
      // SELECT previews are synchronous and reuse the loaded database. This
      // avoids downloading/re-seeding SQL.js databases on every editor input.
      resultSets = sourceDb.exec(sql);
    } else {
      // DML/DDL previews run against a fast snapshot so typing never mutates
      // the real task database or contaminates answer validation.
      isolatedDb = await cloneDatabase(sourceDb);
      previewSource = isolatedDb;
      resultSets = isolatedDb.exec(sql);
    }

    if (previewVersion !== queryPreviewVersion
      || currentQuestionId !== selectedQuestionId
      || String($('#query')?.value || '').trim() !== sql) return false;

    if (!renderQueryResultsInSchemaViewer(resultSets)) {
      // Non-result statements still get a preview of the changed tables. Mark
      // it as an active query preview so navigation does not flash base tables.
      renderSchemaViewer(previewSource, true);
    }
    return true;
  } catch {
    // Keep the last valid preview on screen while the learner corrects SQL.
    // Never flash the unfiltered source table between preview attempts.
    return false;
  } finally {
    isolatedDb?.close();
  }
}

/** Update the preview quickly without rebuilding the whole sample database. */
function scheduleQueryPreview() {
  cancelQueryPreview();
  const sql = String($('#query')?.value || '').trim();
  if (!sql) {
    if (queryPreviewVisible) renderSchemaViewer();
    return;
  }
  // Preserve the last successful preview while a query is incomplete or being
  // edited. Restore the source table only when the user explicitly clears it.
  if (!hasRequiredSemicolon(sql)) return;

  const previewVersion = queryPreviewVersion;
  const selectedQuestionId = currentQuestionId;
  queryPreviewTimer = window.setTimeout(() => {
    queryPreviewTimer = null;
    applyQueryPreview(sql, previewVersion, selectedQuestionId);
  }, QUERY_PREVIEW_DELAY_MS);
}

function renderSchemaViewer(sourceDb = db, isQueryPreview = false) {
  const root = $('#schema-viewer');
  if (!root || !sourceDb) return;
  queryPreviewVisible = Boolean(isQueryPreview);
  try {
    const tableResult = sourceDb.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")[0];
    const availableTables = tableResult ? tableResult.values.map((row) => String(row[0])) : [];
    const relevantTables = activeTableNames.filter((name) => availableTables.includes(name));

    if (relevantTables.length) {
      root.innerHTML = relevantTables.map((tableName) => {
        const safeIdentifier = `"${tableName.replace(/"/g, '""')}"`;
        const preview = sourceDb.exec(`SELECT * FROM ${safeIdentifier} LIMIT 10;`)[0];
        const tableHtml = preview ? `<table><thead><tr>${preview.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${preview.values.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(displayValue(value))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="task-empty">This table has no rows yet.</p>';
        return `<section class="table-preview-unit"><p class="table-caption">Table: ${escapeHtml(tableName)}</p>${tableHtml}</section>`;
      }).join('');
      const heading = $('#table-heading');
      if (heading) heading.textContent = relevantTables.length === 1 ? `Table: ${relevantTables[0]}` : `Tables: ${relevantTables.join(' + ')}`;
      return;
    }

    if (activeCreatedTable) {
      const columns = activeCreatedTable.columns;
      root.innerHTML = `<section class="table-preview-unit"><p class="table-caption">Table to create: ${escapeHtml(activeCreatedTable.name)}</p><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody><tr><td colspan="${Math.max(1, columns.length)}" class="empty-table-cell">The table will be empty until rows are inserted.</td></tr></tbody></table></section>`;
      const heading = $('#table-heading');
      if (heading) heading.textContent = `Table: ${activeCreatedTable.name}`;
      return;
    }

    const fallback = availableTables[0];
    if (!fallback) {
      root.innerHTML = '<p class="task-empty">No sample table is available for this task.</p>';
      return;
    }
    const result = sourceDb.exec(`SELECT * FROM "${fallback.replace(/"/g, '""')}" LIMIT 10;`)[0];
    root.innerHTML = result ? `<section class="table-preview-unit"><p class="table-caption">Table: ${escapeHtml(fallback)}</p><table><thead><tr>${result.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${result.values.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(displayValue(value))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>` : '<p class="task-empty">No sample table is available.</p>';
    const heading = $('#table-heading');
    if (heading) heading.textContent = `Table: ${fallback}`;
  } catch (error) {
    root.textContent = `Could not inspect database table: ${error.message}`;
  }
}

function inferRelevantTables(question) {
  const sql = String(question?.solution || '');
  const found = [];
  const pattern = /\b(?:FROM|JOIN|UPDATE|INTO|ON)\s+["`]?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  for (const match of sql.matchAll(pattern)) {
    const name = match[1];
    if (!found.includes(name)) found.push(name);
  }
  const createMatch = sql.match(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?\s*\(([^;]+)\)/i);
  activeCreatedTable = null;
  if (!found.length && createMatch) {
    const columns = createMatch[2].split(',').map((part) => part.trim()).filter((part) => part && !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(part)).map((part) => part.split(/\s+/)[0].replace(/["`]/g, '')).filter(Boolean);
    activeCreatedTable = { name: createMatch[1], columns };
  }
  return found;
}

function displayValue(value) {
  if (value === null) return 'NULL';
  if (value instanceof Uint8Array) return `[BLOB ${value.length} bytes]`;
  return String(value);
}

async function init() {
  return createFreshDatabase();
}


async function openLesson(index, shouldScroll = true, preferredQuestionId = null, preferredTopicSlug = null, checkExistingDraft = false) {
  const requestedIndex = Math.max(0, Math.min(lessons.length - 1, Number(index) || 0));
  if (!isLessonUnlocked(requestedIndex)) return;
  const message = $('#lesson-access-message');
  if (message) message.hidden = true;
  saveCurrentQuestionDraft();
  cancelAutoAdvance();
  cancelAutoCheck();
  cancelQueryPreview();
  // A query result belongs to the question/database context where it was run.
  // Keep the shared editor text, but never carry the previous topic's result
  // table into the newly selected lesson or question.
  queryPreviewVisible = false;
  navigationVersion += 1;
  currentLessonIndex = requestedIndex;
  const requestedTopic = preferredTopicSlug ? TOPIC_BY_SLUG[preferredTopicSlug] : null;
  if (requestedTopic && requestedTopic.lessonIndex === requestedIndex) currentTopicSlug = requestedTopic.slug;
  else if (!TOPIC_BY_SLUG[currentTopicSlug] || TOPIC_BY_SLUG[currentTopicSlug].lessonIndex !== requestedIndex) {
    currentTopicSlug = getDefaultTopicForLesson(requestedIndex).slug;
  }
  renderDashboard();
  const requestedLesson = lessons[currentLessonIndex];
  const topicQuestions = getActiveTopicQuestions();
  const availableQuestions = topicQuestions.filter((question) => isUnlocked(question));
  const preferredQuestion = availableQuestions.find((question) => question.id === preferredQuestionId) || null;
  const firstUnsolvedQuestion = availableQuestions.find((question) => getQuestionProgress(question.id).status !== 'solved');
  // A learner may reopen any completed question. Only the default lesson entry
  // chooses the next unfinished question.
  currentQuestionId = preferredQuestion?.id || firstUnsolvedQuestion?.id || availableQuestions[0]?.id || null;
  const selectedQuestion = getQuestionById(currentQuestionId)?.question;
  activeTableNames = inferRelevantTables(selectedQuestion);
  activeTableName = activeTableNames[0] || activeCreatedTable?.name || null;
  try {
    if (currentQuestionId) localStorage.setItem(SELECTED_QUESTION_KEY, currentQuestionId);
    window.QueryPathAccount?.saveAccountState?.();
    const practiceUrl = `practice.html?lesson=${currentLessonIndex}&topic=${encodeURIComponent(currentTopicSlug)}${currentQuestionId ? `&question=${encodeURIComponent(currentQuestionId)}` : ''}`;
    window.history.replaceState({}, '', practiceUrl);
  } catch {}
  hintVisible = false;
  solutionVisible = false;
  const requestId = ++openRequest;
  nav();
  render();
  const answerMessage = $('#answer-message');
  if (answerMessage) {
    answerMessage.hidden = false;
    answerMessage.className = 'answer-message';
    answerMessage.textContent = 'Preparing the sample database…';
  }
  setPracticeEnabled(false);
  if (shouldScroll) window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const freshDb = await init();
    if (requestId !== openRequest) {
      freshDb.close();
      return;
    }
    if (db) db.close();
    db = freshDb;
    // Navigation always starts with the selected question's source table(s).
    // The shared editor remains untouched; its old query result is not replayed
    // against a different topic, which previously left stale COUNT/SELECT output
    // visible until the learner refreshed the page.
    if (requestId !== openRequest) return;
    queryPreviewVisible = false;
    renderSchemaViewer();
    setPracticeEnabled(true);
    if (answerMessage) {
      const selectedProgress = currentQuestionId ? getQuestionProgress(currentQuestionId) : null;
      const lessonComplete = getActiveFreeTaskCount() > 0 && getActiveFreeTaskSolvedCount() === getActiveFreeTaskCount();
      if (selectedProgress?.status === 'solved') {
        answerMessage.hidden = false;
        answerMessage.className = 'answer-message good';
        answerMessage.textContent = '✓ This question is already completed in this session. You can practise it again.';
      } else if (lessonComplete) {
        answerMessage.hidden = false;
        answerMessage.className = 'answer-message good';
        answerMessage.textContent = '✓ This lesson is complete for this session. Continue to another lesson when you are ready.';
      } else if ($('#query')?.value.trim()) {
        answerMessage.hidden = false;
        answerMessage.className = 'answer-message';
        answerMessage.textContent = 'Your previous SQL is still in the shared editor. Select the query and delete it yourself before writing this answer.';
      } else answerMessage.hidden = true;
    }
    // Keep the shared SQL draft, but only preview it again after the learner
    // edits/runs it in this newly selected context.
    if (checkExistingDraft && $('#query')?.value.trim()) scheduleAutoCheck();
  } catch (error) {
    if (requestId !== openRequest) return;
    console.error(error);
    const message = $('#answer-message');
    if (message) {
      message.hidden = false;
      message.className = 'answer-message bad';
      message.textContent = `SQL engine could not start: ${error.message || 'Check your internet connection and refresh the page.'}`;
    }
    setPracticeEnabled(false);
  }
}

function setPracticeEnabled(enabled) {
  const textarea = $('#query');
  const checkButton = $('#check-answer-button');
  const resetButton = $('#reset-current-task-button');
  if (textarea) textarea.disabled = !enabled;
  if (checkButton) checkButton.disabled = !enabled;
  if (resetButton) resetButton.disabled = !enabled;
}

function selectQuestion(id) {
  const match = getQuestionById(id);
  if (!match || !isUnlocked(match.question)) return;
  cancelAutoAdvance();
  navigationVersion += 1;
  const activeTopic = TOPIC_BY_SLUG[currentTopicSlug];
  const belongsToActiveTopic = activeTopic && (
    Array.isArray(activeTopic.questionIds)
      ? activeTopic.questionIds.includes(id)
      : match.lessonIndex === currentLessonIndex
  );
  const targetLessonIndex = belongsToActiveTopic ? currentLessonIndex : match.lessonIndex;
  const targetTopicSlug = belongsToActiveTopic ? currentTopicSlug : getDefaultTopicForLesson(match.lessonIndex).slug;
  // Selecting a task changes only the prompt/database context. The one shared SQL
  // editor and its current text are intentionally retained for the learner to edit.
  openLesson(targetLessonIndex, false, id, targetTopicSlug, true);
}

function runQuery() {
  const textarea = $('#query');
  const status = $('#status');
  const output = $('#run-result');
  if (!db || !textarea || !status || !output) return;
  const sql = textarea.value.trim();
  if (!sql) {
    status.textContent = 'Write a SQL query before running it.';
    status.className = 'status bad';
    return;
  }
  try {
    const results = db.exec(sql);
    saveQueryHistory(sql, 'Lesson practice', true, 'Executed successfully');
    output.innerHTML = renderResultSets(results);
    // SELECT results replace the full-table preview with exactly the columns
    // returned by the user's query. Non-result statements keep the schema view.
    if (!renderQueryResultsInSchemaViewer(results)) renderSchemaViewer();
    status.textContent = '✓ Query executed successfully. Database previews refreshed.';
    status.className = 'status good';
  } catch (error) {
    saveQueryHistory(sql, 'Lesson practice', false, error.message);
    output.textContent = 'No results to display.';
    status.textContent = `SQL error: ${error.message}`;
    status.className = 'status bad';
  }
}

async function resetQuery() {
  // Reset uses the same fresh-database path as opening a lesson.
  await openLesson(currentLessonIndex, false, currentQuestionId);
}

function renderResultSets(resultSets) {
  if (!resultSets || !resultSets.length) return '<p class="empty-preview">Query executed successfully. No rows were returned.</p>';
  return resultSets.map((resultSet) => `
    <div class="table-wrap">
      <table>
        <thead><tr>${resultSet.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
        <tbody>${resultSet.values.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(displayValue(value))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    <p class="result-count">${resultSet.values.length} row${resultSet.values.length === 1 ? '' : 's'}</p>
  `).join('');
}

function renderComparison(actual, expected) {
  const root = $('#comparison');
  if (!root) return;
  root.innerHTML = `
    <div class="comparison-grid">
      <section class="comparison-card"><h4>Your result</h4>${renderResultSets(actual)}</section>
      <section class="comparison-card"><h4>Expected result</h4>${renderResultSets(expected)}</section>
    </div>
  `;
}

function cancelAutoAdvance() {
  if (autoAdvanceTimer !== null) {
    window.clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

function cancelAutoCheck() {
  autoCheckVersion += 1;
  if (autoCheckTimer !== null) {
    window.clearTimeout(autoCheckTimer);
    autoCheckTimer = null;
  }
}

async function evaluateQuestionAnswer(sql, question) {
  const fixtures = [
    '',
    "UPDATE students SET age = age + 2 WHERE id = 1; UPDATE students SET city = 'Jaipur' WHERE id = 2;",
    "UPDATE courses SET lesson_count = lesson_count + 3 WHERE id = 3; UPDATE enrollments SET status = 'review' WHERE id = 5;"
  ];
  let userError = null;
  let comparison = { equal: true, reason: '' };
  let passedCases = 0;

  for (const fixture of fixtures) {
    let actualDb;
    let expectedDb;
    try {
      actualDb = await createFreshDatabase();
      expectedDb = await createFreshDatabase();
      if (fixture) {
        actualDb.run(fixture);
        expectedDb.run(fixture);
      }
      let actualResults;
      let expectedResults;
      if (question.type === 'state') {
        actualDb.run(sql);
        actualResults = actualDb.exec(question.verify);
        expectedDb.run(question.solution);
        expectedResults = expectedDb.exec(question.verify);
      } else {
        actualResults = actualDb.exec(sql);
        expectedResults = expectedDb.exec(question.solution);
      }
      const check = compareResults(actualResults, expectedResults, question);
      if (!check.equal) {
        comparison = check;
        break;
      }
      passedCases += 1;
    } catch (error) {
      userError = error;
      comparison = { equal: false, reason: error.message };
      break;
    } finally {
      actualDb?.close();
      expectedDb?.close();
    }
  }

  return {
    correct: !userError && comparison.equal && passedCases === fixtures.length,
    userError,
    comparison,
    passedCases,
    totalCases: fixtures.length
  };
}

async function completeCorrectAnswer(question, sql) {
  const questionId = question.id;
  // Finish the matching query preview before confirming the answer or moving
  // to another question. This is especially important for UPDATE/INSERT/DELETE,
  // whose preview is rendered from an isolated database snapshot.
  cancelQueryPreview();
  await applyQueryPreview(sql, queryPreviewVersion, questionId);
  if (currentQuestionId !== questionId || String($('#query')?.value || '').trim() !== sql) return;

  const alreadySolved = getQuestionProgress(question.id).status === 'solved';
  if (!alreadySolved) recordAttempt(question, true);
  saveQueryHistory(sql, 'Lesson submission', true, 'Passed 3/3 validation cases');

  saveSharedEditorDraft(sql);
  const message = $('#answer-message');
  if (message) {
    message.hidden = false;
    message.className = 'answer-message good';
    message.textContent = alreadySolved
      ? '✓ This question is already completed. Your query stays in the shared SQL editor.'
      : '✓ Correct answer! Opening the next unanswered question. Your previous SQL will stay in the shared editor—delete it yourself before typing the next answer.';
  }

  if (alreadySolved) return;
  // Do not stop at the end of a lesson/topic. Continue at the next unanswered
  // free question anywhere in the course after the query result has rendered.
  scheduleAutoAdvance(question.id);
}

function scheduleAutoCheck() {
  cancelAutoCheck();
  const textarea = $('#query');
  const questionId = currentQuestionId;
  const sql = textarea?.value.trim();
  const question = getQuestionById(questionId)?.question;
  if (!question || getQuestionProgress(questionId).status !== 'solved') cancelAutoAdvance();
  if (!textarea || textarea.disabled || !question || !sql || !hasRequiredSemicolon(sql)) return;

  const checkVersion = autoCheckVersion;
  autoCheckTimer = window.setTimeout(async () => {
    autoCheckTimer = null;
    if (checkVersion !== autoCheckVersion || currentQuestionId !== questionId || $('#query')?.value.trim() !== sql) return;
    try {
      const result = await evaluateQuestionAnswer(sql, question);
      if (checkVersion !== autoCheckVersion || currentQuestionId !== questionId || $('#query')?.value.trim() !== sql) return;
      if (result.correct) {
        await completeCorrectAnswer(question, sql);
      } else if (!result.userError) {
        const message = $('#answer-message');
        if (message) {
          message.hidden = false;
          message.className = 'answer-message';
          message.textContent = 'Your SQL runs, but the result is not quite right yet. Keep editing — CodeBolt checks it automatically.';
        }
      }
      // Syntax errors are normal while a learner is typing. Do not count them
      // as attempts or interrupt the editor with an error message.
    } catch (error) {
      console.warn('Automatic SQL answer check could not finish:', error);
    }
  }, AUTO_CHECK_DELAY_MS);
}

function scheduleAutoAdvance(questionId) {
  cancelAutoAdvance();
  const selection = getQuestionById(questionId);
  if (!selection) return;

  // Search all 100 questions in canonical lesson order, not only the current
  // topic. This keeps automatic progression working when a topic ends or when
  // the learner has solved questions out of order. Premium questions are skipped.
  const allCourseQuestions = getAllCourseQuestions();
  const nextQuestion = getNextUnsolvedQuestionAfter(
    allCourseQuestions,
    questionId,
    isUnlocked,
    (id) => getQuestionProgress(id).status
  );
  if (!nextQuestion) {
    const status = $('#answer-message');
    if (status) {
      status.hidden = false;
      status.className = 'answer-message good';
      status.textContent = 'All free questions in the course are complete. You can revisit any question or review a lesson.';
    }
    refreshFinishLessonButton();
    return;
  }

  const nextSelection = getQuestionById(nextQuestion.id);
  if (!nextSelection) return;
  const nextTopicSlug = getTopicSlugForQuestion(nextQuestion.id, nextSelection.lessonIndex);
  const expectedNavigationVersion = navigationVersion;
  autoAdvanceTimer = window.setTimeout(() => {
    autoAdvanceTimer = null;
    if (currentQuestionId !== questionId || navigationVersion !== expectedNavigationVersion) return;
    openLesson(nextSelection.lessonIndex, false, nextQuestion.id, nextTopicSlug);
  }, 900);
}

function feedbackMessageForCompletion() {
  const message = $('#answer-message');
  if (message) {
    message.hidden = false;
    message.className = 'answer-message good';
    message.textContent = 'All free questions in this topic are complete. You can choose any other lesson from the Lessons menu.';
  }
  refreshFinishLessonButton();
}

async function submitAnswer() {
  const selection = getQuestionById(currentQuestionId);
  const question = selection?.question;
  const questionId = currentQuestionId;
  const sql = $('#query')?.value.trim();
  if (questionId && sql !== undefined) saveSharedEditorDraft(sql);
  const message = $('#answer-message');
  const checkButton = $('#check-answer-button');
  if (!question || !isUnlocked(question) || !message) return;
  cancelAutoAdvance();
  cancelAutoCheck();
  message.hidden = false;
  if (!sql) {
    message.className = 'answer-message bad';
    message.textContent = 'Write a SQL query first. CodeBolt will also check automatically as you type.';
    return;
  }
  if (!hasRequiredSemicolon(sql)) {
    message.className = 'answer-message bad';
    message.textContent = 'Add a semicolon (;) at the end of your SQL query before it can be marked correct.';
    return;
  }

  message.className = 'answer-message';
  message.textContent = 'Checking your query…';
  if (checkButton) checkButton.disabled = true;
  const result = await evaluateQuestionAnswer(sql, question);
  if (currentQuestionId !== questionId || $('#query')?.value.trim() !== sql) {
    if (checkButton) checkButton.disabled = false;
    return;
  }
  if (checkButton) checkButton.disabled = false;
  const correct = result.correct;
  if (correct) {
    await completeCorrectAnswer(question, sql);
    return;
  }

  saveQueryHistory(sql, 'Lesson submission', false, result.userError ? result.userError.message : result.comparison.reason);
  if (getQuestionProgress(question.id).status !== 'solved') recordAttempt(question, false);
  message.className = 'answer-message bad';
  const reason = result.userError ? `SQL error: ${result.userError.message}` : result.comparison.reason;
  message.textContent = `Not quite. ${reason}. ${question.hint || 'Check the selected columns, table and condition.'}`;
}

function toggleHint() {
  const question = getQuestionById(currentQuestionId)?.question;
  const panel = $('#hint-panel');
  if (!question || !panel) return;
  hintVisible = !hintVisible;
  panel.hidden = !hintVisible;
  panel.innerHTML = hintVisible ? `<b>HINT</b><p>${escapeHtml(question.hint)}</p>` : '';
}

function toggleSolution() {
  const question = getQuestionById(currentQuestionId)?.question;
  const panel = $('#solution-panel');
  const link = $('[data-action="show-task-solution"]');
  if (!question || !panel) return;
  solutionVisible = !solutionVisible;
  panel.hidden = !solutionVisible;
  if (link) link.textContent = solutionVisible ? 'Hide Solution' : 'Solution';
  panel.innerHTML = solutionVisible ? `<b>REFERENCE SOLUTION</b><pre>${escapeHtml(question.solution)}</pre>` : '';
  if (solutionVisible) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


function insertTableName(tableName) {
  const textarea = $('#query');
  if (!textarea || !getQuestionById(currentQuestionId)) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const insertion = tableName;
  textarea.value = `${before}${insertion}${after}`;
  textarea.focus();
  const position = start + insertion.length;
  textarea.setSelectionRange(position, position);
}

async function resetCurrentTaskProgress() {
  const selection = getQuestionById(currentQuestionId);
  if (!selection) {
    throw new Error('No active task is selected. Open a lesson task first.');
  }

  const { question, lessonIndex } = selection;
  cancelAutoAdvance();
  navigationVersion += 1;

  // Reset only this question. Every other task and its XP remain unchanged.
  const nextState = resetSingleTaskProgress(progressData, gamificationData, question.id, XP_PER_QUESTION);
  progressData = nextState.progress;
  gamificationData = nextState.gamification;

  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressData));
    localStorage.setItem(GAMIFICATION_KEY, JSON.stringify(gamificationData));
    localStorage.setItem(SELECTED_QUESTION_KEY, question.id);
  } catch (error) {
    throw new Error(`The browser could not save the reset: ${error.message}`);
  }

  nav();
  renderDashboard();
  renderAchievements();
  updateProgress();

  // Wait for the signed-in account's Firestore write before rebuilding the task UI.
  const cloudSaved = await window.QueryPathAccount?.saveAccountState?.();
  const activeTopic = TOPIC_BY_SLUG[currentTopicSlug];
  const remainsInActiveTopic = Array.isArray(activeTopic?.questionIds) && activeTopic.questionIds.includes(question.id);
  await openLesson(remainsInActiveTopic ? currentLessonIndex : lessonIndex, false, question.id, remainsInActiveTopic ? currentTopicSlug : null);

  const message = $('#answer-message');
  if (message) {
    message.hidden = false;
    message.className = 'answer-message good';
    const signedIn = Boolean(window.QueryPathAccountState?.user);
    message.textContent = signedIn && cloudSaved === false
      ? 'This task is unsolved again on this device, but cloud sync failed. Check your account connection.'
      : 'This task is unsolved again. Your other completed tasks are unchanged.';
  }
}
function refreshFinishLessonButton() {
  const button = $('#finish-lesson-button');
  if (!button || !lessons[currentLessonIndex]) return;

  // Completion is tracked for progress, but it never blocks access to the next
  // topic. The Lessons menu also remains available for direct navigation.
  const nextTopic = getNextCourseTopic(SQL_TOPICS, currentTopicSlug);
  const hasNextLesson = currentLessonIndex < lessons.length - 1;
  const canContinue = Boolean(nextTopic || hasNextLesson);
  button.disabled = !canContinue;
  button.classList.toggle('ready', canContinue);
  button.textContent = canContinue ? 'Continue to next topic' : 'You reached the last topic';
}

function finishCurrentLesson() {
  const nextTopic = getNextCourseTopic(SQL_TOPICS, currentTopicSlug);
  if (nextTopic) {
    openLesson(nextTopic.lessonIndex, true, null, nextTopic.slug);
    return;
  }

  if (currentLessonIndex < lessons.length - 1) {
    openLesson(currentLessonIndex + 1);
    return;
  }

  const message = $('#answer-message');
  if (message) {
    message.hidden = false;
    message.className = 'answer-message good';
    message.textContent = 'You reached the last topic. Every lesson remains available from the Lessons menu.';
  }
}

function showLoadError(message) {
  const target = $('#load-error');
  if (target) {
    target.hidden = false;
    target.textContent = message;
  }
}

async function start() {
  // Keep the legacy QueryPath flags for existing integrations and expose
  // CodeBolt flags used by the page-level startup guards after the rebrand.
  window.QueryPathStarted = true;
  window.CodeBoltStarted = true;
  // Start downloading/initializing SQL.js immediately, without making the page wait for it.
  // openLesson renders the lesson first and enables the editor as soon as the engine is ready.
  void loadSqlModule().catch((error) => { console.warn('SQL engine warm-up failed; it will retry when needed.', error); });

  // Fetch lesson data while Firebase restores the learner's account in parallel.
  const lessonsController = new AbortController();
  const lessonsTimeoutId = window.setTimeout(() => lessonsController.abort(), 15000);
  const lessonsRequest = fetch(new URL('./lessons.json?v=20261125-lessons-10x10-01', document.baseURI), {
    cache: 'default',
    signal: lessonsController.signal
  }).catch((error) => ({ requestError: error }));
  const filteringQuestionsRequest = fetch(new URL('./filtering-questions.json?v=20261125-filtering-bank-01', document.baseURI), {
    cache: 'default',
    signal: lessonsController.signal
  }).catch((error) => ({ requestError: error }));

  try {
    // Keep the account restore before loading progress, so cloud data cannot be overwritten by stale local data.
    if (window.QueryPathAccountReady) await window.QueryPathAccountReady;

    // A browser refresh starts a clean SQL practice session. account-bootstrap
    // performs the local/cloud reset first; this is a defensive local fallback
    // in case that script was served from cache or account setup could not run.
    const refreshedByBrowser = wasBrowserReload(window.performance)
      || window.QueryPathWasBrowserRefresh === true;
    if (refreshedByBrowser) {
      try {
        localStorage.setItem(PROGRESS_KEY, '{}');
        localStorage.removeItem(SHARED_QUERY_KEY);
        localStorage.removeItem(QUERY_DRAFTS_KEY);
        if (!window.QueryPathProgressResetOnReload) {
          await window.QueryPathAccount?.clearQuestionProgressOnReload?.();
        }
      } catch (error) {
        console.warn('The practice session could not be fully reset on refresh.', error);
      }
      progressData = {};
      questionDrafts = {};
      sharedEditorDraft = '';
      sharedEditorDraftLoaded = true;
    }

    if (refreshedByBrowser) {
      // Do not reload stale completion records even when browser storage is
      // temporarily unavailable; the in-memory practice session still resets.
      progressData = {};
      updateProgress();
    } else {
      loadProgress();
    }
    loadGamification();
    loadQuestionDrafts();
    let response;
    try {
      const [result, filteringResult] = await Promise.all([lessonsRequest, filteringQuestionsRequest]);
      if (result?.requestError) throw result.requestError;
      if (filteringResult?.requestError) throw filteringResult.requestError;
      response = result;
      if (!filteringResult.ok) throw new Error(`Could not load filtering-questions.json (HTTP ${filteringResult.status}). Make sure the complete Codeora ZIP was extracted into one folder.`);
      filteringQuestions = await filteringResult.json();
      if (!Array.isArray(filteringQuestions) || filteringQuestions.length !== 24 || filteringQuestions.some((question) => !question || typeof question.id !== 'string')) {
        throw new Error('filtering-questions.json must contain the 24 additional Filtering & Conditions questions. Re-extract the complete Codeora ZIP into one folder.');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Loading course data timed out after 15 seconds. Check that the local server is running and that lessons.json and filtering-questions.json are both in the public folder.');
      }
      throw new Error(`Could not load course data: ${error.message}. Open Codeora through its local web server, not by double-clicking index.html.`);
    } finally {
      window.clearTimeout(lessonsTimeoutId);
    }

    if (!response.ok) throw new Error(`Could not load lessons.json (HTTP ${response.status}). Make sure lessons.json is beside index.html.`);
    try {
      lessons = await response.json();
    } catch (error) {
      throw new Error(`lessons.json was returned but could not be parsed as JSON: ${error.message}`);
    }
    if (!Array.isArray(lessons) || lessons.length !== 10 || lessons.some((item) => !Array.isArray(item.questions) || item.questions.length !== 10)) {
      throw new Error('lessons.json must contain exactly 10 lessons with 10 questions each. Re-extract the complete Codeora ZIP into one folder.');
    }
    const baseQuestionIds = new Set(lessons.flatMap((lesson) => lesson.questions.map((question) => question.id)));
    const additionalQuestionIds = filteringQuestions.map((question) => question.id);
    if (filteringQuestions.some((question) => baseQuestionIds.has(question.id) || typeof question.free !== 'boolean' || typeof question.text !== 'string' || typeof question.solution !== 'string')
      || new Set(additionalQuestionIds).size !== filteringQuestions.length) {
      throw new Error('filtering-questions.json contains duplicate or invalid question records. Re-extract the complete Codeora ZIP into one folder.');
    }

    initializeProgressRecords();
    syncHistoricalXP();
    nav();
    renderDashboard();
    renderAchievements();
    const page = document.body.dataset.page || 'home';
    if (page === 'practice') {
      const params = new URLSearchParams(window.location.search);
      let preferredQuestionId = params.get('question');
      let rawLesson = params.has('lesson') ? Number(params.get('lesson')) : 0;
      if (!params.has('lesson') && !preferredQuestionId) {
        try {
          const savedQuestionId = localStorage.getItem(SELECTED_QUESTION_KEY);
          const savedSelection = savedQuestionId ? getQuestionById(savedQuestionId) : null;
          if (savedSelection) {
            rawLesson = savedSelection.lessonIndex;
            preferredQuestionId = savedQuestionId;
          }
        } catch {}
      }
      const requestedTopic = TOPIC_BY_SLUG[params.get('topic') || ''];
      if (requestedTopic) rawLesson = requestedTopic.lessonIndex;
      const lessonIndex = Number.isInteger(rawLesson) ? Math.max(0, Math.min(lessons.length - 1, rawLesson)) : 0;
      if (refreshedByBrowser) {
        const refreshTopic = requestedTopic || getDefaultTopicForLesson(lessonIndex);
        const firstOnTopic = getFirstAvailableQuestion(
          getQuestionsForTopic(refreshTopic, lessonIndex),
          (question) => isUnlocked(question)
        );
        preferredQuestionId = firstOnTopic?.id || null;
      }
      await openLesson(lessonIndex, false, preferredQuestionId, requestedTopic?.slug || null);
    } else if (page === 'lessons') {
      renderLessonsCatalog();
    } else if (page === 'solutions') {
      renderSolutions();
    } else if (page === 'explanations') {
      renderExplanationPage();
    } else if (page === 'dashboard') {
      renderDashboard();
    } else if (page === 'rewards') {
      renderAchievements();
    } else {
      renderHomePage();
    }
    updateProgress();
    if (refreshedByBrowser && document.body.dataset.page === 'practice') {
      const refreshMessage = $('#answer-message');
      if (refreshMessage) {
        refreshMessage.hidden = false;
        refreshMessage.className = 'answer-message good';
        refreshMessage.textContent = 'You are back at the first question in this lesson. Question progress has been reset for this session.';
      }
    }
    window.QueryPathReady = true;
    window.CodeBoltReady = true;
  } catch (error) {
    window.QueryPathFailed = true;
    window.CodeBoltFailed = true;
    console.error('Codeora startup failed:', error);
    showLoadError(`Codeora could not start: ${error.message}`);
    const lessonRoot = $('#lesson');
    if (lessonRoot?.querySelector('.loading-copy')) {
      lessonRoot.innerHTML = '<p class="loading-copy">Lessons could not be loaded. See the error message above.</p>';
    }
    const solutionRoot = $('#solution-library');
    if (solutionRoot?.querySelector('.loading-copy')) {
      solutionRoot.innerHTML = '<p class="loading-copy">Solutions are unavailable until lesson data loads.</p>';
    }
    const catalog = $('#lesson-catalog');
    if (catalog) catalog.innerHTML = '<p>Lessons could not be loaded. See the error above.</p>';
  }
}

document.addEventListener('input', (event) => {
  if (event.target?.id === 'query') {
    saveSharedEditorDraft(event.target.value);
    scheduleAutoCheck();
    scheduleQueryPreview();
  }
});

document.addEventListener('click', (event) => {
  const eventTarget = event.target instanceof Element ? event.target : null;
  if (!eventTarget || eventTarget.closest('#interactive-topics')) return;
  const control = eventTarget.closest('[data-action]');
  if (!control) return;
  const action = control.dataset.action;
  if (action === 'toggle-tutorial') { event.preventDefault(); setTutorialMenuOpen($('#interactive-topics')?.hidden !== false); }
  else if (action === 'close-tutorial') { event.preventDefault(); setTutorialMenuOpen(false); $('#tutorial-toggle')?.focus(); }
  else if (action === 'select-tutorial-section') { event.preventDefault(); activeTutorialGroupIndex = Number(control.dataset.groupIndex) || 0; renderInteractiveTutorial(); $('.tutorial-section-option.active')?.focus({ preventScroll: true }); }
  else if (action === 'show-task-solution') { event.preventDefault(); toggleSolution(); }
  else if (action === 'finish-lesson') finishCurrentLesson();
  else if (action === 'open-lesson') { event.preventDefault(); openLesson(Number(control.dataset.lessonIndex)); }
  else if (action === 'open-topic') { event.preventDefault(); const topic = TOPIC_BY_SLUG[control.dataset.topicSlug]; if (topic) { setTutorialMenuOpen(false); openLesson(topic.lessonIndex, true, null, topic.slug); } }
  else if (action === 'select-question') selectQuestion(control.dataset.questionId);
  else if (action === 'submit-answer') submitAnswer();
  else if (action === 'retry-database') openLesson(currentLessonIndex, false, currentQuestionId);
});


document.addEventListener('click', (event) => {
  const eventTarget = event.target instanceof Element ? event.target : null;
  if (!eventTarget || eventTarget.closest('#interactive-topics') || eventTarget.closest('#tutorial-toggle')) return;
  const menu = $('#interactive-topics');
  if (menu && !menu.hidden) setTutorialMenuOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('#interactive-topics') && !$('#interactive-topics').hidden) {
    setTutorialMenuOpen(false);
    $('#tutorial-toggle')?.focus();
    return;
  }
  if (event.target?.id === 'query' && event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submitAnswer();
  }
  // Plain Enter is deliberately left alone so learners can add a new line.
  // The answer checker runs automatically after a short pause in typing.
});

// Retain the familiar function hooks for browser-console debugging and older snippets.
window.QueryPath = { openLesson, runQuery, resetQuery, submitAnswer, isUnlocked, renderDashboard, renderAchievements };
start();
