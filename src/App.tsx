import React, { useState, useEffect } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { NotificationProvider, useNotification } from "./contexts/NotificationContext";
import { EstablishmentProvider } from "./contexts/EstablishmentContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Components
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Footer from "./components/Footer";
import MandatoryPasswordChange from "./components/MandatoryPasswordChange";
import PWAPrompt from "./components/PWAPrompt";
import ReloadPrompt from "./components/ReloadPrompt";
import InternetConnectionGuard from "./components/InternetConnectionGuard";

// Pages
import AIAssistant from "./pages/AIAssistant";
import About from "./pages/About";
import Attendance from "./pages/Attendance";
import AuditLogs from "./pages/AuditLogs";
import BiometricRegistration from "./pages/BiometricRegistration";
import Calendar from "./pages/Calendar";
import Canteen from "./pages/Canteen";
import CanteenDashboard from "./pages/CanteenDashboard";
import Chat from "./pages/Chat";
import Classes from "./pages/Classes";
import Classroom from "./pages/Classroom";
import Clubs from "./pages/Clubs";
import CoursesSubjects from "./pages/CoursesSubjects";
import Dashboard from "./pages/Dashboard";
import DigitalBinder from "./pages/DigitalBinder";
import Directory from "./pages/Directory";
import Discipline from "./pages/Discipline";
import DocumentGenerator from "./pages/DocumentGenerator";
import Establishments from "./pages/Establishments";
import Finance from "./pages/Finance";
import Grades from "./pages/Grades";
import Homework from "./pages/Homework";
import Houses from "./pages/Houses";
import IntegrationCode from "./pages/IntegrationCode";
import KioskMode from "./pages/KioskMode";
import Leaderboard from "./pages/Leaderboard";
import Library from "./pages/Library";
import Login from "./pages/Login";
import LudoAIPlus from "./pages/LudoAIPlus";
import Messaging from "./pages/Messaging";
import MobileApp from "./pages/MobileApp";
import NewsFeed from "./pages/NewsFeed";
import ParentDashboard from "./pages/ParentDashboard";
import Profile from "./pages/Profile";
import RecentConnections from "./pages/RecentConnections";
import Reports from "./pages/Reports";
import ResponsibilityZones from "./pages/ResponsibilityZones";
import Scanner from "./pages/Scanner";
import Settings from "./pages/Settings";
import Staff from "./pages/Staff";
import StrategicOptimizations from "./pages/StrategicOptimizations";
import StudentCard from "./pages/StudentCard";
import StudentDashboard from "./pages/StudentDashboard";
import Surveys from "./pages/Surveys";
import TeacherPlanning from "./pages/TeacherPlanning";
import TermsAndConditions from "./pages/TermsAndConditions";
import Users from "./pages/Users";
import Parents from "./pages/Parents";
import AccessControl from "./pages/AccessControl";
import DossiersAgents from "./pages/DossiersAgents";
import TechSheet from "./pages/TechSheet";
import { Trash } from "./pages/Trash";

function AppContent() {
  const { currentUser, loading } = useAuth();
  const { notifySuccess, notifyError } = useNotification();
  
  // Navigation states
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [chatTargetId, setChatTargetId] = useState<string | null>(null);
  const [prepId, setPrepId] = useState<any>(null);
  const [classroomName, setClassroomName] = useState<any>(null);

  // Set default tab on user login based on role
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === "élève") {
        setActiveTab("student_dashboard");
      } else {
        setActiveTab("dashboard");
      }
    }
  }, [currentUser]);

  // Handle browser and mobile back button navigation via PopStateEvent
  useEffect(() => {
    if (!currentUser) return;

    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.tab) {
        setActiveTab(event.state.tab);
        setPrepId(event.state.prepId ?? null);
        setClassroomName(event.state.classroomName ?? null);
        setChatTargetId(event.state.chatTargetId ?? null);
      } else {
        const defaultTab = currentUser.role === "élève" ? "student_dashboard" : "dashboard";
        setActiveTab(defaultTab);
        setPrepId(null);
        setClassroomName(null);
        setChatTargetId(null);
      }
    };

    window.addEventListener("popstate", handlePopState);

    // Initialize/Replace the initial entry in history if it doesn't exist yet
    const defaultTab = currentUser.role === "élève" ? "student_dashboard" : "dashboard";
    if (!window.history.state) {
      window.history.replaceState({ tab: defaultTab, prepId: null, classroomName: null, chatTargetId: null }, "");
    }

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [currentUser]);

  // Synchronize state changes into browser history so back buttons work flawlessly
  useEffect(() => {
    if (!currentUser) return;

    const currentState = window.history.state;
    
    // Ignore pushing navigation state on top of custom overlay modals like notification details
    if (currentState?.modal) return;

    const shouldPush = !currentState || 
                       currentState.tab !== activeTab || 
                       currentState.prepId !== prepId ||
                       currentState.classroomName !== classroomName ||
                       currentState.chatTargetId !== chatTargetId;

    if (shouldPush) {
      window.history.pushState(
        { tab: activeTab, prepId, classroomName, chatTargetId },
        ""
      );
    }
  }, [activeTab, prepId, classroomName, chatTargetId, currentUser]);

  // Navigate function passed to components
  const handleNavigate = (tab: string, params?: any) => {
    setActiveTab(tab);
    if (tab === "courses_subjects" && params?.prepId) {
      setPrepId(params.prepId);
    }
    if (tab === "classroom" && params?.className) {
      setClassroomName(params.className);
    }
    if (tab === "messaging" && params?.chatTargetId) {
      setChatTargetId(params.chatTargetId);
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <div className="absolute text-indigo-600 font-black text-xl">EN</div>
        </div>
        <p className="mt-4 text-sm font-bold text-gray-700 dark:text-gray-300 animate-pulse">
          Chargement de l'écosystème Edu-Nify...
        </p>
      </div>
    );
  }

  // Render login page if not logged in
  if (!currentUser) {
    return <Login />;
  }

  // Enforce password change if flagged
  if (currentUser.mustChangePassword) {
    return <MandatoryPasswordChange />;
  }

  // Render selected tab / page
  const renderPage = () => {
    // If pupil tries to view something restricted, or parents have specific landing
    const role = currentUser.role;

    // Special redirection: if a parent is on an integrated tab, we map them to ParentDashboard with the correct initial sub-tab
    if (role === "parent") {
      const parentTabs = ["dashboard", "grades", "homework", "planning", "finance"];
      if (parentTabs.includes(activeTab)) {
        let initialTab: 'overview' | 'grades' | 'attendance' | 'homework' | 'courses' | 'timetable' | 'finance' = 'overview';
        if (activeTab === 'grades') initialTab = 'grades';
        else if (activeTab === 'homework') initialTab = 'homework';
        else if (activeTab === 'planning') initialTab = 'timetable';
        else if (activeTab === 'finance') initialTab = 'finance';
        return <ParentDashboard onNavigate={handleNavigate} initialTab={initialTab} />;
      }
    }

    // Direct mapping
    switch (activeTab) {
      case "dashboard":
        return <Dashboard onNavigate={handleNavigate} />;
      case "student_dashboard":
        return <StudentDashboard onNavigate={handleNavigate} />;
      case "newsfeed":
        return <NewsFeed />;
      case "directory":
        return <Directory onNavigate={handleNavigate} />;
      case "messaging":
        return (
          <Messaging
            initialChatTargetId={chatTargetId || undefined}
            onClearTarget={() => setChatTargetId(null)}
          />
        );
      case "profile":
        return <Profile />;
      case "about":
        return <About />;
      case "terms":
        return <TermsAndConditions />;
      case "digital_binder":
        return <DigitalBinder onNavigate={handleNavigate} />;
      case "classroom":
        return <Classroom initialClassName={classroomName} />;
      case "homework":
        return <Homework />;
      case "grades":
        return <Grades />;
      case "ludo_ai_plus":
        return <LudoAIPlus />;
      case "courses_subjects":
        return <CoursesSubjects initialPrepId={prepId} />;
      case "ai_assistant":
        return <AIAssistant onNavigate={handleNavigate} />;
      case "classes":
        return <Classes />;
      case "planning":
        return <TeacherPlanning />;
      case "calendar":
        return <Calendar />;
      case "attendance":
        return <Attendance />;
      case "reports":
        return <Reports />;
      case "student_card":
        return <StudentCard />;
      case "houses":
        return <Houses />;
      case "clubs":
        return <Clubs />;
      case "leaderboard":
        return <Leaderboard />;
      case "library":
        return <Library />;
      case "canteen":
        return <Canteen />;
      case "surveys":
        return <Surveys />;
      case "establishments":
        return <Establishments />;
      case "users":
        return <Users />;
      case "parents":
        return <Parents />;
      case "access_control":
        return <AccessControl />;
      case "staff":
        return <Staff />;
      case "responsibility_zones":
        return <ResponsibilityZones />;
      case "document_generator":
        return <DocumentGenerator />;
      case "finance":
        return <Finance />;
      case "discipline":
        return <Discipline />;
      case "strategic_optimizations":
        return <StrategicOptimizations />;
      case "recent_connections":
        return <RecentConnections />;
      case "audit_logs":
        return <AuditLogs />;
      case "scanner":
        return <Scanner />;
      case "kiosk":
        return <KioskMode onExit={() => setActiveTab(currentUser.role === "élève" ? "student_dashboard" : "dashboard")} />;
      case "mobile_app":
        return <MobileApp />;
      case "integration":
        return <IntegrationCode />;
      case "settings":
        return <Settings />;
      case "dossiers_agents":
        return <DossiersAgents />;
      case "tech_sheet":
        return <TechSheet />;
      case "trash":
        return <Trash currentUser={currentUser} notifySuccess={notifySuccess} notifyError={notifyError} />;
      default:
        return (
          <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Page Non Trouvée</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">La page "{activeTab}" n'est pas encore disponible.</p>
          </div>
        );
    }
  };

  // Full dashboard layout
  return (
    <div className={`min-h-screen flex bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 transition-colors duration-200`}>
      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onMenuClick={() => setIsMobileOpen(true)}
        />

        {/* Content Section */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl w-full mx-auto print:p-0">
          {renderPage()}
          <Footer onNavigate={handleNavigate} />
        </main>
      </div>

      {/* PWAPrompt & ReloadPrompt */}
      <PWAPrompt />
      <ReloadPrompt />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <NotificationProvider>
            <EstablishmentProvider>
              <InternetConnectionGuard />
              <AppContent />
            </EstablishmentProvider>
          </NotificationProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
