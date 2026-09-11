import React, { useState, useEffect } from 'react';
import { useAuth, User } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { 
  RefreshCw, 
  ShieldCheck, 
  UserPlus, 
  GraduationCap, 
  Users, 
  BookOpen, 
  Briefcase, 
  ChevronLeft, 
  ChevronRight,
  Calendar,
  MapPin,
  Lock,
  Phone,
  Mail,
  Send,
  UserCheck,
  ShieldAlert,
  Hash
} from 'lucide-react';
import { collection, onSnapshot, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

export default function Login() {
  const [isRegistering, setIsRegisteringState] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, register, loading } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    // Initialize history state
    window.history.replaceState({ isRegistering: false }, '');

    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.isRegistering !== undefined) {
        setIsRegisteringState(event.state.isRegistering);
      } else {
        setIsRegisteringState(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setIsRegistering = (value: boolean) => {
    setIsRegisteringState(value);
    window.history.pushState({ isRegistering: value }, '');
  };

  // Stepper State
  const [step, setStep] = useState(1);
  const [selectedProfile, setSelectedProfile] = useState<'élève' | 'parent' | 'enseignant' | 'personnel administratif' | 'admin' | ''>('');

  // Login credentials state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Universal registration states
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [lieuNaissance, setLieuNaissance] = useState('');
  
  // Profile specific registration states
  const [matricule, setMatricule] = useState('');
  const [classe, setClasse] = useState('');
  const [houseId, setHouseId] = useState('');
  const [telephone, setTelephone] = useState('');
  const [position, setPosition] = useState('');
  const [etablissement, setEtablissement] = useState('');
  const [matiere, setMatiere] = useState('');
  const [requestedRole, setRequestedRole] = useState('Élève');

  // Administrative secure registration squeeze states
  const [enrollmentToken, setEnrollmentToken] = useState('');
  const [showTokenHelp, setShowTokenHelp] = useState(false);

  // Firestore DB options
  const [houses, setHouses] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);

  // Parse direct parrainage code from URL query parameters (?code=XYZ or ?token=XYZ)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token') || params.get('code') || params.get('invite');
    if (tokenFromUrl) {
      setEnrollmentToken(tokenFromUrl);
      const cleanToken = tokenFromUrl.trim().toUpperCase();
      if (cleanToken.includes('PROF') || cleanToken.includes('TEACHER')) {
        setSelectedProfile('enseignant');
        setIsRegisteringState(true);
        setStep(2);
      } else if (cleanToken.includes('ADMIN')) {
        setSelectedProfile('admin');
        setIsRegisteringState(true);
        setStep(2);
      } else if (cleanToken.includes('STAFF') || cleanToken.includes('PERS')) {
        setSelectedProfile('personnel administratif');
        setIsRegisteringState(true);
        setStep(2);
      }
    }
  }, []);

  // Fetch houses & classes
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'houses'), (snapshot) => {
      const housesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHouses(housesData);
    }, (err) => {
      console.error("Erreur onSnapshot houses:", err);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'classes'), (snapshot) => {
      const classesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClasses(classesData);
    }, (err) => {
      console.error("Erreur onSnapshot classes:", err);
    });
    return () => unsubscribe();
  }, []);

  // Back button functionality
  const handleBackToStep1 = () => {
    setStep(1);
    setError('');
  };

  const handleNextToStep2 = () => {
    setError('');
    
    if (!selectedProfile) {
      setError("Veuillez sélectionner votre profil utilisateur pour continuer.");
      return;
    }

    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (isRegistering) {
        // Enforce validations in active mode
        if (!nom || !prenom || !telephone || !requestedRole || !dateNaissance || !lieuNaissance) {
          setError("Veuillez renseigner tous les champs requis obligatoires (Nom, Prénom, Téléphone, Rôle, Date de naissance, Lieu de naissance).");
          return;
        }

        // Phone validation
        if (telephone.trim().length < 4) {
          setError("Veuillez saisir un numéro de téléphone de contact valide.");
          return;
        }

        setSubmitting(true);

        const phoneCheckQuery = query(
          collection(db, 'access_requests'),
          where('telephone', '==', telephone.trim()),
          where('role', '==', requestedRole),
          where('status', '==', 'pending')
        );
        const phoneSnap = await getDocs(phoneCheckQuery);
        if (!phoneSnap.empty) {
          setError("⚠️ Une demande d'accès identique est déjà en attente avec ce numéro de téléphone pour ce rôle.");
          setSubmitting(false);
          return;
        }

        // Pushing to Firestore
        await addDoc(collection(db, 'access_requests'), {
          nom: nom.trim(),
          prenom: prenom.trim(),
          telephone: telephone.trim(),
          role: requestedRole,
          date_naissance: dateNaissance,
          lieu_naissance: lieuNaissance.trim(),
          status: 'pending',
          date_demande: new Date().toISOString()
        });

        setSuccess("🎉 Votre demande d'accès a été transmise avec succès à l'administrateur principal d'Edu-Nify. Après audit et validation de vos renseignements, un mot de passe temporaire à usage unique vous sera fourni par SMS/téléphone ou email pour vous connecter.");
        setSubmitting(false);
        
        // Clear fields
        setNom('');
        setPrenom('');
        setTelephone('');
        setDateNaissance('');
        setLieuNaissance('');
      } else {
        // Log in flow
        if (!loginEmail || !loginPassword) {
          setError(t('enter_email_password'));
          return;
        }
        await login(loginEmail, loginPassword);
      }
    } catch (err: any) {
      setSubmitting(false);
      console.error("Authentication error details:", err);
      const errCode = err?.code || '';
      const errMsg = err?.message || '';
      const isInvalidCredential = 
        errCode === 'auth/invalid-credential' || 
        errCode === 'auth/user-not-found' || 
        errCode === 'auth/wrong-password' ||
        errMsg.includes('auth/invalid-credential') ||
        errMsg.includes('auth/user-not-found') ||
        errMsg.includes('auth/wrong-password');

      const isEmailInUse = 
        errCode === 'auth/email-already-in-use' || 
        errMsg.includes('auth/email-already-in-use');

      const isWeakPassword = 
        errCode === 'auth/weak-password' || 
        errMsg.includes('auth/weak-password');

      const isConfigNotFound = 
        errCode === 'auth/configuration-not-found' || 
        errMsg.includes('auth/configuration-not-found');

      const isOperationNotAllowed = 
        errCode === 'auth/operation-not-allowed' || 
        errMsg.includes('auth/operation-not-allowed');

      const isNetworkException = 
        errCode === 'auth/network-request-failed' || 
        errMsg.includes('auth/network-request-failed');

      if (isEmailInUse) {
        setError(t('email_already_used'));
      } else if (isInvalidCredential) {
        setError(t('incorrect_email_password'));
      } else if (isWeakPassword) {
        setError(t('password_min_length'));
      } else if (isConfigNotFound || isOperationNotAllowed) {
        setError("La connexion par e-mail et mot de passe n'est pas activée sur votre projet Firebase. Veuillez l'activer dans la console Firebase (sélectionnez Authentication > onglet Sign-in method > activer 'Adresse e-mail/Mot de passe').");
      } else if (isNetworkException) {
        setError(t('network_error'));
      } else {
        setError(errMsg || t('error_occurred'));
      }
    }
  };

  const containerVariants: any = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08
      }
    }
  };

  const cardVariants: any = {
    hidden: { opacity: 0, y: 30, scale: 0.98 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } 
    }
  };

  const fadeUpVariants: any = {
    hidden: { opacity: 0, y: 15 },
    visible: { 
      opacity: 1, 
      y: 0, 
      transition: { duration: 0.4, ease: "easeOut" } 
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <motion.div 
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="sm:mx-auto sm:w-full sm:max-w-2xl text-center space-y-4"
      >
        <div className="inline-flex p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-3xl border border-indigo-100 dark:border-indigo-900/60 shadow-inner hover:scale-105 transition-transform duration-300">
          <img src="/logo.png" alt="Edu-Nify Logo" className="h-16 w-16 object-contain" />
        </div>
        <div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 uppercase font-black tracking-widest text-[11px]">
            {t('attendance_management_system')}
          </p>
        </div>
      </motion.div>

      <motion.div 
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl"
      >
        <div className="bg-white dark:bg-slate-900 py-8 px-6 sm:px-10 shadow-xl rounded-3xl border border-gray-100 dark:border-slate-800 transition-all">
          
          {/* Form Header with Stepper Progress Bar */}
          {isRegistering ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-8 space-y-3 text-center"
            >
              <div className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 px-3.5 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide border border-amber-200/50">
                🔒 Sécurité Renforcée d'Administration
              </div>
              
              <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Demande d'Accès Edu-Nify
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed max-w-md mx-auto">
                Pour assurer la sécurité pédagogique, vous ne pouvez pas créer de compte vous-même. Soumettez vos informations pour faire valider et attribuer votre rôle par l'administration.
              </p>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-8 text-center space-y-1"
            >
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">Connexion Espace Membre</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Saisissez vos identifiants pour entrer sur la plateforme Edu-Nify</p>
            </motion.div>
          )}

          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 p-4 rounded-2xl text-xs border border-rose-100 dark:border-rose-900/40 flex items-start gap-2 animate-shake"
            >
              <ShieldAlert className="shrink-0 mt-0.5 text-rose-500" size={16} />
              <div className="font-semibold leading-relaxed">{error}</div>
            </motion.div>
          )}

          {success && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 p-4 rounded-2xl text-xs border border-emerald-100 dark:border-emerald-950 flex items-start gap-2"
            >
              <UserCheck className="shrink-0 mt-0.5 text-emerald-500" size={16} />
              <div className="font-semibold leading-relaxed">{success}</div>
            </motion.div>
          )}

          {isRegistering ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* STEP 1 Disabled for secure Access Request */}
              {false && (
                <motion.div 
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* card student */}
                    <motion.div 
                      variants={fadeUpVariants}
                      whileHover={{ scale: 1.015, translateY: -2 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => setSelectedProfile('élève')}
                      className={`relative cursor-pointer p-5 rounded-2xl border-2 transition-colors flex flex-col justify-between h-36 duration-200 ${
                        selectedProfile === 'élève' 
                          ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-md' 
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-slate-900 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`p-2.5 rounded-xl ${selectedProfile === 'élève' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                          <GraduationCap size={22} />
                        </div>
                        {selectedProfile === 'élève' && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">✓</div>
                        )}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 dark:text-white text-md">Élève / Étudiant</h4>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal mt-0.5 truncate">Fiche d'apprentissage académique, classe & maison</p>
                      </div>
                    </motion.div>

                    {/* card parent */}
                    <motion.div 
                      variants={fadeUpVariants}
                      whileHover={{ scale: 1.015, translateY: -2 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => setSelectedProfile('parent')}
                      className={`relative cursor-pointer p-5 rounded-2xl border-2 transition-colors flex flex-col justify-between h-36 duration-200 ${
                        selectedProfile === 'parent' 
                          ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-md' 
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-slate-900 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`p-2.5 rounded-xl ${selectedProfile === 'parent' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                          <Users size={22} />
                        </div>
                        {selectedProfile === 'parent' && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">✓</div>
                        )}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 dark:text-white text-md">Parent / Tuteur</h4>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal mt-0.5 truncate">Suivi assiduité, notes scolaires et frais de cantine</p>
                      </div>
                    </motion.div>

                    {/* card teacher */}
                    <motion.div 
                      variants={fadeUpVariants}
                      whileHover={{ scale: 1.015, translateY: -2 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => setSelectedProfile('enseignant')}
                      className={`relative cursor-pointer p-5 rounded-2xl border-2 transition-colors flex flex-col justify-between h-36 duration-200 ${
                        selectedProfile === 'enseignant' 
                          ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-md' 
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-slate-900 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`p-2.5 rounded-xl ${selectedProfile === 'enseignant' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                          <BookOpen size={22} />
                        </div>
                        {selectedProfile === 'enseignant' && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">✓</div>
                        )}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 dark:text-white text-md">Enseignant / Professeur</h4>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal mt-0.5 truncate">Appel journalier, bulletin & évaluations pédagogiques</p>
                      </div>
                    </motion.div>

                    {/* card staff */}
                    <motion.div 
                      variants={fadeUpVariants}
                      whileHover={{ scale: 1.015, translateY: -2 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => setSelectedProfile('personnel administratif')}
                      className={`relative cursor-pointer p-5 rounded-2xl border-2 transition-colors flex flex-col justify-between h-36 duration-200 ${
                        selectedProfile === 'personnel administratif' 
                          ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-md' 
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-slate-900 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`p-2.5 rounded-xl ${selectedProfile === 'personnel administratif' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                          <Briefcase size={22} />
                        </div>
                        {selectedProfile === 'personnel administratif' && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">✓</div>
                        )}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 dark:text-white text-md">Personnel Administratif</h4>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal mt-0.5 truncate">Responsables, secrétaires, comptabilité de l'école</p>
                      </div>
                    </motion.div>

                  </div>

                  {/* Optional Administrative Back Door Code Toggle for Martinien Admin */}
                  <motion.div 
                    variants={fadeUpVariants}
                    className="pt-4 border-t border-gray-100 dark:border-gray-800 text-center"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProfile('admin');
                        setStep(2);
                      }}
                      className="text-xs text-indigo-500 hover:text-indigo-600 hover:underline font-bold transition-all"
                    >
                      🔒 Vous êtes administrateur principal ? S'inscrire ici
                    </button>
                  </motion.div>

                  <motion.div 
                    variants={fadeUpVariants}
                    className="flex justify-end pt-4"
                  >
                    <button
                      type="button"
                      onClick={handleNextToStep2}
                      disabled={!selectedProfile}
                      className="inline-flex items-center gap-2 py-3 px-6 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-600/10"
                    >
                      Continuer vers le formulaire
                      <ChevronRight size={18} />
                    </button>
                  </motion.div>
                </motion.div>
              )}

              {/* STEP 2: DYNAMIC FORM TAILORED FIELDS */}
              {isRegistering && (
                <div className="space-y-6">
                  
                  {/* Row 1: Nom & Prénom */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Nom <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={nom}
                        onChange={(e) => setNom(e.target.value)}
                        placeholder="Ex: Mvezogo"
                        className="mt-1 appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm placeholder-gray-400 dark:bg-gray-800 dark:text-slate-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Prénom <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={prenom}
                        onChange={(e) => setPrenom(e.target.value)}
                        placeholder="Ex: Martinien"
                        className="mt-1 appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm placeholder-gray-400 dark:bg-gray-800 dark:text-slate-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium transition-colors"
                      />
                    </div>
                  </div>

                  {/* Row 2: Téléphone & Rôle demandé */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Phone size={14} /> Téléphone <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={telephone}
                        onChange={(e) => setTelephone(e.target.value)}
                        placeholder="Ex: +241 062-641-120"
                        className="mt-1 appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm placeholder-gray-400 dark:bg-gray-800 dark:text-slate-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Rôle demandé <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={requestedRole}
                        onChange={(e) => setRequestedRole(e.target.value)}
                        className="mt-1 block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 dark:text-slate-150 text-sm font-medium focus:ring-2 focus:ring-indigo-500 transition-colors"
                      >
                        <option value="Élève">Élève / Étudiant</option>
                        <option value="Parent">Parent / Tuteur</option>
                        <option value="Enseignant">Enseignant / Professeur</option>
                        <option value="Super Administrateur">Super Administrateur</option>
                        <option value="Administrateur d'établissement">Administrateur d'établissement</option>
                        <option value="Comptable">Comptable</option>
                        <option value="Surveillant">Surveillant</option>
                        <option value="Bibliothécaire">Bibliothécaire</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Date de naissance & Lieu de naissance */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar size={14} /> Date de naissance <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={dateNaissance}
                        onChange={(e) => setDateNaissance(e.target.value)}
                        className="mt-1 block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                        <MapPin size={14} /> Lieu de naissance <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={lieuNaissance}
                        onChange={(e) => setLieuNaissance(e.target.value)}
                        placeholder="Ex: Libreville, Gabon"
                        className="mt-1 appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm placeholder-gray-400 dark:bg-gray-800 dark:text-slate-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                      />
                    </div>
                  </div>

                  {/* Submit and Navigation Section */}
                  <div className="flex justify-between items-center pt-4 border-t border-gray-150 dark:border-gray-800">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegistering(false);
                        setError('');
                        setSuccess('');
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 transition-colors font-bold uppercase tracking-wider focus:outline-none"
                    >
                      <ChevronLeft size={16} /> Revenir à la connexion
                    </button>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-2 py-3 px-6 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-md transition-all font-bold"
                    >
                      {submitting ? (
                        <RefreshCw className="animate-spin" size={18} />
                      ) : (
                        <Send size={18} />
                      )}
                      {submitting ? "Envoi de la demande..." : "Envoyer ma demande d'accès"}
                    </button>
                  </div>

                </div>
              )}

            </form>
          ) : (
            
            /* Standard Login Form */
            <motion.form 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-6" 
              onSubmit={handleSubmit}
            >
              
              <motion.div variants={fadeUpVariants}>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail size={14} className="text-gray-400" />
                  Identifiant (Pseudo, E-mail ou Matricule)
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm placeholder-gray-400 dark:bg-gray-800 dark:text-slate-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm font-medium"
                    placeholder="Ex: p.nom, nom@edu-nify.com ou MAT-0012"
                  />
                </div>
              </motion.div>

              <motion.div variants={fadeUpVariants}>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock size={14} className="text-gray-400" />
                  {t('password')}
                </label>
                <div className="mt-1">
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm placeholder-gray-400 dark:bg-gray-800 dark:text-slate-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm font-medium"
                    placeholder="••••••••"
                  />
                </div>
              </motion.div>

              <motion.div variants={fadeUpVariants}>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 transition-colors shadow-lg shadow-indigo-600/10 animate-pulse-subtle"
                >
                  {loading ? (
                    <RefreshCw className="animate-spin" size={20} />
                  ) : (
                    <ShieldCheck size={20} />
                  )}
                  {loading ? t('verifying') : t('login_button')}
                </button>
              </motion.div>

              <motion.div variants={fadeUpVariants} className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(true);
                    setError('');
                    setSuccess('');
                  }}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                >
                  Pas encore de compte ? Faire une demande d'accès
                </button>
              </motion.div>
            </motion.form>
          )}
          
          {/* Footer Copyright and Identity */}
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-center text-xs text-gray-400 dark:text-gray-500 font-medium">
            <span>&copy; {new Date().getFullYear()} Edu-Nify. Tous droits réservés.</span>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
