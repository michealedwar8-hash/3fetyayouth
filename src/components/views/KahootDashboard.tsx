import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import * as XLSX from 'xlsx';
import { 
  KahootQuiz, 
  KahootQuestion, 
  KahootOption, 
  KahootQuestionType, 
  KahootQuestionBankItem,
  KahootQuizStatus,
  KahootGameMode,
  KahootQuizSettings,
  KahootMatchingPair,
  KahootLiveSession, 
  KahootPlayer, 
  KahootTeamConfigItem,
  UserRole,
  Registrant,
  KahootSoloScore
} from '../../types';
import { storageService, normalizeArabicNameForComparison, compressImageToFitStorage } from '../../services/storageService';
import { 
  Play, 
  Plus, 
  Trash2, 
  Edit3, 
  Bookmark, 
  Sparkles, 
  Wand2,
  Upload, 
  Link as LinkIcon, 
  Camera, 
  Image as ImageIcon,
  FileText, 
  Users, 
  Trophy, 
  Flame, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Volume2, 
  VolumeX,
  Maximize2, 
  ShieldAlert, 
  BarChart3, 
  MessageSquare, 
  Share2, 
  Eye, 
  Sliders, 
  MapPin, 
  PieChart, 
  Star, 
  RotateCcw,
  ChevronRight,
  ArrowRight,
  Check,
  Music,
  Gamepad2,
  Tv,
  Smartphone,
  Copy,
  ThumbsUp,
  Download,
  AlertTriangle,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Search,
  Filter,
  Lock,
  Unlock,
  BookOpen,
  Layers,
  Award,
  Crown
} from 'lucide-react';

// ==========================================
// 1. WEB AUDIO SYNTHESIZER FOR KAHOOT SOUNDS & LOBBY MUSIC
// ==========================================
class KahootAudioEngine {
  private ctx: AudioContext | null = null;
  private lobbyMusicTimer: any = null;
  private isMuted: boolean = false;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopLobbyMusic();
    }
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  playTick() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {}
  }

  playCorrect() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.07);
        gain.gain.setValueAtTime(0.18, now + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.25);
      });
    } catch {}
  }

  playWrong() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(130, now + 0.3);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch {}
  }

  playFanfare() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = [
        { f: 523.25, t: 0.15 },
        { f: 523.25, t: 0.15 },
        { f: 523.25, t: 0.15 },
        { f: 659.25, t: 0.4 },
        { f: 783.99, t: 0.2 },
        { f: 1046.50, t: 0.6 }
      ];
      let offset = 0;
      notes.forEach((n) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.f, now + offset);
        gain.gain.setValueAtTime(0.25, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + n.t);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + offset);
        osc.stop(now + offset + n.t);
        offset += n.t + 0.04;
      });
    } catch {}
  }

  startLobbyMusic() {
    if (this.isMuted || this.lobbyMusicTimer) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      
      const bassNotes = [261.63, 329.63, 392.00, 523.25, 440.00, 349.23];
      let step = 0;

      this.lobbyMusicTimer = setInterval(() => {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(bassNotes[step % bassNotes.length], now);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
        step++;
      }, 450);
    } catch {}
  }

  stopLobbyMusic() {
    if (this.lobbyMusicTimer) {
      clearInterval(this.lobbyMusicTimer);
      this.lobbyMusicTimer = null;
    }
  }

  speakText(text: string) {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      } catch {}
    }
  }
}

const audio = new KahootAudioEngine();

interface KahootDashboardProps {
  currentUserRole: UserRole;
  currentUserName: string;
  registrants: Registrant[];
  canManageKahoot?: boolean;
  initialQuizId?: string | null;
  onRefresh?: () => void;
}

const QUIZ_CATEGORIES = [
  'الكتاب المقدس',
  'سفر دانيال والثلاثة فتية',
  'تاريخ الكنيسة والقديسين',
  'عقيدة وطقس وألحان',
  'مسابقات عامة وشبابية',
  'جمع آراء وتصويت'
];

const AGE_GROUPS = [
  'كل الأعمار',
  'شباب جامعة وخريجين',
  'ثانوي وإعدادي',
  'خدام وإعداد خدام'
];

export const KahootDashboard: React.FC<KahootDashboardProps> = ({
  currentUserRole,
  currentUserName,
  registrants,
  canManageKahoot = false,
  initialQuizId = null
}) => {
  // Quizzes & Question Bank state
  const [quizzes, setQuizzes] = useState<KahootQuiz[]>(() => storageService.getKahootQuizzes());
  const [questionBank, setQuestionBank] = useState<KahootQuestionBankItem[]>(() => storageService.getKahootQuestionBank());
  const [selectedQuiz, setSelectedQuiz] = useState<KahootQuiz | null>(null);
  const [shareToastMessage, setShareToastMessage] = useState<string | null>(null);

  // Manager Sub-Tab & Filters
  const [managerTab, setManagerTab] = useState<'quizzes' | 'archived' | 'question_bank'>('quizzes');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterCreator, setFilterCreator] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'most_used' | 'most_participated' | 'alphabetical'>('newest');

  // Question Bank Filter & Modal State
  const [bankSearchQuery, setBankSearchQuery] = useState<string>('');
  const [bankFilterCategory, setBankFilterCategory] = useState<string>('all');
  const [bankFilterType, setBankFilterType] = useState<string>('all');
  const [isBankItemModalOpen, setIsBankItemModalOpen] = useState<boolean>(false);
  const [editingBankItem, setEditingBankItem] = useState<KahootQuestionBankItem | null>(null);
  const [showImportFromBankModal, setShowImportFromBankModal] = useState<boolean>(false);
  const [selectedBankIdsToImport, setSelectedBankIdsToImport] = useState<string[]>([]);

  // Modals: Delete, Preview, Analytics/Export, Launch Mode Selector
  const [quizToDelete, setQuizToDelete] = useState<KahootQuiz | null>(null);
  const [previewQuiz, setPreviewQuiz] = useState<KahootQuiz | null>(null);
  const [previewSlideIndex, setPreviewSlideIndex] = useState<number>(0);
  const [analyticsQuiz, setAnalyticsQuiz] = useState<KahootQuiz | null>(null);
  const [launchModalQuiz, setLaunchModalQuiz] = useState<KahootQuiz | null>(null);
  const [exportIncludeSummary, setExportIncludeSummary] = useState<boolean>(true);
  const [exportIncludeQuestions, setExportIncludeQuestions] = useState<boolean>(true);
  const [exportIncludePlayers, setExportIncludePlayers] = useState<boolean>(true);

  // Active Live Session State (with session persistence across dashboard close/reopen)
  const [activeSession, setActiveSession] = useState<KahootLiveSession | null>(() => storageService.getActiveKahootSession());
  const [sessionPin, setSessionPin] = useState<string>(() => storageService.getActiveKahootSession()?.id || '');
  const [activeViewMode, setActiveViewMode] = useState<'manager' | 'live_host' | 'player_gamepad' | 'solo_game'>(() => {
    if (currentUserRole === 'member') return 'player_gamepad';
    try {
      const savedUi = sessionStorage.getItem('three_youths_kahoot_ui_state_v1');
      if (savedUi) {
        const parsed = JSON.parse(savedUi);
        const live = storageService.getActiveKahootSession();
        if (parsed.activeViewMode === 'live_host' && live && live.status !== 'finished') {
          return 'live_host';
        }
        if (parsed.activeViewMode === 'player_gamepad') {
          return 'player_gamepad';
        }
      }
    } catch {}
    return 'manager';
  });
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [selectedJoinTeamId, setSelectedJoinTeamId] = useState<string>('');

  // Team Mode Configuration State (Number of Teams, Custom Names, Assignment Mode, Team QR Modal)
  const DEFAULT_TEAM_CONFIGS: KahootTeamConfigItem[] = [
    { id: 'team_1', name: 'فريق شدرخ 🔥', color: 'red' },
    { id: 'team_2', name: 'فريق ميشخ ⚡', color: 'blue' },
    { id: 'team_3', name: 'فريق عبد نغو 🌟', color: 'amber' },
    { id: 'team_4', name: 'فريق دانيال 🦁', color: 'emerald' }
  ];
  const TEAM_COLORS_PALETTE = ['red', 'blue', 'amber', 'emerald', 'purple', 'pink', 'cyan', 'indigo', 'orange', 'teal'];
  const [launchSelectedMode, setLaunchSelectedMode] = useState<KahootGameMode>('live');
  const [teamAssignmentMode, setTeamAssignmentMode] = useState<'random' | 'manual_or_pin'>('manual_or_pin');
  const [customTeamConfigs, setCustomTeamConfigs] = useState<KahootTeamConfigItem[]>(DEFAULT_TEAM_CONFIGS);
  const [teamQrDataUrls, setTeamQrDataUrls] = useState<Record<string, string>>({});
  const [focusedTeamQrModal, setFocusedTeamQrModal] = useState<{ id: string; name: string; pin: string; qrUrl: string } | null>(null);
  const [isEditingLobbyTeams, setIsEditingLobbyTeams] = useState<boolean>(false);

  // Participant Answers Inspector State
  const [inspectedParticipant, setInspectedParticipant] = useState<{
    name: string;
    modeLabel: string;
    score: number;
    correctCount: number;
    totalQuestions: number;
    teamName?: string;
    completedAt?: string;
    answers: Array<{
      questionNumber: number;
      questionTitle: string;
      playerAnswerLabel: string;
      correctAnswerLabel: string;
      isCorrect: boolean;
      points: number;
      timeSec: string;
    }>;
  } | null>(null);

  // Solo Mode State (النظام العادي / التحدي الذاتي)
  const [soloQuiz, setSoloQuiz] = useState<KahootQuiz | null>(null);
  const [soloQuestionIndex, setSoloQuestionIndex] = useState<number>(0);
  const [soloTimeRemaining, setSoloTimeRemaining] = useState<number>(20);
  const [isSoloTimerRunning, setIsSoloTimerRunning] = useState<boolean>(false);
  const [soloScore, setSoloScore] = useState<number>(0);
  const [soloStreak, setSoloStreak] = useState<number>(0);
  const [soloCorrectCount, setSoloCorrectCount] = useState<number>(0);
  const [soloSelectedAnswer, setSoloSelectedAnswer] = useState<any>(null);
  const [soloHasSubmitted, setSoloHasSubmitted] = useState<boolean>(false);
  const [soloFeedback, setSoloFeedback] = useState<{ isCorrect: boolean; points: number; streak: number } | null>(null);
  const [soloStatus, setSoloStatus] = useState<'question_active' | 'answer_reveal' | 'finished'>('question_active');
  const [soloLeaderboard, setSoloLeaderboard] = useState<KahootSoloScore[]>([]);
  const [previousSoloTop3Ids, setPreviousSoloTop3Ids] = useState<Record<string, number>>({});
  const [soloAnswersDetail, setSoloAnswersDetail] = useState<NonNullable<KahootSoloScore['answersDetail']>>([]);
  const [soloStartedAt, setSoloStartedAt] = useState<number>(Date.now());

  // Host Screen Options & Anti-Cheat Toggles
  const [secondScreenMode, setSecondScreenMode] = useState<boolean>(false);
  const [canvasTextProtection, setCanvasTextProtection] = useState<boolean>(false);
  const [isLobbyMusicOn, setIsLobbyMusicOn] = useState<boolean>(true);
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(false);
  const [showCheatAuditModal, setShowCheatAuditModal] = useState<boolean>(false);

  // Join PIN manually (for external / manual joining)
  const [inputJoinPin, setInputJoinPin] = useState<string>('');
  const [joinPinError, setJoinPinError] = useState<string | null>(null);

  // Creator / Editor Modal State (4 Modes: Blank, URL, AI, Scan Doc)
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [creationMethod, setCreationMethod] = useState<'manual' | 'ai' | 'url' | 'scan'>('manual');
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);

  // AI Generation Fields (Open count, Language Ar/En/Auto, Question Types selector)
  const [aiTopic, setAiTopic] = useState('');
  const [aiCustomPrompt, setAiCustomPrompt] = useState('');
  const [aiDifficulty, setAiDifficulty] = useState<'سهل' | 'متوسط' | 'متقدم'>('متوسط');
  const [aiQuestionsCount, setAiQuestionsCount] = useState<number>(5);
  const [aiLanguage, setAiLanguage] = useState<'auto' | 'ar' | 'en'>('auto');
  const [aiSelectedTypes, setAiSelectedTypes] = useState<KahootQuestionType[]>(['quiz', 'true_false']);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // URL & Scan Doc Fields
  const [urlInput, setUrlInput] = useState('');
  const [showClipboardPasteHelper, setShowClipboardPasteHelper] = useState(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const [scanDocInput, setScanDocInput] = useState('');
  const [scanDocDataUrl, setScanDocDataUrl] = useState('');
  const [scannedFileName, setScannedFileName] = useState('');
  const [isExtractingDoc, setIsExtractingDoc] = useState(false);

  // Editing quiz state
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState<string>('الكتاب المقدس');
  const [editAgeGroup, setEditAgeGroup] = useState<string>('كل الأعمار');
  const [editTagsInput, setEditTagsInput] = useState<string>('');
  const [editStatus, setEditStatus] = useState<KahootQuizStatus>('published');
  const [editGameMode, setEditGameMode] = useState<KahootGameMode>('live');
  const [editTeamAssignmentMode, setEditTeamAssignmentMode] = useState<'random' | 'manual_or_pin'>('manual_or_pin');
  const [editCustomTeams, setEditCustomTeams] = useState<KahootTeamConfigItem[]>(DEFAULT_TEAM_CONFIGS);
  const [editCoverImage, setEditCoverImage] = useState<string>('');
  const [editMaxPlayers, setEditMaxPlayers] = useState<number>(0);
  const [editDetectTabSwitch, setEditDetectTabSwitch] = useState(true);
  const [editBlockAiAssist, setEditBlockAiAssist] = useState(true);
  const [editSettings, setEditSettings] = useState<KahootQuizSettings>({
    enablePoints: true,
    speedBonus: true,
    streakBonus: true,
    allowLateJoin: true,
    allowRetry: false,
    selfPacedTimerEnabled: true,
    leaderboardVisibility: 'after_each',
    showParticipantNames: true,
    showCorrectAnswers: true,
    showFeedback: true
  });
  // Quiz Scheduling & Visibility Fields
  const [editIsVisibleToMembers, setEditIsVisibleToMembers] = useState<boolean>(true);
  const [editIsScheduled, setEditIsScheduled] = useState<boolean>(false);
  const [editAvailableFromDate, setEditAvailableFromDate] = useState<string>('');
  const [editAvailableToDate, setEditAvailableToDate] = useState<string>('');
  const [editAvailableFromTime, setEditAvailableFromTime] = useState<string>('');
  const [editAvailableToTime, setEditAvailableToTime] = useState<string>('');
  const [editAutoHideOnExpiry, setEditAutoHideOnExpiry] = useState<boolean>(true);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const [allSoloScores, setAllSoloScores] = useState<KahootSoloScore[]>(() => storageService.getKahootSoloScores());
  const [editQuestions, setEditQuestions] = useState<KahootQuestion[]>([]);
  const [activeEditingQuestionIndex, setActiveEditingQuestionIndex] = useState<number>(0);

  // Live Game Timer & State
  const [timeRemaining, setTimeRemaining] = useState<number>(20);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [cheatWarningBanner, setCheatWarningBanner] = useState<string | null>(null);

  // Player Gamepad & Interactive Responses State
  const [playerSelectedAnswer, setPlayerSelectedAnswer] = useState<any>(null);
  const [multiSelectedOptions, setMultiSelectedOptions] = useState<string[]>([]);
  const [matchingUserSelections, setMatchingUserSelections] = useState<Record<string, string>>({});
  const [puzzleCurrentOrder, setPuzzleCurrentOrder] = useState<string[]>([]);
  const [typeAnswerInput, setTypeAnswerInput] = useState<string>('');
  const [sliderCurrentValue, setSliderCurrentValue] = useState<number>(5);
  const [pinClickedCoords, setPinClickedCoords] = useState<{ xPercent: number; yPercent: number } | null>(null);
  const [opinionInputText, setOpinionInputText] = useState<string>('');
  const [hasSubmittedCurrentQuestion, setHasSubmittedCurrentQuestion] = useState<boolean>(false);
  const [playerFeedback, setPlayerFeedback] = useState<{ isCorrect: boolean; points: number; streak: number } | null>(null);

  // Per-Question Cumulative Scoreboard & Previous Ranks Tracker
  const [perQuestionTop10, setPerQuestionTop10] = useState<Array<{
    player: KahootPlayer;
    questionPoints: number;
    cumulativeScore: number;
    rankDelta: number;
    isHighestClimber?: boolean;
  }>>([]);

  // Explicit Join State, Servant Observer Mode, Post-Answer Immediate Board Transition & Leaderboard Animation Phase
  const [joinedLiveSessionId, setJoinedLiveSessionId] = useState<string | null>(null);
  const [isLiveObserverMode, setIsLiveObserverMode] = useState<boolean>(false);
  const [playerPostAnswerStage, setPlayerPostAnswerStage] = useState<'none' | 'score_summary' | 'live_board'>('none');
  const lockedSubmittedQuestionKeyRef = useRef<string | null>(null);
  const [leaderboardAnimPhase, setLeaderboardAnimPhase] = useState<'previous' | 'current'>('current');
  const lastAnimatedBoardSignatureRef = useRef<string>('');

  const questionCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Granular Role-Based Access Control (RBAC)
  const isTopLeader = ['community_owner', 'community_manager', 'meeting_secretary', 'priest', 'service_secretary'].includes(currentUserRole);
  const isSeniorAdmin =
    isTopLeader ||
    canManageKahoot === true ||
    registrants.some(r =>
      (r.fullName === currentUserName || (currentUserName && r.fullName && normalizeArabicNameForComparison(r.fullName) === normalizeArabicNameForComparison(currentUserName))) &&
      r.permissions?.canManageKahoot === true
    );

  const canEditOrDeleteQuiz = (quiz: KahootQuiz): boolean => {
    if (isTopLeader) return true;
    if (!isSeniorAdmin) return false;
    return (
      quiz.creatorId === currentUserName ||
      quiz.creatorName === currentUserName ||
      normalizeArabicNameForComparison(quiz.creatorName || '') === normalizeArabicNameForComparison(currentUserName || '')
    );
  };

  // Current Player identification
  const currentPlayerId = useMemo(() => {
    const matched = registrants.find(r => r.fullName === currentUserName);
    return matched?.id || `user_${currentUserName.replace(/\s+/g, '_')}`;
  }, [registrants, currentUserName]);

  // Refresh quizzes, question bank & active sessions from storage
  const handledPendingQuizIdRef = useRef<string | null>(null);

  const refreshQuizzes = () => {
    const latestQuizzes = storageService.getKahootQuizzes();
    setQuizzes(prev => (JSON.stringify(prev) === JSON.stringify(latestQuizzes) ? prev : latestQuizzes));
    const latestBank = storageService.getKahootQuestionBank();
    setQuestionBank(prev => (JSON.stringify(prev) === JSON.stringify(latestBank) ? prev : latestBank));
    const latestSolo = storageService.getKahootSoloScores();
    setAllSoloScores(prev => (JSON.stringify(prev) === JSON.stringify(latestSolo) ? prev : latestSolo));

    setSoloQuiz(prevSolo => {
      if (!prevSolo) return null;
      const updatedParent = latestQuizzes.find(q => q.id === prevSolo.id);
      if (updatedParent) {
        const activeQs = updatedParent.questions.filter(q => !q.isDisabled);
        return {
          ...updatedParent,
          questions: activeQs.length > 0 ? activeQs : updatedParent.questions
        };
      }
      return prevSolo;
    });

    setAnalyticsQuiz(prevAnalytics => {
      if (!prevAnalytics) return null;
      const updatedTarget = latestQuizzes.find(q => q.id === prevAnalytics.id);
      return updatedTarget || prevAnalytics;
    });

    const currentActive = storageService.getActiveKahootSession();
    if (currentActive) {
      setActiveSession(prev => (JSON.stringify(prev) === JSON.stringify(currentActive) ? prev : currentActive));
      setSessionPin(prev => (prev === currentActive.id ? prev : currentActive.id));
      if (currentActive.secondScreenMode !== undefined) {
        setSecondScreenMode(prev => (prev === currentActive.secondScreenMode ? prev : currentActive.secondScreenMode!));
      }
      if (currentActive.canvasTextProtection !== undefined) {
        setCanvasTextProtection(prev => (prev === currentActive.canvasTextProtection ? prev : currentActive.canvasTextProtection!));
      }
      const matchedQuiz = latestQuizzes.find(q => q.id === currentActive.quizId);
      if (matchedQuiz) {
        setSelectedQuiz(prev => (prev?.id === matchedQuiz.id && JSON.stringify(prev) === JSON.stringify(matchedQuiz) ? prev : matchedQuiz));
      }
    } else {
      setActiveSession(prev => (prev === null ? null : null));
    }
  };

  useEffect(() => {
    refreshQuizzes();
    const unsubLocal = storageService.subscribe(refreshQuizzes);
    const unsubServer = storageService.onDataSynced(refreshQuizzes);
    const ultraFastLiveInterval = setInterval(() => {
      storageService.syncKahootLiveStateFast().catch(() => {});
    }, 650);
    const fastSyncInterval = setInterval(() => {
      storageService.fetchLatestServerData().catch(() => {});
    }, 2500);
    return () => {
      unsubLocal();
      unsubServer();
      clearInterval(ultraFastLiveInterval);
      clearInterval(fastSyncInterval);
    };
  }, []);

  // Keep soloLeaderboard synced whenever allSoloScores updates
  useEffect(() => {
    if (soloQuiz) {
      setSoloLeaderboard(storageService.getKahootSoloScores(soloQuiz.id));
    }
  }, [allSoloScores, soloQuiz?.id]);

  // Keep perQuestionTop10 automatically synced whenever activeSession.players or status updates
  useEffect(() => {
    if (!activeSession || !activeSession.players) return;
    const sessionPlayers = Object.values(activeSession.players);
    const sorted = [...sessionPlayers].sort((a, b) => b.score - a.score).slice(0, 10);
    const calculated = sorted.map((p, idx) => {
      const currentRank = idx + 1;
      const prevRank = p.previousRank || currentRank;
      const rankDelta = prevRank - currentRank;
      return {
        player: { ...p, currentRank },
        questionPoints: p.lastPointsEarned || 0,
        cumulativeScore: p.score,
        rankDelta,
        isHighestClimber: rankDelta >= 2
      };
    });
    setPerQuestionTop10(calculated);
  }, [activeSession?.players, activeSession?.status, activeSession?.currentQuestionIndex]);

  // Instant Mode-Switch Detection for Members: if host switches a quiz from self_paced to live/team, move member immediately to the live session without refresh
  useEffect(() => {
    if (!isSeniorAdmin && activeSession && activeSession.status !== 'finished') {
      if (activeViewMode === 'solo_game' && soloQuiz?.id === activeSession.quizId) {
        setIsSoloTimerRunning(false);
        setSoloQuiz(null);
        setActiveViewMode('player_gamepad');
      }
    }
  }, [isSeniorAdmin, activeSession?.id, activeSession?.quizId, activeSession?.status, activeViewMode, soloQuiz?.id]);

  // Live clock tick every 5 seconds to evaluate quiz schedule opening & automatic expiry/hiding in real time
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Automatically close entry & kick non-admin members out of a quiz immediately when its scheduled time expires or it is hidden
  useEffect(() => {
    if (isSeniorAdmin) return;
    if (activeViewMode === 'solo_game' && soloQuiz) {
      const latestQuiz = quizzes.find(q => q.id === soloQuiz.id) || soloQuiz;
      const evalRes = storageService.evaluateKahootQuizSchedule(latestQuiz, nowTick);
      if (!evalRes.available) {
        setIsSoloTimerRunning(false);
        setSoloQuiz(null);
        setActiveViewMode('player_gamepad');
        setShareToastMessage(
          evalRes.reason === 'expired'
            ? '⏰ انتهى التوقيت المحدد للمسابقة وتم إغلاق الدخول إليها تلقائياً.'
            : '🚫 لم تعد هذه المسابقة متاحة للدخول حالياً.'
        );
        setTimeout(() => setShareToastMessage(null), 5000);
      }
    } else if (activeViewMode === 'player_gamepad' && activeSession) {
      const sessionQuiz = quizzes.find(q => q.id === activeSession.quizId);
      if (sessionQuiz && !storageService.isKahootQuizAvailableForMembers(sessionQuiz, nowTick)) {
        setActiveSession(null);
        setSessionPin('');
        setShareToastMessage('⏰ انتهى التوقيت المحدد للمسابقة وتم إغلاق الغرفة تلقائياً.');
        setTimeout(() => setShareToastMessage(null), 5000);
      }
    }
  }, [nowTick, isSeniorAdmin, activeViewMode, soloQuiz, activeSession, quizzes]);

  // Synchronize live countdown timer across all connected devices whenever activeSession updates
  useEffect(() => {
    if (!activeSession) return;
    if (activeSession.status === 'question_active' && activeSession.questionStartedAt) {
      const limitSec = activeSession.questionTimeLimitSeconds || 20;
      const elapsedSec = Math.floor((Date.now() - activeSession.questionStartedAt) / 1000);
      const remaining = Math.max(0, limitSec - elapsedSec);
      setTimeRemaining(remaining);
      setIsTimerRunning(remaining > 0);
    } else {
      setIsTimerRunning(false);
    }
  }, [activeSession?.status, activeSession?.currentQuestionIndex, activeSession?.questionStartedAt]);

  // Reset local player inputs ONLY when live question index or session ID actually changes to a new question
  useEffect(() => {
    if (!activeSession || !selectedQuiz) return;
    const curQ = selectedQuiz.questions[activeSession.currentQuestionIndex];
    const questionKey = `${activeSession.id}_${activeSession.currentQuestionIndex}`;
    const alreadySubmittedServer = Boolean(curQ && activeSession.answersSubmitted?.[`${currentPlayerId}_${curQ.id}`]);
    const isLockedForThisQuestion = lockedSubmittedQuestionKeyRef.current === questionKey || alreadySubmittedServer;

    if (!isLockedForThisQuestion) {
      setPlayerSelectedAnswer(null);
      setMultiSelectedOptions([]);
      setMatchingUserSelections({});
      setPuzzleCurrentOrder(curQ?.puzzleItems ? curQ.puzzleItems.map(p => p.id) : []);
      setTypeAnswerInput('');
      setSliderCurrentValue(curQ?.sliderMin || 1);
      setPinClickedCoords(null);
      setOpinionInputText('');
      setHasSubmittedCurrentQuestion(false);
      setPlayerFeedback(null);
      setPlayerPostAnswerStage('none');
    } else {
      setHasSubmittedCurrentQuestion(true);
      setPlayerPostAnswerStage(prev => (prev === 'none' ? 'live_board' : prev));
    }
  }, [activeSession?.currentQuestionIndex, activeSession?.id, currentPlayerId, selectedQuiz?.id]);

  // Transition player from brief score summary (1.1s) directly to Live Top 10 Leaderboard without waiting for question timer
  useEffect(() => {
    if (playerPostAnswerStage !== 'score_summary') return;
    const timer = setTimeout(() => {
      setPlayerPostAnswerStage('live_board');
    }, 1100);
    return () => clearTimeout(timer);
  }, [playerPostAnswerStage]);

  // Trigger Dynamic Leaderboard Auto-Reordering Animation (previous rank slot -> new rank slot) whenever Top 10 scores update
  useEffect(() => {
    if (!activeSession || !activeSession.players) return;
    const sortedSig = Object.values(activeSession.players)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(p => `${p.id}:${p.score}:${p.previousRank || 1}`)
      .join('|');
    const boardSig = `${activeSession.id}_${activeSession.currentQuestionIndex}_${activeSession.status}_${ playerPostAnswerStage === 'live_board' ? 'board' : '' }_${sortedSig}`;
    if (!sortedSig || boardSig === lastAnimatedBoardSignatureRef.current) return;
    lastAnimatedBoardSignatureRef.current = boardSig;
    setLeaderboardAnimPhase('previous');
    const animTimer = setTimeout(() => {
      setLeaderboardAnimPhase('current');
    }, 380);
    return () => clearTimeout(animTimer);
  }, [activeSession?.id, activeSession?.currentQuestionIndex, activeSession?.status, activeSession?.players, playerPostAnswerStage]);

  // Keep member view on player_gamepad when not in solo_game, WITHOUT auto-joining live sessions before clicking Join
  const myPlayerInActiveSession = activeSession?.players?.[currentPlayerId];
  const isJoinedAsPlayerInActiveSession = Boolean(
    activeSession &&
    !isLiveObserverMode &&
    (joinedLiveSessionId === activeSession.id || Boolean(myPlayerInActiveSession))
  );

  useEffect(() => {
    if (currentUserRole === 'member' && activeViewMode !== 'solo_game' && activeViewMode !== 'player_gamepad') {
      setActiveViewMode('player_gamepad');
    }
  }, [currentUserRole, activeViewMode]);

  // Explicit Join Handler for Live / Team Sessions (places participant into Waiting Room until host starts)
  const handleExplicitJoinLiveSession = (targetSession?: KahootLiveSession | null, teamIdOverride?: string) => {
    const sessionToJoin = targetSession || activeSession || storageService.getActiveKahootSession();
    if (!sessionToJoin) return;
    const parentQuiz = quizzes.find(q => q.id === sessionToJoin.quizId) || selectedQuiz;
    if (!isSeniorAdmin && parentQuiz && !storageService.isKahootQuizAvailableForMembers(parentQuiz, Date.now())) {
      const evalRes = storageService.evaluateKahootQuizSchedule(parentQuiz, Date.now());
      setShareToastMessage(`⏰ عذراً، لا يمكن الانضمام للمسابقة: ${evalRes.statusLabelAr}`);
      setTimeout(() => setShareToastMessage(null), 4500);
      return;
    }
    setIsLiveObserverMode(false);
    const existingPlayer = sessionToJoin.players?.[currentPlayerId];
    const res = storageService.joinKahootSession(sessionToJoin.id, {
      id: currentPlayerId,
      name: currentUserName,
      avatar: registrants.find(r => r.fullName === currentUserName)?.photoUrl,
      teamId: teamIdOverride || selectedJoinTeamId || existingPlayer?.teamId || undefined,
      score: existingPlayer?.score || 0,
      streak: existingPlayer?.streak || 0,
      currentRank: existingPlayer?.currentRank || 1,
      isOnline: true
    });
    const updatedSess = res.session || storageService.getKahootSession(sessionToJoin.id) || sessionToJoin;
    setActiveSession(updatedSess);
    setSessionPin(updatedSess.id);
    if (parentQuiz) setSelectedQuiz(parentQuiz);
    setJoinedLiveSessionId(updatedSess.id);
    setActiveViewMode('player_gamepad');
  };

  // Explicit Observer / Host Mode Handler for Servants (watches questions & live Top 10 without registering as a player)
  const handleEnterLiveAsObserver = (targetSession?: KahootLiveSession | null, targetQuiz?: KahootQuiz | null) => {
    const sess = targetSession || activeSession || storageService.getActiveKahootSession();
    const quiz = targetQuiz || (sess ? quizzes.find(q => q.id === sess.quizId) : null) || selectedQuiz;
    setIsLiveObserverMode(true);
    setJoinedLiveSessionId(null);
    if (sess) {
      if (sess.players && sess.players[currentPlayerId]) {
        const cleanedPlayers = { ...sess.players };
        delete cleanedPlayers[currentPlayerId];
        const cleanedSession: KahootLiveSession = {
          ...sess,
          players: cleanedPlayers
        };
        storageService.saveKahootSession(cleanedSession);
        setActiveSession(cleanedSession);
      } else {
        setActiveSession(sess);
      }
      setSessionPin(sess.id);
    }
    if (quiz) setSelectedQuiz(quiz);
    setActiveViewMode('live_host');
  };

  // Auto-open shared quiz when user arrives via custom quiz link (?quizId=...) after signing in
  useEffect(() => {
    const pendingId = initialQuizId || sessionStorage.getItem('three_youths_pending_quiz_id');
    if (!pendingId || quizzes.length === 0) return;
    if (handledPendingQuizIdRef.current === pendingId) return;

    const targetQuiz = quizzes.find(q => q.id === pendingId);
    if (targetQuiz) {
      handledPendingQuizIdRef.current = pendingId;
      sessionStorage.removeItem('three_youths_pending_quiz_id');
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('quizId')) {
          url.searchParams.delete('quizId');
          window.history.replaceState({}, '', url.pathname + url.search);
        }
      } catch {}

      if (!isSeniorAdmin && !storageService.isKahootQuizAvailableForMembers(targetQuiz, Date.now())) {
        const evalRes = storageService.evaluateKahootQuizSchedule(targetQuiz, Date.now());
        setShareToastMessage(`⏰ عذراً، لا يمكن الدخول لمسابقة «${targetQuiz.title}»: ${evalRes.statusLabelAr}`);
        setTimeout(() => setShareToastMessage(null), 5000);
        return;
      }

      const currentLive = storageService.getActiveKahootSession();
      if (currentLive && currentLive.quizId === targetQuiz.id) {
        setActiveSession(currentLive);
        setSessionPin(currentLive.id);
        setSelectedQuiz(targetQuiz);
        setActiveViewMode('player_gamepad');
      } else if (targetQuiz.activePlayMode === 'self_paced') {
        handleStartSoloQuiz(targetQuiz);
      } else {
        setSelectedQuiz(targetQuiz);
        setActiveViewMode('player_gamepad');
      }
      setShareToastMessage(`🎉 أهلاً بك يا ${currentUserName.split(' ')[0]}! تم نقلك إلى مسابقة «${targetQuiz.title}»`);
      setTimeout(() => setShareToastMessage(null), 5000);
    }
  }, [initialQuizId, quizzes, currentPlayerId, currentUserName, isSeniorAdmin]);

  // Sync session anti-cheat flags when activeSession changes
  useEffect(() => {
    if (activeSession) {
      if (activeSession.secondScreenMode !== undefined) {
        setSecondScreenMode(activeSession.secondScreenMode);
      }
      if (activeSession.canvasTextProtection !== undefined) {
        setCanvasTextProtection(activeSession.canvasTextProtection);
      }
    }
  }, [activeSession?.secondScreenMode, activeSession?.canvasTextProtection]);

  // Persist activeViewMode and selected quiz in sessionStorage so closing/reopening dashboard restores the active mode
  useEffect(() => {
    try {
      sessionStorage.setItem('three_youths_kahoot_ui_state_v1', JSON.stringify({
        activeViewMode,
        selectedQuizId: selectedQuiz?.id || null,
        soloQuizId: soloQuiz?.id || null
      }));
    } catch {}
  }, [activeViewMode, selectedQuiz?.id, soloQuiz?.id]);

  // Generate QR Code whenever sessionPin changes, plus dedicated QR codes for each Team PIN
  useEffect(() => {
    if (sessionPin) {
      const publicOrigin = window.location.origin.replace(/https?:\/\/3fetya-youths\.ai\.studio/gi, 'https://3fetya-youths.com');
      const joinUrl = `${publicOrigin}?pin=${sessionPin}&mode=kahoot_join`;
      QRCode.toDataURL(joinUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: '#1e1b4b',
          light: '#ffffff'
        }
      }).then(url => setQrCodeDataUrl(url)).catch(() => {});
    }
  }, [sessionPin]);

  useEffect(() => {
    if (activeSession?.gameMode === 'team' && activeSession.teams) {
      const teamsList = Object.values(activeSession.teams);
      const publicOrigin = window.location.origin.replace(/https?:\/\/3fetya-youths\.ai\.studio/gi, 'https://3fetya-youths.com');
      Promise.all(
        teamsList.map(async (t) => {
          const teamPin = t.pin || activeSession.id;
          const teamUrl = `${publicOrigin}?pin=${teamPin}&teamId=${encodeURIComponent(t.id)}&mode=kahoot_join`;
          try {
            const dataUrl = await QRCode.toDataURL(teamUrl, {
              width: 240,
              margin: 2,
              color: { dark: '#1e1b4b', light: '#ffffff' }
            });
            return [t.id, dataUrl] as const;
          } catch {
            return [t.id, ''] as const;
          }
        })
      ).then((entries) => {
        const map: Record<string, string> = {};
        entries.forEach(([id, url]) => {
          if (url) map[id] = url;
        });
        setTeamQrDataUrls(map);
      });
    }
  }, [activeSession?.id, activeSession?.gameMode, activeSession?.teams]);

  // Helper to convert raw answer ID/value into readable Arabic text for inspection
  const formatQuestionAnswerLabel = (q: KahootQuestion, rawAnswer: any): string => {
    if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') return 'لم يُجب (انتهى الوقت)';
    if (Array.isArray(rawAnswer)) {
      if (q.options && q.options.length > 0) {
        return rawAnswer.map(id => q.options?.find(o => o.id === id)?.text || String(id)).join(' ، ');
      }
      if (q.puzzleItems && q.puzzleItems.length > 0) {
        return rawAnswer.map(id => q.puzzleItems?.find(p => p.id === id)?.text || String(id)).join(' ⬅ ');
      }
      return rawAnswer.join(' ، ');
    }
    if (typeof rawAnswer === 'object') {
      if ('xPercent' in rawAnswer && 'yPercent' in rawAnswer) {
        return `دبوس عند (${Math.round(rawAnswer.xPercent)}%, ${Math.round(rawAnswer.yPercent)}%)`;
      }
      if (q.matchingPairs && q.matchingPairs.length > 0) {
        return q.matchingPairs.map(pair => `${pair.leftText}: ${rawAnswer[pair.id] || '—'}`).join(' | ');
      }
      return JSON.stringify(rawAnswer);
    }
    if (q.type === 'true_false') {
      if (rawAnswer === 'true' || rawAnswer === 'tf_1' || rawAnswer === 'opt_true') return 'صح ✔️';
      if (rawAnswer === 'false' || rawAnswer === 'tf_2' || rawAnswer === 'opt_false') return 'خطأ ❌';
    }
    if (q.options && q.options.length > 0) {
      const matchedOpt = q.options.find(o => o.id === String(rawAnswer));
      if (matchedOpt) return matchedOpt.text;
    }
    return String(rawAnswer);
  };

  const getCorrectAnswerLabelForQuestion = (q: KahootQuestion): string => {
    if (q.pointsMultiplier === 0 && q.type !== 'pin_answer') return 'سؤال رأي / تصويت مفتوح';
    if (q.type === 'pin_answer' || q.type === 'drop_pin') {
      const target = q.pinCoordinates || { xPercent: 50, yPercent: 50, tolerancePercent: 18 };
      return `موضع الدبوس الصحيح عند (${Math.round(target.xPercent)}%, ${Math.round(target.yPercent)}%) 📍`;
    }
    if (q.type === 'type_answer' && q.correctTextAnswer) return q.correctTextAnswer;
    if (q.type === 'matching' && q.matchingPairs && q.matchingPairs.length > 0) {
      return q.matchingPairs.map(m => `${m.leftText} ⬅ ${m.rightText}`).join(' | ');
    }
    if (q.type === 'puzzle' && q.puzzleItems && q.puzzleItems.length > 0) {
      return [...q.puzzleItems].sort((a, b) => a.correctIndex - b.correctIndex).map(p => p.text).join(' ⬅ ');
    }
    if (q.type === 'slider' && q.sliderCorrectValue !== undefined) return `القيمة الصحيحة: ${q.sliderCorrectValue}`;
    if (q.options && q.options.length > 0) {
      return q.options.filter(o => o.isCorrect).map(o => o.text).join(' ، ') || '—';
    }
    if (q.correctTextAnswer) return q.correctTextAnswer;
    return '—';
  };

  // Handle Mute toggle
  const handleToggleMute = () => {
    const nextMuted = !isSoundMuted;
    setIsSoundMuted(nextMuted);
    audio.setMuted(nextMuted);
  };

  // Anti-Cheat: Tab-Switch, Window Blur & Keyboard Shortcuts Protection
  useEffect(() => {
    if (!activeSession || activeSession.status === 'finished') return;

    const handleVisibilityChange = () => {
      if (document.hidden && activeSession.status === 'question_active') {
        setCheatWarningBanner('⚠️ تنبيه منع الغش: لقد غادرت صفحة المسابقة أو قفلت الشاشة! تم تسجيل المخالفة وإشعار الخادم.');
        audio.playWrong();
        storageService.recordCheatViolation(activeSession.id, currentPlayerId, 'tab_switch');
        setTimeout(() => setCheatWarningBanner(null), 5000);
      }
    };

    const handleWindowBlur = () => {
      if (activeSession.status === 'question_active') {
        setCheatWarningBanner('⚠️ تنبيه أمني: تم رصد مغادرة النافذة أو استخدام تطبيق آخر أثناء تشغيل التايمر!');
        audio.playWrong();
        storageService.recordCheatViolation(activeSession.id, currentPlayerId, 'window_blur');
        setTimeout(() => setCheatWarningBanner(null), 5000);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputTarget = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isCreatorOpen || isInputTarget) return;

      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'c' || e.key === 'C' || e.key === 'a' || e.key === 'A' || e.key === 'u' || e.key === 'U')
      ) {
        e.preventDefault();
        setCheatWarningBanner('🛡️ تم تعطيل اختصارات النسخ والتحديد لحماية نزاهة المسابقة');
        setTimeout(() => setCheatWarningBanner(null), 3000);
      }
      if (e.key === 'F12') {
        e.preventDefault();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeSession, currentPlayerId, isCreatorOpen]);

  // Active Question Memo
  const currentQuestion = useMemo(() => {
    const targetQuiz = selectedQuiz || (activeSession ? quizzes.find(q => q.id === activeSession.quizId) : null);
    if (!targetQuiz || !activeSession) return null;
    return targetQuiz.questions[activeSession.currentQuestionIndex] || null;
  }, [selectedQuiz, activeSession, quizzes]);

  useEffect(() => {
    if (canvasTextProtection && currentQuestion && questionCanvasRef.current) {
      const canvas = questionCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 110 * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, rect.width, 110);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px "Cairo", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const words = currentQuestion.title.split(' ');
        let line = '';
        let y = 38;
        const maxWidth = rect.width - 40;

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line, rect.width / 2, y);
            line = words[n] + ' ';
            y += 32;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, rect.width / 2, y);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for (let i = 0; i < 60; i++) {
          ctx.fillRect(Math.random() * rect.width, Math.random() * 110, 2, 2);
        }
      }
    }
  }, [canvasTextProtection, currentQuestion]);

  // Live Timer Countdown Effect
  useEffect(() => {
    if (!isTimerRunning) return;
    if (timeRemaining <= 0) {
      setIsTimerRunning(false);
      if (activeViewMode === 'live_host' && activeSession?.status === 'question_active') {
        handleTimeUp();
      }
      return;
    }
    const timer = setTimeout(() => {
      if (timeRemaining <= 7 && timeRemaining > 1) {
        audio.playTick();
      }
      setTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [isTimerRunning, timeRemaining, activeViewMode, activeSession?.status]);

  // Auto-end question when all connected players in the live session have submitted their answer
  useEffect(() => {
    if (activeViewMode !== 'live_host' || !activeSession || activeSession.status !== 'question_active' || !currentQuestion) return;
    const totalPlayers = Object.keys(activeSession.players || {}).length;
    if (totalPlayers === 0) return;
    const answeredCount = Object.keys(activeSession.answersSubmitted || {}).filter(k =>
      k.endsWith(`_${currentQuestion.id}`)
    ).length;
    if (answeredCount >= totalPlayers) {
      const t = setTimeout(() => {
        setIsTimerRunning(false);
        handleTimeUp();
      }, 600);
      return () => clearTimeout(t);
    }
  }, [activeViewMode, activeSession?.status, activeSession?.players, activeSession?.answersSubmitted, currentQuestion?.id]);

  // Automatic transition in Live Host Mode: After "Time's Up / Answer Reveal" (2.8s), automatically display the Top 10 Leaderboard without clicking a button
  useEffect(() => {
    if (activeViewMode !== 'live_host' || !activeSession || activeSession.status !== 'answer_reveal' || !selectedQuiz) return;
    const curQ = selectedQuiz.questions[activeSession.currentQuestionIndex];
    // Automatically show Top 10 leaderboard after showing "انتهى الوقت" and correct answer
    if (curQ && curQ.pointsMultiplier !== 0) {
      const autoBoardTimer = setTimeout(() => {
        handleShowLeaderboard();
      }, 2800);
      return () => clearTimeout(autoBoardTimer);
    }
  }, [activeViewMode, activeSession?.status, activeSession?.currentQuestionIndex, selectedQuiz?.id]);

  // Solo Mode Countdown Timer (only runs when selfPacedTimerEnabled !== false)
  useEffect(() => {
    if (
      activeViewMode !== 'solo_game' ||
      soloStatus !== 'question_active' ||
      !isSoloTimerRunning ||
      soloQuiz?.settings?.selfPacedTimerEnabled === false
    ) {
      return;
    }
    if (soloTimeRemaining <= 0) {
      setIsSoloTimerRunning(false);
      handleSoloTimeUp();
      return;
    }
    const timer = setTimeout(() => {
      if (soloTimeRemaining <= 6 && soloTimeRemaining > 1) {
        audio.playTick();
      }
      setSoloTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [activeViewMode, soloStatus, isSoloTimerRunning, soloTimeRemaining, soloQuiz?.settings?.selfPacedTimerEnabled]);

  // Auto-advance to the next question in Self-Paced Mode (solo_game) after 1.6s on answer_reveal so there is zero lag or stuck screen
  useEffect(() => {
    if (activeViewMode !== 'solo_game' || soloStatus !== 'answer_reveal' || !soloQuiz) return;
    const autoNextTimer = setTimeout(() => {
      setPinClickedCoords(null);
      handleSoloNextStep();
    }, 1600);
    return () => clearTimeout(autoNextTimer);
  }, [activeViewMode, soloStatus, soloQuestionIndex, soloQuiz?.id]);

  // Start Solo Quiz (نظام التحدي الذاتي)
  const handleStartSoloQuiz = (quiz: KahootQuiz, forceRestart: boolean = false) => {
    if (!isSeniorAdmin && !storageService.isKahootQuizAvailableForMembers(quiz, Date.now())) {
      const evalRes = storageService.evaluateKahootQuizSchedule(quiz, Date.now());
      setShareToastMessage(`⏰ لا يمكن الدخول للمسابقة حالياً: ${evalRes.statusLabelAr}`);
      setTimeout(() => setShareToastMessage(null), 4500);
      return;
    }
    const activeQuestions = quiz.questions.filter(q => !q.isDisabled);
    const quizToPlay = { ...quiz, questions: activeQuestions.length > 0 ? activeQuestions : quiz.questions };
    const existingBoard = storageService.getKahootSoloScores(quiz.id);
    const prevTopMap: Record<string, number> = {};
    existingBoard.forEach((s, idx) => {
      prevTopMap[s.playerName] = idx + 1;
    });
    setPreviousSoloTop3Ids(prevTopMap);
    setSoloLeaderboard(existingBoard);

    const matched = registrants.find(r => r.fullName === currentUserName);
    const resolvedPlayerId = matched?.id || currentPlayerId;
    const existingCompleted = existingBoard.find(
      s => (s.playerId === resolvedPlayerId || s.playerName === currentUserName) && s.status !== 'in_progress'
    );

    // If participant already completed this quiz and allowRetry is NOT enabled by the quiz creator, show their completed result & Top 3 directly
    if (existingCompleted && quizToPlay.settings?.allowRetry !== true && !forceRestart) {
      setSoloQuiz(quizToPlay);
      setSoloQuestionIndex(quizToPlay.questions.length - 1);
      setSoloScore(existingCompleted.score);
      setSoloStreak(0);
      setSoloCorrectCount(existingCompleted.correctCount);
      setSoloAnswersDetail(existingCompleted.answersDetail || []);
      setIsSoloTimerRunning(false);
      setSoloStatus('finished');
      setActiveViewMode('solo_game');
      return;
    }

    const timerEnabled = quizToPlay.settings?.selfPacedTimerEnabled !== false;
    setSoloQuiz(quizToPlay);
    setSoloQuestionIndex(0);
    setSoloScore(0);
    setSoloStreak(0);
    setSoloCorrectCount(0);
    setSoloSelectedAnswer(null);
    setMultiSelectedOptions([]);
    setMatchingUserSelections({});
    setSoloHasSubmitted(false);
    setSoloFeedback(null);
    setSoloAnswersDetail([]);
    setSoloStatus('question_active');
    setSoloTimeRemaining(quizToPlay.questions[0]?.timeLimitSeconds || 20);
    setIsSoloTimerRunning(timerEnabled);
    setSoloStartedAt(Date.now());
    setActiveViewMode('solo_game');

    // Immediately register 'in_progress' participant so the host can monitor live participants & progress
    const initialProgressRecord: KahootSoloScore = {
      id: existingCompleted?.id || `solo_${quizToPlay.id}_${resolvedPlayerId}`,
      quizId: quizToPlay.id,
      quizTitle: quizToPlay.title,
      playerId: resolvedPlayerId,
      playerName: currentUserName,
      playerAvatar: matched?.photoUrl,
      score: 0,
      correctCount: 0,
      totalQuestions: quizToPlay.questions.length,
      currentQuestionIndex: 0,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      answersDetail: []
    };
    storageService.saveKahootSoloScore(initialProgressRecord);
  };

  // Solo Answer Submit (with real-time per-question progress & score sync to host)
  const handleSoloAnswerSubmit = (answer: any, isCorrectGuess: boolean) => {
    if (!soloQuiz || soloHasSubmitted || soloStatus !== 'question_active') return;
    const currentQ = soloQuiz.questions[soloQuestionIndex];
    if (!currentQ) return;

    setSoloHasSubmitted(true);
    setIsSoloTimerRunning(false);
    setSoloSelectedAnswer(answer);

    const timerEnabled = soloQuiz.settings?.selfPacedTimerEnabled !== false;
    const timeLimitMs = (currentQ.timeLimitSeconds || 20) * 1000;
    const timeElapsedMs = Math.max(500, Date.now() - soloStartedAt);

    let points = 0;
    let newStreak = soloStreak;
    let newTotalScore = soloScore;
    let newCorrectCount = soloCorrectCount;

    if (isCorrectGuess && (currentQ.pointsMultiplier === undefined || currentQ.pointsMultiplier > 0)) {
      audio.playCorrect();
      const mult = currentQ.pointsMultiplier || 1;
      const maxPoints = currentQ.customPoints || (1000 * mult);
      const ratio = Math.min(1, Math.max(0, timeElapsedMs / timeLimitMs));
      const speedPoints =
        !timerEnabled || soloQuiz.settings?.speedBonus === false
          ? maxPoints
          : Math.round((1 - (ratio / 2)) * maxPoints);
      newStreak += 1;
      const streakBonus = soloQuiz.settings?.streakBonus === false ? 0 : Math.min(500, newStreak * 100);
      points = speedPoints + streakBonus;
      newTotalScore = soloScore + points;
      newCorrectCount = soloCorrectCount + 1;

      setSoloScore(newTotalScore);
      setSoloStreak(newStreak);
      setSoloCorrectCount(newCorrectCount);
      setSoloFeedback({ isCorrect: true, points, streak: newStreak });
    } else if (currentQ.pointsMultiplier === 0) {
      audio.playCorrect();
      setSoloFeedback({ isCorrect: true, points: 0, streak: newStreak });
    } else {
      audio.playWrong();
      newStreak = 0;
      setSoloStreak(0);
      setSoloFeedback({ isCorrect: false, points: 0, streak: 0 });
    }

    const answerLabel = formatQuestionAnswerLabel(currentQ, answer);
    const updatedDetails = [
      ...soloAnswersDetail.filter(a => a.questionId !== currentQ.id),
      {
        questionId: currentQ.id,
        questionTitle: currentQ.title,
        answer,
        answerLabel,
        isCorrect: isCorrectGuess || currentQ.pointsMultiplier === 0,
        points,
        timeElapsedMs
      }
    ];
    setSoloAnswersDetail(updatedDetails);

    // Sync live progress to server so host sees participant's current question & live Top 10 score
    const matched = registrants.find(r => r.fullName === currentUserName);
    const resolvedPlayerId = matched?.id || currentPlayerId;
    storageService.saveKahootSoloScore({
      id: `solo_${soloQuiz.id}_${resolvedPlayerId}`,
      quizId: soloQuiz.id,
      quizTitle: soloQuiz.title,
      playerId: resolvedPlayerId,
      playerName: currentUserName,
      playerAvatar: matched?.photoUrl,
      score: newTotalScore,
      correctCount: newCorrectCount,
      totalQuestions: soloQuiz.questions.length,
      currentQuestionIndex: soloQuestionIndex + 1,
      status: 'in_progress',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      answersDetail: updatedDetails
    });

    setSoloStatus('answer_reveal');
  };

  // Solo Time Up
  const handleSoloTimeUp = () => {
    if (!soloQuiz || soloHasSubmitted || soloStatus !== 'question_active') return;
    const currentQ = soloQuiz.questions[soloQuestionIndex];
    setSoloHasSubmitted(true);
    setSoloStreak(0);
    setSoloFeedback({ isCorrect: false, points: 0, streak: 0 });
    audio.playWrong();
    let updatedDetails = soloAnswersDetail;
    if (currentQ) {
      updatedDetails = [
        ...soloAnswersDetail.filter(a => a.questionId !== currentQ.id),
        {
          questionId: currentQ.id,
          questionTitle: currentQ.title,
          answer: null,
          answerLabel: 'لم يُجب (انتهى الوقت ⏱️)',
          isCorrect: false,
          points: 0,
          timeElapsedMs: (currentQ.timeLimitSeconds || 20) * 1000
        }
      ];
      setSoloAnswersDetail(updatedDetails);
    }

    const matched = registrants.find(r => r.fullName === currentUserName);
    const resolvedPlayerId = matched?.id || currentPlayerId;
    storageService.saveKahootSoloScore({
      id: `solo_${soloQuiz.id}_${resolvedPlayerId}`,
      quizId: soloQuiz.id,
      quizTitle: soloQuiz.title,
      playerId: resolvedPlayerId,
      playerName: currentUserName,
      playerAvatar: matched?.photoUrl,
      score: soloScore,
      correctCount: soloCorrectCount,
      totalQuestions: soloQuiz.questions.length,
      currentQuestionIndex: soloQuestionIndex + 1,
      status: 'in_progress',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      answersDetail: updatedDetails
    });

    setSoloStatus('answer_reveal');
  };

  // Solo Next Question / Finish
  const handleSoloNextStep = () => {
    if (!soloQuiz) return;
    const timerEnabled = soloQuiz.settings?.selfPacedTimerEnabled !== false;
    if (soloQuestionIndex + 1 < soloQuiz.questions.length) {
      const nextIdx = soloQuestionIndex + 1;
      const nextQ = soloQuiz.questions[nextIdx];
      setSoloQuestionIndex(nextIdx);
      setSoloTimeRemaining(nextQ?.timeLimitSeconds || 20);
      setSoloSelectedAnswer(null);
      setMultiSelectedOptions([]);
      setMatchingUserSelections({});
      setSoloHasSubmitted(false);
      setSoloFeedback(null);
      setSoloStatus('question_active');
      setSoloStartedAt(Date.now());
      setIsSoloTimerRunning(timerEnabled);
    } else {
      setSoloStatus('finished');
      setIsSoloTimerRunning(false);
      audio.playFanfare();
      try {
        confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
      } catch {}

      const existingBoard = storageService.getKahootSoloScores(soloQuiz.id);
      const prevMap: Record<string, number> = {};
      existingBoard.forEach((s, idx) => {
        prevMap[s.playerName] = idx + 1;
      });
      setPreviousSoloTop3Ids(prevMap);

      const matched = registrants.find(r => r.fullName === currentUserName);
      const resolvedPlayerId = matched?.id || currentPlayerId;
      const scoreObj: KahootSoloScore = {
        id: `solo_${soloQuiz.id}_${resolvedPlayerId}`,
        quizId: soloQuiz.id,
        quizTitle: soloQuiz.title,
        playerId: resolvedPlayerId,
        playerName: currentUserName,
        playerAvatar: matched?.photoUrl,
        score: soloScore,
        correctCount: soloCorrectCount,
        totalQuestions: soloQuiz.questions.length,
        currentQuestionIndex: soloQuiz.questions.length,
        status: 'completed',
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        previousRank: prevMap[currentUserName],
        answersDetail: soloAnswersDetail
      };

      storageService.saveKahootSoloScore(scoreObj);
      setSoloLeaderboard(storageService.getKahootSoloScores(soloQuiz.id));
    }
  };

  // Open Launch Modal & initialize mode/team/settings configs from the quiz
  const handleOpenLaunchModal = (quiz: KahootQuiz) => {
    setLaunchModalQuiz(quiz);
    setLaunchSelectedMode(quiz.activePlayMode || quiz.gameMode || 'live');
    setTeamAssignmentMode(quiz.teamAssignmentMode || 'manual_or_pin');
    setEditTeamAssignmentMode(quiz.teamAssignmentMode || 'manual_or_pin');
    setEditSettings({
      enablePoints: quiz.settings?.enablePoints ?? true,
      speedBonus: quiz.settings?.speedBonus ?? true,
      streakBonus: quiz.settings?.streakBonus ?? true,
      allowLateJoin: quiz.settings?.allowLateJoin ?? true,
      allowRetry: quiz.settings?.allowRetry ?? false,
      selfPacedTimerEnabled: quiz.settings?.selfPacedTimerEnabled ?? true,
      leaderboardVisibility: quiz.settings?.leaderboardVisibility ?? 'after_each',
      showParticipantNames: quiz.settings?.showParticipantNames ?? true,
      showCorrectAnswers: quiz.settings?.showCorrectAnswers ?? true,
      showFeedback: quiz.settings?.showFeedback ?? true
    });
    if (quiz.customTeams && quiz.customTeams.length >= 2) {
      setCustomTeamConfigs(quiz.customTeams);
      setEditCustomTeams(quiz.customTeams);
    } else {
      setCustomTeamConfigs(DEFAULT_TEAM_CONFIGS);
      setEditCustomTeams(DEFAULT_TEAM_CONFIGS);
    }
  };

  // Activate Self-Paced Mode persistently on the quiz, close any active live room for it, and open the Host Self-Paced Monitor
  const handleActivateSelfPacedMode = (quiz: KahootQuiz, alsoPlayNow: boolean = false) => {
    // End any active live session for this quiz so members switch immediately to Self-Paced without page refresh
    const sessions = storageService.getKahootSessions();
    Object.values(sessions).forEach(s => {
      if (s && s.quizId === quiz.id && s.status !== 'finished') {
        storageService.endKahootSession(s.id);
      }
    });
    if (activeSession && activeSession.quizId === quiz.id) {
      setActiveSession(null);
    }

    const updatedQuiz: KahootQuiz = {
      ...quiz,
      status: 'published',
      isPublished: true,
      gameMode: 'self_paced',
      activePlayMode: 'self_paced',
      activeSessionId: undefined,
      settings: {
        ...(quiz.settings || {}),
        ...editSettings,
        allowRetry: editSettings.allowRetry ?? quiz.settings?.allowRetry ?? false,
        selfPacedTimerEnabled: editSettings.selfPacedTimerEnabled ?? quiz.settings?.selfPacedTimerEnabled ?? true
      },
      playCount: (quiz.playCount || 0) + 1,
      updatedAt: new Date().toISOString()
    };
    storageService.saveKahootQuiz(updatedQuiz);
    refreshQuizzes();
    setLaunchModalQuiz(null);
    if (alsoPlayNow) {
      handleStartSoloQuiz(updatedQuiz, true);
    } else {
      // Open the live Self-Paced Progress & Top 10 Monitor immediately for the host
      setAnalyticsQuiz(updatedQuiz);
      setShareToastMessage(`🎯 تم تفعيل وضع «تحدي ذاتي (Self-Paced)» لمسابقة «${quiz.title}» وفتح شاشة متابعة تقدم المشاركين والـ Top 10!`);
      setTimeout(() => setShareToastMessage(null), 5000);
    }
  };

    // Start Live Session as Host or Competing Player (with Game Mode & Custom Teams support)
  const handleStartHosting = (
    quiz: KahootQuiz,
    modeOverride?: KahootGameMode,
    assignmentOverride?: 'random' | 'manual_or_pin',
    teamsOverride?: KahootTeamConfigItem[],
    joinAsPlayerImmediate: boolean = false
  ) => {
    const mode = modeOverride || launchSelectedMode || quiz.gameMode || 'live';
    if (mode === 'self_paced') {
      handleActivateSelfPacedMode(quiz, joinAsPlayerImmediate);
      return;
    }

    const chosenAssignment = assignmentOverride || editTeamAssignmentMode || teamAssignmentMode;
    const chosenTeams = teamsOverride && teamsOverride.length >= 2 ? teamsOverride : customTeamConfigs;
    const validTeams = chosenTeams
      .map((t, i) => ({
        id: t.id || `team_${i + 1}`,
        name: t.name.trim() || `الفريق ${i + 1}`,
        color: t.color || TEAM_COLORS_PALETTE[i % TEAM_COLORS_PALETTE.length],
        icon: t.icon || (['🔥', '⚡', '🛡️', '🦁', '🌟', '👑'][i % 6]),
        pin: t.pin
      }))
      .slice(0, 10);

    const updatedQuiz: KahootQuiz = {
      ...quiz,
      status: 'live',
      isPublished: true,
      gameMode: mode,
      activePlayMode: mode,
      teamAssignmentMode: mode === 'team' ? chosenAssignment : quiz.teamAssignmentMode,
      customTeams: mode === 'team' ? validTeams : quiz.customTeams,
      settings: {
        ...(quiz.settings || {}),
        ...editSettings
      },
      playCount: (quiz.playCount || 0) + 1,
      updatedAt: new Date().toISOString()
    };
    storageService.saveKahootQuiz(updatedQuiz);

    const session = storageService.createKahootLiveSession(
      updatedQuiz.id,
      currentUserName,
      updatedQuiz.maxPlayersLimit,
      {
        hostName: currentUserName,
        gameMode: mode,
        teamAssignmentMode: mode === 'team' ? chosenAssignment : undefined,
        customTeams: mode === 'team' ? validTeams : undefined,
        allowLateJoin: updatedQuiz.settings?.allowLateJoin ?? true,
        leaderboardVisibility: updatedQuiz.settings?.leaderboardVisibility ?? 'after_each',
        showParticipantNames: mode === 'anonymous_poll' ? false : (updatedQuiz.settings?.showParticipantNames ?? true)
      }
    );
    setSelectedQuiz(updatedQuiz);
    setActiveSession(session);
    setSessionPin(session.id);
    setLaunchModalQuiz(null);
    setTimeRemaining(updatedQuiz.questions[0]?.timeLimitSeconds || 20);

    if (joinAsPlayerImmediate) {
      setIsLiveObserverMode(false);
      handleExplicitJoinLiveSession(session);
    } else {
      setIsLiveObserverMode(true);
      setJoinedLiveSessionId(null);
      setActiveViewMode('live_host');
      if (isLobbyMusicOn && !isSoundMuted) {
        audio.startLobbyMusic();
      }
    }
  };

  // Duplicate Quiz
  const handleDuplicateQuiz = (quiz: KahootQuiz) => {
    const duplicated: KahootQuiz = {
      ...quiz,
      id: `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: `${quiz.title} (نسخة)`,
      creatorId: currentUserName,
      creatorName: currentUserName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      playCount: 0,
      participantsCount: 0,
      questions: quiz.questions.map(q => ({
        ...q,
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
      }))
    };
    storageService.saveKahootQuiz(duplicated);
    refreshQuizzes();
    setShareToastMessage(`📋 تم نسخ المسابقة «${quiz.title}» بنجاح كمسودة قابلة للتعديل!`);
    setTimeout(() => setShareToastMessage(null), 4000);
  };

  // Toggle Session Lock (Lobby)
  const handleToggleSessionLock = () => {
    if (!activeSession) return;
    const updated: KahootLiveSession = {
      ...activeSession,
      isLocked: !activeSession.isLocked
    };
    setActiveSession(updated);
    storageService.saveKahootSession(updated);
  };

  // Launch Question in Live Session
  const handleStartQuestion = (questionIndex: number) => {
    if (!selectedQuiz || !activeSession) return;
    const currentQ = selectedQuiz.questions[questionIndex];
    if (!currentQ) return;

    audio.stopLobbyMusic();

    const updatedSession: KahootLiveSession = {
      ...activeSession,
      status: 'question_active',
      currentQuestionIndex: questionIndex,
      questionStartedAt: Date.now(),
      questionTimeLimitSeconds: currentQ.timeLimitSeconds || 20,
      secondScreenMode,
      canvasTextProtection
    };
    storageService.saveKahootSession(updatedSession);
    setActiveSession(updatedSession);
    setTimeRemaining(currentQ.timeLimitSeconds || 20);
    setIsTimerRunning(true);

    setPlayerSelectedAnswer(null);
    setMultiSelectedOptions([]);
    setMatchingUserSelections({});
    setPuzzleCurrentOrder(currentQ.puzzleItems ? currentQ.puzzleItems.map(p => p.id) : []);
    setTypeAnswerInput('');
    setSliderCurrentValue(currentQ.sliderMin || 1);
    setPinClickedCoords(null);
    setOpinionInputText('');
    setHasSubmittedCurrentQuestion(false);
    setPlayerFeedback(null);

    if (currentQ.type === 'audio_quiz') {
      audio.speakText(currentQ.title);
    }
  };

  // Time is Up Handler
  const handleTimeUp = () => {
    if (!activeSession || !selectedQuiz) return;
    const currentQ = selectedQuiz.questions[activeSession.currentQuestionIndex];
    if (!currentQ) return;

    const updatedSession: KahootLiveSession = {
      ...activeSession,
      status: 'answer_reveal'
    };
    storageService.saveKahootSession(updatedSession);
    setActiveSession(updatedSession);

    if (currentQ.type === 'quiz' || currentQ.type === 'true_false' || currentQ.type === 'audio_quiz' || currentQ.type === 'image_quiz') {
      audio.playCorrect();
    }
  };

  // Compute Per-Question Top 10 and Cumulative Scoreboard
  const handleShowLeaderboard = () => {
    if (!activeSession || !selectedQuiz) return;

    const sessionPlayers = Object.values(activeSession.players);
    const sorted = [...sessionPlayers].sort((a, b) => b.score - a.score).slice(0, 10);

    const calculated = sorted.map((p, idx) => {
      const currentRank = idx + 1;
      const prevRank = p.previousRank || currentRank;
      const rankDelta = prevRank - currentRank;
      return {
        player: { ...p, currentRank },
        questionPoints: p.lastPointsEarned || 0,
        cumulativeScore: p.score,
        rankDelta,
        isHighestClimber: rankDelta >= 2
      };
    });

    setPerQuestionTop10(calculated);

    const updatedSession: KahootLiveSession = {
      ...activeSession,
      status: 'leaderboard'
    };
    storageService.saveKahootSession(updatedSession);
    setActiveSession(updatedSession);
  };

  // Move to Next Question or Grand Final Podium
  const handleNextStep = () => {
    if (!activeSession || !selectedQuiz) return;
    const nextIndex = activeSession.currentQuestionIndex + 1;
    if (nextIndex < selectedQuiz.questions.length) {
      handleStartQuestion(nextIndex);
    } else {
      const sessionPlayers = Object.values(activeSession.players);
      const sorted = [...sessionPlayers].sort((a, b) => b.score - a.score).slice(0, 10);
      const calculated = sorted.map((p, idx) => {
        const currentRank = idx + 1;
        const prevRank = p.previousRank || currentRank;
        const rankDelta = prevRank - currentRank;
        return {
          player: { ...p, currentRank },
          questionPoints: p.lastPointsEarned || 0,
          cumulativeScore: p.score,
          rankDelta,
          isHighestClimber: rankDelta >= 2
        };
      });
      setPerQuestionTop10(calculated);

      const updatedSession: KahootLiveSession = {
        ...activeSession,
        status: 'podium',
        finishedAt: new Date().toISOString()
      };
      storageService.saveKahootSession(updatedSession);
      setActiveSession(updatedSession);

      // Mark quiz as published with updated stats
      const playerCount = Object.keys(activeSession.players).length;
      const updatedQuiz: KahootQuiz = {
        ...selectedQuiz,
        status: 'published',
        participantsCount: Math.max(selectedQuiz.participantsCount || 0, playerCount),
        updatedAt: new Date().toISOString()
      };
      storageService.saveKahootQuiz(updatedQuiz);
      setSelectedQuiz(updatedQuiz);

      audio.playFanfare();
      try {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch {}
    }
  };

  // ==========================================
  // CREATION MODES HANDLERS (4 MODES)
  // ==========================================

  const sanitizeEncodingText = (str: string): string => {
    if (!str) return '';
    return str.replace(/\uFFFD+/g, '').replace(/\s{2,}/g, ' ').trim();
  };

  const buildLocalFallbackQuestions = (
    topicLabel: string,
    count: number,
    customSpec: string = '',
    selectedTypes: KahootQuestionType[] = ['quiz', 'true_false'],
    langPref: 'auto' | 'ar' | 'en' = 'auto'
  ): KahootQuestion[] => {
    const cleanRaw = sanitizeEncodingText(topicLabel) || (sanitizeEncodingText(customSpec) ? sanitizeEncodingText(customSpec).slice(0, 45) : '');
    const combinedProbe = `${cleanRaw} ${customSpec}`;
    const arCount = (combinedProbe.match(/[\u0600-\u06FF]/g) || []).length;
    const enCount = (combinedProbe.match(/[A-Za-z]/g) || []).length;
    const isEn = langPref === 'en' || (langPref === 'auto' && enCount > arCount * 2 && enCount > 5);
    const clean = cleanRaw || (isEn ? 'Daniel and the Three Holy Youths' : 'الثلاثة فتية القديسين وسفر دانيال');

    const allowedTypes: KahootQuestionType[] = selectedTypes.length > 0 ? selectedTypes : ['quiz', 'true_false'];
    const targetCount = Math.min(50, Math.max(1, Number(count) || 5));

    const makeQuestionByType = (qType: KahootQuestionType, idx: number): KahootQuestion => {
      const qNum = idx + 1;
      const baseId = `q_${Date.now()}_${qNum}`;

      if (qType === 'true_false') {
        return {
          id: baseId,
          type: 'true_false',
          title: isEn
            ? `True or False (#${qNum}): The main spiritual message of (${clean}) calls for faithfulness and courage in God.`
            : `صح أم خطأ (سؤال ${qNum}): يركز موضوع (${clean}) على الأمانة والثبات في الإيمان بقوة الله.`,
          timeLimitSeconds: 15,
          pointsMultiplier: 1,
          explanation: isEn ? `Faithfulness is a core biblical theme in ${clean}.` : `الأمانة والثبات في الإيمان هما جوهر الرسالة الروحية في ${clean}.`,
          options: [
            { id: 'tf_1', text: isEn ? 'True ✔️' : 'صح (True) ✔️', isCorrect: true, color: 'blue', shape: 'diamond' },
            { id: 'tf_2', text: isEn ? 'False ❌' : 'خطأ (False) ❌', isCorrect: false, color: 'red', shape: 'triangle' }
          ]
        };
      }

      if (qType === 'puzzle') {
        return {
          id: baseId,
          type: 'puzzle',
          title: isEn
            ? `Order the spiritual steps inspired by (${clean}) from first to last:`
            : `رتب الخطوات الروحية والعملية في (${clean}) من البداية إلى النهاية:`,
          timeLimitSeconds: 30,
          pointsMultiplier: 2,
          puzzleItems: isEn
            ? [
                { id: 'p1', text: '1. Prayer and seeking God first', correctIndex: 0 },
                { id: 'p2', text: '2. Standing firm in faith without fear', correctIndex: 1 },
                { id: 'p3', text: '3. Bold witness to the truth', correctIndex: 2 },
                { id: 'p4', text: '4. Praise and thanksgiving for God’s victory', correctIndex: 3 }
              ]
            : [
                { id: 'p1', text: 'الصلاة واللجوء إلى الله أولاً', correctIndex: 0 },
                { id: 'p2', text: 'الثبات على الإيمان وعدم الخوف', correctIndex: 1 },
                { id: 'p3', text: 'الشهادة الأمينة للحق أمام الجميع', correctIndex: 2 },
                { id: 'p4', text: 'التسبيح والشكر لعمل الله', correctIndex: 3 }
              ]
        };
      }

      if (qType === 'type_answer') {
        return {
          id: baseId,
          type: 'type_answer',
          title: isEn
            ? `Type the core Christian virtue highlighted in (${clean}):`
            : `اكتب الفضيلة الروحية الأساسية التي نتعلمها من (${clean}):`,
          timeLimitSeconds: 25,
          pointsMultiplier: 1,
          correctTextAnswer: isEn ? 'Faith' : 'الإيمان',
          acceptableTextAnswers: isEn
            ? ['faith', 'courage', 'love', 'trust', 'hope', 'prayer']
            : ['الايمان', 'الإيمان', 'الثبات', 'الشجاعة', 'المحبة', 'الصلاة', 'الامانة', 'الأمانة']
        };
      }

      if (qType === 'matching') {
        return {
          id: baseId,
          type: 'matching',
          title: isEn
            ? `Match each biblical name or concept with its counterpart in (${clean}):`
            : `صل كل اسم أو مفهوم بما يناسبه في (${clean}):`,
          timeLimitSeconds: 30,
          pointsMultiplier: 2,
          matchingPairs: isEn
            ? [
                { id: 'm1', leftText: 'Hananiah', rightText: 'Shadrach' },
                { id: 'm2', leftText: 'Mishael', rightText: 'Meshach' },
                { id: 'm3', leftText: 'Azariah', rightText: 'Abednego' }
              ]
            : [
                { id: 'm1', leftText: 'حنانيا', rightText: 'شدرخ' },
                { id: 'm2', leftText: 'ميشائيل', rightText: 'ميشخ' },
                { id: 'm3', leftText: 'عزريا', rightText: 'عبد نغو' }
              ]
        };
      }

      if (qType === 'slider') {
        return {
          id: baseId,
          type: 'slider',
          title: isEn
            ? `How many Holy Youths stood faithfully in the fiery furnace in the Book of Daniel?`
            : `كم عدد الفتية القديسين الذين ثبتوا على إيمانهم في أتون النار بسفر دانيال؟`,
          timeLimitSeconds: 20,
          pointsMultiplier: 1,
          sliderMin: 1,
          sliderMax: 10,
          sliderStep: 1,
          sliderCorrectValue: 3,
          sliderMarginOfError: 0
        };
      }

      if (qType === 'pin_answer' || qType === 'drop_pin') {
        return {
          id: baseId,
          type: qType,
          title: isEn
            ? `Place the pin on the target spot in the image for (${clean}):`
            : `حدد بالدبوس 📍 الموضع الصحيح على الصورة الخاصة بـ (${clean}):`,
          timeLimitSeconds: 25,
          pointsMultiplier: qType === 'drop_pin' ? 0 : 1,
          mediaUrl: 'https://images.unsplash.com/photo-1548625361-195977935bb8?w=900',
          mediaType: 'image',
          pinCoordinates: { xPercent: 50, yPercent: 50, tolerancePercent: 20 }
        };
      }

      if (qType === 'poll') {
        return {
          id: baseId,
          type: 'poll',
          title: isEn
            ? `Poll: Which spiritual lesson from (${clean}) touches your life the most?`
            : `تصويت: ما هو أكثر درس روحي في (${clean}) يلمس حياتك العملية؟`,
          timeLimitSeconds: 25,
          pointsMultiplier: 0,
          options: isEn
            ? [
                { id: 'opt_1', text: 'Deep prayer & communion with God', isCorrect: true, color: 'red', shape: 'triangle' },
                { id: 'opt_2', text: 'Courage & steadfastness in trials', isCorrect: true, color: 'blue', shape: 'diamond' },
                { id: 'opt_3', text: 'Christian fellowship & service', isCorrect: true, color: 'yellow', shape: 'circle' },
                { id: 'opt_4', text: 'Daily study of the Holy Bible', isCorrect: true, color: 'green', shape: 'square' }
              ]
            : [
                { id: 'opt_1', text: 'حياة الصلاة والعشرة العميقة مع الله', isCorrect: true, color: 'red', shape: 'triangle' },
                { id: 'opt_2', text: 'الشجاعة والثبات في وقت التجارب', isCorrect: true, color: 'blue', shape: 'diamond' },
                { id: 'opt_3', text: 'المحبة الأخوية والخدمة الأمينة', isCorrect: true, color: 'yellow', shape: 'circle' },
                { id: 'opt_4', text: 'التعمق اليومي في كلمة الكتاب المقدس', isCorrect: true, color: 'green', shape: 'square' }
              ]
        };
      }

      if (qType === 'word_cloud') {
        return {
          id: baseId,
          type: 'word_cloud',
          title: isEn
            ? `Share one inspiring word that summarizes (${clean}):`
            : `شارك بكلمة واحدة تعبر عما استفدته من (${clean}):`,
          timeLimitSeconds: 25,
          pointsMultiplier: 0
        };
      }

      // Default: 'quiz' (Multiple choice)
      return {
        id: baseId,
        type: 'quiz',
        title: isEn
          ? `Question #${qNum}: What is a key spiritual truth and lesson taught in (${clean})?`
          : `السؤال رقم (${qNum}): ما هي الحقيقة الروحية والعملية الأساسية المرتبطة بـ (${clean})؟`,
        timeLimitSeconds: 20,
        pointsMultiplier: 1,
        explanation: isEn ? `Living faithfully according to God's Word is the core lesson of ${clean}.` : `الامانة والثبات في وصية الله هما الدرس الجوهري في ${clean}.`,
        options: isEn
          ? [
              { id: 'opt_1', text: `Trusting God’s power and living faithfully in (${clean.slice(0, 45)})`, isCorrect: true, color: 'red', shape: 'triangle' },
              { id: 'opt_2', text: 'Compromising spiritual principles during trials', isCorrect: false, color: 'blue', shape: 'diamond' },
              { id: 'opt_3', text: 'Relying only on human strength without prayer', isCorrect: false, color: 'yellow', shape: 'circle' },
              { id: 'opt_4', text: 'Ignoring biblical teachings in daily life', isCorrect: false, color: 'green', shape: 'square' }
            ]
          : [
              { id: 'opt_1', text: `إعلان مجد الله والثبات بالأمانة والإيمان في (${clean.slice(0, 45)})`, isCorrect: true, color: 'red', shape: 'triangle' },
              { id: 'opt_2', text: 'التراجع أو المساومة عند مواجهة الصعوبات', isCorrect: false, color: 'blue', shape: 'diamond' },
              { id: 'opt_3', text: 'الاعتماد على الذات فقط دون صلاة أو شركة', isCorrect: false, color: 'yellow', shape: 'circle' },
              { id: 'opt_4', text: 'الاكتفاء بالمعرفة النظرية دون تطبيق روحي', isCorrect: false, color: 'green', shape: 'square' }
            ]
      };
    };

    const list: KahootQuestion[] = [];
    for (let i = 0; i < targetCount; i++) {
      const chosenType = allowedTypes[i % allowedTypes.length];
      list.push(makeQuestionByType(chosenType, i));
    }
    return list;
  };

  const handleToggleAiQuestionType = (type: KahootQuestionType) => {
    setAiSelectedTypes(prev => {
      if (prev.includes(type)) {
        if (prev.length <= 1) return prev; // keep at least 1 type selected
        return prev.filter(t => t !== type);
      }
      return [...prev, type];
    });
  };

  const handleGenerateAiQuiz = async () => {
    if (!aiTopic.trim() && !aiCustomPrompt.trim()) return;
    setIsGeneratingAi(true);
    const effectiveTopic = sanitizeEncodingText(aiTopic.trim() || aiCustomPrompt.trim().slice(0, 50));
    const requestedCount = Math.min(50, Math.max(1, Number(aiQuestionsCount) || 5));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 22000);
      const response = await fetch('/api/kahoot/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: 'ai',
          topic: effectiveTopic,
          customPrompt: aiCustomPrompt.trim(),
          difficulty: aiDifficulty,
          questionsCount: requestedCount,
          language: aiLanguage,
          selectedQuestionTypes: aiSelectedTypes
        })
      });
      clearTimeout(timeoutId);
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
          setEditTitle(sanitizeEncodingText(data.title) || `مسابقة: ${effectiveTopic} 🌟`);
          setEditDesc(sanitizeEncodingText(data.description) || (aiCustomPrompt.trim() ? `مسابقة مصممة بالذكاء الاصطناعي: ${aiCustomPrompt.trim().slice(0, 100)}` : `مسابقة تفاعلية بالذكاء الاصطناعي حول ${effectiveTopic}`));
          setEditQuestions(data.questions);
          setActiveEditingQuestionIndex(0);
          setCreationMethod('manual');
          setShareToastMessage(`🤖 تم تصميم وتوليد ${data.questions.length} سؤال بالذكاء الاصطناعي وفق مواصفاتك بنجاح!`);
          setTimeout(() => setShareToastMessage(null), 4000);
          return;
        }
      }
      throw new Error('Fallback to local smart generator');
    } catch {
      const fallbackQs = buildLocalFallbackQuestions(effectiveTopic, requestedCount, aiCustomPrompt.trim(), aiSelectedTypes, aiLanguage);
      setEditTitle(`مسابقة: ${effectiveTopic} 🌟`);
      setEditDesc(aiCustomPrompt.trim() ? `مسابقة مصممة وفق توصيفك: ${aiCustomPrompt.trim().slice(0, 100)}` : `مسابقة تفاعلية حول ${effectiveTopic} لاجتماع الشباب`);
      setEditQuestions(fallbackQs);
      setActiveEditingQuestionIndex(0);
      setCreationMethod('manual');
      setShareToastMessage(`✅ تم توليد وتجهيز ${fallbackQs.length} سؤال للمسابقة بنجاح!`);
      setTimeout(() => setShareToastMessage(null), 4000);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleGenerateFromUrl = async () => {
    if (!urlInput.trim()) return;
    setIsGeneratingAi(true);
    const cleanUrl = urlInput.trim();
    const requestedCount = Math.min(50, Math.max(1, Number(aiQuestionsCount) || 5));
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const response = await fetch('/api/kahoot/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: 'url',
          url: cleanUrl,
          topic: sanitizeEncodingText(aiTopic.trim()),
          customPrompt: aiCustomPrompt.trim(),
          difficulty: aiDifficulty,
          questionsCount: requestedCount,
          language: aiLanguage,
          selectedQuestionTypes: aiSelectedTypes
        })
      });
      clearTimeout(timeoutId);
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
          setEditTitle(sanitizeEncodingText(data.title) || 'مسابقة مستخرجة من رابط ويب 🔗');
          setEditDesc(sanitizeEncodingText(data.description) || `مسابقة مبنية على محتوى الرابط: ${cleanUrl}`);
          setEditQuestions(data.questions);
          setActiveEditingQuestionIndex(0);
          setCreationMethod('manual');
          setShareToastMessage(`✅ تم استخراج وتوليد ${data.questions.length} سؤال من الرابط بنجاح!`);
          setTimeout(() => setShareToastMessage(null), 4000);
          return;
        }
      }
      throw new Error('Fallback to local smart generator');
    } catch {
      let cleanUrlLabel = 'مقال ويب';
      try {
        const u = new URL(cleanUrl);
        let decodedPath = u.pathname;
        try {
          decodedPath = decodeURIComponent(u.pathname);
        } catch {}
        const pathPart = sanitizeEncodingText(decodedPath.replace(/\.[^/.]+$/, '').replace(/[\/\-_]+/g, ' '));
        cleanUrlLabel = pathPart.length > 3 ? `${u.hostname.replace(/^www\./, '')} - ${pathPart.slice(0, 40)}` : u.hostname.replace(/^www\./, '');
      } catch {
        cleanUrlLabel = sanitizeEncodingText(cleanUrl.replace(/^https?:\/\/(www\.)?/, '').slice(0, 45)) || 'مقال ويب';
      }
      const fallbackQs = buildLocalFallbackQuestions(cleanUrlLabel, requestedCount, aiCustomPrompt.trim(), aiSelectedTypes, aiLanguage);
      setEditTitle(`مسابقة: ${cleanUrlLabel} 🔗`);
      setEditDesc(`مسابقة مبنية على محتوى الرابط: ${cleanUrl}`);
      setEditQuestions(fallbackQs);
      setActiveEditingQuestionIndex(0);
      setCreationMethod('manual');
      setShareToastMessage(`✅ تم توليد ${fallbackQs.length} سؤال من الرابط بنجاح!`);
      setTimeout(() => setShareToastMessage(null), 4000);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handlePasteUrlFromClipboard = async () => {
    // 1. Try standard Clipboard API readText()
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          setUrlInput(clipText.trim());
          setShowClipboardPasteHelper(false);
          setShareToastMessage('📋 تم قراءة ولصق الرابط من الحافظة (Clipboard) بنجاح!');
          setTimeout(() => setShareToastMessage(null), 3000);
          return;
        }
      }
    } catch {
      // Proceed to ClipboardItem fallback
    }

    // 2. Try Clipboard API read() for text/plain blob
    try {
      if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain');
            const text = await blob.text();
            if (text && text.trim()) {
              setUrlInput(text.trim());
              setShowClipboardPasteHelper(false);
              setShareToastMessage('📋 تم قراءة ولصق الرابط من الحافظة بنجاح!');
              setTimeout(() => setShareToastMessage(null), 3000);
              return;
            }
          }
        }
      }
    } catch {
      // Proceed to focused input & instant paste catcher
    }

    // 3. Focus input and show instant auto-paste box so pressing Ctrl+V or tapping Paste works immediately
    if (urlInputRef.current) {
      urlInputRef.current.focus();
      urlInputRef.current.select();
    }
    setShowClipboardPasteHelper(true);
  };

  // Share Custom Quiz Link
  const handleShareQuizLink = async (quiz: KahootQuiz) => {
    const publicOrigin = window.location.origin.replace(/https?:\/\/3fetya-youths\.ai\.studio/gi, 'https://3fetya-youths.com');
    const shareUrl = `${publicOrigin}/?quizId=${encodeURIComponent(quiz.id)}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch {}
    setShareToastMessage(`🔗 تم نسخ الرابط المخصص لمسابقة «${quiz.title}»! عند فتحه يطلب تسجيل الدخول ثم ينقل العضو للمسابقة مباشرة.`);
    setTimeout(() => setShareToastMessage(null), 5000);

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${quiz.title} | مسابقات الثلاثة فتية القديسين`,
          text: `شارك الآن في مسابقة «${quiz.title}» باجتماع شباب الثلاثة فتية القديسين! سجل دخولك وابدأ التحدي:`,
          url: shareUrl
        });
      } catch {}
    }
  };

  // Upload picture for a specific question option
  const handleOptionImageUpload = (optIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = reader.result as string;
      const compressed = await compressImageToFitStorage(rawDataUrl, 450, 0.8);
      const q = editQuestions[activeEditingQuestionIndex];
      if (!q || !q.options) return;
      const updatedOpts = [...q.options];
      if (updatedOpts[optIdx]) {
        updatedOpts[optIdx] = { ...updatedOpts[optIdx], imageUrl: compressed };
        handleUpdateCurrentEditingQuestion({ options: updatedOpts });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Upload picture for the question itself
  const handleQuestionImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = reader.result as string;
      const compressed = await compressImageToFitStorage(rawDataUrl, 650, 0.82);
      const currentQ = editQuestions[activeEditingQuestionIndex];
      const updates: Partial<KahootQuestion> = { mediaUrl: compressed, mediaType: 'image' };
      if ((currentQ?.type === 'pin_answer' || currentQ?.type === 'drop_pin') && !currentQ.pinCoordinates) {
        updates.pinCoordinates = { xPercent: 50, yPercent: 50, tolerancePercent: 18 };
      }
      handleUpdateCurrentEditingQuestion(updates);
      setShareToastMessage('📷 تم رفع وإرفاق صورة السؤال بنجاح!');
      setTimeout(() => setShareToastMessage(null), 2500);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Upload quiz cover image
  const handleQuizCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = reader.result as string;
      const compressed = await compressImageToFitStorage(rawDataUrl, 600, 0.8);
      setEditCoverImage(compressed);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Mode 4: Scan Doc / File (supports images, PDFs, text files, plus custom question count, types, and language)
  const executeGenerateFromScanDoc = async (docTextVal: string, docDataUrlVal: string, fileNameLabel: string) => {
    setIsExtractingDoc(true);
    const requestedCount = Math.min(50, Math.max(1, Number(aiQuestionsCount) || 5));
    const cleanFileName = sanitizeEncodingText(fileNameLabel.replace(/\.[^.]+$/, '')) || 'مستند مرفوع';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const response = await fetch('/api/kahoot/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: 'scan_doc',
          docText: docTextVal.slice(0, 12000),
          docDataUrl: docDataUrlVal || undefined,
          topic: sanitizeEncodingText(aiTopic.trim()) || `مستند: ${cleanFileName}`,
          customPrompt: aiCustomPrompt.trim(),
          difficulty: aiDifficulty,
          questionsCount: requestedCount,
          language: aiLanguage,
          selectedQuestionTypes: aiSelectedTypes
        })
      });
      clearTimeout(timeoutId);
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
          setEditTitle(sanitizeEncodingText(data.title) || `مسابقة من ملف: ${cleanFileName} 📄`);
          setEditDesc(sanitizeEncodingText(data.description) || `مسابقة تم استخراجها بالذكاء الاصطناعي من المستند (${fileNameLabel})`);
          setEditQuestions(data.questions);
          setActiveEditingQuestionIndex(0);
          setCreationMethod('manual');
          setShareToastMessage(`📄 تم استخراج وتوليد ${data.questions.length} سؤال من المستند بنجاح!`);
          setTimeout(() => setShareToastMessage(null), 4000);
          return;
        }
      }
      throw new Error('Fallback to local smart generator');
    } catch {
      const fallbackQs = buildLocalFallbackQuestions(cleanFileName, requestedCount, docTextVal || aiCustomPrompt.trim(), aiSelectedTypes, aiLanguage);
      setEditTitle(`مسابقة من ملف: ${cleanFileName} 📄`);
      setEditDesc(`مسابقة تم استخراجها من المستند (${fileNameLabel})`);
      setEditQuestions(fallbackQs);
      setActiveEditingQuestionIndex(0);
      setCreationMethod('manual');
      setShareToastMessage(`✅ تم توليد ${fallbackQs.length} سؤال من المستند بنجاح!`);
      setTimeout(() => setShareToastMessage(null), 4000);
    } finally {
      setIsExtractingDoc(false);
    }
  };

  const handleFileScanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScannedFileName(file.name);
    const reader = new FileReader();

    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      reader.onload = async () => {
        let dataUrl = reader.result as string;
        if (file.type.startsWith('image/')) {
          dataUrl = await compressImageToFitStorage(dataUrl, 900, 0.85);
        }
        setScanDocDataUrl(dataUrl);
        await executeGenerateFromScanDoc(scanDocInput, dataUrl, file.name);
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = async () => {
        const textContent = sanitizeEncodingText(String(reader.result || ''));
        setScanDocInput(textContent);
        setScanDocDataUrl('');
        await executeGenerateFromScanDoc(textContent, '', file.name);
      };
      reader.readAsText(file, 'UTF-8');
    }
    e.target.value = '';
  };

  // Save Quiz Handler (with Draft / Published / Settings / Metadata support)
  const handleSaveQuiz = (statusOverride?: KahootQuizStatus, keepOpen = false) => {
    if (!editTitle.trim()) return;
    const finalStatus = statusOverride || editStatus || 'published';
    const parsedTags = editTagsInput
      .split(/[،,]/)
      .map(t => t.trim())
      .filter(Boolean);

    const newQuiz: KahootQuiz = {
      id: selectedQuiz?.id || `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: editTitle.trim(),
      description: editDesc.trim(),
      coverImage: editCoverImage || selectedQuiz?.coverImage,
      category: editCategory,
      ageGroup: editAgeGroup,
      tags: parsedTags,
      status: finalStatus,
      gameMode: editGameMode,
      activePlayMode: selectedQuiz ? selectedQuiz.activePlayMode : undefined,
      activeSessionId: selectedQuiz?.activeSessionId,
      teamAssignmentMode: editTeamAssignmentMode,
      customTeams: editCustomTeams,
      creatorId: selectedQuiz?.creatorId || currentUserName,
      creatorName: selectedQuiz?.creatorName || currentUserName,
      createdAt: selectedQuiz?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPublished: finalStatus === 'published' || finalStatus === 'live',
      isVisibleToMembers: finalStatus === 'archived' ? false : editIsVisibleToMembers,
      isScheduled: editIsScheduled,
      availableFromDate: editIsScheduled ? editAvailableFromDate.trim() : '',
      availableToDate: editIsScheduled ? editAvailableToDate.trim() : '',
      availableFromTime: editIsScheduled ? editAvailableFromTime.trim() : '',
      availableToTime: editIsScheduled ? editAvailableToTime.trim() : '',
      autoHideOnExpiry: editAutoHideOnExpiry,
      customAiPrompt: aiCustomPrompt.trim() || selectedQuiz?.customAiPrompt,
      playCount: selectedQuiz?.playCount || 0,
      participantsCount: selectedQuiz?.participantsCount || 0,
      maxPlayersLimit: editMaxPlayers,
      settings: editSettings,
      antiCheat: {
        detectTabSwitch: editDetectTabSwitch,
        blockAiAssist: editBlockAiAssist,
        canvasTextProtection,
        secondScreenMode
      },
      questions: editQuestions.length > 0 ? editQuestions : [
        {
          id: `q_default_1`,
          type: 'quiz',
          title: 'ما هي الآية الشعار لاجتماع شباب الثلاثة فتية القديسين؟',
          timeLimitSeconds: 20,
          pointsMultiplier: 1,
          explanation: 'هذه الآية هي شعار شجاعة وإيمان الثلاثة فتية القديسين في سفر دانيال الإصحاح الثالث.',
          biblicalReference: 'دانيال 3: 17',
          options: [
            { id: 'd1', text: 'إلهنا الذي نعبده يستطيع أن ينجينا من أتون النار المتقد', isCorrect: true, color: 'red', shape: 'triangle' },
            { id: 'd2', text: 'الرب راعي فلا يعوزني شيء', isCorrect: false, color: 'blue', shape: 'diamond' },
            { id: 'd3', text: 'أستطيع كل شيء في المسيح الذي يقويني', isCorrect: false, color: 'yellow', shape: 'circle' },
            { id: 'd4', text: 'الله محبة ومن يثبت في المحبة يثبت في الله', isCorrect: false, color: 'green', shape: 'square' }
          ]
        }
      ]
    };

    storageService.saveKahootQuiz(newQuiz);
    refreshQuizzes();
    if (keepOpen) {
      setSelectedQuiz(newQuiz);
      setLastAutoSavedAt(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
      setShareToastMessage('💾 تم حفظ المسودة تلقائياً بنجاح!');
      setTimeout(() => setShareToastMessage(null), 2500);
    } else {
      setIsCreatorOpen(false);
      setSelectedQuiz(null);
      setShareToastMessage(finalStatus === 'draft' ? '📝 تم حفظ المسابقة كمسودة بنجاح!' : '🚀 تم حفظ ونشر المسابقة بنجاح!');
      setTimeout(() => setShareToastMessage(null), 3500);
    }
  };

  const handleToggleQuizVisibility = (quiz: KahootQuiz) => {
    const nextVisible = quiz.isVisibleToMembers === false ? true : false;
    const updatedQuiz: KahootQuiz = {
      ...quiz,
      isVisibleToMembers: nextVisible,
      updatedAt: new Date().toISOString()
    };
    storageService.saveKahootQuiz(updatedQuiz);
    refreshQuizzes();
    setShareToastMessage(
      nextVisible
        ? `👁️ تم إظهار مسابقة «${quiz.title}» في صفحة المخدومين بنجاح!`
        : `🚫 تم إخفاء مسابقة «${quiz.title}» من صفحة المخدومين وأُغلق الدخول إليها.`
    );
    setTimeout(() => setShareToastMessage(null), 3500);
  };

  // Archive / Restore Quiz (Preserving all participant data & scores)
  const handleArchiveQuiz = (quiz: KahootQuiz, archive: boolean) => {
    storageService.archiveKahootQuiz(quiz.id, archive);
    refreshQuizzes();
    setShareToastMessage(
      archive
        ? `📦 تم نقل مسابقة «${quiz.title}» إلى الأرشيف مع الاحتفاظ بجميع بيانات المشاركين ونتائجهم!`
        : `♻️ تم استعادة مسابقة «${quiz.title}» من الأرشيف إلى المسابقات النشطة بنجاح!`
    );
    setTimeout(() => setShareToastMessage(null), 4000);
  };

  // Add New Question in Manual Editor (All 16 Types)
  const handleAddNewQuestion = (type: KahootQuestionType = 'quiz') => {
    const isUnscored = type === 'word_cloud' || type === 'poll' || type === 'scale' || type === 'rating' || type === 'open_ended' || type === 'brainstorm' || type === 'drop_pin';
    const isPinType = type === 'pin_answer' || type === 'drop_pin';
    const newQ: KahootQuestion = {
      id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      type,
      title: isPinType ? 'حدد بالدبوس 📍 الموضع الصحيح على الصورة:' : 'اكتب نص السؤال هنا...',
      timeLimitSeconds: 20,
      pointsMultiplier: isUnscored ? 0 : 1,
      mediaUrl: isPinType ? 'https://images.unsplash.com/photo-1548625361-195977935bb8?w=900' : undefined,
      mediaType: isPinType ? 'image' : undefined,
      pinCoordinates: isPinType ? { xPercent: 50, yPercent: 50, tolerancePercent: 18 } : undefined,
      options: type === 'true_false' ? [
        { id: 'tf_1', text: 'صح (True) ✔️', isCorrect: true, color: 'blue', shape: 'diamond' },
        { id: 'tf_2', text: 'خطأ (False) ❌', isCorrect: false, color: 'red', shape: 'triangle' }
      ] : [
        { id: 'opt_1', text: 'الخيار الأول (الصحيح)', isCorrect: true, color: 'red', shape: 'triangle' },
        { id: 'opt_2', text: 'الخيار الثاني', isCorrect: false, color: 'blue', shape: 'diamond' },
        { id: 'opt_3', text: 'الخيار الثالث', isCorrect: false, color: 'yellow', shape: 'circle' },
        { id: 'opt_4', text: 'الخيار الرابع', isCorrect: false, color: 'green', shape: 'square' }
      ],
      puzzleItems: type === 'puzzle' ? [
        { id: 'p1', text: 'الخطوة الأولى', correctIndex: 0 },
        { id: 'p2', text: 'الخطوة الثانية', correctIndex: 1 },
        { id: 'p3', text: 'الخطوة الثالثة', correctIndex: 2 },
        { id: 'p4', text: 'الخطوة الرابعة', correctIndex: 3 }
      ] : undefined,
      matchingPairs: type === 'matching' ? [
        { id: 'm1', leftText: 'شدرخ', rightText: 'حنانيا' },
        { id: 'm2', leftText: 'ميشخ', rightText: 'ميشائيل' },
        { id: 'm3', leftText: 'عبد نغو', rightText: 'عزاريا' }
      ] : undefined,
      correctTextAnswer: type === 'type_answer' ? 'الإجابة' : undefined,
      sliderMin: 1,
      sliderMax: 10,
      sliderStep: 1,
      sliderCorrectValue: 5,
      sliderMarginOfError: 1,
      scaleMin: 1,
      scaleMax: 5,
      scaleLabels: { min: 'غير موافق', max: 'موافق بشدة' },
      ratingStyle: 'stars'
    };

    setEditQuestions(prev => [...prev, newQ]);
    setActiveEditingQuestionIndex(editQuestions.length);
  };

  // Duplicate Question inside Creator
  const handleDuplicateQuestion = (idx: number) => {
    const source = editQuestions[idx];
    if (!source) return;
    const copy: KahootQuestion = {
      ...source,
      id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      title: `${source.title} (نسخة)`
    };
    const nextList = [...editQuestions];
    nextList.splice(idx + 1, 0, copy);
    setEditQuestions(nextList);
    setActiveEditingQuestionIndex(idx + 1);
  };

  // Save Question to Central Question Bank
  const handleSaveQuestionToBank = (q: KahootQuestion) => {
    const bankItem: KahootQuestionBankItem = {
      id: `bank_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      question: { ...q, id: `q_${Date.now()}` },
      category: q.category || editCategory || 'الكتاب المقدس',
      tags: q.tags || [],
      creatorId: currentUserName,
      creatorName: currentUserName,
      createdAt: new Date().toISOString(),
      usageCount: 1
    };
    storageService.saveKahootQuestionBankItem(bankItem);
    setQuestionBank(storageService.getKahootQuestionBank());
    setShareToastMessage('🏦 تم حفظ السؤال في «بنك أسئلة الثلاثة فتية» لاستخدامه في أي مسابقة قادمة!');
    setTimeout(() => setShareToastMessage(null), 3500);
  };

  // Import Selected Questions from Bank into Current Quiz
  const handleImportSelectedFromBank = () => {
    const items = questionBank.filter(b => selectedBankIdsToImport.includes(b.id));
    if (items.length === 0) return;
    const importedQuestions: KahootQuestion[] = items.map(item => ({
      ...item.question,
      id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    }));
    setEditQuestions(prev => [...prev, ...importedQuestions]);
    setSelectedBankIdsToImport([]);
    setShowImportFromBankModal(false);
    setShareToastMessage(`📥 تم استيراد ${importedQuestions.length} سؤال من بنك الأسئلة بنجاح!`);
    setTimeout(() => setShareToastMessage(null), 3000);
  };

  // Delete Question
  const handleDeleteQuestion = (idx: number) => {
    setEditQuestions(prev => prev.filter((_, i) => i !== idx));
    if (activeEditingQuestionIndex >= idx && activeEditingQuestionIndex > 0) {
      setActiveEditingQuestionIndex(activeEditingQuestionIndex - 1);
    }
  };

  // Reorder Question (Move Up / Down)
  const handleMoveQuestion = (idx: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === editQuestions.length - 1)) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...editQuestions];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setEditQuestions(updated);
    setActiveEditingQuestionIndex(targetIdx);
  };

  // Update specific question field
  const handleUpdateCurrentEditingQuestion = (fields: Partial<KahootQuestion>) => {
    setEditQuestions(prev => {
      const copy = [...prev];
      if (copy[activeEditingQuestionIndex]) {
        copy[activeEditingQuestionIndex] = { ...copy[activeEditingQuestionIndex], ...fields };
      }
      return copy;
    });
  };

  // ==========================================
  // SCORING & ANSWER SUBMISSION LOGIC (REAL-TIME SERVER SYNC)
  // ==========================================
  const handlePlayerAnswerSubmit = (answer: any, isCorrectGuess: boolean) => {
    if (!activeSession || activeSession.status !== 'question_active' || hasSubmittedCurrentQuestion) return;
    const sessionQuiz = quizzes.find(qz => qz.id === activeSession.quizId) || selectedQuiz;
    const q = sessionQuiz?.questions[activeSession.currentQuestionIndex];
    if (!q) return;

    const questionKey = `${activeSession.id}_${activeSession.currentQuestionIndex}`;
    lockedSubmittedQuestionKeyRef.current = questionKey;
    setHasSubmittedCurrentQuestion(true);
    setPlayerSelectedAnswer(answer);
    setPlayerPostAnswerStage('score_summary');

    const timeLimitMs = (q.timeLimitSeconds || 20) * 1000;
    const timeElapsedMs = activeSession.questionStartedAt ? Math.max(300, Date.now() - activeSession.questionStartedAt) : 5000;

    let points = 0;
    const currentStreak = activeSession.players[currentPlayerId]?.streak || playerFeedback?.streak || 0;
    let newStreak = currentStreak;

    if (isCorrectGuess && q.pointsMultiplier > 0) {
      audio.playCorrect();
      const maxPoints = q.customPoints || (1000 * (q.pointsMultiplier || 1));
      const ratio = Math.min(1, Math.max(0, timeElapsedMs / timeLimitMs));
      const speedPoints = Math.round((1 - (ratio / 2)) * maxPoints);
      newStreak += 1;
      const streakBonus = Math.min(500, newStreak * 100);
      points = speedPoints + streakBonus;

      setPlayerFeedback({ isCorrect: true, points, streak: newStreak });
    } else if (q.pointsMultiplier === 0) {
      audio.playCorrect();
      setPlayerFeedback({ isCorrect: true, points: 0, streak: newStreak });
      storageService.submitKahootOpinion(
        activeSession.id,
        q.id,
        { id: currentPlayerId, name: activeSession.showParticipantNames === false ? 'مشارك سري' : currentUserName },
        answer
      );
    } else {
      audio.playWrong();
      newStreak = 0;
      setPlayerFeedback({ isCorrect: false, points: 0, streak: 0 });
    }

    const answerLabel = formatQuestionAnswerLabel(q, answer);

    // Submit answer to storage service & backend server with real currentPlayerId, currentUserName, and readable answerLabel
    storageService.submitKahootAnswer(
      activeSession.id,
      currentPlayerId,
      q.id,
      answer,
      timeElapsedMs,
      isCorrectGuess,
      q.pointsMultiplier || 1,
      activeSession.showParticipantNames === false ? 'مشارك سري' : currentUserName,
      answerLabel
    );
    const updatedSession = storageService.getKahootSession(activeSession.id);
    if (updatedSession) {
      setActiveSession({ ...updatedSession });
    }
  };

  // Type Answer Verification (Ignoring Hamzas, Tashkeel, Spaces)
  const handleCheckTypeAnswer = () => {
    if (!currentQuestion) return;
    const cleanInput = normalizeArabicNameForComparison(typeAnswerInput);
    const cleanTarget = normalizeArabicNameForComparison(currentQuestion.correctTextAnswer || '');
    const cleanAlternatives = (currentQuestion.acceptableTextAnswers || []).map(a => normalizeArabicNameForComparison(a));

    const isMatch = cleanInput === cleanTarget || cleanAlternatives.includes(cleanInput);
    handlePlayerAnswerSubmit(typeAnswerInput, isMatch);
  };

  // Slider Verification with Margin of Error
  const handleCheckSliderAnswer = () => {
    if (!currentQuestion) return;
    const correctVal = currentQuestion.sliderCorrectValue ?? 5;
    const margin = currentQuestion.sliderMarginOfError ?? 0;
    const diff = Math.abs(sliderCurrentValue - correctVal);
    const isWithinMargin = diff <= margin;
    handlePlayerAnswerSubmit(sliderCurrentValue, isWithinMargin);
  };

  // Pin Answer Verification with Hitbox Area
  const handleCheckPinAnswer = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentQuestion || hasSubmittedCurrentQuestion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    setPinClickedCoords({ xPercent, yPercent });

    if (currentQuestion.type === 'pin_answer') {
      const target = currentQuestion.pinCoordinates || { xPercent: 50, yPercent: 50, tolerancePercent: 20 };
      const distance = Math.sqrt(Math.pow(xPercent - target.xPercent, 2) + Math.pow(yPercent - target.yPercent, 2));
      const isInside = distance <= (target.tolerancePercent || 15);
      handlePlayerAnswerSubmit({ xPercent, yPercent }, isInside);
    } else {
      handlePlayerAnswerSubmit({ xPercent, yPercent }, true);
    }
  };

  // Matching Pairs Verification
  const handleCheckMatchingAnswer = (questionObj: KahootQuestion, isSolo = false) => {
    if (!questionObj.matchingPairs || questionObj.matchingPairs.length === 0) return;
    const allCorrect = questionObj.matchingPairs.every(pair => matchingUserSelections[pair.id] === pair.rightText);
    if (isSolo) {
      handleSoloAnswerSubmit(matchingUserSelections, allCorrect);
    } else {
      handlePlayerAnswerSubmit(matchingUserSelections, allCorrect);
    }
  };

  // Multi-Select Verification
  const handleCheckMultiSelectAnswer = (questionObj: KahootQuestion, isSolo = false) => {
    if (!questionObj.options) return;
    const correctIds = questionObj.options.filter(o => o.isCorrect).map(o => o.id).sort();
    const chosenIds = [...multiSelectedOptions].sort();
    const isExactMatch = JSON.stringify(correctIds) === JSON.stringify(chosenIds);
    if (isSolo) {
      handleSoloAnswerSubmit(chosenIds, isExactMatch);
    } else {
      handlePlayerAnswerSubmit(chosenIds, isExactMatch);
    }
  };

  // Total cheat violations count in current session
  const totalViolationsCount = useMemo(() => {
    if (!activeSession?.players) return 0;
    return Object.values(activeSession.players).reduce((acc, p) => acc + (p.cheatWarningsCount || 0), 0);
  }, [activeSession?.players]);

  const handleJoinByPin = (pinOverride?: string, teamIdOverride?: string) => {
    const rawPin = pinOverride || inputJoinPin;
    if (!rawPin.trim()) return;
    const cleanPin = rawPin.trim().replace(/\D/g, '');
    const session = storageService.getKahootSession(cleanPin);
    if (!session) {
      setJoinPinError('رمز المسابقة أو رمز الفريق (PIN) غير صحيح أو انتهت الجلسة.');
      return;
    }
    const parentQuiz = quizzes.find(q => q.id === session.quizId);
    if (!isSeniorAdmin && parentQuiz && !storageService.isKahootQuizAvailableForMembers(parentQuiz, Date.now())) {
      const evalRes = storageService.evaluateKahootQuizSchedule(parentQuiz, Date.now());
      setJoinPinError(`عذراً، الدخول مغلق لهذه المسابقة: ${evalRes.statusLabelAr}`);
      return;
    }
    const matchedTeamByPin = storageService.findTeamByPinInSession(session, cleanPin);
    const chosenTeamId = teamIdOverride || matchedTeamByPin || selectedJoinTeamId || undefined;
    const res = storageService.joinKahootSession(cleanPin, {
      id: currentPlayerId,
      name: currentUserName,
      avatar: registrants.find(r => r.fullName === currentUserName)?.photoUrl,
      teamId: chosenTeamId,
      score: 0,
      streak: 0,
      currentRank: 1,
      isOnline: true
    });
    if (res.success && res.session) {
      setIsLiveObserverMode(false);
      setJoinedLiveSessionId(res.session.id);
      setActiveSession(res.session);
      setSessionPin(res.session.id);
      setJoinPinError(null);
      setActiveViewMode('player_gamepad');
      const joinedTeamName = res.session.players[currentPlayerId]?.teamName;
      if (joinedTeamName) {
        setShareToastMessage(`🛡️ تم انضمامك بنجاح إلى «${joinedTeamName}» في غرفة الانتظار!`);
        setTimeout(() => setShareToastMessage(null), 4000);
      }
    } else {
      setJoinPinError(res.error || 'تعذر الانضمام للمسابقة');
    }
  };

  // Auto-join if user opened link with ?pin=...&teamId=...
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlPin = params.get('pin');
      const urlTeamId = params.get('teamId') || undefined;
      if (urlPin && urlPin.trim()) {
        if (urlTeamId) setSelectedJoinTeamId(urlTeamId);
        setInputJoinPin(urlPin.trim());
        handleJoinByPin(urlPin.trim(), urlTeamId);
        params.delete('pin');
        params.delete('teamId');
        params.delete('mode');
        const nextQuery = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (nextQuery ? `?${nextQuery}` : ''));
      }
    } catch {}
  }, []);

  // Inspect a Solo Participant's Per-Question Answers
  const handleInspectSoloParticipant = (quiz: KahootQuiz, scoreEntry: KahootSoloScore) => {
    const detailedRows = quiz.questions.map((q, idx) => {
      const found = scoreEntry.answersDetail?.find(a => a.questionId === q.id);
      return {
        questionNumber: idx + 1,
        questionTitle: q.title,
        playerAnswerLabel: found ? (found.answerLabel || formatQuestionAnswerLabel(q, found.answer)) : 'لم يتم تسجيل تفصيل السؤال',
        correctAnswerLabel: getCorrectAnswerLabelForQuestion(q),
        isCorrect: found ? found.isCorrect : false,
        points: found ? found.points : 0,
        timeSec: found ? `${(found.timeElapsedMs / 1000).toFixed(1)} ث` : '—'
      };
    });
    setInspectedParticipant({
      name: scoreEntry.playerName,
      modeLabel: '🎯 تحدي ذاتي (Self-Paced)',
      score: scoreEntry.score,
      correctCount: scoreEntry.correctCount,
      totalQuestions: scoreEntry.totalQuestions || quiz.questions.length,
      completedAt: scoreEntry.completedAt,
      answers: detailedRows
    });
  };

  // Inspect a Live/Team Session Participant's Per-Question Answers
  const handleInspectLiveParticipant = (quiz: KahootQuiz, session: KahootLiveSession, player: KahootPlayer) => {
    let correctCounter = 0;
    const detailedRows = quiz.questions.map((q, idx) => {
      const submission = session.answersSubmitted?.[`${player.id}_${q.id}`];
      if (submission?.isCorrect) correctCounter++;
      return {
        questionNumber: idx + 1,
        questionTitle: q.title,
        playerAnswerLabel: submission
          ? (submission.answerLabel || formatQuestionAnswerLabel(q, submission.answer))
          : 'لم يُجب على هذا السؤال',
        correctAnswerLabel: getCorrectAnswerLabelForQuestion(q),
        isCorrect: !!submission?.isCorrect,
        points: submission?.points || 0,
        timeSec: submission?.timeElapsedMs ? `${(submission.timeElapsedMs / 1000).toFixed(1)} ث` : '—'
      };
    });
    setInspectedParticipant({
      name: player.name,
      modeLabel: session.gameMode === 'team' ? '🛡️ نظام الفرق (Team Mode)' : '⚡ تفاعل مباشر (Live Mode)',
      score: player.score,
      correctCount: player.correctCount ?? correctCounter,
      totalQuestions: quiz.questions.length,
      teamName: player.teamName,
      completedAt: session.finishedAt || session.startedAt || new Date().toISOString(),
      answers: detailedRows
    });
  };

  const handleToggleSecondScreenMode = () => {
    const nextVal = !secondScreenMode;
    setSecondScreenMode(nextVal);
    if (activeSession) {
      const updated = { ...activeSession, secondScreenMode: nextVal };
      setActiveSession(updated);
      storageService.saveKahootSession(updated);
    }
  };

  const handleToggleCanvasProtection = () => {
    const nextVal = !canvasTextProtection;
    setCanvasTextProtection(nextVal);
    if (activeSession) {
      const updated = { ...activeSession, canvasTextProtection: nextVal };
      setActiveSession(updated);
      storageService.saveKahootSession(updated);
    }
  };

  // Puzzle Sequence Submission
  const handleCheckPuzzleAnswer = () => {
    if (!currentQuestion || !currentQuestion.puzzleItems) return;
    const correctOrder = [...currentQuestion.puzzleItems].sort((a, b) => a.correctIndex - b.correctIndex).map(p => p.id);
    const isCorrect = JSON.stringify(puzzleCurrentOrder) === JSON.stringify(correctOrder);
    handlePlayerAnswerSubmit(puzzleCurrentOrder, isCorrect);
  };

  // ==========================================
  // DASHBOARD KPI STATS, FILTERING & ANALYTICS
  // ==========================================
  const dashboardStats = useMemo(() => {
    const validQuizIds = new Set(quizzes.map(q => q.id));
    const validSoloScores = allSoloScores.filter(s => validQuizIds.has(s.quizId));
    const totalQuizzes = quizzes.filter(q => q.status !== 'archived').length;
    const archivedCount = quizzes.filter(q => q.status === 'archived').length;
    const publishedCount = quizzes.filter(q => (q.status || 'published') === 'published').length;
    const liveCount = activeSession && activeSession.status !== 'finished' ? 1 : quizzes.filter(q => q.status === 'live').length;
    const finishedCount = quizzes.filter(q => q.status === 'finished').length;

    const totalParticipants = quizzes.reduce((sum, q) => {
      const soloForQuiz = validSoloScores.filter(s => s.quizId === q.id).length;
      return sum + Math.max(q.participantsCount || 0, soloForQuiz);
    }, 0);

    const activePlayersNow = activeSession ? Object.keys(activeSession.players || {}).length : 0;

    let avgAccuracy = 85;
    if (validSoloScores.length > 0) {
      const ratios = validSoloScores.map(s => (s.correctCount / Math.max(1, s.totalQuestions)) * 100);
      avgAccuracy = Math.round(ratios.reduce((a, b) => a + b, 0) / ratios.length);
    }

    const mostPopularQuiz = [...quizzes].sort((a, b) => (b.participantsCount || 0) - (a.participantsCount || 0))[0]?.title || '—';
    const newestQuiz = [...quizzes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.title || '—';

    return {
      totalQuizzes,
      archivedCount,
      publishedCount,
      liveCount,
      finishedCount,
      totalParticipants,
      activePlayersNow,
      avgAccuracy,
      mostPopularQuiz,
      newestQuiz
    };
  }, [quizzes, activeSession, allSoloScores]);

  const filteredAndSortedQuizzes = useMemo(() => {
    return quizzes
      .filter(q => {
        if (!isSeniorAdmin && !storageService.isKahootQuizAvailableForMembers(q, nowTick)) {
          return false;
        }
        if (managerTab === 'archived') {
          if (q.status !== 'archived') return false;
        } else if (managerTab === 'quizzes') {
          if (filterStatus === 'all' && q.status === 'archived') return false;
        }
        if (searchQuery.trim()) {
          const term = searchQuery.toLowerCase();
          const inTitle = q.title.toLowerCase().includes(term);
          const inDesc = (q.description || '').toLowerCase().includes(term);
          const inTags = (q.tags || []).some(t => t.toLowerCase().includes(term));
          if (!inTitle && !inDesc && !inTags) return false;
        }
        if (managerTab !== 'archived' && filterStatus !== 'all') {
          const qStatus = (activeSession && activeSession.quizId === q.id && activeSession.status !== 'finished') ? 'live' : (q.status || 'published');
          if (qStatus !== filterStatus) return false;
        }
        if (filterCategory !== 'all' && (q.category || 'الكتاب المقدس') !== filterCategory) {
          return false;
        }
        if (filterCreator !== 'all' && q.creatorName !== filterCreator) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sortBy === 'most_used') return (b.playCount || 0) - (a.playCount || 0);
        if (sortBy === 'most_participated') return (b.participantsCount || 0) - (a.participantsCount || 0);
        return a.title.localeCompare(b.title, 'ar');
      });
  }, [quizzes, managerTab, searchQuery, filterStatus, filterCategory, filterCreator, sortBy, activeSession, isSeniorAdmin, nowTick]);

  const uniqueCreators = useMemo(() => {
    return Array.from(new Set(quizzes.map(q => q.creatorName).filter(Boolean)));
  }, [quizzes]);

  // Export Quiz Results to Excel (.xlsx) or CSV (.csv)
  const handleExportAnalytics = (quiz: KahootQuiz, format: 'xlsx' | 'csv') => {
    const soloScores = storageService.getKahootSoloScores(quiz.id);
    const sessionForQuiz = activeSession && activeSession.quizId === quiz.id ? activeSession : null;
    const livePlayers = sessionForQuiz ? Object.values(sessionForQuiz.players) : [];

    const wb = XLSX.utils.book_new();

    if (exportIncludeSummary) {
      const summaryRows = [
        { 'البند': 'اسم المسابقة', 'القيمة': quiz.title },
        { 'البند': 'الفئة', 'القيمة': quiz.category || 'الكتاب المقدس' },
        { 'البند': 'منشئ المسابقة', 'القيمة': quiz.creatorName },
        { 'البند': 'عدد الأسئلة', 'القيمة': quiz.questions.length },
        { 'البند': 'مرات التشغيل', 'القيمة': quiz.playCount || 1 },
        { 'البند': 'إجمالي المشاركين المسجلين', 'القيمة': Math.max(quiz.participantsCount || 0, soloScores.length + livePlayers.length) },
        { 'البند': 'تاريخ التصدير', 'القيمة': new Date().toLocaleString('ar-EG') }
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'ملخص المسابقة');
    }

    if (exportIncludeQuestions) {
      const questionRows = quiz.questions.map((q, idx) => ({
        'رقم السؤال': idx + 1,
        'نص السؤال': q.title,
        'نوع السؤال': q.type,
        'الوقت (ثانية)': q.timeLimitSeconds,
        'النقاط': q.customPoints || (q.pointsMultiplier * 1000),
        'الإجابة الصحيحة': q.options?.find(o => o.isCorrect)?.text || q.correctTextAnswer || String(q.sliderCorrectValue ?? 'رأي مفتوح'),
        'المرجع الكتابي / الشرح': [q.biblicalReference, q.explanation].filter(Boolean).join(' - ') || '—'
      }));
      const wsQuestions = XLSX.utils.json_to_sheet(questionRows);
      XLSX.utils.book_append_sheet(wb, wsQuestions, 'تحليل الأسئلة');
    }

    if (exportIncludePlayers) {
      const combinedPlayers = [
        ...livePlayers.map((p, i) => ({
          'المركز': p.currentRank || (i + 1),
          'الاسم': p.name,
          'الفريق': p.teamName || 'فردي (مباشر)',
          'النقاط': p.score,
          'الإجابات الصحيحة': p.correctCount ?? '—',
          'أطول سلسلة (Streak)': p.streak,
          'مخالفات الغش': p.cheatWarningsCount || 0
        })),
        ...soloScores.map((s, i) => ({
          'المركز': i + 1,
          'الاسم': s.playerName,
          'الفريق': 'تحدي ذاتي',
          'النقاط': s.score,
          'الإجابات الصحيحة': `${s.correctCount} / ${s.totalQuestions}`,
          'أطول سلسلة (Streak)': '—',
          'مخالفات الغش': 0
        }))
      ];
      const wsPlayers = XLSX.utils.json_to_sheet(combinedPlayers.length > 0 ? combinedPlayers : [{ 'ملاحظة': 'لا توجد مشاركات مسجلة بعد' }]);
      XLSX.utils.book_append_sheet(wb, wsPlayers, 'نتائج المشاركين');
    }

    const safeName = quiz.title.replace(/[^\w\u0600-\u06FF\s-]/g, '').trim() || 'kahoot_results';
    if (format === 'csv') {
      XLSX.writeFile(wb, `${safeName}.csv`, { bookType: 'csv' });
    } else {
      XLSX.writeFile(wb, `${safeName}.xlsx`);
    }
    setShareToastMessage(`📥 تم تصدير تقرير مسابقة «${quiz.title}» بصيغة ${format.toUpperCase()} بنجاح!`);
    setTimeout(() => setShareToastMessage(null), 3500);
  };

  const isAntiCheatActiveOnScreen = !isCreatorOpen && (activeViewMode === 'live_host' || activeViewMode === 'player_gamepad' || activeViewMode === 'solo_game');

  // Dynamic Auto-Reordering Top 10 Leaderboard Component (FLIP / translateY smooth rank transition)
  const renderDynamicAnimatedTop10Board = (
    sessionObj: KahootLiveSession,
    quizObj?: KahootQuiz | null,
    allowInspect: boolean = false
  ) => {
    const allPlayers = Object.values(sessionObj.players || {});
    if (allPlayers.length === 0) {
      return (
        <div className="text-center py-8 text-xs text-white/60 bg-white/5 rounded-2xl border border-white/10">
          لا توجد نقاط مسجلة حتى الآن في هذه الجولة.
        </div>
      );
    }

    // Current post-answer rank order (Top 10)
    const postSorted = [...allPlayers]
      .sort((a, b) => {
        const diff = (b.score || 0) - (a.score || 0);
        if (diff !== 0) return diff;
        return (a.totalTimeMs || 0) - (b.totalTimeMs || 0);
      })
      .slice(0, 10);

    // Previous rank order among these Top 10 players (before the latest question points)
    const prevSorted = [...postSorted].sort((a, b) => {
      const aPrevRank = a.previousRank || a.currentRank || 999;
      const bPrevRank = b.previousRank || b.currentRank || 999;
      if (aPrevRank !== bPrevRank) return aPrevRank - bPrevRank;
      const aPrevScore = Math.max(0, (a.score || 0) - (a.lastPointsEarned || 0));
      const bPrevScore = Math.max(0, (b.score || 0) - (b.lastPointsEarned || 0));
      return bPrevScore - aPrevScore;
    });

    const prevIndexMap: Record<string, number> = {};
    prevSorted.forEach((p, idx) => {
      prevIndexMap[p.id] = idx;
    });

    const ROW_HEIGHT_PX = 76;
    const containerHeightPx = Math.max(1, postSorted.length) * ROW_HEIGHT_PX;

    return (
      <div
        className="relative w-full max-w-3xl mx-auto select-none"
        style={{ height: `${containerHeightPx}px`, transition: 'height 400ms ease' }}
      >
        {postSorted.map((player, currentSlotIdx) => {
          const currentRank = currentSlotIdx + 1;
          const prevSlotIdx = prevIndexMap[player.id] ?? currentSlotIdx;
          const prevRank = player.previousRank || (prevSlotIdx + 1);
          const rankDelta = prevRank - currentRank;
          const isRising = rankDelta > 0 || prevSlotIdx > currentSlotIdx;
          const isFalling = rankDelta < 0 || prevSlotIdx < currentSlotIdx;
          const isMe = player.id === currentPlayerId;
          const activeSlotIdx = leaderboardAnimPhase === 'previous' ? prevSlotIdx : currentSlotIdx;
          const displayedRank = leaderboardAnimPhase === 'previous' ? (prevSlotIdx + 1) : currentRank;
          const questionPts = player.lastPointsEarned || 0;
          const displayedScore =
            leaderboardAnimPhase === 'previous'
              ? Math.max(0, (player.score || 0) - questionPts)
              : (player.score || 0);

          const isTop3 = displayedRank <= 3;
          const rankBadgeCls =
            displayedRank === 1
              ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-lg shadow-amber-400/30'
              : displayedRank === 2
              ? 'bg-slate-200 text-slate-950 border-white'
              : displayedRank === 3
              ? 'bg-amber-700 text-white border-amber-500'
              : 'bg-white/15 text-white border-white/25';

          return (
            <div
              key={player.id}
              style={{
                transform: `translateY(${activeSlotIdx * ROW_HEIGHT_PX}px)`,
                transition: 'transform 850ms cubic-bezier(0.22, 1, 0.36, 1), background-color 500ms ease, box-shadow 500ms ease, border-color 500ms ease',
                height: `${ROW_HEIGHT_PX - 8}px`,
                zIndex: isRising && leaderboardAnimPhase === 'current' ? 30 : 20 - currentSlotIdx
              }}
              className={`absolute inset-x-0 top-0 flex items-center justify-between px-4 md:px-5 rounded-2xl border ${
                isRising && leaderboardAnimPhase === 'current'
                  ? 'bg-gradient-to-r from-emerald-500/35 via-amber-500/25 to-emerald-500/25 border-emerald-400 shadow-2xl shadow-emerald-500/25 ring-2 ring-emerald-400/50'
                  : isMe
                  ? 'bg-amber-400/25 border-amber-400 shadow-xl ring-2 ring-amber-400/40'
                  : isTop3
                  ? 'bg-white/15 border-amber-400/45 shadow-lg'
                  : 'bg-white/5 border-white/15'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs md:text-sm border shrink-0 transition-transform duration-500 ${rankBadgeCls} ${
                    isRising && leaderboardAnimPhase === 'current' ? 'scale-110' : ''
                  }`}
                >
                  {displayedRank}
                </span>

                <div className="w-9 h-9 rounded-full overflow-hidden bg-white/20 border border-white/30 shrink-0 flex items-center justify-center font-black text-xs text-white">
                  {player.avatar ? (
                    <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{(player.name || 'م').charAt(0)}</span>
                  )}
                </div>

                <div className="min-w-0 text-right">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-black text-xs md:text-sm text-white truncate max-w-[150px] sm:max-w-[220px]">
                      {sessionObj.showParticipantNames === false && !isMe && !allowInspect
                        ? `متسابق #${displayedRank}`
                        : player.name}
                    </span>
                    {isMe && (
                      <span className="text-[10px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-black">
                        أنت
                      </span>
                    )}
                    {player.teamName && (
                      <span className="text-[10px] bg-blue-500/25 text-blue-200 px-2 py-0.5 rounded-full border border-blue-400/30">
                        {player.teamName}
                      </span>
                    )}
                    {leaderboardAnimPhase === 'current' && isRising && (
                      <span className="text-[10px] bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full font-black shadow animate-bounce">
                        🔺 صعد للمركز #{currentRank}
                      </span>
                    )}
                    {leaderboardAnimPhase === 'current' && isFalling && (
                      <span className="text-[10px] bg-rose-500/25 text-rose-200 border border-rose-400/30 px-2 py-0.5 rounded-full font-bold">
                        🔻 المركز #{currentRank}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-white/70 mt-0.5">
                    {questionPts > 0 ? (
                      <span className="text-emerald-300 font-black">+{questionPts.toLocaleString('ar-EG')} نقطة في هذا السؤال ⚡</span>
                    ) : (
                      <span className="text-white/50">المجموع التراكمي</span>
                    )}
                    {(player.streak || 0) > 1 && (
                      <span className="text-amber-300 font-bold">🔥 سلسلة {player.streak}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div className="text-left font-mono">
                  <span className="text-base md:text-xl font-black text-amber-300 block transition-all duration-500">
                    {displayedScore.toLocaleString('ar-EG')}
                  </span>
                  <span className="text-[9px] text-white/60 block">نقطة</span>
                </div>
                {allowInspect && quizObj && (
                  <button
                    type="button"
                    onClick={() => handleInspectLiveParticipant(quizObj, sessionObj, player)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-amber-400 hover:text-slate-950 text-white/80 transition cursor-pointer"
                    title="فحص إجابات هذا المتسابق"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div 
      className={`min-h-[85vh] bg-gradient-to-br from-[#1b0638] via-[#2a085c] to-[#45108a] text-white rounded-3xl p-4 md:p-6 shadow-2xl relative overflow-hidden ${isCreatorOpen ? '' : 'select-none'}`}
      onContextMenu={(e) => {
        const t = e.target as HTMLElement | null;
        if (isCreatorOpen || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return;
        if (isAntiCheatActiveOnScreen) e.preventDefault();
      }}
      onCopy={(e) => {
        const t = e.target as HTMLElement | null;
        if (isCreatorOpen || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return;
        if (isAntiCheatActiveOnScreen) e.preventDefault();
      }}
      onCut={(e) => {
        const t = e.target as HTMLElement | null;
        if (isCreatorOpen || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return;
        if (isAntiCheatActiveOnScreen) e.preventDefault();
      }}
      onPaste={(e) => {
        const t = e.target as HTMLElement | null;
        if (isCreatorOpen || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return;
        if (isAntiCheatActiveOnScreen) e.preventDefault();
      }}
      onDragStart={(e) => {
        if (!isCreatorOpen && isAntiCheatActiveOnScreen) e.preventDefault();
      }}
    >
      {/* Decorative Kahoot Colors Background Blurs */}
      <div className="absolute top-8 left-8 w-60 h-60 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-8 right-8 w-72 h-72 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* In-App Share / Action Notification Toast */}
      {shareToastMessage && (
        <div className="fixed top-6 inset-x-6 max-w-2xl mx-auto z-[70] bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-emerald-300/60 flex items-center justify-between gap-3 animate-fadeIn">
          <span className="font-black text-xs md:text-sm leading-relaxed">{shareToastMessage}</span>
          <button
            type="button"
            onClick={() => setShareToastMessage(null)}
            className="w-6 h-6 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-xs shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Floating Anti-Cheat Warning Banner */}
      {cheatWarningBanner && (
        <div className="fixed top-6 inset-x-6 max-w-2xl mx-auto z-50 bg-red-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-white/40 flex items-center gap-3 animate-bounce">
          <ShieldAlert className="w-6 h-6 text-amber-300 shrink-0" />
          <span className="font-black text-sm">{cheatWarningBanner}</span>
        </div>
      )}

      {/* ========================================================
          VIEW 1: LIVE HOST SCREEN & CONTROLLER
          ======================================================== */}
      {activeViewMode === 'live_host' && activeSession && selectedQuiz && (
        <div className="space-y-6 relative z-10 animate-fadeIn">
          
          {/* Host Top Navigation Bar */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 md:p-4 border border-white/20 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl md:text-3xl font-black bg-gradient-to-r from-red-400 via-amber-300 to-emerald-400 bg-clip-text text-transparent">
                «مسابقات الثلاثة فتية»
              </span>
              <div className="h-6 w-px bg-white/20" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm md:text-base font-black text-white">{selectedQuiz.title}</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 font-bold">
                    {activeSession.gameMode === 'team' ? 'وضع الفرق 🛡️' : activeSession.gameMode === 'anonymous_poll' ? 'تصويت سري 🗳️' : 'تفاعل مباشر 🔴'}
                  </span>
                </div>
                <p className="text-[11px] text-white/70">المسؤول المضيف: {activeSession.hostName || activeSession.hostId}</p>
              </div>
            </div>

            {/* Session Controls: PIN, Lock, Gamepad Toggle, Canvas Toggle, Anti-Cheat, Mute, Exit */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-black/50 px-3.5 py-1.5 rounded-xl border border-white/20 text-center">
                <span className="text-[9px] text-white/70 block uppercase font-bold">Game PIN رمز اللعبة</span>
                <span className="text-xl md:text-2xl font-black tracking-widest text-amber-300 font-mono">
                  {activeSession.id}
                </span>
              </div>

              {/* Lock / Unlock Joining */}
              <button
                type="button"
                onClick={handleToggleSessionLock}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                  activeSession.isLocked
                    ? 'bg-red-600 text-white border-red-400'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                }`}
                title="قفل أو فتح الانضمام للغرفة"
              >
                {activeSession.isLocked ? <Lock className="w-3.5 h-3.5 text-amber-300" /> : <Unlock className="w-3.5 h-3.5 text-emerald-300" />}
                <span>{activeSession.isLocked ? 'الغرفة مقفلة 🔒' : 'الانضمام متاح 🔓'}</span>
              </button>

              {/* Second Screen (Gamepad Mode) Toggle */}
              <button
                type="button"
                onClick={handleToggleSecondScreenMode}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                  secondScreenMode 
                    ? 'bg-purple-600 text-white border-purple-400 ring-2 ring-purple-400/30' 
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                }`}
                title="إظهار السؤال على شاشة العرض الكبرى فقط والأشكال الهندسية على هواتف المتسابقين"
              >
                {secondScreenMode ? <Smartphone className="w-3.5 h-3.5 text-amber-300" /> : <Tv className="w-3.5 h-3.5" />}
                <span>{secondScreenMode ? 'وضع Gamepad مفعل 📱' : 'وضع الشاشة المنفصلة'}</span>
              </button>

              {/* Canvas Protection Mode Toggle */}
              <button
                type="button"
                onClick={handleToggleCanvasProtection}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                  canvasTextProtection 
                    ? 'bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400/30' 
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                }`}
                title="رسم نص السؤال داخل عنصر Canvas لمنع أدوات وسكرابر الذكاء الاصطناعي من قراءة الـ DOM"
              >
                <Star className="w-3.5 h-3.5 text-amber-300" />
                <span>{canvasTextProtection ? 'حماية Canvas مفعّلة 🛡️' : 'حماية Canvas معطلة'}</span>
              </button>

              {/* Anti-Cheat Audit Monitor */}
              <button
                type="button"
                onClick={() => setShowCheatAuditModal(true)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                  totalViolationsCount > 0 
                    ? 'bg-red-600/40 text-red-200 border-red-500 hover:bg-red-600/60 animate-pulse' 
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                }`}
                title="مراقبة محاولات الغش ومغادرة التبويب"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
                <span>مراقبة الغش ({totalViolationsCount})</span>
              </button>

              {/* Sound / Music Mute Toggle */}
              <button
                type="button"
                onClick={handleToggleMute}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition cursor-pointer"
                title={isSoundMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت والمؤثرات'}
              >
                {isSoundMuted ? <VolumeX className="w-4 h-4 text-red-300" /> : <Volume2 className="w-4 h-4 text-emerald-300" />}
              </button>

              {/* Servant Role Indicator & Switch to Competing Player */}
              <span className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 text-xs font-black flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-emerald-300" />
                <span>وضع المراقب / المقدم 👁️</span>
              </span>

              <button
                type="button"
                onClick={() => handleExplicitJoinLiveSession(activeSession)}
                className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black transition cursor-pointer flex items-center gap-1 shadow-md"
                title="الانضمام للمسابقة والمشاركة كمتسابق"
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>المشاركة كمتسابق 🎮</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeSession) {
                    storageService.endKahootSession(activeSession.id);
                  }
                  audio.stopLobbyMusic();
                  setActiveSession(null);
                  setActiveViewMode('manager');
                  setIsTimerRunning(false);
                }}
                className="px-3.5 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold transition border border-red-400/40 cursor-pointer"
              >
                إنهاء الجلسة ✕
              </button>
            </div>
          </div>

          {/* ----------------------------------------------------
              STAGE A: LOBBY & PARTICIPANTS JOINING
              ---------------------------------------------------- */}
          {activeSession.status === 'lobby' && (
            <div className="bg-black/40 backdrop-blur-md rounded-3xl p-6 md:p-10 border border-white/20 text-center space-y-8 animate-fadeIn">
              
              <div className="max-w-2xl mx-auto space-y-4">
                {selectedQuiz.coverImage ? (
                  <div className="w-full max-w-md mx-auto h-40 rounded-3xl overflow-hidden border-2 border-amber-400/70 shadow-2xl relative">
                    <img src={selectedQuiz.coverImage} alt={selectedQuiz.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-center pb-3">
                      <span className="px-3 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black shadow">
                        {activeSession.gameMode === 'team' ? '🛡️ مسابقة فرق تفاعلية' : '⚡ مسابقة تفاعل مباشر'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-4xl block animate-bounce">🎮🔥</span>
                )}
                <h3 className="text-2xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-200 to-yellow-400">
                  انضموا الآن لمسابقة «{selectedQuiz.title}»!
                </h3>
                <p className="text-xs md:text-sm text-white/80">
                  {activeSession.gameMode === 'team' && activeSession.teamAssignmentMode === 'manual_or_pin'
                    ? 'امسح رمز الـ QR العام للغرفة أو استخدم رمز PIN و QR الخاص بكل فريق بالأسفل للانضمام لفريقك مباشرة:'
                    : 'امسح رمز الـ QR بهاتفك أو افتح صفحة المسابقات وأدخل رمز الـ PIN التالي:'}
                </p>
              </div>

              {/* Giant PIN & QR Code Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto items-center bg-white/5 p-6 rounded-3xl border border-white/15">
                
                {/* QR Code Container */}
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="bg-white p-3.5 rounded-3xl shadow-2xl border-4 border-amber-400 ring-4 ring-amber-400/20">
                    {qrCodeDataUrl ? (
                      <img src={qrCodeDataUrl} alt="Join QR Code" className="w-48 h-48 md:w-56 md:h-56 object-contain" />
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center font-bold text-slate-800">جاري توليد QR...</div>
                    )}
                  </div>
                  <span className="text-xs text-amber-300 font-bold">📲 رمز QR العام للغرفة</span>
                </div>

                {/* Big PIN & Capacity Box */}
                <div className="text-right space-y-4">
                  <div className="bg-black/60 p-5 rounded-2xl border border-white/20 text-center space-y-1">
                    <span className="text-xs text-white/70 block uppercase font-bold">Game PIN كود الغرفة العام</span>
                    <span className="text-4xl md:text-5xl font-black tracking-widest text-amber-300 font-mono block">
                      {activeSession.id}
                    </span>
                  </div>

                  {/* Open / Closed Room Status & Toggle */}
                  <div className="bg-white/10 p-3.5 rounded-2xl border border-white/15 flex items-center justify-between text-xs">
                    <span className="text-white/80 font-bold">حالة الغرفة الآن:</span>
                    <button
                      type="button"
                      onClick={handleToggleSessionLock}
                      className={`px-3 py-1 rounded-xl font-black text-xs cursor-pointer transition ${
                        activeSession.isLocked
                          ? 'bg-red-500/30 text-red-200 border border-red-400/50'
                          : 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/50'
                      }`}
                    >
                      {activeSession.isLocked ? '🔒 الغرفة مقفلة (اضغط لفتحها)' : '🔓 الغرفة مفتوحة للانضمام'}
                    </button>
                  </div>

                  {/* Participant Capacity Indicator */}
                  <div className="bg-white/10 p-4 rounded-2xl border border-white/15 flex items-center justify-between text-xs">
                    <span className="text-white/80 flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-400" />
                      <span>المتسابقون المنتظرون باللوبي:</span>
                    </span>
                    <span className="font-mono font-black text-emerald-300 text-sm">
                      {Object.keys(activeSession.players).length} {activeSession.maxPlayersLimit && activeSession.maxPlayersLimit > 0 ? `/ ${activeSession.maxPlayersLimit}` : '(غير محدود ∞)'}
                    </span>
                  </div>

                  {/* Start Button */}
                  <button
                    type="button"
                    onClick={() => handleStartQuestion(0)}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 text-white font-black text-lg transition shadow-xl shadow-emerald-500/20 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>بدء المسابقة الآن 🚀</span>
                  </button>
                </div>
              </div>

              {/* Team Mode Distribution, Team Customization & Dedicated Team PIN / QR Cards */}
              {activeSession.gameMode === 'team' && activeSession.teams && (
                <div className="max-w-5xl mx-auto bg-white/5 p-5 md:p-6 rounded-3xl border border-amber-400/30 space-y-5 text-right">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                      <h4 className="text-base md:text-lg font-black text-amber-300 flex items-center gap-2">
                        <span>🛡️ إدارة الفرق ورموز انضمام كل فريق ({Object.keys(activeSession.teams).length} فرق)</span>
                      </h4>
                      <p className="text-xs text-white/70 mt-0.5">
                        {activeSession.teamAssignmentMode === 'random'
                          ? '🎲 نظام التوزيع الحالي: توزيع عشوائي تلقائي للأعضاء على الفرق بالتساوي'
                          : '📌 نظام التوزيع الحالي: اختيار كل فريق لوحده (عبر PIN و QR Code خاص بكل فريق أو اختيار يدوي)'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          const nextMode = activeSession.teamAssignmentMode === 'random' ? 'manual_or_pin' : 'random';
                          const currentTeamsList = Object.values(activeSession.teams || {}).map(t => ({
                            id: t.id,
                            name: t.name,
                            color: t.color,
                            pin: t.pin
                          }));
                          const updated = storageService.updateKahootSessionTeams(activeSession.id, currentTeamsList, nextMode);
                          if (updated) setActiveSession(updated);
                        }}
                        className="px-3 py-2 rounded-xl bg-purple-600/40 hover:bg-purple-600/60 text-purple-100 border border-purple-400/40 text-xs font-black cursor-pointer transition"
                      >
                        {activeSession.teamAssignmentMode === 'random'
                          ? 'تبديل إلى: اختيار كل فريق بـ PIN و QR خاص 📌'
                          : 'تبديل إلى: توزيع عشوائي تلقائي 🎲'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!isEditingLobbyTeams && activeSession.teams) {
                            setCustomTeamConfigs(
                              Object.values(activeSession.teams).map(t => ({
                                id: t.id,
                                name: t.name,
                                color: t.color,
                                pin: t.pin
                              }))
                            );
                          }
                          setIsEditingLobbyTeams(!isEditingLobbyTeams);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black cursor-pointer transition"
                      >
                        {isEditingLobbyTeams ? 'إغلاق تعديل الفرق ✕' : 'تعديل عدد وأسماء الفرق ✏️'}
                      </button>
                    </div>
                  </div>

                  {/* Live Team Count & Team Names Editor inside Lobby */}
                  {isEditingLobbyTeams && (
                    <div className="bg-black/50 p-4 rounded-2xl border border-amber-400/40 space-y-4 animate-fadeIn">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-black text-amber-300">
                          تحكم في عدد الفرق (من فريقين إلى 10 فرق) وغيّر أسماءها مباشرة:
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={customTeamConfigs.length <= 2}
                            onClick={() => setCustomTeamConfigs(prev => prev.slice(0, -1))}
                            className="px-3 py-1.5 rounded-xl bg-red-500/30 hover:bg-red-500/50 disabled:opacity-40 text-red-200 border border-red-400/40 text-xs font-black cursor-pointer"
                          >
                            - إنقاص فريق
                          </button>
                          <span className="px-3 py-1 rounded-lg bg-white/10 font-mono font-black text-xs text-white">
                            {customTeamConfigs.length} فرق
                          </span>
                          <button
                            type="button"
                            disabled={customTeamConfigs.length >= 10}
                            onClick={() =>
                              setCustomTeamConfigs(prev => [
                                ...prev,
                                {
                                  id: `team_${Date.now()}_${prev.length + 1}`,
                                  name: `الفريق ${prev.length + 1} ⚡`,
                                  color: TEAM_COLORS_PALETTE[prev.length % TEAM_COLORS_PALETTE.length]
                                }
                              ])
                            }
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/30 hover:bg-emerald-500/50 disabled:opacity-40 text-emerald-200 border border-emerald-400/40 text-xs font-black cursor-pointer"
                          >
                            + إضافة فريق جديد
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {customTeamConfigs.map((tc, idx) => (
                          <div key={tc.id} className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/15">
                            <span className="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={tc.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomTeamConfigs(prev => prev.map((item, i) => (i === idx ? { ...item, name: val } : item)));
                              }}
                              placeholder={`اسم الفريق ${idx + 1}`}
                              className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/20 text-white text-xs font-bold focus:outline-hidden focus:border-amber-400"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = storageService.updateKahootSessionTeams(
                              activeSession.id,
                              customTeamConfigs,
                              activeSession.teamAssignmentMode || teamAssignmentMode
                            );
                            if (updated) {
                              setActiveSession(updated);
                              setIsEditingLobbyTeams(false);
                              setShareToastMessage('✅ تم تحديث عدد وأسماء الفرق ورموز الـ PIN الخاصة بها بنجاح!');
                              setTimeout(() => setShareToastMessage(null), 3500);
                            }
                          }}
                          className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg cursor-pointer"
                        >
                          حفظ وتطبيق تعديلات الفرق ✔️
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Teams Cards Grid with Team PIN, Team QR Code, and Joined Members */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {Object.values(activeSession.teams).map((team) => {
                      const teamPlayers = Object.values(activeSession.players).filter(p => p.teamId === team.id);
                      const teamQr = teamQrDataUrls[team.id];
                      return (
                        <div key={team.id} className="bg-black/45 p-4 rounded-2xl border border-white/20 flex flex-col justify-between space-y-3 shadow-lg">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black text-sm text-amber-300 truncate">{team.name}</span>
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-mono shrink-0">
                                {teamPlayers.length} عضو
                              </span>
                            </div>

                            {/* Dedicated Team PIN & QR Code for manual_or_pin mode */}
                            {team.pin && (
                              <div className="bg-white/5 p-2.5 rounded-xl border border-amber-400/30 flex items-center justify-between gap-2">
                                <div>
                                  <span className="text-[10px] text-white/60 block font-bold">PIN الفريق الخاص:</span>
                                  <span className="font-mono text-lg font-black text-amber-300 tracking-wider">{team.pin}</span>
                                </div>
                                {teamQr && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFocusedTeamQrModal({
                                        id: team.id,
                                        name: team.name,
                                        pin: team.pin || activeSession.id,
                                        qrUrl: teamQr
                                      })
                                    }
                                    className="bg-white p-1.5 rounded-xl border-2 border-amber-400 hover:scale-105 transition cursor-pointer shrink-0"
                                    title="اضغط لتكبير QR Code و PIN هذا الفريق"
                                  >
                                    <img src={teamQr} alt={team.name} className="w-12 h-12 object-contain" />
                                  </button>
                                )}
                              </div>
                            )}

                            <div className="text-[11px] text-white/80 min-h-[36px] max-h-24 overflow-y-auto bg-black/30 p-2 rounded-xl border border-white/10">
                              {teamPlayers.length === 0 ? (
                                <span className="text-white/40 italic">بانتظار انضمام أعضاء الفريق...</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {teamPlayers.map(tp => (
                                    <span key={tp.id} className="px-2 py-0.5 rounded-md bg-white/10 text-white font-bold text-[10px]">
                                      {tp.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {team.pin && teamQr && (
                            <button
                              type="button"
                              onClick={() =>
                                setFocusedTeamQrModal({
                                  id: team.id,
                                  name: team.name,
                                  pin: team.pin || activeSession.id,
                                  qrUrl: teamQr
                                })
                              }
                              className="w-full py-1.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/30 text-amber-300 border border-amber-400/30 text-[11px] font-black cursor-pointer transition"
                            >
                              📲 عرض QR و PIN «{team.name}»
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Joined Players Grid with Kick Option */}
              <div className="space-y-3 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between max-w-4xl mx-auto px-2">
                  <span className="text-xs font-bold text-white/70">
                    قائمة المتسابقين الحاضرين في غرفة الانتظار:
                  </span>
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 px-3 py-0.5 rounded-full font-bold border border-emerald-500/30">
                    🟢 متصلون الآن ({Object.keys(activeSession.players).length})
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-4xl mx-auto max-h-52 overflow-y-auto p-2">
                  {Object.values(activeSession.players).length === 0 ? (
                    <div className="py-6 text-white/50 text-xs italic">
                      بانتظار دخول المتسابقين... شارك الـ PIN أو رمز الـ QR مع الحاضرين في القاعة!
                    </div>
                  ) : (
                    Object.values(activeSession.players).map((p) => (
                      <div
                        key={p.id}
                        className="bg-white/15 px-3.5 py-1.5 rounded-xl border border-white/20 text-xs font-bold flex items-center gap-2 group hover:bg-white/25 transition"
                      >
                        <span>{activeSession.showParticipantNames === false ? 'مشارك سري' : p.name}</span>
                        {p.teamName && (
                          <span className="text-[10px] text-amber-300 bg-black/30 px-1.5 py-0.5 rounded">{p.teamName}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => storageService.kickPlayer(activeSession.id, p.id)}
                          className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-400 transition cursor-pointer"
                          title="استبعاد المتسابق من اللوبي"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ----------------------------------------------------
              STAGE B: ACTIVE QUESTION WITH TIMER & CONTROLS
              ---------------------------------------------------- */}
          {activeSession.status === 'question_active' && currentQuestion && (
            <div className="space-y-6">
              
              {/* Question Header Card */}
              <div className="bg-black/40 backdrop-blur-md rounded-3xl p-6 border border-white/15 text-center relative overflow-hidden">
                <div className="flex flex-wrap items-center justify-between text-xs text-white/70 mb-3 font-bold gap-2">
                  <span>السؤال {activeSession.currentQuestionIndex + 1} من {selectedQuiz.questions.length}</span>
                  <span className="bg-amber-400/20 text-amber-300 px-3 py-1 rounded-full border border-amber-400/30 font-bold">
                    {currentQuestion.type === 'quiz' ? (currentQuestion.multiSelect ? 'اختيار متعدد الإجابات (Multi-Select)' : 'اختيار من متعدد (Quiz)')
                      : currentQuestion.type === 'true_false' ? 'صح أم خطأ (True/False)'
                      : currentQuestion.type === 'puzzle' ? 'لغز الترتيب (Puzzle)'
                      : currentQuestion.type === 'matching' ? 'توصيل ومطابقة (Matching)'
                      : currentQuestion.type === 'image_quiz' ? 'سؤال بصورة (Image Quiz)'
                      : currentQuestion.type === 'type_answer' ? 'كتابة الإجابة (Type Answer)'
                      : currentQuestion.type === 'slider' ? 'شريط التقدير (Slider)'
                      : currentQuestion.type === 'audio_quiz' ? 'سؤال صوتي (Audio Quiz)'
                      : currentQuestion.type === 'pin_answer' ? 'تحديد بالدبوس (Pin Answer)'
                      : currentQuestion.type === 'word_cloud' ? 'سحابة كلمات (Word Cloud)'
                      : currentQuestion.type === 'poll' ? 'استطلاع رأي (Poll)'
                      : currentQuestion.type === 'open_ended' ? 'سؤال مفتوح (Open Ended)'
                      : currentQuestion.type === 'brainstorm' ? 'عصف ذهني (Brainstorm)'
                      : currentQuestion.type === 'drop_pin' ? 'دبوس الرأي (Drop Pin)'
                      : currentQuestion.type === 'scale' ? 'مقياس التقييم (Scale)'
                      : currentQuestion.type === 'rating' ? 'تقييم بالنجوم (Rating 1-5)'
                      : 'سؤال تفاعلي'}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/30 font-mono">
                      أجاب: {Object.keys(activeSession.answersSubmitted || {}).filter(k => k.endsWith(`_${currentQuestion.id}`)).length} / {Object.keys(activeSession.players).length}
                    </span>
                    <span className="font-mono text-amber-300">
                      {currentQuestion.pointsMultiplier === 2 ? '🔥 نقاط مضاعفة (2000)' : currentQuestion.pointsMultiplier === 0 ? '💬 رأي (بدون نقاط)' : `⭐ (${currentQuestion.customPoints || 1000} نقطة)`}
                    </span>
                  </div>
                </div>

                {/* Render Question Title: Standard or Canvas Protected */}
                {canvasTextProtection ? (
                  <div className="flex justify-center py-2">
                    <canvas ref={questionCanvasRef} className="w-full max-w-4xl h-24 object-contain" />
                  </div>
                ) : (
                  <h2 className="text-xl md:text-3xl font-black text-white leading-relaxed max-w-4xl mx-auto py-2">
                    {currentQuestion.title}
                  </h2>
                )}

                {/* Servant Note (Visible only on Host Screen) */}
                {currentQuestion.servantNote && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-200 text-xs">
                    <BookOpen className="w-3.5 h-3.5 text-amber-300" />
                    <span>ملاحظة الخادم: {currentQuestion.servantNote}</span>
                  </div>
                )}

                {/* Circular Countdown Timer */}
                <div className="mt-3 flex items-center justify-center">
                  <div className={`w-20 h-20 rounded-full flex flex-col items-center justify-center border-4 font-black font-mono transition-all duration-300 ${
                    timeRemaining <= 5 
                      ? 'border-red-500 bg-red-950/80 text-red-200 scale-110 animate-pulse' 
                      : 'border-amber-400 bg-amber-950/60 text-amber-300'
                  }`}>
                    <span className="text-2xl">{timeRemaining}</span>
                    <span className="text-[9px] uppercase tracking-wider text-white/60">ثانية</span>
                  </div>
                </div>
              </div>

              {/* Question Media with Image Reveal support (skipped for pin_answer/drop_pin which render their own interactive image board) */}
              {currentQuestion.mediaUrl && currentQuestion.type !== 'pin_answer' && currentQuestion.type !== 'drop_pin' && (
                <div className="max-w-lg mx-auto rounded-2xl overflow-hidden border border-white/20 relative shadow-2xl">
                  {currentQuestion.mediaType === 'youtube' ? (
                    <div className="aspect-video w-full">
                      <iframe
                        src={`${currentQuestion.mediaUrl.replace('watch?v=', 'embed/')}?start=${currentQuestion.youtubeStartSec || 0}&end=${currentQuestion.youtubeEndSec || 30}&autoplay=1`}
                        className="w-full h-full"
                        title="YouTube Media"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                      />
                    </div>
                  ) : (
                    <div className="relative">
                      <img src={currentQuestion.mediaUrl} alt="وسائط السؤال" className="w-full h-56 object-cover" />
                      {currentQuestion.imageReveal && timeRemaining > 0 && (
                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0.5 pointer-events-none">
                          {Array.from({ length: 9 }).map((_, i) => {
                            const shouldHide = (9 - Math.ceil((timeRemaining / (currentQuestion.timeLimitSeconds || 20)) * 9)) > i;
                            return (
                              <div
                                key={i}
                                className={`bg-slate-900 transition-opacity duration-500 ${
                                  shouldHide ? 'opacity-0' : 'opacity-100'
                                }`}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ----------------------------------------------------
                  QUESTION TYPES RENDERER (ALL 16 TYPES)
                  ---------------------------------------------------- */}

              {/* 1. Quiz, Image Quiz, Audio Quiz & Poll */}
              {(currentQuestion.type === 'quiz' || currentQuestion.type === 'image_quiz' || currentQuestion.type === 'audio_quiz' || currentQuestion.type === 'poll') && currentQuestion.options && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentQuestion.options.map((opt, idx) => {
                      const colors = [
                        'from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 border-red-400',
                        'from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 border-blue-400',
                        'from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 border-amber-300 text-slate-950',
                        'from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border-emerald-400',
                        'from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 border-purple-400',
                        'from-pink-600 to-pink-700 hover:from-pink-500 hover:to-pink-600 border-pink-400'
                      ];
                      const shapes = ['▲ مثلث', '◆ معين', '● دائرة', '■ مربع', '⬢ سداسي', '★ نجمة'];
                      const isSelected = currentQuestion.multiSelect
                        ? multiSelectedOptions.includes(opt.id)
                        : playerSelectedAnswer === opt.id;

                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            if (currentQuestion.multiSelect) {
                              setMultiSelectedOptions(prev =>
                                prev.includes(opt.id) ? prev.filter(x => x !== opt.id) : [...prev, opt.id]
                              );
                            } else {
                              handlePlayerAnswerSubmit(opt.id, opt.isCorrect || false);
                            }
                          }}
                          className={`p-5 rounded-2xl bg-gradient-to-r ${colors[idx % colors.length]} border-2 text-white font-black text-lg md:text-xl flex items-center justify-between gap-3 shadow-xl transition-all active:scale-95 cursor-pointer text-right ${
                            isSelected ? 'ring-4 ring-white scale-102' : ''
                          }`}
                        >
                          <span className="text-base font-bold opacity-80 shrink-0 font-mono">
                            {shapes[idx % shapes.length]}
                          </span>
                          {!secondScreenMode && opt.imageUrl && (
                            <img
                              src={opt.imageUrl}
                              alt={opt.text}
                              className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover border-2 border-white/40 shrink-0 shadow-md bg-black/20"
                            />
                          )}
                          <span className="flex-1 px-2 leading-normal">
                            {secondScreenMode ? shapes[idx % shapes.length] : opt.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {currentQuestion.multiSelect && (
                    <button
                      type="button"
                      disabled={multiSelectedOptions.length === 0}
                      onClick={() => handleCheckMultiSelectAnswer(currentQuestion, false)}
                      className="w-full max-w-md mx-auto block py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm shadow-lg disabled:opacity-50 cursor-pointer"
                    >
                      تأكيد الإجابات المختارة ({multiSelectedOptions.length}) ✔️
                    </button>
                  )}
                </div>
              )}

              {/* 2. True or False */}
              {currentQuestion.type === 'true_false' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
                  <button
                    type="button"
                    onClick={() => {
                      const trueOpt = currentQuestion.options?.find(o => o.id === 'tf_1' || o.text.includes('صح'));
                      handlePlayerAnswerSubmit('true', trueOpt ? !!trueOpt.isCorrect : true);
                    }}
                    className="p-8 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 border-2 border-blue-400 text-white font-black text-2xl flex items-center justify-center gap-3 shadow-xl transition active:scale-95 cursor-pointer"
                  >
                    <CheckCircle2 className="w-8 h-8 text-blue-200" />
                    <span>صح (True) ✔️</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const falseOpt = currentQuestion.options?.find(o => o.id === 'tf_2' || o.text.includes('خطأ'));
                      handlePlayerAnswerSubmit('false', falseOpt ? !!falseOpt.isCorrect : false);
                    }}
                    className="p-8 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 border-2 border-red-400 text-white font-black text-2xl flex items-center justify-center gap-3 shadow-xl transition active:scale-95 cursor-pointer"
                  >
                    <XCircle className="w-8 h-8 text-red-200" />
                    <span>خطأ (False) ❌</span>
                  </button>
                </div>
              )}

              {/* 3. Matching Pairs */}
              {currentQuestion.type === 'matching' && currentQuestion.matchingPairs && (
                <div className="max-w-2xl mx-auto bg-black/40 p-6 rounded-3xl border border-white/20 space-y-4">
                  <p className="text-xs text-amber-300 text-center font-bold">
                    صل كل عنصر في العمود الأيمن بما يناسبه في العمود الأيسر:
                  </p>
                  <div className="space-y-3">
                    {currentQuestion.matchingPairs.map((pair) => (
                      <div key={pair.id} className="grid grid-cols-2 gap-3 items-center bg-white/5 p-3 rounded-xl border border-white/10">
                        <span className="font-black text-sm text-white">{pair.leftText}</span>
                        <select
                          value={matchingUserSelections[pair.id] || ''}
                          onChange={(e) => setMatchingUserSelections(prev => ({ ...prev, [pair.id]: e.target.value }))}
                          className="px-3 py-2 rounded-xl bg-slate-800 border border-white/20 text-white text-xs font-bold"
                        >
                          <option value="">-- اختر المطابق --</option>
                          {currentQuestion.matchingPairs!.map(p => (
                            <option key={p.id} value={p.rightText}>{p.rightText}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCheckMatchingAnswer(currentQuestion, false)}
                    className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm cursor-pointer shadow-lg"
                  >
                    تأكيد التوصيل والمطابقة 🔗
                  </button>
                </div>
              )}

              {/* 4. Puzzle: Sequence ordering */}
              {currentQuestion.type === 'puzzle' && currentQuestion.puzzleItems && (
                <div className="max-w-2xl mx-auto bg-black/40 p-6 rounded-3xl border border-white/20 space-y-4">
                  <p className="text-xs text-white/70 text-center font-bold">
                    رتب العناصر في الترتيب الصحيح من الأعلى للأسفل (انقر للتبديل):
                  </p>
                  <div className="space-y-2.5">
                    {puzzleCurrentOrder.map((itemId, idx) => {
                      const item = currentQuestion.puzzleItems?.find(p => p.id === itemId);
                      if (!item) return null;
                      return (
                        <div
                          key={item.id}
                          className="bg-white/10 hover:bg-white/20 p-4 rounded-xl border border-white/20 flex items-center justify-between transition"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center font-mono">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-sm">{item.text}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (idx > 0) {
                                  const copy = [...puzzleCurrentOrder];
                                  const temp = copy[idx];
                                  copy[idx] = copy[idx - 1];
                                  copy[idx - 1] = temp;
                                  setPuzzleCurrentOrder(copy);
                                }
                              }}
                              className="p-1 rounded bg-white/10 hover:bg-white/20 text-white"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (idx < puzzleCurrentOrder.length - 1) {
                                  const copy = [...puzzleCurrentOrder];
                                  const temp = copy[idx];
                                  copy[idx] = copy[idx + 1];
                                  copy[idx + 1] = temp;
                                  setPuzzleCurrentOrder(copy);
                                }
                              }}
                              className="p-1 rounded bg-white/10 hover:bg-white/20 text-white"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckPuzzleAnswer}
                    className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm transition shadow-lg"
                  >
                    تأكيد ترتيب الأحداث 🚀
                  </button>
                </div>
              )}

              {/* 5. Type Answer / Open Ended / Brainstorm */}
              {(currentQuestion.type === 'type_answer' || currentQuestion.type === 'open_ended' || currentQuestion.type === 'brainstorm') && (
                <div className="max-w-xl mx-auto bg-black/40 p-6 rounded-3xl border border-white/20 text-center space-y-4">
                  <input
                    type="text"
                    maxLength={120}
                    value={typeAnswerInput}
                    onChange={(e) => setTypeAnswerInput(e.target.value)}
                    placeholder={currentQuestion.type === 'type_answer' ? 'اكتب إجابتك هنا (تجاهل الهمزات والمسافات)...' : 'اكتب رأيك أو فكرتك هنا...'}
                    className="w-full px-5 py-4 rounded-xl bg-white/10 border-2 border-white/30 text-white text-xl font-black text-center focus:outline-hidden focus:border-amber-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (currentQuestion.type === 'type_answer') handleCheckTypeAnswer();
                        else handlePlayerAnswerSubmit(typeAnswerInput, true);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!typeAnswerInput.trim()}
                    onClick={() => {
                      if (currentQuestion.type === 'type_answer') handleCheckTypeAnswer();
                      else handlePlayerAnswerSubmit(typeAnswerInput, true);
                    }}
                    className="px-8 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm transition disabled:opacity-50 cursor-pointer shadow-lg"
                  >
                    إرسال الإجابة 🚀
                  </button>
                </div>
              )}

              {/* 6. Slider Answer */}
              {currentQuestion.type === 'slider' && (
                <div className="max-w-xl mx-auto bg-black/40 p-6 rounded-3xl border border-white/20 text-center space-y-4">
                  <span className="text-3xl font-black text-amber-300 font-mono">
                    القيمة المحددة: {sliderCurrentValue}
                  </span>
                  <div className="px-4">
                    <input
                      type="range"
                      min={currentQuestion.sliderMin || 1}
                      max={currentQuestion.sliderMax || 10}
                      step={currentQuestion.sliderStep || 1}
                      value={sliderCurrentValue}
                      onChange={(e) => setSliderCurrentValue(Number(e.target.value))}
                      className="w-full h-3 bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    />
                  </div>
                  <div className="flex justify-between text-xs text-white/60 font-mono px-4">
                    <span>الحد الأدنى: {currentQuestion.sliderMin || 1}</span>
                    <span>الحد الأقصى: {currentQuestion.sliderMax || 10}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckSliderAnswer}
                    className="px-8 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm transition shadow-lg cursor-pointer"
                  >
                    تأكيد قيمة شريط التمرير ✔️
                  </button>
                </div>
              )}

              {/* 7. Pin Answer & Drop Pin */}
              {(currentQuestion.type === 'pin_answer' || currentQuestion.type === 'drop_pin') && (
                <div className="max-w-2xl mx-auto bg-black/40 p-5 rounded-3xl border border-white/20 text-center space-y-3">
                  <p className="text-xs text-amber-300 font-bold">
                    📍 انقر على الصورة لإسقاط دبوسك في الموضع الصحيح:
                  </p>
                  <div 
                    onClick={handleCheckPinAnswer}
                    className="relative rounded-2xl overflow-hidden cursor-crosshair border-2 border-amber-400/50 bg-slate-900 select-none shadow-2xl"
                  >
                    <img 
                      src={currentQuestion.mediaUrl || 'https://images.unsplash.com/photo-1548625361-195977935bb8?w=900'} 
                      alt="Pin Map/Image" 
                      className="w-full h-72 md:h-80 object-contain bg-black/60" 
                    />
                    {pinClickedCoords && (
                      <div 
                        className="absolute -translate-x-1/2 -translate-y-full pointer-events-none z-20 flex flex-col items-center"
                        style={{ left: `${pinClickedCoords.xPercent}%`, top: `${pinClickedCoords.yPercent}%` }}
                      >
                        <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] shadow mb-0.5 whitespace-nowrap">
                          دبوسك ({Math.round(pinClickedCoords.xPercent)}%, {Math.round(pinClickedCoords.yPercent)}%)
                        </span>
                        <span className="text-3xl drop-shadow-lg animate-bounce">📍</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 8. Word Cloud */}
              {currentQuestion.type === 'word_cloud' && (
                <div className="max-w-2xl mx-auto bg-black/40 p-6 rounded-3xl border border-white/20 text-center space-y-4">
                  <div className="flex flex-wrap items-center justify-center gap-4 py-6">
                    {((activeSession.opinionsCollected?.[currentQuestion.id]?.map((o: any) => String(o.response)) || []).concat(['المحبة', 'الثقة', 'الإيمان', 'السلام', 'الرجاء'])).map((word: string, i: number) => (
                      <span 
                        key={`${word}_${i}`} 
                        className={`font-black animate-pulse ${
                          i % 3 === 0 ? 'text-3xl text-amber-300' : i % 2 === 0 ? 'text-2xl text-cyan-300' : 'text-xl text-emerald-300'
                        }`}
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 max-w-md mx-auto">
                    <input
                      type="text"
                      maxLength={25}
                      value={opinionInputText}
                      onChange={(e) => setOpinionInputText(e.target.value)}
                      placeholder="أضف كلمتك للسحابة الحية..."
                      className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs"
                    />
                    <button
                      type="button"
                      disabled={!opinionInputText.trim()}
                      onClick={() => {
                        handlePlayerAnswerSubmit(opinionInputText.trim(), true);
                        setOpinionInputText('');
                      }}
                      className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs cursor-pointer"
                    >
                      إرسال ☁️
                    </button>
                  </div>
                </div>
              )}

              {/* 9. Scale & Rating (1-5) */}
              {(currentQuestion.type === 'scale' || currentQuestion.type === 'rating') && (
                <div className="max-w-xl mx-auto bg-black/40 p-6 rounded-3xl border border-white/20 text-center space-y-5">
                  <span className="text-3xl font-black text-amber-300 font-mono">
                    {currentQuestion.type === 'rating' ? `التقييم: ${'⭐'.repeat(sliderCurrentValue)}` : `التقييم: ${sliderCurrentValue} من 5`}
                  </span>
                  <div className="flex justify-between items-center gap-2">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          setSliderCurrentValue(val);
                          handlePlayerAnswerSubmit(val, true);
                        }}
                        className={`w-12 h-12 rounded-2xl font-black text-lg transition cursor-pointer ${
                          sliderCurrentValue === val ? 'bg-amber-400 text-slate-950 scale-110 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        {currentQuestion.type === 'rating' ? '⭐' : val}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-white/60">
                    <span>{currentQuestion.scaleLabels?.min || 'منخفض'}</span>
                    <span>{currentQuestion.scaleLabels?.max || 'مرتفع جداً 🔥'}</span>
                  </div>
                </div>
              )}

              {/* Live Real-Time Top 10 & Answer Monitor for Observer / Host while Question is Active */}
              {Object.keys(activeSession.players || {}).length > 0 && (
                <div className="bg-black/45 p-4 md:p-5 rounded-3xl border border-amber-400/30 space-y-3 mt-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs md:text-sm font-black text-amber-300 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>متابعة مباشرة للترتيب التراكمي والنقاط أثناء الإجابة (Top 10 Live):</span>
                    </span>
                    <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-3 py-0.5 rounded-full border border-emerald-400/30 font-bold">
                      أجاب حتى الآن: {Object.keys(activeSession.answersSubmitted || {}).filter(k => k.endsWith(`_${currentQuestion.id}`)).length} من {Object.keys(activeSession.players || {}).length} متسابق ⚡
                    </span>
                  </div>
                  {renderDynamicAnimatedTop10Board(activeSession, selectedQuiz, true)}
                </div>
              )}

              {/* Bottom Action Bar: Show answers or proceed to leaderboard */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleTimeUp}
                  className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/20 cursor-pointer"
                >
                  كشف الإجابات الآن ⏱️
                </button>

                {playerFeedback && (
                  <div className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg ${
                    playerFeedback.isCorrect ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {playerFeedback.isCorrect ? `إجابة صحيحة! +${playerFeedback.points} نقطة 🎯` : 'إجابة خاطئة! حاول في السؤال القادم ❌'}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleShowLeaderboard}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 text-slate-950 font-black text-xs transition shadow-lg flex items-center gap-2 cursor-pointer"
                >
                  <span>عرض لوحة المتصدرين (Top 10)</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          )}

          {/* ----------------------------------------------------
              STAGE C: ANSWER REVEAL + DISTRIBUTION CHARTS + EXPLANATION
              ---------------------------------------------------- */}
          {activeSession.status === 'answer_reveal' && currentQuestion && (
            <div className="bg-black/40 backdrop-blur-md rounded-3xl p-8 border border-white/20 text-center space-y-6 animate-fadeIn">
              <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-red-500/25 border border-red-400/50 text-red-200 text-xs md:text-sm font-black animate-pulse">
                <Clock className="w-4 h-4 text-amber-300" />
                <span>⏰ انتهى وقت السؤال! تم إقفال استقبال الإجابات — جاري عرض لوحة الـ Top 10 تلقائياً...</span>
              </div>
              <span className="text-5xl block animate-bounce">🎉</span>
              <h2 className="text-2xl md:text-3xl font-black text-white">
                {currentQuestion.pointsMultiplier === 0 ? 'نتائج التصويت والآراء المباشرة' : 'الوقت انتهى — الإجابة الصحيحة هي:'}
              </h2>

              {currentQuestion.pointsMultiplier !== 0 && (
                <div className="max-w-xl mx-auto bg-emerald-950/80 border-2 border-emerald-400 rounded-2xl p-6 text-emerald-200 text-xl font-black shadow-xl">
                  {getCorrectAnswerLabelForQuestion(currentQuestion)}
                </div>
              )}

              {(currentQuestion.type === 'pin_answer' || currentQuestion.type === 'drop_pin') && (
                <div className="max-w-2xl mx-auto bg-black/50 p-4 rounded-2xl border border-emerald-400/40 space-y-2">
                  <span className="text-xs font-black text-emerald-300 block">
                    🎯 موضع الدبوس الصحيح على الصورة (المنطقة الخضراء):
                  </span>
                  <div className="relative rounded-xl overflow-hidden border border-white/20 bg-slate-900">
                    <img
                      src={currentQuestion.mediaUrl || 'https://images.unsplash.com/photo-1548625361-195977935bb8?w=900'}
                      alt="Pin Answer Reveal"
                      className="w-full h-64 md:h-72 object-contain bg-black/60"
                    />
                    {currentQuestion.pinCoordinates && (
                      <>
                        <div
                          className="absolute rounded-full border-4 border-emerald-400 bg-emerald-500/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-pulse"
                          style={{
                            left: `${currentQuestion.pinCoordinates.xPercent}%`,
                            top: `${currentQuestion.pinCoordinates.yPercent}%`,
                            width: `${(currentQuestion.pinCoordinates.tolerancePercent || 18) * 2}%`,
                            height: `${(currentQuestion.pinCoordinates.tolerancePercent || 18) * 2}%`
                          }}
                        />
                        <div
                          className="absolute -translate-x-1/2 -translate-y-full pointer-events-none z-20 flex flex-col items-center"
                          style={{
                            left: `${currentQuestion.pinCoordinates.xPercent}%`,
                            top: `${currentQuestion.pinCoordinates.yPercent}%`
                          }}
                        >
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white font-black text-[10px] shadow">
                            الموضع الصحيح ✔️
                          </span>
                          <span className="text-3xl">📍</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Biblical Reference & Explanation */}
              {(currentQuestion.biblicalReference || currentQuestion.explanation) && (
                <div className="max-w-2xl mx-auto bg-amber-500/10 border border-amber-400/30 rounded-2xl p-4 text-right space-y-1.5">
                  {currentQuestion.biblicalReference && (
                    <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4" />
                      <span>الشاهد الكتابي: {currentQuestion.biblicalReference}</span>
                    </div>
                  )}
                  {currentQuestion.explanation && (
                    <p className="text-xs text-white/90 leading-relaxed">{currentQuestion.explanation}</p>
                  )}
                </div>
              )}

              {/* Live Option Distribution Bar Chart */}
              {currentQuestion.options && currentQuestion.options.length > 0 && (
                <div className="max-w-2xl mx-auto bg-white/5 p-5 rounded-2xl border border-white/10 space-y-3 text-right">
                  <span className="text-xs font-bold text-white/70 block">توزيع إجابات المتسابقين:</span>
                  {currentQuestion.options.map((opt) => {
                    const allSubmits = Object.entries(activeSession.answersSubmitted || {})
                      .filter(([k]) => k.endsWith(`_${currentQuestion.id}`))
                      .map(([, v]) => v);
                    const totalVotes = Math.max(1, allSubmits.length);
                    const count = allSubmits.filter(v => v.answer === opt.id || (Array.isArray(v.answer) && v.answer.includes(opt.id))).length;
                    const pct = Math.round((count / totalVotes) * 100);
                    return (
                      <div key={opt.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className={opt.isCorrect ? 'text-emerald-300 font-black' : 'text-white/80'}>
                            {opt.text} {opt.isCorrect ? '✔️' : ''}
                          </span>
                          <span className="font-mono text-amber-300">{count} ({pct}%)</span>
                        </div>
                        <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${opt.isCorrect ? 'bg-emerald-400' : 'bg-amber-400/70'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Live Aggregated Opinions (Word Cloud / Open Ended / Brainstorm) */}
              {activeSession.opinionsCollected?.[currentQuestion.id] && activeSession.opinionsCollected[currentQuestion.id].length > 0 && (
                <div className="max-w-2xl mx-auto bg-white/5 p-4 rounded-2xl border border-white/10 space-y-2 text-right">
                  <span className="text-xs font-bold text-cyan-300 block">مشاركات وآراء الأعضاء ({activeSession.opinionsCollected[currentQuestion.id].length}):</span>
                  <div className="flex flex-wrap gap-2">
                    {activeSession.opinionsCollected[currentQuestion.id].map((op: any, i: number) => (
                      <div key={i} className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/15 text-xs">
                        <span className="font-black text-amber-300">{String(op.response)}</span>
                        {activeSession.showParticipantNames !== false && (
                          <span className="text-[10px] text-white/60 mr-1.5">— {op.playerName}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleShowLeaderboard}
                  className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 text-slate-950 font-black text-sm transition shadow-xl flex items-center gap-2 cursor-pointer"
                >
                  <span>عرض المتصدرين (Top 10 Active Board) 🏆</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------
              STAGE D: CUMULATIVE TOP 10 LEADERBOARD & TEAM STANDINGS
              ---------------------------------------------------- */}
          {activeSession.status === 'leaderboard' && (
            <div className="bg-black/40 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-white/20 space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-white/10 pb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Trophy className="w-8 h-8 text-amber-400" />
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-white">
                      {activeSession.gameMode === 'team'
                        ? `ترتيب الفرق التراكمي وأعلى 10 متسابقين بعد السؤال ${activeSession.currentQuestionIndex + 1}`
                        : `لوحة شرف هذا السؤال والترتيب التراكمي (Top 10)`}
                    </h2>
                    <p className="text-xs text-white/70">تضاف نقاط هذا السؤال مباشرة إلى المجموع التراكمي السابق</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAnalyticsQuiz(selectedQuiz)}
                    className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-amber-300 border border-amber-400/30 font-black text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    <span>فحص إجابات المشاركين 📋</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 text-white font-black text-xs transition shadow-xl flex items-center gap-2 cursor-pointer"
                  >
                    <span>{activeSession.currentQuestionIndex + 1 >= selectedQuiz.questions.length ? 'منصة التتويج النهائية 🏆' : 'السؤال التالي ➡️'}</span>
                  </button>
                </div>
              </div>

              {/* Cumulative Team Standings after EVERY question if Team Mode is active */}
              {activeSession.gameMode === 'team' && activeSession.teams && (
                <div className="max-w-4xl mx-auto bg-white/5 p-5 rounded-3xl border border-amber-400/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm md:text-base font-black text-amber-300 flex items-center gap-2">
                      <span>🛡️ لوحة صدارة الفرق التراكمية (مجموع نقاط أعضاء كل فريق)</span>
                    </h3>
                    <span className="text-[11px] text-emerald-300 font-bold bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                      تحديث تلقائي بعد كل سؤال ⚡
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {Object.values(activeSession.teams)
                      .sort((a, b) => b.score - a.score)
                      .map((team, idx) => {
                        const rank = idx + 1;
                        const prevRank = team.previousRank || rank;
                        const teamDelta = prevRank - rank;
                        const teamMembersCount = Object.values(activeSession.players).filter(p => p.teamId === team.id).length;
                        return (
                          <div
                            key={team.id}
                            className={`flex items-center justify-between px-5 py-3.5 rounded-2xl border transition-all ${
                              rank === 1
                                ? 'bg-gradient-to-r from-amber-500/25 to-yellow-500/15 border-amber-400 shadow-lg'
                                : 'bg-black/40 border-white/15'
                            }`}
                          >
                            <div className="flex items-center gap-3.5">
                              <span
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                                  rank === 1
                                    ? 'bg-amber-400 text-slate-950'
                                    : rank === 2
                                    ? 'bg-slate-300 text-slate-950'
                                    : rank === 3
                                    ? 'bg-amber-700 text-white'
                                    : 'bg-white/10 text-white'
                                }`}
                              >
                                #{rank}
                              </span>
                              <div className="text-right">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-black text-base text-white">{team.name}</span>
                                  <span className="text-[10px] bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">
                                    {teamMembersCount} عضو
                                  </span>
                                  {teamDelta > 0 && (
                                    <span className="text-[10px] bg-emerald-500/25 text-emerald-300 px-2 py-0.5 rounded-full font-black border border-emerald-400/40">
                                      🔺 صعد +{teamDelta} للمركز #{rank}
                                    </span>
                                  )}
                                  {teamDelta < 0 && (
                                    <span className="text-[10px] bg-red-500/25 text-red-300 px-2 py-0.5 rounded-full font-black border border-red-400/40">
                                      🔻 تراجع {teamDelta} للمركز #{rank}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-emerald-300 font-bold">
                                  +{team.lastQuestionPoints || 0} نقطة مضافة في هذا السؤال
                                </span>
                              </div>
                            </div>
                            <div className="text-left font-mono">
                              <span className="text-xl font-black text-amber-300">{team.score.toLocaleString('ar-EG')}</span>
                              <span className="text-[10px] text-white/60 block">مجموع نقاط الفريق</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Dynamic Animated Individual Top 10 Leaderboard */}
              <div className="space-y-3 max-w-3xl mx-auto">
                <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                  <h4 className="text-xs md:text-sm font-black text-amber-300">
                    🏆 أعلى 10 متسابقين في الترتيب التراكمي المتحرك (Dynamic Top 10):
                  </h4>
                  <span className="text-[11px] text-emerald-300 font-bold bg-emerald-500/15 px-3 py-0.5 rounded-full border border-emerald-400/30">
                    ✨ صعود وهبوط تلقائي للمراكز حسب النقاط والسرعة
                  </span>
                </div>
                {renderDynamicAnimatedTop10Board(activeSession, selectedQuiz, true)}
              </div>
            </div>
          )}

          {/* ----------------------------------------------------
              STAGE E: GRAND FINAL PODIUM & CELEBRATION
              ---------------------------------------------------- */}
          {activeSession.status === 'podium' && (
            <div className="bg-black/50 backdrop-blur-md rounded-3xl p-8 border border-white/20 text-center space-y-8 animate-fadeIn">
              <span className="text-6xl block animate-bounce">🏆🎉</span>
              <h2 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-200 to-yellow-400">
                منصة التتويج النهائية (Final Podium)
              </h2>

              {/* Final Teams Standings if Team Mode */}
              {activeSession.gameMode === 'team' && activeSession.teams && (
                <div className="max-w-3xl mx-auto bg-white/5 p-5 rounded-3xl border border-amber-400/40 space-y-3 text-right">
                  <h3 className="text-base font-black text-amber-300 text-center">
                    🛡️ الترتيب النهائي للفرق المتنافسة
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.values(activeSession.teams)
                      .sort((a, b) => b.score - a.score)
                      .map((team, idx) => (
                        <div
                          key={team.id}
                          className={`p-4 rounded-2xl border text-center space-y-1 ${
                            idx === 0
                              ? 'bg-gradient-to-b from-amber-400/30 to-amber-600/20 border-amber-300 shadow-xl'
                              : 'bg-black/40 border-white/15'
                          }`}
                        >
                          <span className="text-xs font-black text-amber-300 block">
                            {idx === 0 ? '🥇 الفريق البطل (#1)' : `المركز #${idx + 1}`}
                          </span>
                          <span className="font-black text-base text-white block">{team.name}</span>
                          <span className="font-mono text-xl font-black text-emerald-300 block">
                            {team.score.toLocaleString('ar-EG')} نقطة
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 3 Steps Podium */}
              <div className="flex items-end justify-center gap-3 md:gap-6 pt-10 pb-4 max-w-2xl mx-auto">
                {/* 2nd Place */}
                <div className="flex-1 text-center space-y-2">
                  <div className="w-16 h-16 rounded-full overflow-hidden mx-auto border-2 border-slate-300 shadow-xl bg-slate-300/30 flex items-center justify-center font-black text-xl">
                    {perQuestionTop10[1]?.player.avatar ? (
                      <img src={perQuestionTop10[1].player.avatar} alt="المركز الثاني" className="w-full h-full object-cover" />
                    ) : (
                      <span>{perQuestionTop10[1]?.player.name?.charAt(0) || '2'}</span>
                    )}
                  </div>
                  <span className="font-bold text-xs text-white block truncate">{perQuestionTop10[1]?.player.name || 'المركز الثاني'}</span>
                  <div className="h-32 bg-gradient-to-t from-slate-600 to-slate-400 rounded-t-2xl flex flex-col justify-center items-center font-black">
                    <span className="text-2xl text-slate-950 font-mono">🥈 2</span>
                    <span className="text-xs text-slate-900">{perQuestionTop10[1]?.cumulativeScore || 0} نقطة</span>
                  </div>
                </div>

                {/* 1st Place */}
                <div className="flex-1 text-center space-y-2">
                  <span className="text-3xl block animate-pulse">👑</span>
                  <div className="w-20 h-20 rounded-full overflow-hidden mx-auto border-4 border-amber-300 shadow-2xl bg-amber-300/30 ring-4 ring-amber-400/40 flex items-center justify-center font-black text-2xl">
                    {perQuestionTop10[0]?.player.avatar ? (
                      <img src={perQuestionTop10[0].player.avatar} alt="المركز الأول" className="w-full h-full object-cover" />
                    ) : (
                      <span>{perQuestionTop10[0]?.player.name?.charAt(0) || '1'}</span>
                    )}
                  </div>
                  <span className="font-black text-sm text-amber-200 block truncate">{perQuestionTop10[0]?.player.name || 'البطل الأول'}</span>
                  <div className="h-44 bg-gradient-to-t from-amber-600 to-amber-300 rounded-t-2xl flex flex-col justify-center items-center font-black shadow-2xl">
                    <span className="text-3xl text-slate-950 font-mono">🥇 1</span>
                    <span className="text-xs text-slate-950 font-bold">{perQuestionTop10[0]?.cumulativeScore || 0} نقطة</span>
                  </div>
                </div>

                {/* 3rd Place */}
                <div className="flex-1 text-center space-y-2">
                  <div className="w-16 h-16 rounded-full overflow-hidden mx-auto border-2 border-amber-700 shadow-xl bg-amber-700/30 flex items-center justify-center font-black text-xl">
                    {perQuestionTop10[2]?.player.avatar ? (
                      <img src={perQuestionTop10[2].player.avatar} alt="المركز الثالث" className="w-full h-full object-cover" />
                    ) : (
                      <span>{perQuestionTop10[2]?.player.name?.charAt(0) || '3'}</span>
                    )}
                  </div>
                  <span className="font-bold text-xs text-white block truncate">{perQuestionTop10[2]?.player.name || 'المركز الثالث'}</span>
                  <div className="h-24 bg-gradient-to-t from-amber-900 to-amber-700 rounded-t-2xl flex flex-col justify-center items-center font-black">
                    <span className="text-2xl text-amber-200 font-mono">🥉 3</span>
                    <span className="text-xs text-amber-200">{perQuestionTop10[2]?.cumulativeScore || 0} نقطة</span>
                  </div>
                </div>
              </div>

              {/* Complete Final Top 10 Table */}
              <div className="max-w-2xl mx-auto bg-white/5 p-4 rounded-2xl border border-white/10 text-right space-y-2">
                <h4 className="text-xs font-bold text-amber-300 border-b border-white/10 pb-2">
                  قائمة الـ Final Top 10 للمراكز العشرة الأولى (اضغط على أي مشارك لفحص إجاباته):
                </h4>
                <div className="space-y-1.5 text-xs">
                  {perQuestionTop10.map(({ player, cumulativeScore }) => (
                    <div key={player.id} className="flex items-center justify-between py-1.5 px-2 rounded-xl hover:bg-white/10 border-b border-white/5 last:border-b-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white">{player.currentRank}. {player.name}</span>
                        {player.teamName && (
                          <span className="text-[10px] bg-purple-500/30 text-purple-200 px-2 py-0.5 rounded-full">
                            {player.teamName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-300">{cumulativeScore} نقطة</span>
                        <button
                          type="button"
                          onClick={() => handleInspectLiveParticipant(selectedQuiz, activeSession, player)}
                          className="px-2 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400 text-amber-300 hover:text-slate-950 font-black text-[10px] transition cursor-pointer"
                        >
                          إجاباته 👁️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions: Inspect All, Save/Export & Close */}
              <div className="flex items-center justify-center gap-3 pt-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAnalyticsQuiz(selectedQuiz)}
                  className="px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition border border-purple-400/40 flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <BarChart3 className="w-4 h-4 text-amber-300" />
                  <span>عرض نتائج وإجابات كل المشاركين بالتفصيل 📋</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportAnalytics(selectedQuiz, 'xlsx')}
                  className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition border border-emerald-400/40 flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>تصدير النتائج Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const text = `نتائج مسابقة: ${selectedQuiz.title}\n` + perQuestionTop10.map(p => `${p.player.currentRank}. ${p.player.name} - ${p.cumulativeScore} نقطة`).join('\n');
                    navigator.clipboard.writeText(text).catch(() => {});
                    setShareToastMessage('✅ تم نسخ النتائج الكاملة للمتسابقين بنجاح!');
                    setTimeout(() => setShareToastMessage(null), 4000);
                  }}
                  className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition border border-white/20 flex items-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-emerald-400" />
                  <span>نسخ سجل التكريم</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (activeSession) {
                      storageService.endKahootSession(activeSession.id);
                    }
                    setActiveSession(null);
                    setActiveViewMode('manager');
                  }}
                  className="px-8 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm transition cursor-pointer shadow-xl"
                >
                  العودة لقائمة المسابقات 🏠
                </button>
              </div>

            </div>
          )}

        </div>
      )}

      {/* ========================================================
          VIEW 2: MAIN DASHBOARD, KPI STATS, QUIZZES & QUESTION BANK
          ======================================================== */}
      {activeViewMode === 'manager' && (
        <div className="space-y-6 relative z-10">
          
          {/* Top Bar Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-3xl font-black bg-gradient-to-r from-red-400 via-amber-300 to-emerald-400 bg-clip-text text-transparent">
                  «🔥 مسابقات الثلاثة فتية 🔥»
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-bold">
                  منصة المسابقات والاختبارات التفاعلية
                </span>
              </div>
              <p className="text-xs text-white/70 mt-1">
                نظام متكامل للمسابقات المباشرة، التحدي الفردي، مسابقات الفرق، بنك الأسئلة الكنسي، والتحليلات الفورية
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {isSeniorAdmin && (
                <div className="flex items-center bg-black/40 p-1 rounded-2xl border border-white/15 flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setManagerTab('quizzes')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      managerTab === 'quizzes' ? 'bg-amber-400 text-slate-950 shadow' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>المسابقات النشطة ({dashboardStats.totalQuizzes})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setManagerTab('archived')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      managerTab === 'archived' ? 'bg-amber-400 text-slate-950 shadow' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    <span>📦</span>
                    <span>الأرشيف ({dashboardStats.archivedCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setManagerTab('question_bank')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      managerTab === 'question_bank' ? 'bg-amber-400 text-slate-950 shadow' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>بنك الأسئلة ({questionBank.length})</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setActiveViewMode('player_gamepad')}
                className="px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition border border-white/20 flex items-center gap-1.5 cursor-pointer"
                title="الانتقال لشاشة المتسابق للمشاركة بالهاتف"
              >
                <Gamepad2 className="w-4 h-4 text-amber-300" />
                <span>شاشة المتسابق 📱</span>
              </button>

              {isSeniorAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedQuiz(null);
                    setEditTitle('');
                    setEditDesc('');
                    setEditCategory('الكتاب المقدس');
                    setEditAgeGroup('كل الأعمار');
                    setEditTagsInput('');
                    setEditStatus('published');
                    setEditGameMode('live');
                    setEditCoverImage('');
                    setEditMaxPlayers(0);
                    setEditIsVisibleToMembers(true);
                    setEditIsScheduled(false);
                    setEditAvailableFromDate('');
                    setEditAvailableToDate('');
                    setEditAvailableFromTime('');
                    setEditAvailableToTime('');
                    setEditAutoHideOnExpiry(true);
                    setAiCustomPrompt('');
                    setEditQuestions([]);
                    setIsCreatorOpen(true);
                    setCreationMethod('manual');
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 text-white font-black text-xs transition shadow-lg flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إنشاء مسابقة جديدة</span>
                </button>
              )}
            </div>
          </div>

          {/* 9 Real-Time KPI Stat Cards (For Leaders & Authorized Servants) */}
          {isSeniorAdmin && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/15">
                <span className="text-[11px] text-white/60 block font-bold">المسابقات النشطة (الأرشيف: {dashboardStats.archivedCount})</span>
                <span className="text-2xl font-mono font-black text-white">{dashboardStats.totalQuizzes}</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-emerald-400/25">
                <span className="text-[11px] text-emerald-300 block font-bold">المسابقات المنشورة</span>
                <span className="text-2xl font-mono font-black text-emerald-300">{dashboardStats.publishedCount}</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-red-400/30">
                <span className="text-[11px] text-red-300 block font-bold">مباشرة الآن 🔴</span>
                <span className="text-2xl font-mono font-black text-red-300">{dashboardStats.liveCount}</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-purple-400/25">
                <span className="text-[11px] text-purple-200 block font-bold">المسابقات المنتهية</span>
                <span className="text-2xl font-mono font-black text-purple-200">{dashboardStats.finishedCount}</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-amber-400/25">
                <span className="text-[11px] text-amber-300 block font-bold">إجمالي المشاركين</span>
                <span className="text-2xl font-mono font-black text-amber-300">{dashboardStats.totalParticipants}</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-cyan-400/25">
                <span className="text-[11px] text-cyan-300 block font-bold">النشطون حالياً 🟢</span>
                <span className="text-2xl font-mono font-black text-cyan-300">{dashboardStats.activePlayersNow}</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-teal-400/25">
                <span className="text-[11px] text-teal-300 block font-bold">متوسط الدقة 🎯</span>
                <span className="text-2xl font-mono font-black text-teal-300">{dashboardStats.avgAccuracy}%</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/15 col-span-1 sm:col-span-2 lg:col-span-1">
                <span className="text-[11px] text-amber-200/80 block font-bold">الأكثر مشاركة 🏆</span>
                <span className="text-xs font-black text-white truncate block mt-1">{dashboardStats.mostPopularQuiz}</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/15 col-span-2 sm:col-span-1">
                <span className="text-[11px] text-white/60 block font-bold">أحدث مسابقة ✨</span>
                <span className="text-xs font-black text-white truncate block mt-1">{dashboardStats.newestQuiz}</span>
              </div>
            </div>
          )}

          {/* Active Live Session Glowing Banner */}
          {activeSession && (
            <div className="bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-emerald-500/20 border-2 border-amber-400/50 rounded-3xl p-4 md:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl animate-fadeIn">
              <div className="flex items-center gap-3 text-right">
                <span className="text-3xl animate-bounce">🔥</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm md:text-base text-white">
                      توجد مسابقة نشطة حالياً برمز PIN ({activeSession.id})!
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <p className="text-xs text-white/70">
                    المشاركون المتصلون: {Object.keys(activeSession.players).length} لاعب • الحالة: {
                      activeSession.status === 'lobby' ? 'غرفة الانتظار (Lobby)'
                      : activeSession.status === 'question_active' ? 'سؤال نشط ⏱️'
                      : activeSession.status === 'answer_reveal' ? 'كشف الإجابة 🎉'
                      : activeSession.status === 'leaderboard' ? 'لوحة الشرف 🏆'
                      : activeSession.status === 'podium' ? 'منصة التتويج 🥇'
                      : activeSession.status
                    }
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {isSeniorAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      const quiz = quizzes.find(q => q.id === activeSession.quizId) || selectedQuiz || quizzes[0];
                      handleEnterLiveAsObserver(activeSession, quiz);
                    }}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Tv className="w-4 h-4 text-amber-300" />
                    <span>المتابعة كمراقب / مقدم 👁️📺</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleExplicitJoinLiveSession(activeSession)}
                  className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs transition shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Gamepad2 className="w-4 h-4" />
                  <span>انضمام كمتسابق 🎮</span>
                </button>
              </div>
            </div>
          )}

          {/* SUB-TAB 1 & ARCHIVE TAB: QUIZZES LIST WITH SEARCH, FILTER & SORT */}
          {(managerTab === 'quizzes' || managerTab === 'archived') && (
            <div className="space-y-5">
              {managerTab === 'archived' && (
                <div className="bg-amber-500/15 border border-amber-400/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black text-amber-300 flex items-center gap-2">
                      <span>📦</span>
                      <span>أرشيف المسابقات المحفوظة ببيانات المشاركين ({dashboardStats.archivedCount} مسابقة)</span>
                    </h4>
                    <p className="text-xs text-white/75 mt-1">
                      المسابقات في الأرشيف مخفية عن صفحات المخدومين، ولكن جميع بيانات المشاركين، النقاط، ولوحة الصدارة محفوظة بالكامل ويمكنك استعادتها في أي وقت. أما الحذف النهائي فيمسح المسابقة وبياناتها تماماً.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManagerTab('quizzes')}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 cursor-pointer shrink-0"
                  >
                    العودة للمسابقات النشطة ⬅
                  </button>
                </div>
              )}

              {/* Search, Filter & Sort Toolbar */}
              <div className="bg-black/35 backdrop-blur-md p-4 rounded-2xl border border-white/15 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="relative lg:col-span-2">
                  <Search className="w-4 h-4 text-white/50 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث باسم المسابقة، الوصف، أو الوسوم..."
                    className="w-full pr-10 pl-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs focus:outline-hidden focus:border-amber-400"
                  />
                </div>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-white/20 text-white text-xs font-bold"
                >
                  <option value="all">{managerTab === 'archived' ? 'كل المؤرشفة 📦' : 'كل الحالات النشطة'}</option>
                  <option value="published">منشورة ✅</option>
                  <option value="live">مباشرة الآن 🔴</option>
                  <option value="draft">مسودة 📝</option>
                  <option value="finished">منتهية 🏁</option>
                  <option value="archived">مؤرشفة 📦</option>
                </select>

                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-white/20 text-white text-xs font-bold"
                >
                  <option value="all">كل الفئات</option>
                  {QUIZ_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-white/20 text-white text-xs font-bold"
                >
                  <option value="newest">الترتيب: الأحدث أولاً</option>
                  <option value="most_participated">الأكثر مشاركة 👥</option>
                  <option value="most_used">الأكثر تشغيلاً ▶</option>
                  <option value="alphabetical">أبجدياً (أ - ي)</option>
                </select>
              </div>

              {/* Quizzes List Cards */}
              {filteredAndSortedQuizzes.length === 0 ? (
                <div className="bg-black/30 rounded-3xl p-10 text-center border border-white/10 space-y-2">
                  <span className="text-4xl block">{managerTab === 'archived' ? '📦' : '🔍'}</span>
                  <h4 className="font-black text-base text-white">
                    {managerTab === 'archived' ? 'لا توجد مسابقات في الأرشيف حالياً' : 'لا توجد مسابقات مطابقة للبحث أو الفلتر المحدد'}
                  </h4>
                  <p className="text-xs text-white/60">
                    {managerTab === 'archived'
                      ? 'يمكنك نقل أي مسابقة للأرشيف من خلال زر "أرشيف 📦" للاحتفاظ ببيانات المشاركين مع إخفائها عن المخدومين.'
                      : 'جرب تغيير الفلتر أو إنشاء مسابقة جديدة.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredAndSortedQuizzes.map((quiz) => {
                    const isLiveNow = activeSession && activeSession.quizId === quiz.id && activeSession.status !== 'finished';
                    const qStatus: KahootQuizStatus = isLiveNow ? 'live' : (quiz.status || 'published');
                    const statusBadge =
                      qStatus === 'live' ? { label: 'مباشرة الآن 🔴', cls: 'bg-red-500/30 text-red-200 border-red-400/50 animate-pulse' }
                      : qStatus === 'draft' ? { label: 'مسودة 📝', cls: 'bg-amber-500/25 text-amber-200 border-amber-400/40' }
                      : qStatus === 'finished' ? { label: 'منتهية 🏁', cls: 'bg-purple-500/25 text-purple-200 border-purple-400/40' }
                      : qStatus === 'archived' ? { label: 'مؤرشفة 📦', cls: 'bg-slate-500/30 text-slate-300 border-slate-400/40' }
                      : { label: 'منشورة ✅', cls: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40' };

                    const hasSelectedPlayMode = Boolean(isLiveNow || quiz.activePlayMode);
                    const activeMode = isLiveNow ? activeSession.gameMode : (quiz.activePlayMode || quiz.gameMode || 'self_paced');
                    const modeLabelBadge = !hasSelectedPlayMode
                      ? { text: '⏳ لم يُحدد وضع التشغيل بعد', cls: 'bg-slate-600/40 text-amber-200 border-amber-400/40' }
                      : activeMode === 'team' ? { text: '🛡️ وضع الفرق', cls: 'bg-blue-500/25 text-blue-200 border-blue-400/40' }
                      : activeMode === 'live' ? { text: '📺 تفاعل مباشر', cls: 'bg-amber-500/25 text-amber-200 border-amber-400/40' }
                      : activeMode === 'anonymous_poll' ? { text: '🕵️ تصويت سري', cls: 'bg-purple-500/25 text-purple-200 border-purple-400/40' }
                      : { text: '🎯 تحدي ذاتي', cls: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40' };

                    const userCanModify = canEditOrDeleteQuiz(quiz);

                    return (
                      <div
                        key={quiz.id}
                        className="bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-white/15 hover:border-amber-400/60 transition-all flex flex-col justify-between group shadow-xl"
                      >
                        <div className="space-y-3">
                          {quiz.coverImage && (
                            <div className="h-36 w-full rounded-2xl overflow-hidden border border-white/15 mb-2 relative">
                              <img src={quiz.coverImage} alt={quiz.title} className="w-full h-full object-cover" />
                              <span className={`absolute top-2 right-2 text-[10px] px-2.5 py-0.5 rounded-full font-black border backdrop-blur-md ${modeLabelBadge.cls}`}>
                                {modeLabelBadge.text}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${statusBadge.cls}`}>
                                {statusBadge.label}
                              </span>
                              {!quiz.coverImage && (
                                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border ${modeLabelBadge.cls}`}>
                                  {modeLabelBadge.text}
                                </span>
                              )}
                              <span className="text-[10px] bg-purple-500/30 text-purple-200 px-2.5 py-0.5 rounded-full font-bold border border-purple-400/30">
                                {quiz.questions.length} أسئلة
                              </span>
                              <span className="text-[10px] bg-cyan-500/20 text-cyan-200 px-2 py-0.5 rounded-full border border-cyan-400/30">
                                {quiz.category || 'الكتاب المقدس'}
                              </span>
                            </div>
                            <span className="text-[10px] text-white/60 font-mono">
                              {new Date(quiz.createdAt).toLocaleDateString('ar-EG')}
                            </span>
                          </div>

                          <h3 className="text-lg font-black text-white group-hover:text-amber-300 transition">
                            {quiz.title}
                          </h3>

                          <p className="text-xs text-white/70 line-clamp-2 leading-relaxed">
                            {quiz.description || 'مسابقة تفاعلية للاجتماع'}
                          </p>

                          {/* Schedule & Visibility Status Banner on Card */}
                          {(() => {
                            const schedEval = storageService.evaluateKahootQuizSchedule(quiz, nowTick);
                            return (
                              <div className="flex items-center justify-between gap-2 pt-1.5 flex-wrap">
                                <span
                                  className={`text-[10px] px-2.5 py-1 rounded-xl font-black border flex items-center gap-1 ${
                                    schedEval.available
                                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30'
                                      : schedEval.reason === 'expired'
                                      ? 'bg-rose-500/25 text-rose-200 border-rose-400/40'
                                      : schedEval.reason === 'not_started'
                                      ? 'bg-amber-500/25 text-amber-200 border-amber-400/40'
                                      : 'bg-slate-600/40 text-slate-200 border-slate-400/30'
                                  }`}
                                >
                                  <span>{schedEval.available ? '🟢' : schedEval.reason === 'expired' ? '⏰' : schedEval.reason === 'not_started' ? '⏳' : '🚫'}</span>
                                  <span>{schedEval.statusLabelAr}</span>
                                </span>

                                {(isSeniorAdmin || userCanModify) && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleQuizVisibility(quiz)}
                                    className={`px-2.5 py-1 rounded-xl text-[10px] font-black border transition cursor-pointer flex items-center gap-1 ${
                                      quiz.isVisibleToMembers === false
                                        ? 'bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 border-emerald-400/40'
                                        : 'bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border-rose-400/30'
                                    }`}
                                    title={quiz.isVisibleToMembers === false ? 'إظهار المسابقة للمخدومين' : 'إخفاء المسابقة عن المخدومين'}
                                  >
                                    <span>{quiz.isVisibleToMembers === false ? '👁️ إظهار للمخدومين' : '🚫 إخفاء عن المخدومين'}</span>
                                  </button>
                                )}
                              </div>
                            );
                          })()}

                          {/* Meta Info: Creator, Play Count, Participants */}
                          {(() => {
                            const soloQuizEntries = allSoloScores.filter(s => s.quizId === quiz.id);
                            const inProgressCount = soloQuizEntries.filter(s => s.status === 'in_progress').length;
                            const liveCountForQuiz = isLiveNow && activeSession ? Object.keys(activeSession.players || {}).length : 0;
                            const totalParts = Math.max(quiz.participantsCount || 0, soloQuizEntries.length, liveCountForQuiz);
                            return (
                              <div className="flex items-center justify-between text-[11px] text-white/70 pt-1 border-t border-white/10 flex-wrap gap-1">
                                <span>👤 {quiz.creatorName || 'خادم المسابقات'}</span>
                                <span className="font-bold text-amber-300">
                                  ▶ {quiz.playCount || 0} تشغيل • 👥 {totalParts} مشارك
                                  {inProgressCount > 0 ? ` (${inProgressCount} يحل الآن ⏳)` : ''}
                                </span>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Action Buttons: Join hidden until Play Mode is explicitly selected */}
                        <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
                          {!hasSelectedPlayMode ? (
                            <div className="space-y-2">
                              <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-200 text-[11px] font-bold text-center">
                                ⚠️ اختر وضع التشغيل أولاً ليظهر زر الانضمام للمشاركين
                              </div>
                              {(isSeniorAdmin || userCanModify) && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenLaunchModal(quiz)}
                                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 text-slate-950 font-black text-xs transition shadow-md flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                                >
                                  <Tv className="w-3.5 h-3.5" />
                                  <span>▶ تحديد وضع التشغيل وتفعيل الانضمام</span>
                                </button>
                              )}
                            </div>
                          ) : activeMode === 'self_paced' ? (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartSoloQuiz(quiz)}
                                className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 text-white font-black text-xs transition shadow-md flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>انضمام (تحدي ذاتي) 🚀</span>
                              </button>

                              {(isSeniorAdmin || userCanModify) && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenLaunchModal(quiz)}
                                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 text-white font-black text-xs transition shadow-md flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                                >
                                  <Tv className="w-3.5 h-3.5 text-amber-300" />
                                  <span>⚙️ تغيير وضع التشغيل</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isLiveNow && activeSession) {
                                      handleExplicitJoinLiveSession(activeSession);
                                    } else {
                                      const existingSess = quiz.activeSessionId ? storageService.getKahootSession(quiz.activeSessionId) : null;
                                      if (existingSess && existingSess.status !== 'finished') {
                                        handleExplicitJoinLiveSession(existingSess);
                                      } else {
                                        handleStartHosting(quiz, activeMode, quiz.teamAssignmentMode, quiz.customTeams, true);
                                      }
                                    }
                                  }}
                                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 text-slate-950 font-black text-xs transition shadow-md flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                                >
                                  <Gamepad2 className="w-3.5 h-3.5" />
                                  <span>انضمام كمتسابق 🎮</span>
                                </button>

                                {(isSeniorAdmin || userCanModify) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isLiveNow && activeSession) {
                                        handleEnterLiveAsObserver(activeSession, quiz);
                                      } else {
                                        const existingSess = quiz.activeSessionId ? storageService.getKahootSession(quiz.activeSessionId) : null;
                                        if (existingSess && existingSess.status !== 'finished') {
                                          handleEnterLiveAsObserver(existingSess, quiz);
                                        } else {
                                          handleStartHosting(quiz, activeMode, quiz.teamAssignmentMode, quiz.customTeams, false);
                                        }
                                      }
                                    }}
                                    className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 text-white font-black text-xs transition shadow-md flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                                  >
                                    <Tv className="w-3.5 h-3.5 text-amber-300" />
                                    <span>متابعة كمراقب 👁️📺</span>
                                  </button>
                                )}
                              </div>
                              {(isSeniorAdmin || userCanModify) && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenLaunchModal(quiz)}
                                  className="w-full py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-amber-200 font-bold text-[11px] transition border border-white/15 cursor-pointer"
                                >
                                  ⚙️ إعدادات الغرفة أو تغيير وضع التشغيل
                                </button>
                              )}
                            </div>
                          )}

                          {/* Secondary Action Bar: Preview, Results, Share, Duplicate, Archive, Edit, Delete */}
                          <div className="flex items-center justify-between gap-1.5 flex-wrap pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewQuiz(quiz);
                                setPreviewSlideIndex(0);
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition border border-white/15 flex items-center gap-1 cursor-pointer"
                              title="معاينة أسئلة المسابقة"
                            >
                              <Eye className="w-3.5 h-3.5 text-cyan-300" />
                              <span>معاينة</span>
                            </button>

                            {(isSeniorAdmin || userCanModify) && (
                              <button
                                type="button"
                                onClick={() => setAnalyticsQuiz(quiz)}
                                className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[11px] font-black transition border border-emerald-400/30 flex items-center gap-1 cursor-pointer"
                                title="متابعة تقدم المشاركين، الـ Top 10، والنتائج النهائية"
                              >
                                <BarChart3 className="w-3.5 h-3.5 text-emerald-300" />
                                <span>متابعة المشاركين والـ Top 10 📊</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleShareQuizLink(quiz)}
                              className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/30 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer"
                              title="نسخ رابط المسابقة"
                            >
                              <Share2 className="w-3.5 h-3.5 text-amber-300" />
                              <span>مشاركة</span>
                            </button>

                            {(isSeniorAdmin || userCanModify) && (
                              <button
                                type="button"
                                onClick={() => handleDuplicateQuiz(quiz)}
                                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition border border-white/15 cursor-pointer"
                                title="نسخ المسابقة (Duplicate)"
                              >
                                <Copy className="w-3.5 h-3.5 text-amber-300" />
                              </button>
                            )}

                            {userCanModify && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleArchiveQuiz(quiz, quiz.status !== 'archived')}
                                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black transition border flex items-center gap-1 cursor-pointer ${
                                    quiz.status === 'archived'
                                      ? 'bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 border-emerald-400/40'
                                      : 'bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border-amber-400/40'
                                  }`}
                                  title={quiz.status === 'archived' ? 'استعادة المسابقة من الأرشيف' : 'نقل المسابقة إلى الأرشيف مع حفظ جميع بيانات المشاركين'}
                                >
                                  <span>{quiz.status === 'archived' ? '♻️ استعادة' : '📦 أرشيف'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedQuiz(quiz);
                                    setEditTitle(quiz.title);
                                    setEditDesc(quiz.description || '');
                                    setEditCategory(quiz.category || 'الكتاب المقدس');
                                    setEditAgeGroup(quiz.ageGroup || 'كل الأعمار');
                                    setEditTagsInput((quiz.tags || []).join('، '));
                                    setEditStatus(quiz.status || 'published');
                                    setEditGameMode(quiz.gameMode || 'live');
                                    setEditTeamAssignmentMode(quiz.teamAssignmentMode || 'random');
                                    setEditCustomTeams(quiz.customTeams && quiz.customTeams.length >= 2 ? quiz.customTeams : DEFAULT_TEAM_CONFIGS.slice(0, 4));
                                    setEditCoverImage(quiz.coverImage || '');
                                    setEditMaxPlayers(quiz.maxPlayersLimit || 0);
                                    setEditIsVisibleToMembers(quiz.isVisibleToMembers !== false);
                                    setEditIsScheduled(!!quiz.isScheduled);
                                    setEditAvailableFromDate(quiz.availableFromDate || '');
                                    setEditAvailableToDate(quiz.availableToDate || '');
                                    setEditAvailableFromTime(quiz.availableFromTime || '');
                                    setEditAvailableToTime(quiz.availableToTime || '');
                                    setEditAutoHideOnExpiry(quiz.autoHideOnExpiry !== false);
                                    setAiCustomPrompt(quiz.customAiPrompt || '');
                                    setEditDetectTabSwitch(quiz.antiCheat.detectTabSwitch);
                                    setEditBlockAiAssist(quiz.antiCheat.blockAiAssist);
                                    if (quiz.settings) setEditSettings(quiz.settings);
                                    setEditQuestions(quiz.questions);
                                    setActiveEditingQuestionIndex(0);
                                    setIsCreatorOpen(true);
                                    setCreationMethod('manual');
                                  }}
                                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition border border-white/20 cursor-pointer"
                                  title="تعديل المسابقة"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setQuizToDelete(quiz)}
                                  className="p-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/40 text-red-200 transition border border-red-500/30 cursor-pointer"
                                  title="حذف المسابقة نهائياً مع مسح بياناتها"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 2: CENTRAL QUESTION BANK («🏦 بنك أسئلة الثلاثة فتية») */}
          {managerTab === 'question_bank' && isSeniorAdmin && (
            <div className="space-y-5 animate-fadeIn">
              <div className="bg-black/35 backdrop-blur-md p-5 rounded-3xl border border-white/15 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-amber-300 flex items-center gap-2">
                    <BookOpen className="w-5 h-5" />
                    <span>بنك أسئلة الثلاثة فتية المركزي ({questionBank.length} سؤال)</span>
                  </h3>
                  <p className="text-xs text-white/70 mt-1">
                    احفظ الأسئلة المميزة في البنك المركزي واستوردها بضغطة زر داخل أي مسابقة جديدة أو حالية.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                  <input
                    type="text"
                    value={bankSearchQuery}
                    onChange={(e) => setBankSearchQuery(e.target.value)}
                    placeholder="ابحث في بنك الأسئلة..."
                    className="flex-1 md:w-60 px-3.5 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs"
                  />
                  <select
                    value={bankFilterCategory}
                    onChange={(e) => setBankFilterCategory(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-white/20 text-white text-xs font-bold"
                  >
                    <option value="all">كل الفئات</option>
                    {QUIZ_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {questionBank.length === 0 ? (
                <div className="bg-black/30 rounded-3xl p-10 text-center border border-white/10 space-y-3">
                  <span className="text-4xl block">🏦</span>
                  <h4 className="font-black text-base text-white">بنك الأسئلة فارغ حالياً</h4>
                  <p className="text-xs text-white/60 max-w-md mx-auto">
                    أثناء إنشاء أو تعديل أي مسابقة، اضغط على زر «حفظ في بنك الأسئلة 🏦» بجانب أي سؤال لإضافته هنا.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {questionBank
                    .filter(item => {
                      if (bankFilterCategory !== 'all' && item.category !== bankFilterCategory) return false;
                      if (bankSearchQuery.trim()) {
                        const term = bankSearchQuery.toLowerCase();
                        return item.question.title.toLowerCase().includes(term) || item.category.toLowerCase().includes(term);
                      }
                      return true;
                    })
                    .map(item => (
                      <div key={item.id} className="bg-white/10 p-4 rounded-2xl border border-white/15 flex flex-col justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="bg-amber-400/20 text-amber-300 px-2.5 py-0.5 rounded-full font-bold border border-amber-400/30">
                              {item.category}
                            </span>
                            <span className="text-white/60 font-mono">بواسطة: {item.creatorName}</span>
                          </div>
                          <h4 className="font-black text-sm text-white">{item.question.title}</h4>
                          {item.question.biblicalReference && (
                            <span className="text-[11px] text-emerald-300 block">📖 {item.question.biblicalReference}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                          <span className="text-white/60 text-[11px]">نوع السؤال: {item.question.type}</span>
                          <button
                            type="button"
                            onClick={() => {
                              storageService.deleteKahootQuestionBankItem(item.id);
                              setQuestionBank(storageService.getKahootQuestionBank());
                            }}
                            className="text-red-300 hover:text-red-400 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ========================================================
          VIEW 2.5: PLAYER GAMEPAD & INTERACTIVE PARTICIPANT VIEW
          ======================================================== */}
      {activeViewMode === 'player_gamepad' && (
        <div className="space-y-6 relative z-10 animate-fadeIn">
          
          {/* Top Player Navigation Bar */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 md:p-4 border border-white/20 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl md:text-2xl font-black bg-gradient-to-r from-red-400 via-amber-300 to-emerald-400 bg-clip-text text-transparent">
                «مسابقات الثلاثة فتية»
              </span>
              <span className="text-xs bg-amber-400/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-400/30 font-bold">
                شاشة المتسابق 🎮
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {activeSession && (
                <>
                  <div className="bg-black/50 px-3 py-1 rounded-xl border border-white/20 text-xs">
                    <span className="text-white/70 ml-1">PIN:</span>
                    <span className="font-mono font-black text-amber-300">{activeSession.id}</span>
                  </div>
                  <div className="bg-amber-500/20 px-3 py-1 rounded-xl border border-amber-400/30 text-xs font-black text-amber-300">
                    ⭐ {activeSession.players[currentPlayerId]?.score || 0} نقطة
                  </div>
                  {(activeSession.players[currentPlayerId]?.streak || 0) > 0 && (
                    <div className="bg-red-500/20 px-2.5 py-1 rounded-xl border border-red-500/30 text-xs font-black text-red-300 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5" />
                      <span>{activeSession.players[currentPlayerId]?.streak}</span>
                    </div>
                  )}
                </>
              )}

              {isSeniorAdmin && (
                <div className="flex items-center gap-2">
                  {activeSession && (
                    <button
                      type="button"
                      onClick={() => handleEnterLiveAsObserver(activeSession, selectedQuiz)}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition border border-purple-400 cursor-pointer"
                    >
                      المتابعة كمراقب / مقدم 👁️📺
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveViewMode('manager')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition border border-white/20 cursor-pointer"
                  >
                    لوحة الإدارة ⚙️
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active Live Competition Join Banner when user has NOT clicked Join yet */}
          {activeSession && activeSession.status !== 'finished' && !isJoinedAsPlayerInActiveSession && (
            <div className="max-w-3xl mx-auto bg-gradient-to-r from-amber-500/25 via-purple-600/25 to-emerald-500/25 backdrop-blur-md rounded-3xl p-6 md:p-8 border-2 border-amber-400/70 shadow-2xl space-y-5 text-center animate-fadeIn">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/30 border border-red-400/50 text-red-200 text-xs font-black animate-pulse">
                <span>🔴 مسابقة تفاعلية مباشرة متاحة الآن للانضمام!</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-white">
                {activeSession.quizTitle}
              </h3>
              <div className="inline-flex items-center gap-3 bg-black/50 px-5 py-2.5 rounded-2xl border border-white/15 text-xs md:text-sm font-black text-emerald-300">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>عدد المشاركين في المسابقة الآن: {Object.keys(activeSession.players || {}).length} مشارك</span>
              </div>
              <p className="text-xs text-white/80 max-w-lg mx-auto leading-relaxed">
                اضغط على زر «انضمام للمسابقة المباشرة» بالأسفل للدخول إلى غرفة الانتظار، وستبدأ المسابقة عند جميع المشاركين في نفس اللحظة فور إطلاقها من الخادم المسؤول!
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleExplicitJoinLiveSession(activeSession)}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-500 text-slate-950 font-black text-base shadow-2xl flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition"
                >
                  <Gamepad2 className="w-5 h-5" />
                  <span>انضمام للمسابقة المباشرة الآن 🚀</span>
                </button>
                {isSeniorAdmin && (
                  <button
                    type="button"
                    onClick={() => handleEnterLiveAsObserver(activeSession, selectedQuiz)}
                    className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black text-sm border border-purple-400/50 shadow-xl flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition"
                  >
                    <Tv className="w-5 h-5 text-amber-300" />
                    <span>المتابعة كمراقب / مقدم (بدون مشاركة) 👁️📺</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* When User Has Not Joined an Active Live Session Yet: PIN Entry Bar + Available Quizzes */}
          {(!activeSession || !isJoinedAsPlayerInActiveSession) && (
            <>
              {/* Direct Room or Team PIN Entry Card */}
              <div className="max-w-xl mx-auto bg-black/45 backdrop-blur-md rounded-3xl p-5 md:p-6 border border-amber-400/30 shadow-2xl space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm md:text-base font-black text-white">انضم إلى غرفة مسابقة مباشرة أو فريق برمز الـ PIN</h3>
                  </div>
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                    PIN الغرفة أو PIN الفريق ⚡
                  </span>
                </div>
                <p className="text-xs text-white/75">
                  أدخل رمز الغرفة (6 أرقام) للانضمام العام، أو أدخل <span className="text-amber-300 font-bold">رمز الـ PIN الخاص بفريقك</span> لتدخل مباشرة في فريقك مع مجموعتك!
                </p>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={inputJoinPin}
                    onChange={(e) => setInputJoinPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="أدخل PIN الغرفة أو PIN الفريق (6 أرقام)..."
                    className="flex-1 px-4 py-3 rounded-2xl bg-white/10 border border-white/25 text-white font-mono text-lg font-black text-center tracking-widest focus:outline-hidden focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleJoinByPin()}
                    disabled={inputJoinPin.trim().length < 4}
                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 text-slate-950 font-black text-xs shadow-lg disabled:opacity-50 cursor-pointer transition"
                  >
                    انضمام للغرفة 🚀
                  </button>
                </div>
                {joinPinError && (
                  <p className="text-xs font-bold text-red-300 bg-red-500/20 px-3 py-2 rounded-xl border border-red-500/30 text-center">
                    {joinPinError}
                  </p>
                )}
              </div>

              {quizzes.filter(q => ((q.status || 'published') === 'published' || q.status === 'live') && storageService.isKahootQuizAvailableForMembers(q, nowTick)).length === 0 ? (
                <div className="max-w-xl mx-auto bg-black/40 backdrop-blur-md rounded-3xl p-8 md:p-12 border border-white/20 text-center space-y-4 shadow-2xl my-8">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-300 flex items-center justify-center mx-auto text-4xl shadow-inner">
                    ⏳
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-bold">
                    <span>مسابقات شباب الثلاثة فتية</span>
                  </div>
                  <h3 className="text-2xl font-black text-white">لا توجد أي مسابقات متاحة حالياً</h3>
                  <p className="text-xs md:text-sm text-white/70 max-w-md mx-auto leading-relaxed">
                    لا توجد أي مسابقات مفتوحة في هذا التوقيت. سيتم فتح المسابقات الجديدة في مواعيدها المحددة من قبل الخدام!
                  </p>
                </div>
              ) : (
                /* Available Quizzes Section in Player Screen (with Cover Images & Active Mode Badges) */
                <div className="max-w-4xl mx-auto space-y-4 my-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-amber-400 fill-current" />
                      <h3 className="text-lg md:text-xl font-black text-white">
                        المسابقات المتاحة للمشاركة والتحدي
                      </h3>
                    </div>
                    <span className="text-xs text-amber-200/80 font-bold bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/20">
                      🎯 انضم للمسابقة بعد تحديد وضع التشغيل من الخادم
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {quizzes.filter(q => ((q.status || 'published') === 'published' || q.status === 'live') && storageService.isKahootQuizAvailableForMembers(q, nowTick)).map((quiz) => {
                      const isQuizLiveNow = Boolean(activeSession && activeSession.quizId === quiz.id && activeSession.status !== 'finished');
                      const hasLiveRoom = Boolean(isQuizLiveNow || quiz.activeSessionId);
                      const hasChosenMode = Boolean(isQuizLiveNow || quiz.activePlayMode || hasLiveRoom);
                      const activeMode = isQuizLiveNow && activeSession ? activeSession.gameMode : (quiz.activePlayMode || quiz.gameMode || 'self_paced');
                      return (
                        <div
                          key={quiz.id}
                          className="bg-black/45 backdrop-blur-md rounded-3xl overflow-hidden border border-white/15 hover:border-amber-400/60 transition flex flex-col justify-between shadow-xl group"
                        >
                          {quiz.coverImage && (
                            <div className="h-44 w-full overflow-hidden relative border-b border-white/10">
                              <img
                                src={quiz.coverImage}
                                alt={quiz.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                              <span className={`absolute top-3 right-3 text-[11px] px-3 py-1 rounded-full font-black border backdrop-blur-md ${
                                !hasChosenMode
                                  ? 'bg-slate-700/85 text-amber-200 border-amber-400/40'
                                  : activeMode === 'team'
                                  ? 'bg-blue-500/80 text-white border-blue-300'
                                  : activeMode === 'live'
                                  ? 'bg-red-500/80 text-white border-red-300 animate-pulse'
                                  : 'bg-emerald-500/80 text-white border-emerald-300'
                              }`}>
                                {!hasChosenMode
                                  ? '⏳ بانتظار تحديد وضع التشغيل'
                                  : activeMode === 'team'
                                  ? '🛡️ مسابقة فرق مباشرة'
                                  : activeMode === 'live'
                                  ? '🔴 مسابقة تفاعلية مباشرة'
                                  : '🎯 تحدي ذاتي متاح الآن'}
                              </span>
                            </div>
                          )}

                          <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs flex-wrap gap-1.5">
                                <span className="bg-purple-500/30 text-purple-200 px-2.5 py-0.5 rounded-full font-bold border border-purple-400/30">
                                  {quiz.questions.length} أسئلة
                                </span>
                                {quiz.category && (
                                  <span className="bg-blue-500/20 text-blue-200 px-2 py-0.5 rounded-full text-[10px] font-bold border border-blue-400/30">
                                    {quiz.category}
                                  </span>
                                )}
                                {!quiz.coverImage && (
                                  <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-black border border-emerald-400/30">
                                    {!hasChosenMode
                                      ? '⏳ لم يُحدد الوضع بعد'
                                      : activeMode === 'team'
                                      ? '🛡️ نظام الفرق'
                                      : activeMode === 'live'
                                      ? '📺 تفاعل مباشر'
                                      : '🎯 تحدي ذاتي'}
                                  </span>
                                )}
                                <span className="text-white/50 font-mono text-[11px]">
                                  {new Date(quiz.createdAt).toLocaleDateString('ar-EG')}
                                </span>
                              </div>
                              <h4 className="text-lg font-black text-white group-hover:text-amber-300 transition">{quiz.title}</h4>
                              <p className="text-xs text-white/70 line-clamp-2 leading-relaxed">
                                {quiz.description || 'مسابقة تفاعلية شيقة لشباب الثلاثة فتية'}
                              </p>
                            </div>

                            <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                              {!hasChosenMode ? (
                                <div className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-amber-200/90 text-xs font-bold text-center">
                                  ⏳ سيظهر زر الانضمام فور تحديد وضع التشغيل من الخادم المسؤول
                                </div>
                              ) : (activeMode === 'live' || activeMode === 'team' || activeMode === 'anonymous_poll') ? (
                                <div className="space-y-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isQuizLiveNow && activeSession) {
                                        handleExplicitJoinLiveSession(activeSession);
                                      } else if (quiz.activeSessionId) {
                                        handleJoinByPin(quiz.activeSessionId);
                                      } else if (isSeniorAdmin) {
                                        handleStartHosting(quiz, activeMode, quiz.teamAssignmentMode, quiz.customTeams, true);
                                      }
                                    }}
                                    disabled={!isQuizLiveNow && !quiz.activeSessionId && !isSeniorAdmin}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 text-slate-950 font-black text-xs transition shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                                  >
                                    <Gamepad2 className="w-4 h-4" />
                                    <span>
                                      {isQuizLiveNow || quiz.activeSessionId
                                        ? 'انضمام للمسابقة المباشرة الآن 🚀'
                                        : isSeniorAdmin
                                        ? 'إطلاق الغرفة والانضمام كمتسابق 🎮'
                                        : '⏳ بانتظار فتح غرفة الانتظار من الخادم'}
                                    </span>
                                  </button>
                                  {isSeniorAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isQuizLiveNow && activeSession) {
                                          handleEnterLiveAsObserver(activeSession, quiz);
                                        } else {
                                          handleStartHosting(quiz, activeMode, quiz.teamAssignmentMode, quiz.customTeams, false);
                                        }
                                      }}
                                      className="w-full py-2.5 rounded-xl bg-purple-600/80 hover:bg-purple-600 text-white font-black text-xs border border-purple-400/40 transition flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                      <Tv className="w-4 h-4 text-amber-300" />
                                      <span>المتابعة كمراقب / مقدم 👁️📺</span>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleStartSoloQuiz(quiz)}
                                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 text-white font-black text-xs transition shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                                  >
                                    <Play className="w-4 h-4 fill-current" />
                                    <span>انضمام للتحدي الذاتي 🚀</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleShareQuizLink(quiz)}
                                    className="py-3 px-3.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/30 font-bold text-xs transition flex items-center justify-center gap-1 cursor-pointer"
                                    title="نسخ ومشاركة رابط المسابقة المخصص"
                                  >
                                    <Share2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* When Active Session Exists AND Participant Has Explicitly Clicked Join */}
          {activeSession && isJoinedAsPlayerInActiveSession && (() => {
            const myPlayer = activeSession.players[currentPlayerId];
            const myScore = myPlayer?.score || 0;
            const myRank = myPlayer?.currentRank || 1;
            const sessionQuiz = quizzes.find(q => q.id === activeSession.quizId) || selectedQuiz || quizzes[0];
            const curQ = sessionQuiz?.questions[activeSession.currentQuestionIndex];
            const currentQuestionKey = `${activeSession.id}_${activeSession.currentQuestionIndex}`;
            const hasSubmitted =
              lockedSubmittedQuestionKeyRef.current === currentQuestionKey ||
              hasSubmittedCurrentQuestion ||
              Boolean(curQ && activeSession.answersSubmitted?.[`${currentPlayerId}_${curQ.id}`]);
            const showPostAnswerFlow =
              hasSubmitted ||
              playerPostAnswerStage !== 'none' ||
              activeSession.status === 'answer_reveal' ||
              activeSession.status === 'leaderboard';
            const totalParticipantsInRoom = Object.keys(activeSession.players || {}).length;

            return (
              <div className="space-y-6">
                
                {/* 1. CLEAN WAITING ROOM (LOBBY STAGE) — Shows ONLY Total Participants Count in this Competition */}
                {activeSession.status === 'lobby' && (
                  <div className="max-w-lg mx-auto bg-black/50 backdrop-blur-md rounded-3xl p-8 md:p-10 border-2 border-emerald-400/40 text-center space-y-6 shadow-2xl animate-fadeIn">
                    <div className="relative inline-block">
                      <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 border-2 border-emerald-400/50 flex items-center justify-center mx-auto text-4xl shadow-lg">
                        ⏳
                      </div>
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full animate-ping" />
                    </div>

                    <div className="space-y-2">
                      <span className="inline-block px-4 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black">
                        غرفة انتظار المسابقة المباشرة ✔️
                      </span>
                      <h3 className="text-xl md:text-2xl font-black text-white">
                        {activeSession.quizTitle}
                      </h3>
                      <p className="text-xs text-white/75 leading-relaxed">
                        تم تسجيل انضمامك بنجاح! ستفتح المسابقة وتظهر الأسئلة تلقائياً عند جميع المشاركين في نفس اللحظة فور ضغط الخادم المسؤول على «بدء المسابقة».
                      </p>
                    </div>

                    {/* ONLY Participant Count Box as requested */}
                    <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/10 p-6 rounded-3xl border-2 border-emerald-400/40 shadow-inner space-y-1">
                      <span className="text-xs font-bold text-emerald-200 block">
                        عدد المشاركين المنضمين في هذه المسابقة الآن
                      </span>
                      <div className="text-4xl md:text-5xl font-mono font-black text-amber-300">
                        {totalParticipantsInRoom}
                      </div>
                      <span className="text-[11px] text-white/70 block font-bold">
                        مشارك في غرفة الانتظار 👥
                      </span>
                    </div>

                    {/* Manual Team Selection inside Lobby if Team Mode allows manual selection */}
                    {activeSession.gameMode === 'team' && activeSession.teams && activeSession.teamAssignmentMode === 'manual_or_pin' && (
                      <div className="bg-blue-950/40 p-4 rounded-2xl border border-blue-400/30 space-y-3 text-right">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-blue-300">🛡️ اختر فريقك:</span>
                          <span className="text-[10px] text-white/60">اضغط على الفريق للانضمام إليه</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {Object.values(activeSession.teams).map((t) => {
                            const isMyTeam = myPlayer?.teamId === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  const updated = storageService.changePlayerTeamInKahootSession(activeSession.id, currentPlayerId, t.id);
                                  if (updated) setActiveSession({ ...updated });
                                }}
                                className={`p-3 rounded-xl border text-right transition flex items-center justify-between cursor-pointer ${
                                  isMyTeam
                                    ? 'bg-blue-500/30 border-amber-400 ring-2 ring-amber-400/40 text-white'
                                    : 'bg-white/5 hover:bg-white/10 border-white/15 text-white/80'
                                }`}
                              >
                                <span className="font-black text-xs block">{t.name}</span>
                                <span className="text-[11px] bg-black/40 px-2 py-0.5 rounded-full font-mono text-emerald-300">
                                  {Object.values(activeSession.players).filter(p => p.teamId === t.id).length} {isMyTeam ? '✔️' : ''}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. QUESTION ACTIVE STAGE (Only shown when player has NOT submitted yet) */}
                {activeSession.status === 'question_active' && curQ && !showPostAnswerFlow && (
                  <div className="space-y-5 max-w-4xl mx-auto">
                    
                    {/* Header Progress & Countdown Bar */}
                    <div className="bg-black/40 p-4 rounded-2xl border border-white/15 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-white/80">
                        <span>السؤال {activeSession.currentQuestionIndex + 1} من {sessionQuiz.questions.length}</span>
                        <span className="bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/30 text-[10px]">
                          {curQ.pointsMultiplier === 2 ? 'نقاط مضاعفة 🔥' : curQ.pointsMultiplier === 0 ? 'رأي 💬' : '1000 نقطة ⭐'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                        <span className="font-mono text-xl font-black text-amber-300">
                          {timeRemaining} ث
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-amber-400 to-red-500 h-full transition-all duration-1000"
                        style={{ width: `${Math.max(0, Math.min(100, (timeRemaining / (curQ.timeLimitSeconds || 20)) * 100))}%` }}
                      />
                    </div>

                    {/* MODE A: SEPARATE DISPLAY SCREEN MODE (GAMEPAD CONTROLLER) */}
                    {activeSession.secondScreenMode ? (
                      <div className="space-y-4">
                        <div className="bg-purple-950/70 border-2 border-purple-400/50 p-4 rounded-2xl text-center space-y-1">
                          <span className="text-xs font-black text-amber-300 block">
                            👀 انظر إلى شاشة العرض الكبرى (البروجكتور) في القاعة!
                          </span>
                          <p className="text-[11px] text-white/80">
                            اقرأ السؤال والخيارات على الشاشة الرئيسية ثم اضغط الرمز المطابق أدناه:
                          </p>
                        </div>

                        {/* 4 Massive Touchpad Buttons */}
                        <div className="grid grid-cols-2 gap-4 h-[55vh] min-h-[360px]">
                          <button
                            type="button"
                            onClick={() => {
                              const opt = curQ.options?.[0];
                              handlePlayerAnswerSubmit(opt?.id || 'opt_0', opt?.isCorrect || false);
                            }}
                            className="rounded-3xl bg-gradient-to-br from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 active:scale-95 border-4 border-red-300/40 shadow-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition text-white"
                          >
                            <span className="text-5xl md:text-6xl font-black">▲</span>
                            <span className="text-sm md:text-base font-black tracking-wide">مثلث</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const opt = curQ.options?.[1];
                              handlePlayerAnswerSubmit(opt?.id || 'opt_1', opt?.isCorrect || false);
                            }}
                            className="rounded-3xl bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 active:scale-95 border-4 border-blue-300/40 shadow-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition text-white"
                          >
                            <span className="text-5xl md:text-6xl font-black">◆</span>
                            <span className="text-sm md:text-base font-black tracking-wide">معين</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const opt = curQ.options?.[2];
                              handlePlayerAnswerSubmit(opt?.id || 'opt_2', opt?.isCorrect || false);
                            }}
                            className="rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 active:scale-95 border-4 border-amber-200/50 shadow-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition text-slate-950 font-black"
                          >
                            <span className="text-5xl md:text-6xl">●</span>
                            <span className="text-sm md:text-base tracking-wide">دائرة</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const opt = curQ.options?.[3];
                              handlePlayerAnswerSubmit(opt?.id || 'opt_3', opt?.isCorrect || false);
                            }}
                            className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 active:scale-95 border-4 border-emerald-300/40 shadow-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition text-white"
                          >
                            <span className="text-5xl md:text-6xl font-black">■</span>
                            <span className="text-sm md:text-base font-black tracking-wide">مربع</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* MODE B: INTEGRATED MOBILE SCREEN MODE */
                      <div className="space-y-4">
                        {/* Question Title Header */}
                        <div className="bg-black/40 p-5 rounded-2xl border border-white/20 text-center space-y-2">
                          <h3 className="text-lg md:text-xl font-black text-white leading-relaxed">
                            {curQ.title}
                          </h3>
                          {curQ.multiSelect && (
                            <span className="inline-block text-[11px] bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-400/30 font-bold">
                              ☑️ سؤال متعدد الاختيارات — اختر كل الإجابات الصحيحة ثم اضغط تأكيد
                            </span>
                          )}
                        </div>

                        {/* 1. Multiple Choice / Image Quiz / Audio Quiz / Poll */}
                        {(curQ.type === 'quiz' || curQ.type === 'image_quiz' || curQ.type === 'audio_quiz' || curQ.type === 'poll') && curQ.options && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {curQ.options.map((opt, idx) => {
                                const colors = [
                                  'from-red-600 to-red-700 hover:from-red-500 border-red-400',
                                  'from-blue-600 to-blue-700 hover:from-blue-500 border-blue-400',
                                  'from-amber-500 to-amber-600 hover:from-amber-400 border-amber-300 text-slate-950',
                                  'from-emerald-600 to-emerald-700 hover:from-emerald-500 border-emerald-400',
                                  'from-purple-600 to-purple-700 hover:from-purple-500 border-purple-400',
                                  'from-pink-600 to-pink-700 hover:from-pink-500 border-pink-400'
                                ];
                                const shapes = ['▲', '◆', '●', '■', '★', '✦'];
                                const isSelected = multiSelectedOptions.includes(opt.id);
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                      if (curQ.multiSelect) {
                                        setMultiSelectedOptions((prev: string[]) =>
                                          prev.includes(opt.id) ? prev.filter((i: string) => i !== opt.id) : [...prev, opt.id]
                                        );
                                      } else {
                                        handlePlayerAnswerSubmit(opt.id, opt.isCorrect || false);
                                      }
                                    }}
                                    className={`p-5 rounded-2xl bg-gradient-to-r ${colors[idx % colors.length]} border-2 font-black text-base flex items-center justify-between gap-3 shadow-lg active:scale-95 transition cursor-pointer text-right text-white ${
                                      isSelected ? 'ring-4 ring-white scale-[1.01]' : ''
                                    }`}
                                  >
                                    <span className="text-xl font-mono shrink-0 ml-1">{isSelected ? '☑️' : shapes[idx % shapes.length]}</span>
                                    {opt.imageUrl && (
                                      <img
                                        src={opt.imageUrl}
                                        alt={opt.text}
                                        className="w-14 h-14 rounded-xl object-cover border-2 border-white/40 shrink-0 shadow-md bg-black/20"
                                      />
                                    )}
                                    <span className="flex-1 leading-snug">{opt.text}</span>
                                  </button>
                                );
                              })}
                            </div>
                            {curQ.multiSelect && (
                              <button
                                type="button"
                                disabled={multiSelectedOptions.length === 0}
                                onClick={() => handleCheckMultiSelectAnswer(curQ, false)}
                                className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm shadow-xl disabled:opacity-50 cursor-pointer"
                              >
                                تأكيد الاختيارات ({multiSelectedOptions.length}) 🚀
                              </button>
                            )}
                          </div>
                        )}

                        {/* 2. True or False */}
                        {curQ.type === 'true_false' && (
                          <div className="grid grid-cols-2 gap-4">
                            <button
                              type="button"
                              onClick={() => {
                                const trueOpt = curQ.options?.find(o => o.id === 'opt_true' || o.text.includes('صح'));
                                handlePlayerAnswerSubmit(trueOpt?.id || 'true', trueOpt ? !!trueOpt.isCorrect : true);
                              }}
                              className="p-6 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 border-2 border-blue-400 text-white font-black text-xl flex items-center justify-center gap-2 shadow-xl active:scale-95 cursor-pointer"
                            >
                              <span>صح ✔️</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const falseOpt = curQ.options?.find(o => o.id === 'opt_false' || o.text.includes('خطأ'));
                                handlePlayerAnswerSubmit(falseOpt?.id || 'false', falseOpt ? !!falseOpt.isCorrect : false);
                              }}
                              className="p-6 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 border-2 border-red-400 text-white font-black text-xl flex items-center justify-center gap-2 shadow-xl active:scale-95 cursor-pointer"
                            >
                              <span>خطأ ❌</span>
                            </button>
                          </div>
                        )}

                        {/* 3. Type Answer */}
                        {curQ.type === 'type_answer' && (
                          <div className="bg-black/40 p-5 rounded-2xl border border-white/20 text-center space-y-3">
                            <input
                              type="text"
                              maxLength={40}
                              value={typeAnswerInput}
                              onChange={(e) => setTypeAnswerInput(e.target.value)}
                              placeholder="اكتب إجابتك هنا..."
                              className="w-full px-4 py-3 rounded-xl bg-white/10 border-2 border-white/30 text-white text-lg font-black text-center focus:outline-hidden focus:border-amber-400"
                            />
                            <button
                              type="button"
                              onClick={handleCheckTypeAnswer}
                              disabled={!typeAnswerInput.trim()}
                              className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm shadow-lg disabled:opacity-50 cursor-pointer"
                            >
                              تأكيد الإجابة 🚀
                            </button>
                          </div>
                        )}

                        {/* 4. Puzzle Ordering */}
                        {curQ.type === 'puzzle' && curQ.puzzleItems && (
                          <div className="bg-black/40 p-5 rounded-2xl border border-white/20 space-y-3">
                            <p className="text-xs text-white/70 text-center font-bold">
                              رتب العناصر بالترتيب الصحيح باستخدام الأسهم:
                            </p>
                            <div className="space-y-2">
                              {puzzleCurrentOrder.map((itemId, idx) => {
                                const item = curQ.puzzleItems?.find(p => p.id === itemId);
                                if (!item) return null;
                                return (
                                  <div key={item.id} className="bg-white/10 p-3 rounded-xl flex items-center justify-between text-xs font-bold">
                                    <span>{idx + 1}. {item.text}</span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (idx > 0) {
                                            const c = [...puzzleCurrentOrder];
                                            const tmp = c[idx];
                                            c[idx] = c[idx - 1];
                                            c[idx - 1] = tmp;
                                            setPuzzleCurrentOrder(c);
                                          }
                                        }}
                                        className="p-1 rounded bg-white/10 text-white"
                                      >
                                        ▲
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (idx < puzzleCurrentOrder.length - 1) {
                                            const c = [...puzzleCurrentOrder];
                                            const tmp = c[idx];
                                            c[idx] = c[idx + 1];
                                            c[idx + 1] = tmp;
                                            setPuzzleCurrentOrder(c);
                                          }
                                        }}
                                        className="p-1 rounded bg-white/10 text-white"
                                      >
                                        ▼
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={handleCheckPuzzleAnswer}
                              className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm cursor-pointer"
                            >
                              تأكيد الترتيب 🚀
                            </button>
                          </div>
                        )}

                        {/* 5. Slider */}
                        {curQ.type === 'slider' && (
                          <div className="bg-black/40 p-5 rounded-2xl border border-white/20 text-center space-y-4">
                            <div className="text-4xl font-mono font-black text-amber-300">
                              {sliderCurrentValue}
                            </div>
                            <input
                              type="range"
                              min={curQ.sliderMin || 0}
                              max={curQ.sliderMax || 100}
                              value={sliderCurrentValue}
                              onChange={(e) => setSliderCurrentValue(Number(e.target.value))}
                              className="w-full accent-amber-400 cursor-pointer"
                            />
                            <button
                              type="button"
                              onClick={handleCheckSliderAnswer}
                              className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm cursor-pointer"
                            >
                              تأكيد القيمة 🚀
                            </button>
                          </div>
                        )}

                        {/* 6. Matching Pairs */}
                        {curQ.type === 'matching' && curQ.matchingPairs && (
                          <div className="bg-black/40 p-5 rounded-2xl border border-white/20 space-y-3">
                            <p className="text-xs text-amber-300 text-center font-bold">
                              🔗 اختر الإجابة المطابقة لكل عنصر من القائمة:
                            </p>
                            <div className="space-y-2.5">
                              {curQ.matchingPairs.map((pair) => (
                                <div key={pair.id} className="bg-white/5 p-3 rounded-xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <span className="text-xs font-black text-white">{pair.leftText}</span>
                                  <select
                                    value={matchingUserSelections[pair.id] || ''}
                                    onChange={(e) => setMatchingUserSelections((prev: Record<string, string>) => ({ ...prev, [pair.id]: e.target.value }))}
                                    className="px-3 py-2 rounded-xl bg-slate-900 border border-amber-400/40 text-amber-300 text-xs font-bold"
                                  >
                                    <option value="">-- اختر المطابق --</option>
                                    {curQ.matchingPairs!.map((p) => (
                                      <option key={p.id} value={p.rightText}>{p.rightText}</option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCheckMatchingAnswer(curQ, false)}
                              className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm cursor-pointer"
                            >
                              تأكيد التوصيل 🚀
                            </button>
                          </div>
                        )}

                        {/* 7. Rating / Scale */}
                        {(curQ.type === 'rating' || curQ.type === 'scale') && (
                          <div className="bg-black/40 p-5 rounded-2xl border border-white/20 text-center space-y-4">
                            <div className="flex items-center justify-center gap-2 flex-wrap">
                              {Array.from({ length: curQ.scaleMax || 5 }, (_, i) => i + 1).map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => setSliderCurrentValue(val)}
                                  className={`w-12 h-12 rounded-2xl font-black text-base transition cursor-pointer border-2 ${
                                    sliderCurrentValue >= val
                                      ? 'bg-amber-400 text-slate-950 border-amber-200 scale-105'
                                      : 'bg-white/10 text-white border-white/20'
                                  }`}
                                >
                                  {curQ.type === 'rating' ? '⭐' : val}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => handlePlayerAnswerSubmit(sliderCurrentValue, true)}
                              className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm cursor-pointer"
                            >
                              إرسال التقييم ({sliderCurrentValue}) 🚀
                            </button>
                          </div>
                        )}

                        {/* 8. Word Cloud / Open Ended / Brainstorm */}
                        {(curQ.type === 'word_cloud' || curQ.type === 'open_ended' || curQ.type === 'brainstorm') && (
                          <div className="bg-black/40 p-5 rounded-2xl border border-white/20 space-y-3">
                            <input
                              type="text"
                              value={opinionInputText}
                              onChange={(e) => setOpinionInputText(e.target.value)}
                              placeholder="اكتب مشاركتك أو فكرتك هنا..."
                              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/25 text-white text-sm font-bold text-center"
                            />
                            <button
                              type="button"
                              disabled={!opinionInputText.trim()}
                              onClick={() => {
                                handlePlayerAnswerSubmit(opinionInputText.trim(), true);
                                setOpinionInputText('');
                              }}
                              className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm disabled:opacity-50 cursor-pointer"
                            >
                              إرسال المشاركة 💬
                            </button>
                          </div>
                        )}

                        {/* 9. Pin Answer / Drop Pin */}
                        {(curQ.type === 'pin_answer' || curQ.type === 'drop_pin') && (
                          <div className="bg-black/40 p-4 rounded-2xl border border-white/20 space-y-3 text-center">
                            <p className="text-xs text-amber-300 font-bold">
                              📍 اضغط على الصورة لتحديد موضع الدبوس ثم اضغط زر التأكيد:
                            </p>
                            <div
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const xPercent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                                const yPercent = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
                                setPinClickedCoords({ xPercent, yPercent });
                              }}
                              className="relative w-full h-64 md:h-72 rounded-2xl overflow-hidden border-2 border-amber-400/50 cursor-crosshair bg-slate-900 select-none shadow-xl"
                            >
                              <img
                                src={curQ.mediaUrl || 'https://images.unsplash.com/photo-1548625361-195977935bb8?w=900'}
                                alt="Pin Question"
                                className="w-full h-full object-contain bg-black/60"
                              />
                              {pinClickedCoords && (
                                <div
                                  className="absolute -translate-x-1/2 -translate-y-full pointer-events-none z-20 flex flex-col items-center"
                                  style={{ left: `${pinClickedCoords.xPercent}%`, top: `${pinClickedCoords.yPercent}%` }}
                                >
                                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] shadow mb-0.5 whitespace-nowrap">
                                    ({Math.round(pinClickedCoords.xPercent)}%, {Math.round(pinClickedCoords.yPercent)}%)
                                  </span>
                                  <span className="text-3xl drop-shadow-lg animate-bounce">📍</span>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={!pinClickedCoords}
                              onClick={() => {
                                if (!pinClickedCoords) return;
                                if (curQ.type === 'pin_answer') {
                                  const target = curQ.pinCoordinates || { xPercent: 50, yPercent: 50, tolerancePercent: 18 };
                                  const distance = Math.sqrt(
                                    Math.pow(pinClickedCoords.xPercent - target.xPercent, 2) +
                                    Math.pow(pinClickedCoords.yPercent - target.yPercent, 2)
                                  );
                                  const isInside = distance <= (target.tolerancePercent || 18);
                                  handlePlayerAnswerSubmit(pinClickedCoords, isInside);
                                } else {
                                  handlePlayerAnswerSubmit(pinClickedCoords, true);
                                }
                              }}
                              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 text-slate-950 font-black text-sm shadow-lg disabled:opacity-40 cursor-pointer transition"
                            >
                              {pinClickedCoords ? 'تأكيد وإرسال موضع الدبوس 📍🚀' : 'انقر على الصورة أولاً لوضع الدبوس 👆'}
                            </button>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )}

                {/* 3. POST-ANSWER IMMEDIATE SCORE SUMMARY (1.1s) -> DYNAMIC TOP 10 LEADERBOARD (NEVER WAITS FOR TIMER & NEVER REVERTS TO QUESTION) */}
                {showPostAnswerFlow && activeSession.status !== 'podium' && (
                  playerPostAnswerStage === 'score_summary' && activeSession.status === 'question_active' ? (
                    <div className="max-w-xl mx-auto bg-black/50 backdrop-blur-md rounded-3xl p-8 border-2 border-emerald-400/50 text-center space-y-5 animate-scaleIn shadow-2xl">
                      {playerFeedback?.isCorrect ? (
                        <>
                          <div className="text-6xl block animate-bounce">🎉</div>
                          <h3 className="text-2xl font-black text-emerald-400">
                            إجابة صحيحة يا بطل!
                          </h3>
                          <div className="inline-block bg-emerald-500/20 text-emerald-300 px-6 py-2.5 rounded-2xl border border-emerald-500/30 font-black text-xl">
                            +{playerFeedback.points} نقطة 🎯
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-6xl block animate-shake">⚡</div>
                          <h3 className="text-2xl font-black text-amber-300">
                            تم تسجيل إجابتك!
                          </h3>
                        </>
                      )}
                      <div className="bg-white/10 p-4 rounded-2xl border border-white/15 space-y-1">
                        <span className="text-xs text-white/70 block">مجموع نقاطك التراكمي الآن:</span>
                        <span className="text-2xl font-mono font-black text-amber-300">{myScore.toLocaleString('ar-EG')} نقطة</span>
                      </div>
                      <div className="inline-flex items-center gap-2 text-xs font-black text-emerald-300 animate-pulse">
                        <span>🚀 جاري الانتقال تلقائياً إلى لوحة النقاط والـ Top 10...</span>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-3xl mx-auto bg-black/45 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-white/20 space-y-6 animate-fadeIn shadow-2xl">
                      {/* Player Score & Status Header */}
                      <div className="text-center space-y-2.5 border-b border-white/10 pb-4">
                        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-black">
                          {activeSession.status === 'question_active' ? (
                            <span>⚡ لوحة الـ Top 10 المباشرة — تتحدث تلقائياً مع إجابات المتسابقين ({timeRemaining} ث متبقية للسؤال)</span>
                          ) : (
                            <span>🏆 الترتيب التراكمي بعد السؤال {activeSession.currentQuestionIndex + 1} — بانتظار السؤال التالي</span>
                          )}
                        </div>
                        <h3 className="text-xl md:text-2xl font-black text-white">
                          لوحة النقاط وأعلى 10 متسابقين (Top 10 Board)
                        </h3>
                        <div className="flex items-center justify-center gap-3 flex-wrap">
                          <div className="inline-flex items-center gap-3 bg-amber-400/20 text-amber-300 px-5 py-1.5 rounded-full border border-amber-400/30 text-sm font-black">
                            <span>مركزك الحالي: #{myRank} 🏆</span>
                            <span>•</span>
                            <span>مجموعك: {myScore.toLocaleString('ar-EG')} نقطة</span>
                          </div>
                          {playerFeedback && (
                            <span className={`px-3.5 py-1.5 rounded-full text-xs font-black border ${
                              playerFeedback.isCorrect
                                ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/40'
                                : 'bg-rose-500/25 text-rose-300 border-rose-400/40'
                            }`}>
                              {playerFeedback.isCorrect ? `✔️ +${playerFeedback.points} نقطة في هذا السؤال` : '❌ 0 نقطة في هذا السؤال'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Show Correct Answer Box once question time finishes or after submission if enabled */}
                      {curQ && (activeSession.status === 'answer_reveal' || activeSession.status === 'leaderboard') && (sessionQuiz?.settings?.showCorrectAnswers ?? true) && (
                        <div className="bg-emerald-950/40 p-4 rounded-2xl border border-emerald-400/30 text-xs text-white/85 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="text-emerald-300 font-black ml-2">✔️ الإجابة الصحيحة للسؤال:</span>
                            <span className="font-black text-amber-300 text-sm">{getCorrectAnswerLabelForQuestion(curQ)}</span>
                          </div>
                          {curQ.biblicalReference && (
                            <span className="text-amber-200 font-bold text-[11px]">📖 {curQ.biblicalReference}</span>
                          )}
                        </div>
                      )}

                      {/* Cumulative Teams Leaderboard (If Team Mode) */}
                      {activeSession.gameMode === 'team' && activeSession.teams && Object.keys(activeSession.teams).length > 0 && (
                        <div className="bg-blue-950/40 p-4 rounded-2xl border border-blue-400/30 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs md:text-sm font-black text-blue-300">🛡️ ترتيب الفرق التراكمي:</h4>
                            <span className="text-[10px] text-white/60">يتحدث تلقائياً</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {Object.values(activeSession.teams)
                              .sort((a, b) => b.score - a.score)
                              .map((t, tIdx) => {
                                const rankDiff = (t.previousRank || tIdx + 1) - (t.currentRank || tIdx + 1);
                                const isMyTeam = myPlayer?.teamId === t.id;
                                return (
                                  <div
                                    key={t.id}
                                    className={`p-3 rounded-xl border flex items-center justify-between ${
                                      isMyTeam ? 'bg-blue-500/25 border-amber-400 ring-2 ring-amber-400/40' : 'bg-white/5 border-white/10'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center">
                                        {tIdx + 1}
                                      </span>
                                      <div>
                                        <span className="font-black text-xs text-white block">
                                          {t.name} {isMyTeam ? '(فريقك)' : ''}
                                        </span>
                                        <span className="text-[10px] text-white/60">
                                          {Object.values(activeSession.players).filter(p => p.teamId === t.id).length} أعضاء
                                          {rankDiff > 0 ? ` • 🔺 صعد ${rankDiff}` : rankDiff < 0 ? ` • 🔻 تراجع ${Math.abs(rankDiff)}` : ''}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-left font-mono">
                                      <span className="text-sm font-black text-amber-300 block">{t.score.toLocaleString('ar-EG')}</span>
                                      {(t.lastQuestionPoints || 0) > 0 && (
                                        <span className="text-[10px] text-emerald-300 font-bold">+{t.lastQuestionPoints}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Dynamic Auto-Reordering Top 10 Players Leaderboard */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs md:text-sm font-black text-amber-300">🔥 قائمة أعلى 10 متسابقين (Dynamic Top 10):</span>
                          <span className="text-[11px] text-emerald-300 font-bold">تغير تلقائي للمراكز حسب النقاط والسرعة ⚡</span>
                        </div>
                        {renderDynamicAnimatedTop10Board(activeSession, sessionQuiz, false)}
                      </div>
                    </div>
                  )
                )}

                {/* 5. PODIUM STAGE (FINAL 3-TIER STAGE FOR TOP 3 + FINAL TOP 10 LIST FOR PLAYERS) */}
                {activeSession.status === 'podium' && (() => {
                  const finalSorted = Object.values(activeSession.players).sort((a, b) => b.score - a.score);
                  const first = finalSorted[0];
                  const second = finalSorted[1];
                  const third = finalSorted[2];
                  return (
                    <div className="max-w-3xl mx-auto bg-black/50 backdrop-blur-md rounded-3xl p-6 md:p-8 border-2 border-amber-400/40 text-center space-y-6 animate-scaleIn shadow-2xl">
                      <div className="space-y-2">
                        <div className="text-5xl block animate-bounce">🏆👑</div>
                        <h3 className="text-2xl md:text-3xl font-black text-amber-300">
                          منصة التتويج النهائية (Top 3) + قائمة الـ Top 10!
                        </h3>
                        <p className="text-xs text-white/80">
                          مركزك النهائي: <span className="text-amber-300 font-black">#{myRank}</span> • مجموع نقاطك: <span className="text-emerald-300 font-mono font-black">{myScore.toLocaleString('ar-EG')} نقطة</span>
                        </p>
                      </div>

                      {/* 3-Tier Visual Stage Podium for Top 3 */}
                      <div className="grid grid-cols-3 gap-3 items-end pt-6 max-w-xl mx-auto">
                        {/* 2nd Place */}
                        <div className="flex flex-col items-center space-y-2">
                          {second ? (
                            <>
                              <div className="text-xs font-black text-slate-200 truncate max-w-full">{second.name}</div>
                              <div className="text-[11px] font-mono text-amber-300 font-bold">{second.score.toLocaleString('ar-EG')}</div>
                              <div className="w-full h-24 rounded-t-2xl bg-gradient-to-t from-slate-600 to-slate-400 border-t-4 border-slate-200 flex flex-col items-center justify-center text-slate-950 font-black">
                                <span className="text-2xl">🥈</span>
                                <span className="text-xs">المركز 2</span>
                              </div>
                            </>
                          ) : <div className="h-24" />}
                        </div>

                        {/* 1st Place */}
                        <div className="flex flex-col items-center space-y-2">
                          {first ? (
                            <>
                              <Crown className="w-7 h-7 text-amber-400 animate-bounce" />
                              <div className="text-sm font-black text-amber-300 truncate max-w-full">{first.name}</div>
                              <div className="text-xs font-mono text-emerald-300 font-black">{first.score.toLocaleString('ar-EG')}</div>
                              <div className="w-full h-32 rounded-t-2xl bg-gradient-to-t from-amber-600 via-amber-400 to-yellow-300 border-t-4 border-white flex flex-col items-center justify-center text-slate-950 font-black shadow-xl">
                                <span className="text-3xl">🥇</span>
                                <span className="text-xs">البطل #1</span>
                              </div>
                            </>
                          ) : <div className="h-32" />}
                        </div>

                        {/* 3rd Place */}
                        <div className="flex flex-col items-center space-y-2">
                          {third ? (
                            <>
                              <div className="text-xs font-black text-amber-200 truncate max-w-full">{third.name}</div>
                              <div className="text-[11px] font-mono text-amber-300 font-bold">{third.score.toLocaleString('ar-EG')}</div>
                              <div className="w-full h-20 rounded-t-2xl bg-gradient-to-t from-amber-900 to-amber-700 border-t-4 border-amber-500 flex flex-col items-center justify-center text-white font-black">
                                <span className="text-2xl">🥉</span>
                                <span className="text-xs">المركز 3</span>
                              </div>
                            </>
                          ) : <div className="h-20" />}
                        </div>
                      </div>

                      {/* Final Top 10 List */}
                      <div className="bg-black/40 p-4 rounded-2xl border border-white/15 text-right space-y-2">
                        <h4 className="text-xs font-black text-amber-300">🏅 القائمة النهائية لأعلى 10 متسابقين (Top 10):</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {finalSorted.slice(0, 10).map((p, idx) => (
                            <div
                              key={p.id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                                p.id === currentPlayerId ? 'bg-amber-400/20 border-amber-400 font-black' : 'bg-white/5 border-white/10'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center font-mono text-[10px]">
                                  {idx + 1}
                                </span>
                                <span className="text-white truncate">{p.name} {p.id === currentPlayerId ? '(أنت)' : ''}</span>
                              </div>
                              <span className="font-mono text-amber-300 font-bold">{p.score.toLocaleString('ar-EG')}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveViewMode(isSeniorAdmin ? 'manager' : 'player_gamepad')}
                        className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition border border-white/20 cursor-pointer"
                      >
                        العودة للمسابقات 🏠
                      </button>
                    </div>
                  );
                })()}

              </div>
            );
          })()}

        </div>
      )}

      {/* ========================================================
          VIEW 4: SOLO GAME MODE (نظام التحدي الذاتي الفردي)
          ======================================================== */}
      {activeViewMode === 'solo_game' && soloQuiz && (
        <div className="space-y-6 relative z-10 max-w-4xl mx-auto animate-fadeIn">
          
          {/* Top Header Bar */}
          <div className="bg-black/40 backdrop-blur-md p-4 rounded-3xl border border-white/15 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsSoloTimerRunning(false);
                  setActiveViewMode(currentUserRole === 'member' ? 'player_gamepad' : 'manager');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition border border-white/20 cursor-pointer flex items-center gap-1.5"
              >
                <span>خروج</span>
                <span>🚪</span>
              </button>
              {soloQuiz.coverImage && (
                <img src={soloQuiz.coverImage} alt="" className="w-10 h-10 rounded-xl object-cover border border-white/20 hidden sm:block" />
              )}
              <div>
                <span className="text-[10px] text-amber-300 font-bold block">🎯 تحدي ذاتي (Self-Paced Mode)</span>
                <h2 className="text-sm md:text-base font-black text-white">{soloQuiz.title}</h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {soloStatus !== 'finished' && (
                soloQuiz.settings?.selfPacedTimerEnabled !== false ? (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                    <span className={`font-mono text-xl font-black ${soloTimeRemaining <= 5 ? 'text-red-400 animate-pulse' : 'text-amber-300'}`}>
                      {soloTimeRemaining} ث
                    </span>
                  </div>
                ) : (
                  <div className="px-3 py-1 rounded-xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-200 text-xs font-black">
                    ♾️ بدون تايمر (وقت مفتوح)
                  </div>
                )
              )}

              <div className="bg-amber-400/20 px-3 py-1.5 rounded-2xl border border-amber-400/30 text-amber-300 font-black text-xs">
                {soloScore.toLocaleString('ar-EG')} نقطة ⭐
              </div>

              {soloStreak > 1 && (
                <div className="bg-red-500/20 px-2.5 py-1 rounded-xl border border-red-500/30 text-xs font-black text-red-300 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5" />
                  <span>{soloStreak}</span>
                </div>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {soloStatus !== 'finished' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-white/70 px-1 font-bold">
                <span>السؤال {soloQuestionIndex + 1} من {soloQuiz.questions.length}</span>
                <span>{Math.round(((soloQuestionIndex + (soloStatus === 'answer_reveal' ? 1 : 0)) / soloQuiz.questions.length) * 100)}%</span>
              </div>
              <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-400 to-emerald-400 h-full transition-all duration-300"
                  style={{ width: `${((soloQuestionIndex + 1) / soloQuiz.questions.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* STAGE 1: ACTIVE QUESTION */}
          {soloStatus === 'question_active' && (() => {
            const currentQ = soloQuiz.questions[soloQuestionIndex];
            if (!currentQ) return null;

            return (
              <div className="space-y-6">
                
                {/* Question Title Header Card */}
                <div className="bg-black/50 backdrop-blur-md p-6 md:p-8 rounded-3xl border border-white/20 text-center space-y-3 shadow-2xl">
                  <span className="text-xs bg-amber-400/20 text-amber-300 px-3 py-1 rounded-full font-bold border border-amber-400/30">
                    {currentQ.pointsMultiplier === 2 ? 'سؤال نقاط مضاعفة (2000 نقطة) 🔥' : currentQ.pointsMultiplier === 0 ? 'سؤال تفاعلي بدون نقاط 💬' : 'سؤال قياسي (1000 نقطة) ⭐'}
                  </span>
                  <h3 className="text-xl md:text-2xl font-black text-white leading-relaxed">
                    {currentQ.title}
                  </h3>
                </div>

                {/* Media Image / Video if present (skipped for pin_answer/drop_pin which render their own interactive image) */}
                {currentQ.mediaUrl && currentQ.type !== 'pin_answer' && currentQ.type !== 'drop_pin' && (
                  <div className="max-w-md mx-auto rounded-2xl overflow-hidden border border-white/20 shadow-xl">
                    {currentQ.mediaType === 'youtube' ? (
                      <div className="aspect-video w-full">
                        <iframe
                          src={`${currentQ.mediaUrl.replace('watch?v=', 'embed/')}?start=${currentQ.youtubeStartSec || 0}&end=${currentQ.youtubeEndSec || 30}&autoplay=1`}
                          className="w-full h-full"
                          title="YouTube Media"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                        />
                      </div>
                    ) : (
                      <img src={currentQ.mediaUrl} alt="" className="w-full h-48 object-cover" />
                    )}
                  </div>
                )}

                {/* Question Types Options (Quiz, Image Quiz, Audio Quiz, Poll + MultiSelect) */}
                {(currentQ.type === 'quiz' || currentQ.type === 'image_quiz' || currentQ.type === 'audio_quiz' || currentQ.type === 'poll') && currentQ.options && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {currentQ.options.map((opt, idx) => {
                        const colors = [
                          'from-red-600 to-red-700 hover:from-red-500 border-red-400',
                          'from-blue-600 to-blue-700 hover:from-blue-500 border-blue-400',
                          'from-amber-500 to-amber-600 hover:from-amber-400 border-amber-300 text-slate-950',
                          'from-emerald-600 to-emerald-700 hover:from-emerald-500 border-emerald-400',
                          'from-purple-600 to-purple-700 hover:from-purple-500 border-purple-400',
                          'from-pink-600 to-pink-700 hover:from-pink-500 border-pink-400'
                        ];
                        const shapes = ['▲ مثلث', '◆ معين', '● دائرة', '■ مربع', '★ نجمة', '✦ جوهرة'];
                        const isSelected = currentQ.multiSelect && multiSelectedOptions.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              if (currentQ.multiSelect) {
                                setMultiSelectedOptions(prev =>
                                  prev.includes(opt.id) ? prev.filter(x => x !== opt.id) : [...prev, opt.id]
                                );
                              } else {
                                handleSoloAnswerSubmit(opt.id, opt.isCorrect || false);
                              }
                            }}
                            className={`p-5 rounded-2xl bg-gradient-to-r ${colors[idx % colors.length]} border-2 font-black text-base md:text-lg flex items-center justify-between gap-3 shadow-xl active:scale-95 transition cursor-pointer text-right text-white ${
                              isSelected ? 'ring-4 ring-white scale-102' : ''
                            }`}
                          >
                            <span className="text-sm font-mono opacity-80 shrink-0 ml-1">{shapes[idx % shapes.length]}</span>
                            {opt.imageUrl && (
                              <img
                                src={opt.imageUrl}
                                alt={opt.text}
                                className="w-16 h-16 rounded-xl object-cover border-2 border-white/40 shrink-0 shadow-md bg-black/20"
                              />
                            )}
                            <span className="flex-1 leading-snug">{opt.text}</span>
                          </button>
                        );
                      })}
                    </div>
                    {currentQ.multiSelect && (
                      <button
                        type="button"
                        disabled={multiSelectedOptions.length === 0}
                        onClick={() => {
                          handleCheckMultiSelectAnswer(currentQ, true);
                          setMultiSelectedOptions([]);
                        }}
                        className="w-full max-w-md mx-auto block py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm shadow-xl disabled:opacity-50 cursor-pointer"
                      >
                        تأكيد الإجابات المختارة ({multiSelectedOptions.length}) ✔️
                      </button>
                    )}
                  </div>
                )}

                {/* True or False */}
                {currentQ.type === 'true_false' && (
                  <div className="grid grid-cols-2 gap-4 max-w-xl mx-auto">
                    <button
                      type="button"
                      onClick={() => {
                        const trueOpt = currentQ.options?.find(o => o.id === 'opt_true' || o.id === 'tf_1' || o.text.includes('صح') || o.text.toLowerCase().includes('true'));
                        handleSoloAnswerSubmit('true', trueOpt ? !!trueOpt.isCorrect : true);
                      }}
                      className="p-8 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 border-2 border-blue-400 text-white font-black text-2xl flex items-center justify-center gap-2 shadow-xl active:scale-95 cursor-pointer"
                    >
                      <span>صح ✔️</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const falseOpt = currentQ.options?.find(o => o.id === 'opt_false' || o.id === 'tf_2' || o.text.includes('خطأ') || o.text.toLowerCase().includes('false'));
                        handleSoloAnswerSubmit('false', falseOpt ? !!falseOpt.isCorrect : false);
                      }}
                      className="p-8 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 border-2 border-red-400 text-white font-black text-2xl flex items-center justify-center gap-2 shadow-xl active:scale-95 cursor-pointer"
                    >
                      <span>خطأ ❌</span>
                    </button>
                  </div>
                )}

                {/* Pin Answer & Drop Pin in Solo Mode */}
                {(currentQ.type === 'pin_answer' || currentQ.type === 'drop_pin') && (
                  <div className="max-w-2xl mx-auto bg-black/50 p-5 rounded-3xl border border-white/20 text-center space-y-4 shadow-xl">
                    <p className="text-xs md:text-sm text-amber-300 font-black">
                      📍 انقر على الموضع الصحيح في الصورة لوضع الدبوس ثم اضغط زر التأكيد:
                    </p>
                    <div
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const xPercent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                        const yPercent = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
                        setPinClickedCoords({ xPercent, yPercent });
                      }}
                      className="relative w-full h-64 md:h-80 rounded-2xl overflow-hidden border-2 border-amber-400/50 cursor-crosshair bg-slate-900 select-none shadow-2xl"
                    >
                      <img
                        src={currentQ.mediaUrl || 'https://images.unsplash.com/photo-1548625361-195977935bb8?w=900'}
                        alt="Pin Target"
                        className="w-full h-full object-contain bg-black/60"
                      />
                      {pinClickedCoords && (
                        <div
                          className="absolute -translate-x-1/2 -translate-y-full pointer-events-none z-20 flex flex-col items-center"
                          style={{ left: `${pinClickedCoords.xPercent}%`, top: `${pinClickedCoords.yPercent}%` }}
                        >
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] shadow mb-0.5 whitespace-nowrap">
                            دبوسك ({Math.round(pinClickedCoords.xPercent)}%, {Math.round(pinClickedCoords.yPercent)}%)
                          </span>
                          <span className="text-3xl drop-shadow-lg animate-bounce">📍</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={!pinClickedCoords}
                      onClick={() => {
                        if (!pinClickedCoords) return;
                        if (currentQ.type === 'pin_answer') {
                          const target = currentQ.pinCoordinates || { xPercent: 50, yPercent: 50, tolerancePercent: 18 };
                          const distance = Math.sqrt(
                            Math.pow(pinClickedCoords.xPercent - target.xPercent, 2) +
                            Math.pow(pinClickedCoords.yPercent - target.yPercent, 2)
                          );
                          const isInside = distance <= (target.tolerancePercent || 18);
                          handleSoloAnswerSubmit(pinClickedCoords, isInside);
                        } else {
                          handleSoloAnswerSubmit(pinClickedCoords, true);
                        }
                      }}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 text-slate-950 font-black text-sm shadow-xl disabled:opacity-40 cursor-pointer transition"
                    >
                      {pinClickedCoords ? 'تأكيد موضع الدبوس 📍🚀' : 'انقر على الصورة أولاً لوضع الدبوس 👆'}
                    </button>
                  </div>
                )}

                {/* Type Answer */}
                {currentQ.type === 'type_answer' && (
                  <div className="max-w-md mx-auto bg-black/50 p-6 rounded-3xl border border-white/20 text-center space-y-4 shadow-xl">
                    <input
                      type="text"
                      maxLength={80}
                      value={typeAnswerInput}
                      onChange={(e) => setTypeAnswerInput(e.target.value)}
                      placeholder="اكتب إجابتك هنا..."
                      className="w-full px-4 py-3.5 rounded-2xl bg-white/10 border-2 border-white/30 text-white text-lg font-black text-center focus:outline-hidden focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cleanInput = (typeAnswerInput || '').trim().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').toLowerCase();
                        const cleanTarget = (currentQ.correctTextAnswer || '').trim().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').toLowerCase();
                        const isCorrect = cleanInput === cleanTarget || (currentQ.acceptableTextAnswers || []).some(a => a.trim().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').toLowerCase() === cleanInput);
                        handleSoloAnswerSubmit(typeAnswerInput, isCorrect);
                        setTypeAnswerInput('');
                      }}
                      disabled={!typeAnswerInput.trim()}
                      className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm shadow-xl disabled:opacity-50 cursor-pointer"
                    >
                      تأكيد الإجابة 🚀
                    </button>
                  </div>
                )}

                {/* Slider */}
                {currentQ.type === 'slider' && (
                  <div className="max-w-md mx-auto bg-black/50 p-6 rounded-3xl border border-white/20 text-center space-y-4 shadow-xl">
                    <div className="text-4xl font-mono font-black text-amber-300">
                      {sliderCurrentValue}
                    </div>
                    <input
                      type="range"
                      min={currentQ.sliderMin || 0}
                      max={currentQ.sliderMax || 10}
                      step={currentQ.sliderStep || 1}
                      value={sliderCurrentValue}
                      onChange={(e) => setSliderCurrentValue(Number(e.target.value))}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const diff = Math.abs(sliderCurrentValue - (currentQ.sliderCorrectValue || 0));
                        const margin = currentQ.sliderMarginOfError || 0;
                        handleSoloAnswerSubmit(sliderCurrentValue, diff <= margin);
                      }}
                      className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm cursor-pointer shadow-xl"
                    >
                      تأكيد القيمة 🚀
                    </button>
                  </div>
                )}

                {/* Matching Pairs in Solo Mode */}
                {currentQ.type === 'matching' && currentQ.matchingPairs && (
                  <div className="max-w-lg mx-auto bg-black/50 p-6 rounded-3xl border border-white/20 space-y-3 shadow-xl">
                    <p className="text-xs text-amber-300 text-center font-bold">🔗 صل كل عنصر بما يناسبه:</p>
                    <div className="space-y-2.5">
                      {currentQ.matchingPairs.map((pair) => (
                        <div key={pair.id} className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-white">{pair.leftText}</span>
                          <select
                            value={matchingUserSelections[pair.id] || ''}
                            onChange={(e) => setMatchingUserSelections((prev: Record<string, string>) => ({ ...prev, [pair.id]: e.target.value }))}
                            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-amber-400/40 text-amber-300 text-xs font-bold"
                          >
                            <option value="">-- اختر --</option>
                            {currentQ.matchingPairs!.map(p => (
                              <option key={p.id} value={p.rightText}>{p.rightText}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCheckMatchingAnswer(currentQ, true)}
                      className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm cursor-pointer shadow-xl"
                    >
                      تأكيد التوصيل 🚀
                    </button>
                  </div>
                )}

                {/* Puzzle Ordering */}
                {currentQ.type === 'puzzle' && currentQ.puzzleItems && (
                  <div className="max-w-lg mx-auto bg-black/50 p-6 rounded-3xl border border-white/20 space-y-3 shadow-xl">
                    <p className="text-xs text-white/70 text-center font-bold">
                      رتب العناصر بالترتيب الصحيح باستخدام الأسهم:
                    </p>
                    <div className="space-y-2">
                      {(puzzleCurrentOrder.length > 0 ? puzzleCurrentOrder : currentQ.puzzleItems.map(p => p.id)).map((itemId, idx) => {
                        const item = currentQ.puzzleItems?.find(p => p.id === itemId);
                        if (!item) return null;
                        return (
                          <div key={item.id} className="bg-white/10 p-3 rounded-xl flex items-center justify-between text-xs font-bold text-white">
                            <span>{idx + 1}. {item.text}</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const list = puzzleCurrentOrder.length > 0 ? [...puzzleCurrentOrder] : currentQ.puzzleItems!.map(p => p.id);
                                  if (idx > 0) {
                                    const tmp = list[idx];
                                    list[idx] = list[idx - 1];
                                    list[idx - 1] = tmp;
                                    setPuzzleCurrentOrder(list);
                                  }
                                }}
                                className="p-1 rounded bg-white/20 text-white"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const list = puzzleCurrentOrder.length > 0 ? [...puzzleCurrentOrder] : currentQ.puzzleItems!.map(p => p.id);
                                  if (idx < list.length - 1) {
                                    const tmp = list[idx];
                                    list[idx] = list[idx + 1];
                                    list[idx + 1] = tmp;
                                    setPuzzleCurrentOrder(list);
                                  }
                                }}
                                className="p-1 rounded bg-white/20 text-white"
                              >
                                ▼
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const order = puzzleCurrentOrder.length > 0 ? puzzleCurrentOrder : currentQ.puzzleItems!.map(p => p.id);
                        const isCorrect = order.every((id, idx) => {
                          const item = currentQ.puzzleItems?.find(p => p.id === id);
                          return item?.correctIndex === idx;
                        });
                        handleSoloAnswerSubmit(order, isCorrect);
                        setPuzzleCurrentOrder([]);
                      }}
                      className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm cursor-pointer shadow-xl"
                    >
                      تأكيد الترتيب 🚀
                    </button>
                  </div>
                )}

                {/* Rating / Scale / Opinion fallback in Solo Mode */}
                {(currentQ.type === 'rating' || currentQ.type === 'scale' || currentQ.type === 'word_cloud' || currentQ.type === 'open_ended' || currentQ.type === 'brainstorm') && (
                  <div className="max-w-md mx-auto bg-black/50 p-6 rounded-3xl border border-white/20 text-center space-y-4 shadow-xl">
                    <input
                      type="text"
                      value={typeAnswerInput}
                      onChange={(e) => setTypeAnswerInput(e.target.value)}
                      placeholder="اكتب رأيك أو تقييمك هنا..."
                      className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/25 text-white text-sm font-bold text-center"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        handleSoloAnswerSubmit(typeAnswerInput || 'تم', true);
                        setTypeAnswerInput('');
                      }}
                      className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm cursor-pointer shadow-xl"
                    >
                      إرسال ومتابعة 🚀
                    </button>
                  </div>
                )}

              </div>
            );
          })()}

          {/* STAGE 2: ANSWER REVEAL */}
          {soloStatus === 'answer_reveal' && (() => {
            const currentQ = soloQuiz.questions[soloQuestionIndex];
            if (!currentQ) return null;

            return (
              <div className="max-w-xl mx-auto bg-black/50 backdrop-blur-md rounded-3xl p-8 border border-white/20 text-center space-y-6 animate-scaleIn shadow-2xl">
                {soloFeedback?.isCorrect ? (
                  <>
                    <div className="text-6xl block animate-bounce">🎉</div>
                    <h3 className="text-2xl font-black text-emerald-400">
                      إجابة صحيحة يا بطل!
                    </h3>
                    <div className="inline-block bg-emerald-500/20 text-emerald-300 px-5 py-2 rounded-2xl border border-emerald-500/30 font-black text-xl">
                      +{soloFeedback.points} نقطة 🎯
                    </div>
                    {soloFeedback.streak > 1 && (
                      <div className="text-amber-300 font-bold text-xs flex items-center justify-center gap-1">
                        <Flame className="w-4 h-4 fill-current text-amber-400" />
                        <span>سلسلة إجابات متتالية: {soloFeedback.streak} 🔥</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-6xl block animate-shake">❌</div>
                    <h3 className="text-2xl font-black text-red-400">
                      إجابة غير صحيحة!
                    </h3>
                    <p className="text-xs text-white/70">
                      لا تقلق، ركز واستعد للسؤال القادم لتجمع نقاطاً أكثر!
                    </p>
                  </>
                )}

                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 text-xs text-white/80 space-y-2">
                  <span className="text-white/50 block font-bold">الإجابة الصحيحة:</span>
                  <span className="font-black text-amber-300 text-base block">
                    {getCorrectAnswerLabelForQuestion(currentQ)}
                  </span>
                  {(currentQ.type === 'pin_answer' || currentQ.type === 'drop_pin') && (
                    <div className="relative rounded-xl overflow-hidden border border-white/20 bg-slate-900 mt-2">
                      <img
                        src={currentQ.mediaUrl || 'https://images.unsplash.com/photo-1548625361-195977935bb8?w=900'}
                        alt="Pin Answer Reveal"
                        className="w-full h-56 object-contain bg-black/60"
                      />
                      {currentQ.pinCoordinates && (
                        <>
                          <div
                            className="absolute rounded-full border-4 border-emerald-400 bg-emerald-500/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                            style={{
                              left: `${currentQ.pinCoordinates.xPercent}%`,
                              top: `${currentQ.pinCoordinates.yPercent}%`,
                              width: `${(currentQ.pinCoordinates.tolerancePercent || 18) * 2}%`,
                              height: `${(currentQ.pinCoordinates.tolerancePercent || 18) * 2}%`
                            }}
                          />
                          <div
                            className="absolute -translate-x-1/2 -translate-y-full pointer-events-none z-20 flex flex-col items-center"
                            style={{ left: `${currentQ.pinCoordinates.xPercent}%`, top: `${currentQ.pinCoordinates.yPercent}%` }}
                          >
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white font-black text-[9px] shadow">
                              الموضع الصحيح ✔️
                            </span>
                            <span className="text-2xl">📍</span>
                          </div>
                        </>
                      )}
                      {pinClickedCoords && (
                        <div
                          className="absolute -translate-x-1/2 -translate-y-full pointer-events-none z-30 flex flex-col items-center"
                          style={{ left: `${pinClickedCoords.xPercent}%`, top: `${pinClickedCoords.yPercent}%` }}
                        >
                          <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] shadow">
                            دبوسك
                          </span>
                          <span className="text-xl">📌</span>
                        </div>
                      )}
                    </div>
                  )}
                  {currentQ.biblicalReference && (
                    <span className="text-amber-200 font-bold block pt-1">📖 المرجع الكتابي: {currentQ.biblicalReference}</span>
                  )}
                  {currentQ.explanation && (
                    <p className="text-white/80 text-xs pt-1 leading-relaxed">💡 {currentQ.explanation}</p>
                  )}
                </div>

                <div className="text-xs text-white/60">
                  مجموع نقاطك الحالي: <span className="text-amber-300 font-black">{soloScore.toLocaleString('ar-EG')} نقطة</span>
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-black animate-pulse">
                  <span>⚡ جاري الانتقال تلقائياً للسؤال التالي...</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPinClickedCoords(null);
                    handleSoloNextStep();
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 text-slate-950 font-black text-sm shadow-xl cursor-pointer active:scale-95 transition"
                >
                  {soloQuestionIndex + 1 < soloQuiz.questions.length ? 'السؤال التالي الآن ➡️' : 'عرض المجموع الكلي ولوحة الصدارة 🏆'}
                </button>
              </div>
            );
          })()}

          {/* STAGE 3: FINISHED & ROLE-BASED LEADERBOARD (TOP 3 + MY RESULT FOR MEMBERS / ALL PARTICIPANTS FOR CREATOR & ADMINS) */}
          {soloStatus === 'finished' && (() => {
            const top3List = soloLeaderboard.slice(0, 3);
            const myBestEntryIndex = soloLeaderboard.findIndex(s => s.playerName === currentUserName);
            const myRank = myBestEntryIndex >= 0 ? myBestEntryIndex + 1 : soloLeaderboard.length + 1;
            const isUserInTop3 = myRank >= 1 && myRank <= 3;
            const canSeeAllParticipants = isSeniorAdmin || canEditOrDeleteQuiz(soloQuiz);

            return (
              <div className="space-y-6 max-w-3xl mx-auto animate-scaleIn">
                
                {/* 1. TOP 3 STAGE CARD AT THE VERY TOP (WITH DROP-DOWN INDICATOR) */}
                <div className="bg-black/55 backdrop-blur-md rounded-3xl p-6 md:p-8 border-2 border-amber-400/50 space-y-5 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <Trophy className="w-7 h-7 text-amber-400" />
                      <div>
                        <h3 className="text-lg md:text-xl font-black text-white">أبطال المراكز الثلاثة الأولى (Top 3) 🏆</h3>
                        <p className="text-xs text-white/70">
                          إذا تفوق متسابق جديد على أحد الـ Top 3 يأخذ مكانه وتهبط المراكز تحته تلقائياً (Drop Down)
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-amber-300 font-black bg-amber-400/15 px-3 py-1 rounded-full border border-amber-400/30">
                      قمة الصدارة 🥇🥈🥉
                    </span>
                  </div>

                  {top3List.length === 0 ? (
                    <div className="text-center py-6 text-xs text-white/50">
                      كن أول بطل يتصدر المراكز الثلاثة الأولى في هذه المسابقة! 🌟
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {top3List.map((scoreEntry, idx) => {
                        const isCurrentUser = scoreEntry.playerName === currentUserName;
                        const prevRankNum = previousSoloTop3Ids[scoreEntry.playerName];
                        const prevIdx = prevRankNum ? prevRankNum - 1 : -1;
                        const droppedDown = prevIdx !== -1 && prevIdx < idx;
                        const newlyEntered = prevIdx === -1 && Object.keys(previousSoloTop3Ids).length > 0 && isCurrentUser;
                        const rankBadges = [
                          { label: 'المركز الأول 🥇', cls: 'bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 border-white' },
                          { label: 'المركز الثاني 🥈', cls: 'bg-gradient-to-r from-slate-300 to-slate-200 text-slate-950 border-slate-100' },
                          { label: 'المركز الثالث 🥉', cls: 'bg-gradient-to-r from-amber-700 to-amber-600 text-white border-amber-400' }
                        ];

                        return (
                          <div
                            key={scoreEntry.id}
                            className={`p-4 rounded-2xl border-2 flex items-center justify-between transition ${
                              isCurrentUser
                                ? 'bg-amber-400/25 border-amber-400 shadow-xl ring-2 ring-amber-300/40'
                                : 'bg-white/10 border-white/15'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`px-3 py-1.5 rounded-xl font-black text-xs border shrink-0 shadow-md ${rankBadges[idx].cls}`}>
                                {rankBadges[idx].label}
                              </span>

                              <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30 overflow-hidden shrink-0 flex items-center justify-center font-black text-sm text-white">
                                {scoreEntry.playerAvatar ? (
                                  <img src={scoreEntry.playerAvatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  scoreEntry.playerName.charAt(0)
                                )}
                              </div>

                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-black text-sm md:text-base text-white">
                                    {scoreEntry.playerName}
                                  </span>
                                  {isCurrentUser && (
                                    <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-full">
                                      أنت البطل 🌟
                                    </span>
                                  )}
                                  {newlyEntered && (
                                    <span className="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 font-black px-2 py-0.5 rounded-full">
                                      ⬆️ اقتحم الـ Top 3!
                                    </span>
                                  )}
                                  {droppedDown && (
                                    <span className="text-[10px] bg-amber-500/30 text-amber-200 border border-amber-400/40 font-bold px-2 py-0.5 rounded-full">
                                      ⬇️ نزل من المركز #{prevIdx + 1} إلى #{idx + 1}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-white/60 block mt-0.5">
                                  {scoreEntry.correctCount} من {scoreEntry.totalQuestions} إجابة صحيحة
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-left font-mono">
                                <span className="text-lg font-black text-amber-300 block">
                                  {scoreEntry.score.toLocaleString('ar-EG')}
                                </span>
                                <span className="text-[10px] text-white/60 block">نقطة</span>
                              </div>
                              {canSeeAllParticipants && (
                                <button
                                  type="button"
                                  onClick={() => handleInspectSoloParticipant(soloQuiz, scoreEntry)}
                                  className="px-2.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 border border-cyan-400/30 text-[11px] font-bold cursor-pointer"
                                  title="عرض إجابات المتسابق على كل سؤال"
                                >
                                  إجاباته 👁️
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. CURRENT PLAYER'S OWN SCORE CARD SEPARATELY BELOW TOP 3 */}
                <div className="bg-gradient-to-br from-purple-950/90 via-indigo-950/90 to-slate-950/90 backdrop-blur-md rounded-3xl p-6 md:p-8 border-2 border-emerald-400/50 text-center space-y-5 shadow-2xl">
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-3">
                    <span className="bg-emerald-500/20 text-emerald-300 px-3.5 py-1 rounded-full text-xs font-black border border-emerald-500/30">
                      نتيجتك ومجموعك الكلي في التحدي الذاتي 🎯
                    </span>
                    <span className="text-xs font-black text-amber-300 bg-amber-400/15 px-3.5 py-1 rounded-full border border-amber-400/30">
                      ترتيبك العام: المركز #{myRank} {isUserInTop3 ? '🔥 (ضمن الـ Top 3 الأوائل!)' : ''}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-white">
                      {isUserInTop3 ? `مبارك يا ${currentUserName}! لقد حجزت مكانك في الـ Top 3 🏆` : `أحسنت المحاولة يا ${currentUserName}!`}
                    </h2>
                    {!isUserInTop3 && top3List.length > 0 && (
                      <p className="text-xs text-white/75">
                        تحتاج إلى <span className="text-amber-300 font-black">{Math.max(1, (top3List[top3List.length - 1]?.score || 0) - soloScore + 10).toLocaleString('ar-EG')}</span> نقطة إضافية لتتفوق على المركز الثالث وتأخذ مكانه في الـ Top 3!
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 bg-black/40 p-4 rounded-2xl border border-white/10 text-center">
                    <div>
                      <span className="text-[11px] text-white/60 block">مجموعك الكلي</span>
                      <span className="text-2xl md:text-3xl font-mono font-black text-amber-300">{soloScore.toLocaleString('ar-EG')}</span>
                      <span className="text-[10px] text-amber-200/80 block">نقطة ⭐</span>
                    </div>
                    <div className="border-x border-white/10">
                      <span className="text-[11px] text-white/60 block">الإجابات الصحيحة</span>
                      <span className="text-2xl md:text-3xl font-mono font-black text-emerald-300">{soloCorrectCount} / {soloQuiz.questions.length}</span>
                      <span className="text-[10px] text-emerald-200/80 block">
                        ({Math.round((soloCorrectCount / Math.max(1, soloQuiz.questions.length)) * 100)}% دقة)
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-white/60 block">مركزك الحالي</span>
                      <span className="text-2xl md:text-3xl font-mono font-black text-cyan-300">#{myRank}</span>
                      <span className="text-[10px] text-cyan-200/80 block">من {soloLeaderboard.length} مشارك</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-3 flex-wrap pt-1">
                    {soloQuiz.settings?.allowRetry === true ? (
                      <button
                        type="button"
                        onClick={() => handleStartSoloQuiz(soloQuiz, true)}
                        className="px-6 py-3 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs transition shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>إعادة المسابقة لتحسين السكور 🔄</span>
                      </button>
                    ) : (
                      <span className="px-4 py-2.5 rounded-2xl bg-white/5 border border-white/15 text-white/75 text-xs font-bold">
                        🔒 تم اعتماد نتيجتك النهائية (إعادة المسابقة مغلقة من مسؤول المسابقة)
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setActiveViewMode(currentUserRole === 'member' ? 'player_gamepad' : 'manager')}
                      className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition border border-white/20 flex items-center gap-2 cursor-pointer"
                    >
                      <span>العودة للمسابقات 🏠</span>
                    </button>
                  </div>
                </div>

                {/* 3. FULL PARTICIPANTS LIST (VISIBLE ONLY TO CREATOR SERVANT & SENIOR ADMINS) */}
                {canSeeAllParticipants && (
                  <div className="bg-black/50 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-cyan-400/30 space-y-4 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-wrap gap-2">
                      <div>
                        <span className="text-[11px] text-cyan-300 font-bold block">🔒 خاص بمنشئ المسابقة والمسؤولين الكبار فقط</span>
                        <h3 className="text-base md:text-lg font-black text-white">
                          سجل جميع المشاركين في المسابقة ({soloLeaderboard.length} مشارك) بما فيهم الـ Top 3
                        </h3>
                      </div>
                      <span className="text-xs bg-cyan-500/20 text-cyan-200 px-3 py-1 rounded-full border border-cyan-400/30 font-bold">
                        اضغط «عرض إجاباته 👁️» لفحص إجابات كل سؤال
                      </span>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {soloLeaderboard.map((scoreEntry, idx) => (
                        <div
                          key={scoreEntry.id}
                          className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between gap-3 transition"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                              idx === 0 ? 'bg-amber-400 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-950' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-white/10 text-white'
                            }`}>
                              {idx + 1}
                            </span>
                            <div>
                              <span className="font-black text-sm text-white block">{scoreEntry.playerName}</span>
                              <span className="text-[11px] text-white/60">
                                {scoreEntry.correctCount}/{scoreEntry.totalQuestions} صح • {new Date(scoreEntry.completedAt).toLocaleString('ar-EG')}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-black text-amber-300">
                              {scoreEntry.score.toLocaleString('ar-EG')} نقطة
                            </span>
                            <button
                              type="button"
                              onClick={() => handleInspectSoloParticipant(soloQuiz, scoreEntry)}
                              className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 border border-cyan-400/30 text-xs font-bold cursor-pointer"
                            >
                              عرض إجاباته 👁️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            );
          })()}

        </div>
      )}

      {/* ========================================================
          VIEW 3: COMPLETE KAHOOT CREATOR STUDIO MODAL (4 CREATION MODES)
          ======================================================== */}
      {isCreatorOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-[#190b2e] border border-white/20 rounded-3xl w-full max-w-6xl p-5 md:p-7 space-y-5 text-white my-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            
            {/* Modal Top Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-amber-400" />
                <h3 className="text-xl font-black text-white">
                  استوديو تصميم المسابقات التفاعلية («🔥 مسابقات الثلاثة فتية 🔥»)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatorOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 4 Creation Modes Tabs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCreationMethod('manual')}
                className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                  creationMethod === 'manual' ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                <span>1. Blank (إنشاء وتعديل يدوي)</span>
              </button>

              <button
                type="button"
                onClick={() => setCreationMethod('ai')}
                className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                  creationMethod === 'ai' ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>2. By AI (بالذكاء الاصطناعي)</span>
              </button>

              <button
                type="button"
                onClick={() => setCreationMethod('url')}
                className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                  creationMethod === 'url' ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                }`}
              >
                <LinkIcon className="w-4 h-4" />
                <span>3. URL (من رابط مقال أو فيديو)</span>
              </button>

              <button
                type="button"
                onClick={() => setCreationMethod('scan')}
                className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                  creationMethod === 'scan' ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>4. Scan Doc (مسح مستند أو صورة)</span>
              </button>
            </div>

            {/* Shared Generation Settings Bar (Count, Language & Question Types) for AI, URL, and Scan Doc */}
            {(creationMethod === 'ai' || creationMethod === 'url' || creationMethod === 'scan') && (
              <div className="bg-black/40 p-4 rounded-2xl border border-amber-400/30 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-black text-amber-300">
                      إعدادات التوليد الذكي المفتوحة (تطبق على الذكاء الاصطناعي، الرابط URL، ورفع المستندات):
                    </span>
                  </div>

                  {/* Language Selector (Auto / Arabic / English) */}
                  <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/15">
                    <span className="text-[11px] text-white/70 px-2 font-bold">🌐 لغة التوليد:</span>
                    {([
                      { id: 'auto', label: 'تلقائي (Auto)' },
                      { id: 'ar', label: 'العربية 🇪🇬' },
                      { id: 'en', label: 'English 🇬🇧' }
                    ] as const).map((lang) => (
                      <button
                        key={lang.id}
                        type="button"
                        onClick={() => setAiLanguage(lang.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer ${
                          aiLanguage === lang.id
                            ? 'bg-amber-400 text-slate-950 shadow'
                            : 'text-white/75 hover:bg-white/10'
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  {/* Open Question Count Input + Presets */}
                  <div className="md:col-span-5 bg-white/5 p-2.5 rounded-xl border border-white/10 flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-xs font-bold text-cyan-300">🔢 عدد الأسئلة (مفتوح 1–50):</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={aiQuestionsCount}
                        onChange={(e) => setAiQuestionsCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                        className="w-16 px-2 py-1 rounded-lg bg-slate-900 border border-amber-400/50 text-amber-300 font-mono font-black text-center text-xs"
                      />
                      {[5, 10, 15, 20, 30].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAiQuestionsCount(preset)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-black border transition cursor-pointer ${
                            aiQuestionsCount === preset
                              ? 'bg-cyan-400 text-slate-950 border-white'
                              : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/20'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Multi-select Question Types */}
                  <div className="md:col-span-7 bg-white/5 p-2.5 rounded-xl border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-emerald-300">🎯 حدد أنواع الأسئلة المطلوب توليدها (يمكنك اختيار نوع واحد أو عدة أنواع):</span>
                      <button
                        type="button"
                        onClick={() => setAiSelectedTypes(['quiz', 'true_false', 'type_answer', 'puzzle', 'matching', 'pin_answer'])}
                        className="text-[10px] text-amber-300 hover:underline font-bold cursor-pointer"
                      >
                        تنويع شامل ✨
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {([
                        { type: 'quiz', label: 'اختيار من متعدد' },
                        { type: 'true_false', label: 'صح أم خطأ' },
                        { type: 'type_answer', label: 'كتابة إجابة' },
                        { type: 'puzzle', label: 'ترتيب (Puzzle)' },
                        { type: 'matching', label: 'توصيل ومطابقة' },
                        { type: 'pin_answer', label: 'تحديد بالدبوس 📍' },
                        { type: 'slider', label: 'شريط التقدير' },
                        { type: 'poll', label: 'تصويت (Poll)' },
                        { type: 'word_cloud', label: 'سحابة كلمات' },
                      ] as Array<{ type: KahootQuestionType; label: string }>).map((item) => {
                        const isSelected = aiSelectedTypes.includes(item.type);
                        return (
                          <button
                            key={item.type}
                            type="button"
                            onClick={() => handleToggleAiQuestionType(item.type)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-black shadow-sm'
                                : 'bg-white/5 text-white/70 border-white/15 hover:bg-white/10'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}{item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI Generator Panel */}
            {creationMethod === 'ai' && (
              <div className="bg-white/5 p-4 rounded-2xl border border-amber-400/30 space-y-4" onPaste={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                    <Wand2 className="w-4 h-4" />
                    <span>توليد وتصميم مسابقة متكاملة بالذكاء الاصطناعي (العربية أو الإنجليزية):</span>
                  </label>
                  <span className="text-[11px] text-white/60">صف موضوع المسابقة ونوع الأسئلة وسيقوم النموذج بتصميمها فوراً</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    type="text"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    onPaste={(e) => e.stopPropagation()}
                    placeholder="عنوان أو موضوع المسابقة (مثال: سفر دانيال والفتية الثلاثة / Book of Daniel...)"
                    className="md:col-span-3 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:outline-hidden focus:border-amber-400"
                  />
                  <select
                    value={aiDifficulty}
                    onChange={(e: any) => setAiDifficulty(e.target.value)}
                    className="px-3 py-2.5 rounded-xl bg-slate-800 border border-white/20 text-white text-xs font-bold"
                  >
                    <option value="سهل">المستوى: سهل (Easy)</option>
                    <option value="متوسط">المستوى: متوسط (Medium)</option>
                    <option value="متقدم">المستوى: متقدم (Hard)</option>
                  </select>
                </div>

                {/* Custom AI Model Specification Prompt Box */}
                <div className="space-y-2 bg-black/30 p-3.5 rounded-2xl border border-white/10">
                  <label className="text-xs font-bold text-cyan-300 block">
                    🧠 مربع توصيف المسابقة للنموذج (اشرح للـ AI نوع الأسئلة، فكرتها، الشواهد، وكل تفاصيل المسابقة ليصممها كما وصفت بالضبط):
                  </label>
                  <textarea
                    rows={3}
                    value={aiCustomPrompt}
                    onChange={(e) => setAiCustomPrompt(e.target.value)}
                    onPaste={(e) => e.stopPropagation()}
                    placeholder="مثال: صمم لي مسابقة للشباب عن الأصحاح الثالث من سفر دانيال، أو Generate an English Bible quiz about Daniel Chapter 3 with Biblical references..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs leading-relaxed focus:outline-hidden focus:border-cyan-400"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-white/50 font-bold">إضافة سريعة للوصف:</span>
                    {[
                      'اجعل كل الأسئلة اختيار من متعدد فقط (4 خيارات)',
                      'اجعل الأسئلة صح أم خطأ واختيار من متعدد',
                      'أضف أسئلة ترتيب أحداث (Puzzle) وكتابة إجابة وتحديد بالدبوس',
                      'أضف شواهد كتابية وتفسير روحي مبسط للشباب',
                      'Generate all questions and explanations in English'
                    ].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setAiCustomPrompt(prev => prev ? `${prev} - ${chip}` : chip)}
                        className="text-[10px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-cyan-500/20 text-cyan-200 border border-white/15 hover:border-cyan-400/40 transition cursor-pointer"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isGeneratingAi || (!aiTopic.trim() && !aiCustomPrompt.trim())}
                    onClick={handleGenerateAiQuiz}
                    className="w-full md:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-orange-500 text-slate-950 font-black text-xs transition disabled:opacity-50 cursor-pointer shadow-lg"
                  >
                    {isGeneratingAi ? 'جاري تصميم وتوليد المسابقة... ⏳' : `تصميم وتوليد ${aiQuestionsCount} سؤال بالذكاء الاصطناعي 🤖✨`}
                  </button>
                </div>
              </div>
            )}

            {/* URL Mode Panel */}
            {creationMethod === 'url' && (
              <div className="bg-white/5 p-4 rounded-2xl border border-blue-400/30 space-y-3" onPaste={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-black text-blue-300 block">
                    🔗 أدخل أو الصق رابط أي مقال أو موقع ويب (مثل الأنبا تكلا أو ويكيبيديا بالعربية أو الإنجليزية) لاستخراج مسابقة كاملة:
                  </label>
                  <span className="text-[11px] text-emerald-300 font-bold">
                    ✓ يدعم الترميز العربي (UTF-8 / Windows-1256) والإنجليزي بالكامل
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 flex gap-2">
                    <input
                      ref={urlInputRef}
                      type="url"
                      dir="ltr"
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        if (showClipboardPasteHelper) setShowClipboardPasteHelper(false);
                      }}
                      onPaste={(e) => {
                        e.stopPropagation();
                        const pasted = e.clipboardData?.getData('text');
                        if (pasted && pasted.trim()) {
                          e.preventDefault();
                          setUrlInput(pasted.trim());
                          setShowClipboardPasteHelper(false);
                          setShareToastMessage('📋 تم لصق الرابط بنجاح!');
                          setTimeout(() => setShareToastMessage(null), 2500);
                        }
                      }}
                      placeholder="https://st-takla.org/... or https://en.wikipedia.org/..."
                      className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm select-text focus:outline-hidden focus:border-blue-400"
                    />
                    <button
                      type="button"
                      onClick={handlePasteUrlFromClipboard}
                      className="px-3.5 py-2.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40 font-black text-xs flex items-center gap-1.5 shrink-0 cursor-pointer transition"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>لصق الرابط 📋</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={isGeneratingAi || !urlInput.trim()}
                    onClick={handleGenerateFromUrl}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 text-white font-black text-xs cursor-pointer transition shadow-md"
                  >
                    {isGeneratingAi ? 'جاري استخراج الأسئلة... ⏳' : `توليد ${aiQuestionsCount} سؤال من الرابط 🔗`}
                  </button>
                </div>

                {showClipboardPasteHelper && (
                  <div className="bg-amber-500/15 border border-amber-400/40 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <span className="text-xs text-amber-200 font-bold">
                      📋 الحقل جاهز الآن: اضغط <kbd className="px-1.5 py-0.5 bg-black/50 rounded text-amber-300">Ctrl+V</kbd> على الكيبورد أو اضغط مطولاً داخل المربع هنا للصق الرابط فوراً:
                    </span>
                    <input
                      type="text"
                      dir="ltr"
                      autoFocus
                      placeholder="اضغط Ctrl+V أو لصق هنا..."
                      onPaste={(e) => {
                        e.stopPropagation();
                        const text = e.clipboardData?.getData('text');
                        if (text && text.trim()) {
                          e.preventDefault();
                          setUrlInput(text.trim());
                          setShowClipboardPasteHelper(false);
                          setShareToastMessage('📋 تم لصق الرابط بنجاح!');
                          setTimeout(() => setShareToastMessage(null), 2500);
                        }
                      }}
                      onChange={(e) => {
                        if (e.target.value.trim()) {
                          setUrlInput(e.target.value.trim());
                          setShowClipboardPasteHelper(false);
                        }
                      }}
                      className="w-full sm:w-64 px-3 py-1.5 rounded-lg bg-black/50 border border-amber-400 text-white text-xs"
                    />
                  </div>
                )}

                {/* Optional custom instructions for URL extraction */}
                <div className="pt-1">
                  <input
                    type="text"
                    value={aiCustomPrompt}
                    onChange={(e) => setAiCustomPrompt(e.target.value)}
                    onPaste={(e) => e.stopPropagation()}
                    placeholder="توجيه إضافي للنموذج (اختياري): مثال: ركز على التواريخ والشخصيات أو استخرج الأسئلة باللغة الإنجليزية..."
                    className="w-full px-3.5 py-2 rounded-xl bg-black/30 border border-white/15 text-white text-xs focus:outline-hidden focus:border-blue-400"
                  />
                </div>
              </div>
            )}

            {/* Scan Doc Panel */}
            {creationMethod === 'scan' && (
              <div className="bg-white/5 p-5 rounded-2xl border border-dashed border-cyan-400/40 space-y-4" onPaste={(e) => e.stopPropagation()}>
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0">
                      <Camera className="w-6 h-6 text-cyan-300" />
                    </div>
                    <div className="text-right">
                      <h4 className="text-sm font-black text-white">مسح ضوئي أو رفع مستند / صورة / مذكرة (PDF، Word، صورة، أو نص)</h4>
                      <p className="text-xs text-white/60">
                        حدد عدد الأسئلة ونوعها في الأعلى، ثم ارفع الملف أو الصق النص ليقوم الذكاء الاصطناعي باستخراج المسابقة فوراً
                      </p>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileScanUpload}
                    className="text-xs text-white/80 file:ml-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-cyan-500 file:text-slate-950 hover:file:bg-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-cyan-200 block">
                    📄 أو الصق نص الدرس / المذكرة مباشرة هنا لتوليد الأسئلة منه حسب العدد والأنواع المختارة:
                  </label>
                  <textarea
                    rows={3}
                    value={scanDocInput}
                    onChange={(e) => setScanDocInput(e.target.value)}
                    placeholder="الصق هنا أي نص كتابي أو مقال أو مذكرة درس (بالعربية أو الإنجليزية)..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-xs leading-relaxed focus:outline-hidden focus:border-cyan-400"
                  />
                  <input
                    type="text"
                    value={aiCustomPrompt}
                    onChange={(e) => setAiCustomPrompt(e.target.value)}
                    placeholder="توجيه إضافي (اختياري): مثال: ركز على الآيات والشواهد أو صمم الأسئلة للمرحلة الثانوية..."
                    className="w-full px-3.5 py-2 rounded-xl bg-black/30 border border-white/15 text-white text-xs"
                  />
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2">
                  {isExtractingDoc ? (
                    <p className="text-xs text-amber-300 font-bold animate-pulse">⏳ جاري فحص المستند وتوليد {aiQuestionsCount} سؤال...</p>
                  ) : (
                    <span className="text-[11px] text-white/60">
                      {scannedFileName ? `📎 الملف المرفق: ${scannedFileName}` : 'يمكنك رفع ملف أو لصق نص والضغط على زر التوليد'}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={isExtractingDoc || (!scanDocInput.trim() && !scanDocDataUrl)}
                    onClick={() => executeGenerateFromScanDoc(scanDocInput, scanDocDataUrl, scannedFileName || 'مستند نصي')}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-500 hover:to-teal-500 text-slate-950 font-black text-xs transition disabled:opacity-50 cursor-pointer shadow-lg"
                  >
                    {isExtractingDoc ? 'جاري التوليد... ⏳' : `توليد ${aiQuestionsCount} سؤال من المستند / النص 📄✨`}
                  </button>
                </div>
              </div>
            )}

            {/* Quiz Comprehensive Metadata & Settings */}
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-white/80 block mb-1">اسم المسابقة:</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="مثال: مسابقة سفر دانيال وأتون النار"
                    className="w-full px-3.5 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-bold focus:outline-hidden focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-white/80 block mb-1">الفئة / الموضوع:</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/20 text-white text-xs font-bold"
                  >
                    {QUIZ_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-white/80 block mb-1">الفئة العمرية / المستوى:</label>
                  <select
                    value={editAgeGroup}
                    onChange={(e) => setEditAgeGroup(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/20 text-white text-xs font-bold"
                  >
                    {AGE_GROUPS.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-white/80 block mb-1">وصف المسابقة:</label>
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="وصف مختصر يظهر للمخدومين..."
                    className="w-full px-3.5 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-white/80 block mb-1">الوسوم (Tags مفصولة بفاصلة):</label>
                  <input
                    type="text"
                    value={editTagsInput}
                    onChange={(e) => setEditTagsInput(e.target.value)}
                    placeholder="دانيال, عهد قديم, شباب..."
                    className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-white/80 block mb-1">وضع اللعب الافتراضي:</label>
                  <select
                    value={editGameMode}
                    onChange={(e: any) => setEditGameMode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/20 text-white text-xs font-bold"
                  >
                    <option value="live">تفاعل مباشر (Live)</option>
                    <option value="team">وضع الفرق (Team Mode)</option>
                    <option value="self_paced">تحدي ذاتي (Self-Paced)</option>
                    <option value="anonymous_poll">تصويت بدون أسماء</option>
                  </select>
                </div>
              </div>

              {/* Team Mode Settings inside Creator Studio */}
              {editGameMode === 'team' && (
                <div className="bg-blue-950/40 p-4 rounded-2xl border border-blue-400/30 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black text-blue-300">🛡️ إعدادات الفرق المخصصة (عدد الفرق، الأسماء، وطريقة التوزيع):</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditTeamAssignmentMode('random')}
                        className={`px-3 py-1 rounded-xl text-[11px] font-black border cursor-pointer ${
                          editTeamAssignmentMode === 'random'
                            ? 'bg-amber-400 text-slate-950 border-white'
                            : 'bg-white/10 text-white border-white/20'
                        }`}
                      >
                        🎲 توزيع عشوائي تلقائي
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTeamAssignmentMode('manual_or_pin')}
                        className={`px-3 py-1 rounded-xl text-[11px] font-black border cursor-pointer ${
                          editTeamAssignmentMode === 'manual_or_pin'
                            ? 'bg-amber-400 text-slate-950 border-white'
                            : 'bg-white/10 text-white border-white/20'
                        }`}
                      >
                        🔑 اختيار يدوي + PIN و QR خاص لكل فريق
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[11px] text-white/75">عدد الفرق ({editCustomTeams.length} فرق):</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (editCustomTeams.length >= 10) return;
                          const nextIdx = editCustomTeams.length;
                          const preset = DEFAULT_TEAM_CONFIGS[nextIdx] || {
                            id: `team_custom_${Date.now()}`,
                            name: `⚡ الفريق رقم ${nextIdx + 1}`,
                            color: '#f59e0b'
                          };
                          setEditCustomTeams([...editCustomTeams, { ...preset, id: `team_${nextIdx + 1}_${Date.now().toString().slice(-3)}` }]);
                        }}
                        disabled={editCustomTeams.length >= 10}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-400/40 text-[11px] font-black cursor-pointer disabled:opacity-40"
                      >
                        + إضافة فريق
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editCustomTeams.length <= 2) return;
                          setEditCustomTeams(editCustomTeams.slice(0, -1));
                        }}
                        disabled={editCustomTeams.length <= 2}
                        className="px-2.5 py-1 rounded-lg bg-red-500/25 hover:bg-red-500/40 text-red-200 border border-red-400/40 text-[11px] font-black cursor-pointer disabled:opacity-40"
                      >
                        - تقليل فريق
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                    {editCustomTeams.map((t, idx) => (
                      <div key={t.id} className="bg-black/40 p-2 rounded-xl border border-white/15 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-500/30 text-blue-200 text-[10px] font-black flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={t.name}
                          onChange={(e) => {
                            const updated = [...editCustomTeams];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            setEditCustomTeams(updated);
                          }}
                          className="w-full bg-transparent text-white text-xs font-bold focus:outline-hidden border-b border-transparent focus:border-amber-400"
                          placeholder={`اسم الفريق ${idx + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cover Image & Advanced Settings Toggles */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10 text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/30 font-bold flex items-center gap-1.5 cursor-pointer">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{editCoverImage ? 'تغيير صورة الغلاف 🖼️' : 'رفع صورة غلاف للمسابقة 🖼️'}</span>
                    <input type="file" accept="image/*" onChange={handleQuizCoverUpload} className="hidden" />
                  </label>
                  {editCoverImage && (
                    <div className="flex items-center gap-2">
                      <img src={editCoverImage} alt="غلاف" className="w-10 h-10 rounded-lg object-cover border border-amber-400/50" />
                      <button
                        type="button"
                        onClick={() => setEditCoverImage('')}
                        className="text-[11px] text-red-300 hover:text-red-400 font-bold cursor-pointer"
                      >
                        حذف الغلاف ✕
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-white/70">السعة:</span>
                    <input
                      type="number"
                      min={0}
                      value={editMaxPlayers}
                      onChange={(e) => setEditMaxPlayers(parseInt(e.target.value, 10) || 0)}
                      className="w-20 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-mono text-center"
                      title="0 = غير محدود"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap text-[11px] font-bold">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editSettings.speedBonus ?? true}
                      onChange={(e) => setEditSettings((s: KahootQuizSettings) => ({ ...s, speedBonus: e.target.checked }))}
                      className="accent-amber-400"
                    />
                    <span>مكافأة السرعة ⚡</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editSettings.streakBonus ?? true}
                      onChange={(e) => setEditSettings((s: KahootQuizSettings) => ({ ...s, streakBonus: e.target.checked }))}
                      className="accent-amber-400"
                    />
                    <span>مكافأة السلسلة 🔥</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editSettings.allowLateJoin ?? true}
                      onChange={(e) => setEditSettings((s: KahootQuizSettings) => ({ ...s, allowLateJoin: e.target.checked }))}
                      className="accent-amber-400"
                    />
                    <span>دخول متأخر 🚪</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editSettings.showCorrectAnswers ?? true}
                      onChange={(e) => setEditSettings((s: KahootQuizSettings) => ({ ...s, showCorrectAnswers: e.target.checked }))}
                      className="accent-amber-400"
                    />
                    <span>إظهار الإجابة الصحيحة ✔️</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer bg-emerald-500/15 px-2.5 py-1 rounded-lg border border-emerald-400/30 text-emerald-200">
                    <input
                      type="checkbox"
                      checked={editSettings.allowRetry ?? false}
                      onChange={(e) => setEditSettings((s: KahootQuizSettings) => ({ ...s, allowRetry: e.target.checked }))}
                      className="accent-emerald-400"
                    />
                    <span>السماح بإعادة المسابقة لتحسين السكور 🔄</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer bg-cyan-500/15 px-2.5 py-1 rounded-lg border border-cyan-400/30 text-cyan-200">
                    <input
                      type="checkbox"
                      checked={editSettings.selfPacedTimerEnabled ?? true}
                      onChange={(e) => setEditSettings((s: KahootQuizSettings) => ({ ...s, selfPacedTimerEnabled: e.target.checked }))}
                      className="accent-cyan-400"
                    />
                    <span>تايمر للأسئلة في التحدي الذاتي ⏱️</span>
                  </label>
                </div>

                {/* Scheduling & Visibility Control Panel (Open from Date/Time to Date/Time + Auto-Hide + Manual Show/Hide) */}
                <div className="mt-3 pt-3 border-t border-white/15 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-black text-amber-300">
                        توقيت فتح وإغلاق المسابقة والتحكم في ظهورها للمخدومين:
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setEditIsVisibleToMembers(prev => !prev)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black border transition cursor-pointer flex items-center gap-1.5 ${
                          editIsVisibleToMembers
                            ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40'
                            : 'bg-rose-500/25 text-rose-200 border-rose-400/40'
                        }`}
                      >
                        <span>{editIsVisibleToMembers ? '👁️ ظاهرة في صفحة المخدومين' : '🚫 مخفية عن صفحة المخدومين'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditIsScheduled(prev => !prev)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black border transition cursor-pointer flex items-center gap-1.5 ${
                          editIsScheduled
                            ? 'bg-amber-400 text-slate-950 border-amber-300 shadow'
                            : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/15'
                        }`}
                      >
                        <span>{editIsScheduled ? '⏰ جدولة التوقيت مفعّلة ✔️' : '⏰ تحديد موعد فتح وإغلاق (من يوم/ساعة إلى يوم/ساعة)'}</span>
                      </button>
                    </div>
                  </div>

                  {editIsScheduled && (
                    <div className="bg-black/40 p-3.5 rounded-2xl border border-amber-400/30 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-emerald-300 block mb-1">📅 تفتح من يوم (تاريخ البداية):</label>
                          <input
                            type="date"
                            value={editAvailableFromDate}
                            onChange={(e) => setEditAvailableFromDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-emerald-300 block mb-1">🕒 من الساعة (وقت الفتح):</label>
                          <input
                            type="time"
                            value={editAvailableFromTime}
                            onChange={(e) => setEditAvailableFromTime(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-rose-300 block mb-1">📅 تغلق يوم (تاريخ النهاية):</label>
                          <input
                            type="date"
                            value={editAvailableToDate}
                            onChange={(e) => setEditAvailableToDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-rose-300 block mb-1">🕒 إلى الساعة (وقت الإغلاق):</label>
                          <input
                            type="time"
                            value={editAvailableToTime}
                            onChange={(e) => setEditAvailableToTime(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-200">
                          <input
                            type="checkbox"
                            checked={editAutoHideOnExpiry}
                            onChange={(e) => setEditAutoHideOnExpiry(e.target.checked)}
                            className="accent-amber-400 w-4 h-4"
                          />
                          <span>🔒 إلغاء الدخول وإخفاء المسابقة تلقائياً من صفحة كل المخدومين فور انتهاء توقيتها</span>
                        </label>
                        <span className="text-[11px] text-white/60">
                          بمجرد انتهاء الساعة المحددة تختفي المسابقة فوراً من حسابات المخدومين ولا يقبل النظام دخول أي مشارك.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ========================================================
                INTERACTIVE SLIDE-BY-SLIDE QUESTION CREATOR (KAHOOT STYLE)
                ======================================================== */}
            <div className="grid grid-cols-12 gap-4 items-start">
              
              {/* Left Column: Slides Preview Thumbnails List */}
              <div className="col-span-12 md:col-span-4 bg-black/40 p-3 rounded-2xl border border-white/15 space-y-2 max-h-[460px] overflow-y-auto">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 gap-1 flex-wrap">
                  <span className="text-xs font-bold text-amber-300">شرائح الأسئلة ({editQuestions.length})</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowImportFromBankModal(true)}
                      className="px-2 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black flex items-center gap-1 transition cursor-pointer"
                      title="استيراد سؤال من بنك الأسئلة"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>من البنك</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddNewQuestion('quiz')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>إضافة شريحة</span>
                    </button>
                  </div>
                </div>

                {editQuestions.length === 0 ? (
                  <div className="text-center py-8 text-white/40 text-xs italic">
                    لا توجد شرائح حالياً. اضغط "إضافة شريحة" للبدء!
                  </div>
                ) : (
                  editQuestions.map((q, idx) => (
                    <div
                      key={q.id}
                      onClick={() => setActiveEditingQuestionIndex(idx)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition ${
                        activeEditingQuestionIndex === idx 
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md font-bold' 
                          : q.isDisabled
                            ? 'bg-white/5 border-white/5 opacity-50 text-white/60'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-5 h-5 rounded-full bg-black/20 text-center text-xs flex items-center justify-center font-mono shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-xs truncate">{q.title || 'سؤال بدون عنوان'}</span>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveQuestionToBank(q);
                          }}
                          className="p-1 hover:bg-black/20 rounded"
                          title="حفظ في بنك الأسئلة المركزي"
                        >
                          <Bookmark className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateQuestion(idx);
                          }}
                          className="p-1 hover:bg-black/20 rounded"
                          title="تكرار الشريحة"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveQuestion(idx, 'up');
                          }}
                          className="p-1 hover:bg-black/20 rounded"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveQuestion(idx, 'down');
                          }}
                          className="p-1 hover:bg-black/20 rounded"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteQuestion(idx);
                          }}
                          className="p-1 hover:bg-red-500/30 text-red-400 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Right Column: Active Question Detailed Editor */}
              <div className="col-span-12 md:col-span-8 bg-black/40 p-5 rounded-2xl border border-white/15 space-y-4">
                {editQuestions[activeEditingQuestionIndex] ? (
                  (() => {
                    const q = editQuestions[activeEditingQuestionIndex];
                    return (
                      <div className="space-y-4">
                        
                        {/* Question Title & Disable Toggle */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-white/80">
                              نص السؤال رقم ({activeEditingQuestionIndex + 1}):
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={q.isDisabled || false}
                                onChange={(e) => handleUpdateCurrentEditingQuestion({ isDisabled: e.target.checked })}
                                className="accent-amber-400"
                              />
                              <span>تعطيل مؤقت لهذه الشريحة</span>
                            </label>
                          </div>
                          <input
                            type="text"
                            value={q.title}
                            onChange={(e) => handleUpdateCurrentEditingQuestion({ title: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:outline-hidden focus:border-amber-400 font-bold"
                          />
                        </div>

                        {/* Question Settings Bar: Type, Timer, Points */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          {/* Type Selector */}
                          <div>
                            <label className="text-[10px] text-white/70 block mb-0.5">نوع السؤال (16 نوعاً):</label>
                            <select
                              value={q.type}
                              onChange={(e: any) => {
                                const newType = e.target.value as KahootQuestionType;
                                const updates: Partial<KahootQuestion> = { type: newType };
                                if (newType === 'matching' && (!q.matchingPairs || q.matchingPairs.length === 0)) {
                                  updates.matchingPairs = [
                                    { id: 'mp_1', leftText: 'شدرخ', rightText: 'حنانيا' },
                                    { id: 'mp_2', leftText: 'ميشخ', rightText: 'ميشائيل' },
                                    { id: 'mp_3', leftText: 'عبد نغو', rightText: 'عزريا' }
                                  ];
                                } else if (newType === 'puzzle' && (!q.puzzleItems || q.puzzleItems.length === 0)) {
                                  updates.puzzleItems = [
                                    { id: `puz_${Date.now()}_0`, text: 'الخطوة الأولى', correctIndex: 0 },
                                    { id: `puz_${Date.now()}_1`, text: 'الخطوة الثانية', correctIndex: 1 },
                                    { id: `puz_${Date.now()}_2`, text: 'الخطوة الثالثة', correctIndex: 2 },
                                    { id: `puz_${Date.now()}_3`, text: 'الخطوة الرابعة', correctIndex: 3 }
                                  ];
                                } else if (newType === 'true_false') {
                                  updates.options = [
                                    { id: `opt_${Date.now()}_1`, text: 'صح ✔️', isCorrect: true, color: 'blue' },
                                    { id: `opt_${Date.now()}_2`, text: 'خطأ ✖️', isCorrect: false, color: 'red' }
                                  ];
                                } else if (newType === 'pin_answer' || newType === 'drop_pin') {
                                  if (!q.pinCoordinates) {
                                    updates.pinCoordinates = { xPercent: 50, yPercent: 50, tolerancePercent: 18 };
                                  }
                                  if (!q.mediaUrl) {
                                    updates.mediaUrl = 'https://images.unsplash.com/photo-1548625361-195977935bb8?w=900';
                                    updates.mediaType = 'image';
                                  }
                                } else if (newType === 'type_answer' && !q.correctTextAnswer) {
                                  updates.correctTextAnswer = 'الإجابة الصحيحة';
                                } else if (newType === 'slider' && q.sliderCorrectValue === undefined) {
                                  updates.sliderMin = 1;
                                  updates.sliderMax = 10;
                                  updates.sliderCorrectValue = 5;
                                  updates.sliderMarginOfError = 1;
                                }
                                handleUpdateCurrentEditingQuestion(updates);
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-white/20 text-white text-xs"
                            >
                              <optgroup label="أسئلة تنافسية (Scored)">
                                <option value="quiz">اختيار من متعدد (Quiz)</option>
                                <option value="image_quiz">اختيار بالصور (Image Quiz)</option>
                                <option value="true_false">صح أم خطأ (True/False)</option>
                                <option value="matching">سؤال التوصيل والمطابقة (Matching)</option>
                                <option value="puzzle">ترتيب عناصر (Puzzle)</option>
                                <option value="type_answer">كتابة الإجابة (Type Answer)</option>
                                <option value="slider">شريط التقدير (Slider)</option>
                                <option value="audio_quiz">سؤال صوتي (Audio Quiz)</option>
                                <option value="pin_answer">تحديد بالدبوس (Pin Answer) 📍</option>
                              </optgroup>
                              <optgroup label="جمع آراء وتفاعل (Unscored)">
                                <option value="poll">تصويت فوري (Poll)</option>
                                <option value="word_cloud">سحابة كلمات (Word Cloud)</option>
                                <option value="open_ended">سؤال مفتوح (Open Ended)</option>
                                <option value="brainstorm">عصف ذهني (Brainstorm)</option>
                                <option value="rating">تقييم بالنجوم (Rating)</option>
                                <option value="scale">مقياس رقمي (Scale)</option>
                                <option value="drop_pin">دبوس الرأي على صورة (Drop Pin)</option>
                              </optgroup>
                            </select>
                          </div>

                          {/* Timer Selector */}
                          <div>
                            <label className="text-[10px] text-white/70 block mb-0.5">وقت السؤال (تايمر):</label>
                            <select
                              value={q.timeLimitSeconds}
                              onChange={(e) => handleUpdateCurrentEditingQuestion({ timeLimitSeconds: Number(e.target.value) })}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-white/20 text-white text-xs"
                            >
                              <option value={5}>5 ثوانٍ</option>
                              <option value={10}>10 ثوانٍ</option>
                              <option value={15}>15 ثانية</option>
                              <option value={20}>20 ثانية (الافتراضي)</option>
                              <option value={30}>30 ثانية</option>
                              <option value={45}>45 ثانية</option>
                              <option value={60}>60 ثانية (دقيقة)</option>
                              <option value={90}>90 ثانية</option>
                              <option value={120}>120 ثانية (دقيقتان)</option>
                            </select>
                          </div>

                          {/* Points Multiplier */}
                          <div>
                            <label className="text-[10px] text-white/70 block mb-0.5">نظام النقاط:</label>
                            <select
                              value={q.pointsMultiplier}
                              onChange={(e) => handleUpdateCurrentEditingQuestion({ pointsMultiplier: Number(e.target.value) })}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-white/20 text-white text-xs"
                            >
                              <option value={1}>قياسي (1000 نقطة)</option>
                              <option value={2}>مضاعف 🔥 (2000 نقطة)</option>
                              <option value={0}>بدون نقاط (استطلاع / رأي)</option>
                            </select>
                          </div>
                        </div>

                        {/* Media Controls for Question */}
                        <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-2">
                          <label className="text-xs font-bold text-white/80 block">إرفاق وسائط للسؤال (رفع صورة من جهازك، رابط صورة، أو يوتيوب):</label>
                          <div className="flex flex-wrap gap-2 items-center">
                            <input
                              type="text"
                              value={q.mediaUrl || ''}
                              onChange={(e) => handleUpdateCurrentEditingQuestion({ mediaUrl: e.target.value, mediaType: e.target.value.includes('youtu') ? 'youtube' : 'image' })}
                              placeholder="رابط الصورة المباشر أو رابط YouTube..."
                              className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs select-text"
                            />
                            <label className="px-3 py-1.5 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition border border-purple-400/40">
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span>رفع صورة للسؤال 📷</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleQuestionImageUpload}
                                className="hidden"
                              />
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-amber-300 font-bold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={q.imageReveal || false}
                                onChange={(e) => handleUpdateCurrentEditingQuestion({ imageReveal: e.target.checked })}
                                className="w-3.5 h-3.5 rounded accent-amber-400"
                              />
                              <span>كشف تدريجي (Tile Reveal)</span>
                            </label>
                          </div>
                          {q.mediaUrl && !q.mediaUrl.includes('youtu') && q.type !== 'pin_answer' && q.type !== 'drop_pin' && (
                            <div className="flex items-center gap-3 pt-1">
                              <img src={q.mediaUrl} alt="Question preview" className="w-20 h-14 object-cover rounded-lg border border-amber-400/40" />
                              <span className="text-[11px] text-emerald-300 font-bold">✓ الصورة جاهزة للعرض والمزامنة مع صفحات المخدومين</span>
                              <button
                                type="button"
                                onClick={() => handleUpdateCurrentEditingQuestion({ mediaUrl: '' })}
                                className="text-[11px] text-red-300 hover:text-red-400 font-bold cursor-pointer"
                              >
                                حذف صورة السؤال ✕
                              </button>
                            </div>
                          )}
                        </div>

                        {/* INTERACTIVE PIN ANSWER & DROP PIN IMAGE + TARGET COORDINATE EDITOR */}
                        {(q.type === 'pin_answer' || q.type === 'drop_pin') && (
                          <div className="bg-amber-500/10 p-4 rounded-2xl border-2 border-amber-400/40 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div>
                                <h5 className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                                  <span>📍 إعداد سؤال التحديد بالدبوس على الصورة ({q.type === 'pin_answer' ? 'تحديد الإجابة الصحيحة بالدبوس' : 'دبوس الرأي الحر'}):</span>
                                </h5>
                                <p className="text-[11px] text-white/75">
                                  اضغط مباشرة في أي مكان على الصورة بالأسفل لتحديد موقع الدبوس الصحيح الذي يجب على المتسابق النقر عليه!
                                </p>
                              </div>
                              <label className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow">
                                <ImageIcon className="w-3.5 h-3.5" />
                                <span>رفع / تغيير صورة الدبوس 📷</span>
                                <input type="file" accept="image/*" onChange={handleQuestionImageUpload} className="hidden" />
                              </label>
                            </div>

                            <div
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const xPercent = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
                                const yPercent = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
                                const currentTol = q.pinCoordinates?.tolerancePercent || 18;
                                handleUpdateCurrentEditingQuestion({
                                  pinCoordinates: { xPercent, yPercent, tolerancePercent: currentTol },
                                  mediaUrl: q.mediaUrl || 'https://images.unsplash.com/photo-1548625361-195977935bb8?w=900',
                                  mediaType: 'image'
                                });
                              }}
                              className="relative w-full max-w-lg mx-auto rounded-2xl overflow-hidden border-2 border-amber-400 cursor-crosshair select-none bg-slate-950 shadow-xl"
                            >
                              <img
                                src={q.mediaUrl || 'https://images.unsplash.com/photo-1548625361-195977935bb8?w=900'}
                                alt="Pin Target Editor"
                                className="w-full h-64 object-cover pointer-events-none block"
                              />
                              {q.type === 'pin_answer' && (
                                <>
                                  {/* Tolerance Hitbox Circle */}
                                  <div
                                    style={{
                                      left: `${q.pinCoordinates?.xPercent ?? 50}%`,
                                      top: `${q.pinCoordinates?.yPercent ?? 50}%`,
                                      width: `${(q.pinCoordinates?.tolerancePercent ?? 18) * 2}%`,
                                      height: `${(q.pinCoordinates?.tolerancePercent ?? 18) * 2}%`,
                                    }}
                                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-400 bg-emerald-500/25 pointer-events-none transition-all"
                                  />
                                  {/* Target Pin Marker */}
                                  <div
                                    style={{
                                      left: `${q.pinCoordinates?.xPercent ?? 50}%`,
                                      top: `${q.pinCoordinates?.yPercent ?? 50}%`,
                                    }}
                                    className="absolute -translate-x-1/2 -translate-y-full text-2xl pointer-events-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                                  >
                                    📍
                                  </div>
                                </>
                              )}
                            </div>

                            {q.type === 'pin_answer' && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center bg-black/40 p-3 rounded-xl border border-white/10 text-xs">
                                <div className="font-mono text-emerald-300 font-bold">
                                  الإحداثيات: X={q.pinCoordinates?.xPercent ?? 50}% , Y={q.pinCoordinates?.yPercent ?? 50}%
                                </div>
                                <div className="sm:col-span-2 flex items-center gap-2">
                                  <span className="text-white/80 font-bold shrink-0">نطاق القبول (حجم الدائرة الخضراء):</span>
                                  <input
                                    type="range"
                                    min={5}
                                    max={35}
                                    value={q.pinCoordinates?.tolerancePercent ?? 18}
                                    onChange={(e) => {
                                      const tol = Number(e.target.value) || 18;
                                      handleUpdateCurrentEditingQuestion({
                                        pinCoordinates: {
                                          xPercent: q.pinCoordinates?.xPercent ?? 50,
                                          yPercent: q.pinCoordinates?.yPercent ?? 50,
                                          tolerancePercent: tol
                                        }
                                      });
                                    }}
                                    className="flex-1 accent-emerald-400 cursor-pointer"
                                  />
                                  <span className="font-mono font-black text-amber-300 w-10 text-left">
                                    {q.pinCoordinates?.tolerancePercent ?? 18}%
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Puzzle Ordered Items Editor */}
                        {q.type === 'puzzle' && (
                          <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-amber-300">🧩 عناصر الترتيب الصحيح (من الأول إلى الأخير):</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextIdx = q.puzzleItems?.length || 0;
                                  const items = [
                                    ...(q.puzzleItems || []),
                                    { id: `puz_${Date.now()}_${nextIdx}`, text: `الخطوة ${nextIdx + 1}`, correctIndex: nextIdx }
                                  ];
                                  handleUpdateCurrentEditingQuestion({ puzzleItems: items });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold cursor-pointer"
                              >
                                + إضافة عنصر للترتيب
                              </button>
                            </div>
                            {(q.puzzleItems || []).map((item, idx) => (
                              <div key={item.id || idx} className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                <input
                                  type="text"
                                  value={item.text}
                                  onChange={(e) => {
                                    const updated = [...(q.puzzleItems || [])];
                                    updated[idx] = { ...item, text: e.target.value, correctIndex: idx };
                                    handleUpdateCurrentEditingQuestion({ puzzleItems: updated });
                                  }}
                                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs"
                                  placeholder={`العنصر رقم ${idx + 1}...`}
                                />
                                {(q.puzzleItems?.length || 0) > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (q.puzzleItems || [])
                                        .filter((_, i) => i !== idx)
                                        .map((it, newIdx) => ({ ...it, correctIndex: newIdx }));
                                      handleUpdateCurrentEditingQuestion({ puzzleItems: updated });
                                    }}
                                    className="p-1.5 rounded bg-red-500/20 text-red-300 text-xs cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Type Specific Fields in Creator */}
                        {q.type === 'type_answer' && (
                          <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-2">
                            <label className="text-xs font-bold text-emerald-300 block">الإجابة الصحيحة النصية:</label>
                            <input
                              type="text"
                              value={q.correctTextAnswer || ''}
                              onChange={(e) => handleUpdateCurrentEditingQuestion({ correctTextAnswer: e.target.value })}
                              placeholder="مثال: أربعة"
                              className="w-full px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs select-text"
                            />
                          </div>
                        )}

                        {q.type === 'slider' && (
                          <div className="grid grid-cols-3 gap-2 bg-white/5 p-3 rounded-xl border border-white/10 text-xs">
                            <div>
                              <span className="block text-white/70 mb-0.5">القيمة الصحيحة:</span>
                              <input
                                type="number"
                                value={q.sliderCorrectValue || 5}
                                onChange={(e) => handleUpdateCurrentEditingQuestion({ sliderCorrectValue: Number(e.target.value) })}
                                className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-xs"
                              />
                            </div>
                            <div>
                              <span className="block text-white/70 mb-0.5">الحد الأدنى:</span>
                              <input
                                type="number"
                                value={q.sliderMin || 1}
                                onChange={(e) => handleUpdateCurrentEditingQuestion({ sliderMin: Number(e.target.value) })}
                                className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-xs"
                              />
                            </div>
                            <div>
                              <span className="block text-white/70 mb-0.5">هامش الخطأ المقبول:</span>
                              <input
                                type="number"
                                value={q.sliderMarginOfError || 0}
                                onChange={(e) => handleUpdateCurrentEditingQuestion({ sliderMarginOfError: Number(e.target.value) })}
                                className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-xs"
                              />
                            </div>
                          </div>
                        )}

                        {/* Matching Pairs Editor */}
                        {q.type === 'matching' && (
                          <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-amber-300">🔗 أزواج التوصيل والمطابقة:</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const pairs = [...(q.matchingPairs || []), { id: `mp_${Date.now()}`, leftText: '', rightText: '' }];
                                  handleUpdateCurrentEditingQuestion({ matchingPairs: pairs });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold cursor-pointer"
                              >
                                + إضافة زوج توصيل
                              </button>
                            </div>
                            {(q.matchingPairs || []).map((pair, pIdx) => (
                              <div key={pair.id} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={pair.leftText}
                                  onChange={(e) => {
                                    const updated = [...(q.matchingPairs || [])];
                                    updated[pIdx] = { ...updated[pIdx], leftText: e.target.value };
                                    handleUpdateCurrentEditingQuestion({ matchingPairs: updated });
                                  }}
                                  placeholder="العمود الأول (مثال: شدرخ)"
                                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs"
                                />
                                <span className="text-amber-300 font-black">↔</span>
                                <input
                                  type="text"
                                  value={pair.rightText}
                                  onChange={(e) => {
                                    const updated = [...(q.matchingPairs || [])];
                                    updated[pIdx] = { ...updated[pIdx], rightText: e.target.value };
                                    handleUpdateCurrentEditingQuestion({ matchingPairs: updated });
                                  }}
                                  placeholder="المطابق الصحيح (مثال: حنانيا)"
                                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (q.matchingPairs || []).filter((_, i) => i !== pIdx);
                                    handleUpdateCurrentEditingQuestion({ matchingPairs: updated });
                                  }}
                                  className="p-1.5 rounded bg-red-500/20 text-red-300 text-xs cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Options Editor with Picture Upload Support for Each Option (2 to 6 options + MultiSelect) */}
                        {(q.type === 'quiz' || q.type === 'image_quiz' || q.type === 'audio_quiz' || q.type === 'poll' || q.type === 'true_false') && q.options && (
                          <div className="space-y-2.5 pt-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="text-xs font-bold text-white/80">
                                خيارات السؤال (حدد الإجابة الصحيحة ويمكنك رفع صورة مع أي خيار 📷):
                              </span>
                              <div className="flex items-center gap-3">
                                {(q.type === 'quiz' || q.type === 'image_quiz') && (
                                  <label className="flex items-center gap-1 text-[11px] font-bold text-blue-300 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={q.multiSelect || false}
                                      onChange={(e) => handleUpdateCurrentEditingQuestion({ multiSelect: e.target.checked })}
                                      className="accent-blue-400"
                                    />
                                    <span>سؤال متعدد الإجابات الصحيحة ☑️</span>
                                  </label>
                                )}
                                {q.type !== 'true_false' && q.options.length < 6 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextIdx = q.options!.length;
                                      const colors: Array<'red' | 'blue' | 'yellow' | 'green'> = ['red', 'blue', 'yellow', 'green'];
                                      const updatedOpts = [
                                        ...q.options!,
                                        { id: `opt_${Date.now()}`, text: `خيار ${nextIdx + 1}`, isCorrect: false, color: colors[nextIdx % 4] }
                                      ];
                                      handleUpdateCurrentEditingQuestion({ options: updatedOpts });
                                    }}
                                    className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold cursor-pointer"
                                  >
                                    + خيار إضافي (حتى 6)
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {q.options.map((opt, optIdx) => (
                                <div key={opt.id} className="bg-white/5 p-2.5 rounded-xl border border-white/15 space-y-2">
                                  <div className="flex items-center gap-2">
                                    {q.type !== 'poll' && (
                                      <input
                                        type="checkbox"
                                        checked={opt.isCorrect || false}
                                        onChange={(e) => {
                                          const updatedOpts = [...q.options!];
                                          updatedOpts[optIdx] = { ...updatedOpts[optIdx], isCorrect: e.target.checked };
                                          handleUpdateCurrentEditingQuestion({ options: updatedOpts });
                                        }}
                                        className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer shrink-0"
                                        title="تحديد كإجابة صحيحة"
                                      />
                                    )}
                                    <input
                                      type="text"
                                      value={opt.text}
                                      onChange={(e) => {
                                        const updatedOpts = [...q.options!];
                                        updatedOpts[optIdx] = { ...updatedOpts[optIdx], text: e.target.value };
                                        handleUpdateCurrentEditingQuestion({ options: updatedOpts });
                                      }}
                                      placeholder={`نص الخيار ${optIdx + 1}...`}
                                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs select-text"
                                    />
                                    <label
                                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-400/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition"
                                      title="رفع صورة لهذا الخيار"
                                    >
                                      <ImageIcon className="w-3.5 h-3.5" />
                                      <span>صورة</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleOptionImageUpload(optIdx, e)}
                                        className="hidden"
                                      />
                                    </label>
                                    {q.type !== 'true_false' && q.options!.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updatedOpts = q.options!.filter((_, i) => i !== optIdx);
                                          handleUpdateCurrentEditingQuestion({ options: updatedOpts });
                                        }}
                                        className="p-1 text-red-300 hover:text-red-400 text-xs cursor-pointer"
                                        title="حذف الخيار"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>

                                  {opt.imageUrl && (
                                    <div className="flex items-center justify-between bg-black/30 p-1.5 rounded-lg border border-white/10">
                                      <div className="flex items-center gap-2">
                                        <img
                                          src={opt.imageUrl}
                                          alt={opt.text}
                                          className="w-12 h-12 rounded-lg object-cover border border-amber-400/40"
                                        />
                                        <span className="text-[10px] text-emerald-300 font-bold">تم إرفاق صورة للخيار ✔️</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updatedOpts = [...q.options!];
                                          updatedOpts[optIdx] = { ...updatedOpts[optIdx], imageUrl: undefined };
                                          handleUpdateCurrentEditingQuestion({ options: updatedOpts });
                                        }}
                                        className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40 text-red-300 text-[10px] font-bold cursor-pointer"
                                      >
                                        حذف ✕
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Explanation, Biblical Reference & Servant Note */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 bg-white/5 p-3 rounded-xl border border-white/10">
                          <div>
                            <label className="text-[10px] font-bold text-amber-300 block mb-1">📖 المرجع الكتابي / الشاهد (اختياري):</label>
                            <input
                              type="text"
                              value={q.biblicalReference || ''}
                              onChange={(e) => handleUpdateCurrentEditingQuestion({ biblicalReference: e.target.value })}
                              placeholder="مثال: دانيال 3: 17-18"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-emerald-300 block mb-1">💡 شرح الإجابة الصحيحة (يظهر بعد الكشف):</label>
                            <input
                              type="text"
                              value={q.explanation || ''}
                              onChange={(e) => handleUpdateCurrentEditingQuestion({ explanation: e.target.value })}
                              placeholder="توضيح مختصر للمعلومة..."
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-purple-300 block mb-1">🎙️ ملاحظة للخادم على شاشة العرض:</label>
                            <input
                              type="text"
                              value={q.servantNote || ''}
                              onChange={(e) => handleUpdateCurrentEditingQuestion({ servantNote: e.target.value })}
                              placeholder="ملاحظة خاصة بمقدم المسابقة..."
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs"
                            />
                          </div>
                        </div>

                      </div>
                    );
                  })()
                ) : (
                  <div className="py-12 text-center text-white/50 text-xs italic">
                    اختر شريحة من القائمة على اليمين لتعديلها
                  </div>
                )}
              </div>

            </div>

            {/* Modal Bottom Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <span className="text-xs text-white/60">
                إجمالي الأسئلة: {editQuestions.length} سؤال
              </span>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreatorOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={!editTitle.trim()}
                  onClick={() => handleSaveQuiz('draft', true)}
                  className="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 font-black text-xs transition disabled:opacity-50 cursor-pointer"
                >
                  حفظ كمسودة 📝
                </button>
                <button
                  type="button"
                  disabled={!editTitle.trim()}
                  onClick={() => handleSaveQuiz('published', false)}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 text-white font-black text-xs transition shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  حفظ ونشر المسابقة 💾
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 4: IN-APP DELETE OR ARCHIVE COMPETITION CONFIRMATION MODAL
          ======================================================== */}
      {quizToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1b0a2a] border-2 border-red-500/50 rounded-3xl p-6 md:p-8 max-w-lg w-full text-white space-y-5 shadow-2xl animate-scaleIn text-center relative">
            <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto border border-red-500/30">
              <Trash2 className="w-8 h-8 text-red-400" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl md:text-2xl font-black text-white">
                حذف المسابقة أم نقلها للأرشيف؟
              </h3>
              <p className="text-sm font-bold text-amber-300">
                «{quizToDelete.title}»
              </p>
            </div>

            <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-4 text-xs text-red-200 leading-relaxed text-right space-y-2">
              <p className="font-bold flex items-center gap-1 text-red-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>الفرق بين الحذف النهائي والأرشيف:</span>
              </p>
              <p>
                • <strong className="text-white">الحذف النهائي 🗑️:</strong> يمسح المسابقة وجميع أسئلتها ({quizToDelete.questions.length} سؤال) <strong className="text-rose-300">ويمسح معها جميع نتائج وبيانات المشاركين فيها نهائياً</strong> من إجمالي المشاركين ومن قاعدة البيانات.
              </p>
              <p>
                • <strong className="text-amber-300">النقل للأرشيف 📦:</strong> يخفي المسابقة عن المخدومين وينقلها لقسم الأرشيف <strong className="text-emerald-300">مع الاحتفاظ الكامل بجميع بيانات ونتائج المشاركين فيها</strong> للرجوع إليها في أي وقت.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              {quizToDelete.status !== 'archived' && (
                <button
                  type="button"
                  onClick={() => {
                    handleArchiveQuiz(quizToDelete, true);
                    setQuizToDelete(null);
                  }}
                  className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition shadow-lg cursor-pointer"
                >
                  📦 نقل للأرشيف (مع حفظ بيانات ونتائج المشاركين)
                </button>
              )}
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const id = quizToDelete.id;
                    storageService.deleteKahootQuiz(id);
                    refreshQuizzes();
                    if (selectedQuiz?.id === id) {
                      setSelectedQuiz(null);
                    }
                    setQuizToDelete(null);
                    setShareToastMessage('🗑️ تم حذف المسابقة ومسح جميع بيانات المشاركين المرتبطة بها نهائياً');
                    setTimeout(() => setShareToastMessage(null), 3500);
                  }}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs transition shadow-xl shadow-red-600/30 cursor-pointer active:scale-95"
                >
                  تأكيد الحذف النهائي ومسح البيانات 🗑️
                </button>
                <button
                  type="button"
                  onClick={() => setQuizToDelete(null)}
                  className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition border border-white/20 cursor-pointer"
                >
                  إلغاء ✖️
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 5: ANTI-CHEAT AUDIT LOG (TAB-SWITCH MONITOR)
          ======================================================== */}
      {showCheatAuditModal && activeSession && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1b0a2a] border border-white/20 rounded-3xl p-6 md:p-8 max-w-xl w-full text-white space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-6 h-6 text-amber-400" />
                <div>
                  <h3 className="text-lg font-black text-white">سجل مراقبة الغش والحماية</h3>
                  <p className="text-[11px] text-white/60">مراقبة مغادرة الصفحة والتبديل بين التطبيقات لحظياً</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCheatAuditModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 text-white transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto">
              {Object.values(activeSession.players).length === 0 ? (
                <div className="py-8 text-center text-white/50 text-xs italic">
                  لا يوجد متسابقون حالياً
                </div>
              ) : (
                Object.values(activeSession.players).map((p) => {
                  const warnings = p.cheatWarningsCount || 0;
                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between transition ${
                        warnings > 0 
                          ? 'bg-red-500/15 border-red-500/30' 
                          : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/20 border border-white/30 flex items-center justify-center font-bold text-sm">
                          {p.avatar ? (
                            <img src={p.avatar} alt={p.name} className="w-full h-full rounded-full object-cover" />
                          ) : (
                            p.name.charAt(0)
                          )}
                        </div>
                        <div>
                          <span className="font-bold text-sm text-white block">{p.name}</span>
                          <span className="text-[10px] text-white/60">
                            النقاط الحالية: {p.score.toLocaleString('ar-EG')}
                          </span>
                        </div>
                      </div>

                      <div className="text-left">
                        {warnings > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-black bg-red-600/30 text-red-300 px-3 py-1 rounded-full border border-red-500/40">
                            🚨 {warnings} مخالفات (تبديل التبويب)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                            ✔️ نزيه (صفر مخالفات)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-white/10 pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCheatAuditModal(false)}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 6: LAUNCH GAME MODE SELECTOR MODAL (4 MODES + TEAM CONFIG)
          ======================================================== */}
      {launchModalQuiz && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1b0a2a] border border-amber-400/40 rounded-3xl p-6 md:p-8 max-w-2xl w-full text-white space-y-5 shadow-2xl animate-scaleIn my-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-lg font-black text-white">🚀 اختيار وتثبيت وضع تشغيل المسابقة</h3>
                <p className="text-xs text-amber-300 font-bold">{launchModalQuiz.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setLaunchModalQuiz(null)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-right">
              {[
                { id: 'self_paced', title: '🎯 تحدي ذاتي (Self-Paced)', desc: 'يدخل كل مخدوم ليحل المسابقة بمفرده وتظهر له الـ Top 3 فوق ونتيجته تحت (وللمسؤول كل المشاركين)' },
                { id: 'live', title: '📺 تفاعل مباشر (Live Host)', desc: 'غرفة مفتوحة تقبل وتُقفل، QR + PIN، والـ Top 10 التراكمي بعد كل سؤال ومنصة تتويج في النهاية' },
                { id: 'team', title: '🛡️ نظام الفرق (Team Mode)', desc: 'تحكم كامل في عدد وأسماء الفرق، توزيع عشوائي أو PIN/QR لكل فريق، ومجموع نقاط الفريق بعد كل سؤال' },
                { id: 'anonymous_poll', title: '🕵️ تصويت بدون أسماء', desc: 'جلسة تفاعلية واستطلاع آراء مع إخفاء هويات المشاركين على الشاشة' },
              ].map((m) => {
                const isSelected = launchSelectedMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setLaunchSelectedMode(m.id as KahootGameMode)}
                    className={`p-4 rounded-2xl border text-right transition cursor-pointer space-y-1 shadow-lg ${
                      isSelected
                        ? 'bg-amber-400/20 border-amber-400 ring-2 ring-amber-400/40'
                        : 'bg-white/5 hover:bg-white/10 border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-amber-300">{m.title}</span>
                      {isSelected && <span className="text-xs bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-full">محدد ✔️</span>}
                    </div>
                    <p className="text-[11px] leading-relaxed text-white/80">{m.desc}</p>
                  </button>
                );
              })}
            </div>

            {/* Team Mode Customization inside Launch Modal */}
            {launchSelectedMode === 'team' && (
              <div className="bg-blue-950/50 border border-blue-400/40 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-black text-blue-300">🛡️ إعدادات الفرق قبل إطلاق الغرفة:</h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditTeamAssignmentMode('random')}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer transition ${
                        editTeamAssignmentMode === 'random'
                          ? 'bg-amber-400 text-slate-950 border-white'
                          : 'bg-white/10 text-white border-white/20'
                      }`}
                    >
                      🎲 توزيع عشوائي تلقائي
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditTeamAssignmentMode('manual_or_pin')}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer transition ${
                        editTeamAssignmentMode === 'manual_or_pin'
                          ? 'bg-amber-400 text-slate-950 border-white'
                          : 'bg-white/10 text-white border-white/20'
                      }`}
                    >
                      🔑 اختيار كل فريق لوحده (PIN + QR خاص لكل فريق)
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-white/85">
                    التحكم في عدد الفرق ({editCustomTeams.length} فرق):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (editCustomTeams.length >= 10) return;
                        const nextIdx = editCustomTeams.length;
                        const preset = DEFAULT_TEAM_CONFIGS[nextIdx] || {
                          id: `team_custom_${Date.now()}`,
                          name: `⚡ الفريق رقم ${nextIdx + 1}`,
                          color: '#f59e0b'
                        };
                        setEditCustomTeams([...editCustomTeams, { ...preset, id: `team_${nextIdx + 1}_${Date.now().toString().slice(-3)}` }]);
                      }}
                      disabled={editCustomTeams.length >= 10}
                      className="px-3 py-1 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-400/40 text-xs font-black cursor-pointer disabled:opacity-40"
                    >
                      + إضافة فريق
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editCustomTeams.length <= 2) return;
                        setEditCustomTeams(editCustomTeams.slice(0, -1));
                      }}
                      disabled={editCustomTeams.length <= 2}
                      className="px-3 py-1 rounded-xl bg-red-500/25 hover:bg-red-500/40 text-red-200 border border-red-400/40 text-xs font-black cursor-pointer disabled:opacity-40"
                    >
                      - حذف فريق
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {editCustomTeams.map((t, idx) => (
                    <div key={t.id} className="bg-black/40 p-2.5 rounded-xl border border-white/15 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-500/30 text-blue-200 text-xs font-black flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={t.name}
                        onChange={(e) => {
                          const updated = [...editCustomTeams];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setEditCustomTeams(updated);
                        }}
                        className="w-full bg-transparent text-white text-xs font-black focus:outline-hidden border-b border-white/20 focus:border-amber-400 pb-0.5"
                        placeholder={`اسم الفريق ${idx + 1}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Self-Paced Mode Customization inside Launch Modal */}
            {launchSelectedMode === 'self_paced' && (
              <div className="bg-emerald-950/50 border border-emerald-400/40 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-black text-emerald-300">🎯 إعدادات التحدي الذاتي (تتحكم بها أنت كمسؤول المسابقة):</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-black/40 p-3 rounded-xl border border-white/15 space-y-2">
                    <span className="text-xs font-bold text-white block">🔄 إعادة المسابقة لتحسين السكور:</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const updated: KahootQuiz = {
                            ...launchModalQuiz,
                            settings: { ...(launchModalQuiz.settings || editSettings), allowRetry: false }
                          };
                          setLaunchModalQuiz(updated);
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black border cursor-pointer transition ${
                          !(launchModalQuiz.settings?.allowRetry ?? false)
                            ? 'bg-red-500 text-white border-white shadow'
                            : 'bg-white/10 text-white/70 border-white/15'
                        }`}
                      >
                        🔒 مغلق (محاولة واحدة فقط)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated: KahootQuiz = {
                            ...launchModalQuiz,
                            settings: { ...(launchModalQuiz.settings || editSettings), allowRetry: true }
                          };
                          setLaunchModalQuiz(updated);
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black border cursor-pointer transition ${
                          launchModalQuiz.settings?.allowRetry === true
                            ? 'bg-emerald-500 text-white border-white shadow'
                            : 'bg-white/10 text-white/70 border-white/15'
                        }`}
                      >
                        🔄 مسموح بإعادة المحاولة
                      </button>
                    </div>
                  </div>

                  <div className="bg-black/40 p-3 rounded-xl border border-white/15 space-y-2">
                    <span className="text-xs font-bold text-white block">⏱️ مؤقت الأسئلة (التايمر):</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const updated: KahootQuiz = {
                            ...launchModalQuiz,
                            settings: { ...(launchModalQuiz.settings || editSettings), selfPacedTimerEnabled: true }
                          };
                          setLaunchModalQuiz(updated);
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black border cursor-pointer transition ${
                          (launchModalQuiz.settings?.selfPacedTimerEnabled ?? true)
                            ? 'bg-amber-400 text-slate-950 border-white shadow'
                            : 'bg-white/10 text-white/70 border-white/15'
                        }`}
                      >
                        ⏱️ بتايمر لكل سؤال
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated: KahootQuiz = {
                            ...launchModalQuiz,
                            settings: { ...(launchModalQuiz.settings || editSettings), selfPacedTimerEnabled: false }
                          };
                          setLaunchModalQuiz(updated);
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black border cursor-pointer transition ${
                          launchModalQuiz.settings?.selfPacedTimerEnabled === false
                            ? 'bg-cyan-400 text-slate-950 border-white shadow'
                            : 'bg-white/10 text-white/70 border-white/15'
                        }`}
                      >
                        ♾️ بدون تايمر (وقت مفتوح)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-white/10 flex-wrap">
              <button
                type="button"
                onClick={() => setLaunchModalQuiz(null)}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>

              {launchSelectedMode === 'self_paced' ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleActivateSelfPacedMode(launchModalQuiz)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black shadow-lg cursor-pointer"
                  >
                    📊 تثبيت التحدي الذاتي ومتابعة المشاركين والـ Top 10
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleActivateSelfPacedMode(launchModalQuiz);
                      setAnalyticsQuiz(null);
                      handleStartSoloQuiz(launchModalQuiz);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black shadow-lg cursor-pointer"
                  >
                    تجربة التحدي الذاتي كمتسابق 🚀
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleStartHosting(launchModalQuiz, launchSelectedMode, editTeamAssignmentMode, editCustomTeams, false)}
                    className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 text-white text-xs font-black shadow-xl cursor-pointer border border-purple-400/40"
                  >
                    👁️📺 فتح الغرفة والمتابعة كمراقب / مقدم (Host)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartHosting(launchModalQuiz, launchSelectedMode, editTeamAssignmentMode, editCustomTeams, true)}
                    className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 text-slate-950 text-xs font-black shadow-xl cursor-pointer"
                  >
                    🎮 فتح الغرفة والمشاركة كمتسابق معهم 🚀
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 7: QUIZ PREVIEW MODAL (معاينة كاملة للمسابقة)
          ======================================================== */}
      {previewQuiz && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1b0a2a] border border-white/20 rounded-3xl p-6 md:p-8 max-w-2xl w-full text-white space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <span className="text-[11px] text-amber-300 font-bold">👁️ وضع المعاينة قبل النشر أو التشغيل</span>
                <h3 className="text-lg font-black text-white">{previewQuiz.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewQuiz(null)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {previewQuiz.questions[previewSlideIndex] ? (() => {
              const pq = previewQuiz.questions[previewSlideIndex];
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-white/70">
                    <span>السؤال {previewSlideIndex + 1} من {previewQuiz.questions.length}</span>
                    <span className="bg-amber-400/20 text-amber-300 px-2.5 py-0.5 rounded-full font-bold">
                      ⏱️ {pq.timeLimitSeconds} ثانية • نوع: {pq.type}
                    </span>
                  </div>

                  <div className="bg-black/40 p-5 rounded-2xl border border-white/15 text-center space-y-2">
                    <h4 className="text-base md:text-lg font-black text-white">{pq.title}</h4>
                    {pq.mediaUrl && (
                      <img src={pq.mediaUrl} alt="" className="w-40 h-28 object-cover rounded-xl mx-auto border border-white/20" />
                    )}
                  </div>

                  {pq.options && pq.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {pq.options.map((o, idx) => (
                        <div
                          key={o.id}
                          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                            o.isCorrect ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200' : 'bg-white/5 border-white/10 text-white/80'
                          }`}
                        >
                          <span>{idx + 1}. {o.text}</span>
                          {o.isCorrect && <span>✔️ صحيحة</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {(pq.explanation || pq.biblicalReference || pq.servantNote) && (
                    <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-xs space-y-1">
                      {pq.biblicalReference && <div className="text-amber-300 font-bold">📖 الشاهد: {pq.biblicalReference}</div>}
                      {pq.explanation && <div className="text-white/80">💡 الشرح: {pq.explanation}</div>}
                      {pq.servantNote && <div className="text-purple-300">🎙️ ملاحظة الخادم: {pq.servantNote}</div>}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <button
                      type="button"
                      disabled={previewSlideIndex === 0}
                      onClick={() => setPreviewSlideIndex((i: number) => Math.max(0, i - 1))}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs font-bold cursor-pointer"
                    >
                      السابق
                    </button>
                    <button
                      type="button"
                      disabled={previewSlideIndex >= previewQuiz.questions.length - 1}
                      onClick={() => setPreviewSlideIndex((i: number) => Math.min(previewQuiz.questions.length - 1, i + 1))}
                      className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-40 text-slate-950 text-xs font-black cursor-pointer"
                    >
                      التالي
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div className="text-center py-8 text-white/50 text-xs">لا توجد أسئلة في هذه المسابقة</div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 8: RESULTS, PARTICIPANT ANSWERS INSPECTOR & EXPORT MODAL
          ======================================================== */}
      {analyticsQuiz && (() => {
        const currentAnalyticsQuiz = quizzes.find(q => q.id === analyticsQuiz.id) || analyticsQuiz;
        const linkedLiveSession =
          (activeSession && activeSession.quizId === currentAnalyticsQuiz.id ? activeSession : null) ||
          (currentAnalyticsQuiz.activeSessionId ? storageService.getKahootSession(currentAnalyticsQuiz.activeSessionId) : null);
        const quizSessions = linkedLiveSession ? [linkedLiveSession] : [];
        const quizSoloScores = allSoloScores
          .filter(s => s.quizId === currentAnalyticsQuiz.id)
          .sort((a, b) => b.score - a.score);
        const soloTop10 = quizSoloScores.slice(0, 10);
        const soloInProgressCount = quizSoloScores.filter(s => s.status === 'in_progress').length;
        const soloCompletedCount = quizSoloScores.filter(s => s.status !== 'in_progress').length;

        const qStats = currentAnalyticsQuiz.questions.map((q, idx) => {
          let totalAns = 0;
          let correctAns = 0;
          quizSessions.forEach((s: KahootLiveSession) => {
            Object.entries(s.answersSubmitted || {}).forEach(([k, v]: [string, any]) => {
              if (k.endsWith(`_${q.id}`)) {
                totalAns++;
                if (v?.isCorrect) correctAns++;
              }
            });
          });
          quizSoloScores.forEach((solo) => {
            const ans = solo.answersDetail?.find(a => a.questionId === q.id);
            if (ans) {
              totalAns++;
              if (ans.isCorrect) correctAns++;
            }
          });
          const rate = totalAns > 0 ? Math.round((correctAns / totalAns) * 100) : null;
          return { index: idx + 1, title: q.title, totalAns, correctAns, rate };
        });

        const answeredQs = qStats.filter(q => q.rate !== null);
        const hardestQ = answeredQs.length > 0 ? [...answeredQs].sort((a, b) => (a.rate || 0) - (b.rate || 0))[0] : null;
        const easiestQ = answeredQs.length > 0 ? [...answeredQs].sort((a, b) => (b.rate || 0) - (a.rate || 0))[0] : null;
        const livePlayersList = linkedLiveSession
          ? Object.values(linkedLiveSession.players).sort((a, b) => b.score - a.score)
          : [];

        const handleQuickUpdateSoloSetting = (patch: Partial<KahootQuizSettings>) => {
          const updated: KahootQuiz = {
            ...currentAnalyticsQuiz,
            settings: {
              ...(currentAnalyticsQuiz.settings || {
                shuffleQuestions: false,
                shuffleOptions: false,
                showCorrectAnswers: true,
                speedBonus: true,
                streakBonus: true,
                allowLateJoin: true,
                lobbyMusic: true,
                allowRetry: false,
                selfPacedTimerEnabled: true,
              }),
              ...patch
            }
          };
          storageService.saveKahootQuiz(updated);
          setQuizzes(storageService.getKahootQuizzes());
          setAnalyticsQuiz(updated);
        };

        return (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#1b0a2a] border border-white/20 rounded-3xl p-6 md:p-8 max-w-5xl w-full text-white space-y-6 shadow-2xl my-6 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-wrap gap-2">
                <div>
                  <span className="text-xs text-emerald-300 font-black flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                    <span>📊 متابعة تقدم المشاركين لحظياً + لوحة الـ Top 10 + النتائج التفصيلية</span>
                  </span>
                  <h3 className="text-xl font-black text-white mt-0.5">{currentAnalyticsQuiz.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAnalyticsQuiz(null)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Host Live Controls for Self-Paced Mode (Allow Retry + Timer On/Off) */}
              <div className="bg-emerald-950/40 border border-emerald-400/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-black text-emerald-300 block">⚙️ تحكم مسؤول المسابقة الفوري في التحدي الذاتي:</span>
                  <span className="text-[11px] text-white/70 block">أي تعديل هنا يُطبق فوراً عند جميع المخدومين بدون ريفرش</span>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleQuickUpdateSoloSetting({ allowRetry: !(currentAnalyticsQuiz.settings?.allowRetry ?? false) })}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer transition ${
                      currentAnalyticsQuiz.settings?.allowRetry
                        ? 'bg-emerald-500 text-white border-white shadow-lg'
                        : 'bg-red-500/25 text-red-200 border-red-400/40'
                    }`}
                  >
                    {currentAnalyticsQuiz.settings?.allowRetry
                      ? '🔄 إعادة المسابقة للمخدوم: مسموح ✔️'
                      : '🔒 إعادة المسابقة للمخدوم: مغلق (محاولة واحدة)'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickUpdateSoloSetting({ selfPacedTimerEnabled: !(currentAnalyticsQuiz.settings?.selfPacedTimerEnabled ?? true) })}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer transition ${
                      (currentAnalyticsQuiz.settings?.selfPacedTimerEnabled ?? true)
                        ? 'bg-amber-400 text-slate-950 border-white shadow-lg'
                        : 'bg-cyan-500/25 text-cyan-200 border-cyan-400/40'
                    }`}
                  >
                    {(currentAnalyticsQuiz.settings?.selfPacedTimerEnabled ?? true)
                      ? '⏱️ نظام الوقت: بتايمر لكل سؤال'
                      : '♾️ نظام الوقت: بدون تايمر (وقت مفتوح)'}
                  </button>
                </div>
              </div>

              {/* KPI Summary Row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10">
                  <span className="text-[11px] text-white/60 block">إجمالي المشاركين</span>
                  <span className="text-2xl font-mono font-black text-amber-300">
                    {quizSoloScores.length + livePlayersList.length}
                  </span>
                </div>
                <div className="bg-amber-500/15 p-3.5 rounded-2xl border border-amber-400/30">
                  <span className="text-[11px] text-amber-200 block">يحلون الآن (تقدم حي) ⏳</span>
                  <span className="text-2xl font-mono font-black text-amber-300">{soloInProgressCount}</span>
                </div>
                <div className="bg-emerald-500/15 p-3.5 rounded-2xl border border-emerald-400/30">
                  <span className="text-[11px] text-emerald-200 block">أنهوا التحدي الذاتي ✅</span>
                  <span className="text-2xl font-mono font-black text-emerald-300">{soloCompletedCount}</span>
                </div>
                <div className="bg-purple-500/15 p-3.5 rounded-2xl border border-purple-400/30">
                  <span className="text-[11px] text-purple-200 block">مشاركو البث المباشر 📺</span>
                  <span className="text-2xl font-mono font-black text-purple-300">{livePlayersList.length}</span>
                </div>
                <div className="bg-cyan-500/15 p-3.5 rounded-2xl border border-cyan-400/30">
                  <span className="text-[11px] text-cyan-200 block">أعلى نتيجة مسجلة 🏆</span>
                  <span className="text-2xl font-mono font-black text-cyan-300">
                    {Math.max(quizSoloScores[0]?.score || 0, livePlayersList[0]?.score || 0).toLocaleString('ar-EG')}
                  </span>
                </div>
              </div>

              {/* TOP 10 BOARD FOR SELF-PACED MODE */}
              <div className="bg-gradient-to-br from-amber-950/40 via-purple-950/40 to-slate-950/60 p-5 rounded-3xl border-2 border-amber-400/40 space-y-3 shadow-xl">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-6 h-6 text-amber-400" />
                    <h4 className="text-sm md:text-base font-black text-amber-300">
                      🏆 لوحة المتصدرين الأوائل (Top 10) في التحدي الذاتي (تحديث تلقائي مباشر)
                    </h4>
                  </div>
                  <span className="text-xs font-bold text-white/75 bg-white/10 px-3 py-1 rounded-full">
                    عدد المتنافسين في التحدي الذاتي: {quizSoloScores.length} مشارك
                  </span>
                </div>

                {soloTop10.length === 0 ? (
                  <div className="text-center py-6 text-xs text-white/60">
                    بانتظار دخول المخدومين وبدء حل الأسئلة ليظهر ترتيب الـ Top 10 مباشرة هنا...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {soloTop10.map((entry, idx) => {
                      const answeredCount = entry.answersDetail?.length || 0;
                      const totalQ = entry.totalQuestions || currentAnalyticsQuiz.questions.length || 1;
                      const isDone = entry.status !== 'in_progress';
                      return (
                        <div
                          key={entry.id}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                            idx === 0
                              ? 'bg-amber-400/20 border-amber-400 shadow-lg'
                              : idx === 1
                              ? 'bg-slate-300/15 border-slate-300/50'
                              : idx === 2
                              ? 'bg-amber-700/20 border-amber-500/50'
                              : 'bg-white/5 border-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                              idx === 0 ? 'bg-amber-400 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-950' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-white/15 text-white'
                            }`}>
                              #{idx + 1}
                            </span>
                            <div>
                              <span className="font-black text-xs md:text-sm text-white block">{entry.playerName}</span>
                              <span className="text-[10px] text-white/70">
                                {isDone
                                  ? `✅ أنهى المسابقة (${entry.correctCount}/${totalQ} صح)`
                                  : `⏳ يحل الآن (${answeredCount}/${totalQ} أسئلة)`}
                              </span>
                            </div>
                          </div>
                          <div className="text-left font-mono">
                            <span className="text-sm md:text-base font-black text-amber-300 block">
                              {entry.score.toLocaleString('ar-EG')} نقطة
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION A: LIVE / TEAM SESSION PARTICIPANTS & ANSWERS INSPECTOR */}
              {linkedLiveSession && livePlayersList.length > 0 && (
                <div className="bg-black/40 p-4 rounded-2xl border border-amber-400/30 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-xs md:text-sm font-black text-amber-300">
                      📺 نتائج جميع المشاركين في الغرفة المباشرة / الفرق (PIN: {linkedLiveSession.id} — {livePlayersList.length} مشارك):
                    </h4>
                    <span className="text-[11px] text-white/60">اضغط على «عرض إجاباته 👁️» لرؤية إجابته على كل سؤال</span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {livePlayersList.map((p, idx) => (
                      <div
                        key={p.id}
                        className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs ${
                            idx === 0 ? 'bg-amber-400 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-950' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-white/15 text-white'
                          }`}>
                            {idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-xs md:text-sm text-white">{p.name}</span>
                              {p.teamName && (
                                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30">
                                  {p.teamName}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-white/60">
                              سلسلة: {p.streak} 🔥 • مخالفات الغش: {p.cheatWarningsCount || 0}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-black text-amber-300">{p.score.toLocaleString('ar-EG')} نقطة</span>
                          <button
                            type="button"
                            onClick={() => handleInspectLiveParticipant(currentAnalyticsQuiz, linkedLiveSession, p)}
                            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 border border-cyan-400/30 text-xs font-bold cursor-pointer"
                          >
                            عرض إجاباته 👁️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION B: SOLO MODE PARTICIPANTS LIVE PROGRESS & FINAL ANSWERS INSPECTOR */}
              <div className="bg-black/40 p-4 rounded-2xl border border-emerald-400/30 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs md:text-sm font-black text-emerald-300">
                    🎯 متابعة تقدم ونتائج جميع المشاركين في التحدي الذاتي ({quizSoloScores.length} مشارك):
                  </h4>
                  <span className="text-[11px] text-white/60">يتحدث تلقائياً مع كل سؤال يحله المشارك — اضغط «عرض إجاباته 👁️» للتفاصيل</span>
                </div>
                {quizSoloScores.length === 0 ? (
                  <div className="text-center py-6 text-xs text-white/50">
                    لا توجد مشاركات في التحدي الذاتي لهذه المسابقة حتى الآن.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {quizSoloScores.map((s, idx) => {
                      const answeredCount = s.answersDetail?.length || 0;
                      const totalQ = s.totalQuestions || currentAnalyticsQuiz.questions.length || 1;
                      const progressPct = Math.min(100, Math.round((answeredCount / Math.max(1, totalQ)) * 100));
                      const isInProgress = s.status === 'in_progress';

                      return (
                        <div
                          key={s.id}
                          className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                              idx === 0 ? 'bg-amber-400 text-slate-950' : idx === 1 ? 'bg-slate-300 text-slate-950' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-white/15 text-white'
                            }`}>
                              {idx + 1}
                            </span>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-xs md:text-sm text-white">{s.playerName}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black border ${
                                  isInProgress
                                    ? 'bg-amber-500/25 text-amber-200 border-amber-400/40 animate-pulse'
                                    : 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40'
                                }`}>
                                  {isInProgress
                                    ? `⏳ جاري الحل (السؤال ${Math.min(totalQ, (s.currentQuestionIndex ?? answeredCount) + 1)} من ${totalQ})`
                                    : '✅ أنهى المسابقة'}
                                </span>
                              </div>
                              <div className="w-full max-w-xs bg-white/10 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${isInProgress ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                  style={{ width: `${isInProgress ? progressPct : 100}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-white/60 block">
                                أجاب على {answeredCount} من {totalQ} ({s.correctCount} صحيحة) • آخر تحديث: {new Date(s.completedAt).toLocaleTimeString('ar-EG')}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3">
                            <span className="font-mono text-sm font-black text-amber-300">{s.score.toLocaleString('ar-EG')} نقطة</span>
                            <button
                              type="button"
                              onClick={() => handleInspectSoloParticipant(currentAnalyticsQuiz, s)}
                              className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 border border-cyan-400/30 text-xs font-bold cursor-pointer"
                            >
                              عرض إجاباته 👁️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Hardest & Easiest Question Callouts */}
              {(hardestQ || easiestQ) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {hardestQ && (
                    <div className="bg-red-500/15 border border-red-500/30 p-3.5 rounded-2xl text-xs space-y-1">
                      <span className="font-black text-red-300 block">🔥 أصعب سؤال (نسبة الإجابة الصحيحة {hardestQ.rate}%):</span>
                      <p className="text-white font-bold">س{hardestQ.index}: {hardestQ.title}</p>
                    </div>
                  )}
                  {easiestQ && (
                    <div className="bg-emerald-500/15 border border-emerald-500/30 p-3.5 rounded-2xl text-xs space-y-1">
                      <span className="font-black text-emerald-300 block">🌟 أسهل سؤال (نسبة الإجابة الصحيحة {easiestQ.rate}%):</span>
                      <p className="text-white font-bold">س{easiestQ.index}: {easiestQ.title}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Question-by-Question Breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-amber-300">تحليل الأسئلة ونسب الإجابة الصحيحة:</h4>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {qStats.map((qs) => (
                    <div key={qs.index} className="bg-white/5 p-2.5 rounded-xl border border-white/10 flex items-center justify-between text-xs">
                      <span className="font-bold text-white truncate max-w-md">س{qs.index}. {qs.title}</span>
                      <div className="flex items-center gap-3 shrink-0 font-mono">
                        <span className="text-white/60">{qs.correctAns}/{qs.totalAns} إجابة صحيحة</span>
                        <span className={`px-2 py-0.5 rounded-full font-black ${
                          qs.rate === null ? 'bg-white/10 text-white/50' : qs.rate >= 70 ? 'bg-emerald-500/20 text-emerald-300' : qs.rate >= 40 ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'
                        }`}>
                          {qs.rate !== null ? `${qs.rate}%` : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export Section Controls */}
              <div className="bg-black/40 p-4 rounded-2xl border border-white/15 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-black text-amber-300">📥 خيارات تصدير التقرير (Excel / CSV / PDF):</span>
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={exportIncludeSummary} onChange={(e) => setExportIncludeSummary(e.target.checked)} className="accent-amber-400" />
                      <span>الملخص العام</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={exportIncludeQuestions} onChange={(e) => setExportIncludeQuestions(e.target.checked)} className="accent-amber-400" />
                      <span>تحليل الأسئلة</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={exportIncludePlayers} onChange={(e) => setExportIncludePlayers(e.target.checked)} className="accent-amber-400" />
                      <span>نتائج المشاركين</span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleExportAnalytics(analyticsQuiz, 'xlsx')}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>تصدير Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportAnalytics(analyticsQuiz, 'csv')}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>تصدير CSV (.csv)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>طباعة / حفظ PDF 🖨️</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================
          MODAL 9: IMPORT FROM CENTRAL QUESTION BANK MODAL
          ======================================================== */}
      {showImportFromBankModal && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1b0a2a] border border-purple-400/40 rounded-3xl p-6 max-w-2xl w-full text-white space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">استيراد أسئلة من بنك الأسئلة المركزي</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportFromBankModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {questionBank.length === 0 ? (
                <div className="text-center py-10 text-xs text-white/50">
                  بنك الأسئلة فارغ حالياً. يمكنك حفظ أي سؤال في البنك بالضغط على أيقونة الحفظ بجانب الشريحة!
                </div>
              ) : (
                questionBank.map((item) => (
                  <div key={item.id} className="bg-white/5 p-3 rounded-2xl border border-white/10 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] text-amber-300 font-bold block">{item.category} • {item.question.type}</span>
                      <p className="text-xs font-black text-white">{item.question.title}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const importedQuestion: KahootQuestion = {
                          ...item.question,
                          id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
                        };
                        setEditQuestions(prev => [...prev, importedQuestion]);
                        setShareToastMessage('📥 تم إدراج السؤال من البنك إلى المسابقة بنجاح!');
                        setTimeout(() => setShareToastMessage(null), 2500);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black shrink-0 cursor-pointer"
                    >
                      + إدراج في المسابقة
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 10: FOCUSED TEAM QR CODE & PIN MODAL
          ======================================================== */}
      {focusedTeamQrModal && (
        <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1b0a2a] border-2 border-amber-400 rounded-3xl p-6 md:p-8 max-w-md w-full text-center text-white space-y-5 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="text-right">
                <span className="text-xs text-amber-300 font-bold block">🛡️ رمز الانضمام المخصص للفريق</span>
                <h3 className="text-xl font-black text-white">{focusedTeamQrModal.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setFocusedTeamQrModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-white p-4 rounded-3xl w-56 h-56 mx-auto flex items-center justify-center shadow-2xl">
              <img src={focusedTeamQrModal.qrUrl} alt={focusedTeamQrModal.name} className="w-full h-full object-contain" />
            </div>

            <div className="bg-black/40 p-4 rounded-2xl border border-amber-400/40 space-y-1">
              <span className="text-xs text-white/70 block">رمز الـ PIN الخاص بهذا الفريق:</span>
              <span className="text-4xl font-mono font-black text-amber-300 tracking-widest block">
                {focusedTeamQrModal.pin}
              </span>
              <p className="text-[11px] text-white/70 pt-1">
                امسح الـ QR Code أو أدخل هذا الـ PIN في شاشة المتسابق للانضمام مباشرة إلى «{focusedTeamQrModal.name}»!
              </p>
            </div>

            <button
              type="button"
              onClick={() => setFocusedTeamQrModal(null)}
              className="w-full py-3 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 11: PARTICIPANT PER-QUESTION ANSWERS INSPECTOR MODAL
          ======================================================== */}
      {inspectedParticipant && (
        <div className="fixed inset-0 z-[75] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1b0a2a] border-2 border-cyan-400/50 rounded-3xl p-6 md:p-8 max-w-3xl w-full text-white space-y-5 shadow-2xl my-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <span className="text-xs text-cyan-300 font-bold block">
                  👁️ تفاصيل إجابات المتسابق على كل سؤال ({inspectedParticipant.modeLabel})
                </span>
                <h3 className="text-xl font-black text-white">
                  {inspectedParticipant.name}
                  {inspectedParticipant.teamName ? ` — 🛡️ ${inspectedParticipant.teamName}` : ''}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedParticipant(null)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center bg-black/40 p-3.5 rounded-2xl border border-white/10">
              <div>
                <span className="text-[11px] text-white/60 block">المجموع الكلي</span>
                <span className="text-lg font-mono font-black text-amber-300">
                  {inspectedParticipant.score.toLocaleString('ar-EG')} نقطة
                </span>
              </div>
              <div className="border-x border-white/10">
                <span className="text-[11px] text-white/60 block">الإجابات الصحيحة</span>
                <span className="text-lg font-mono font-black text-emerald-300">
                  {inspectedParticipant.correctCount} / {inspectedParticipant.totalQuestions}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-white/60 block">نسبة الدقة</span>
                <span className="text-lg font-mono font-black text-cyan-300">
                  {Math.round((inspectedParticipant.correctCount / Math.max(1, inspectedParticipant.totalQuestions)) * 100)}%
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {inspectedParticipant.answers.map((ans) => (
                <div
                  key={ans.questionNumber}
                  className={`p-4 rounded-2xl border space-y-2 ${
                    ans.isCorrect
                      ? 'bg-emerald-500/15 border-emerald-400/40'
                      : 'bg-red-500/15 border-red-400/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-black text-xs md:text-sm text-white">
                      س{ans.questionNumber}. {ans.questionTitle}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                      <span className={`px-2.5 py-0.5 rounded-full font-black ${
                        ans.isCorrect ? 'bg-emerald-500/30 text-emerald-200' : 'bg-red-500/30 text-red-200'
                      }`}>
                        {ans.isCorrect ? '✔️ إجابة صحيحة' : '❌ إجابة خاطئة'}
                      </span>
                      <span className="text-amber-300 font-black">+{ans.points} نقطة</span>
                      {ans.timeSec && (
                        <span className="text-white/60 text-[11px]">⏱️ {ans.timeSec}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1 border-t border-white/10">
                    <div className="bg-black/30 p-2.5 rounded-xl">
                      <span className="text-white/60 block text-[10px]">إجابة المتسابق:</span>
                      <span className={`font-black ${ans.isCorrect ? 'text-emerald-300' : 'text-red-300'}`}>
                        {ans.playerAnswerLabel}
                      </span>
                    </div>
                    <div className="bg-black/30 p-2.5 rounded-xl">
                      <span className="text-white/60 block text-[10px]">الإجابة الصحيحة النموذجية:</span>
                      <span className="font-black text-amber-300">{ans.correctAnswerLabel}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setInspectedParticipant(null)}
                className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs cursor-pointer"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

