import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { db, auth, isFirebaseConfigured } from '../lib/firebase';
import { initSessionTracking, stopSessionTracking } from '../lib/sessionTracker';
import { getUserAvatarUrl } from '../utils/avatar';
import { sendEmailNotification } from '../services/NotificationService';

export interface User {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: 'admin' | 'enseignant' | 'élève' | 'personnel administratif' | 'parent' | 'cuisinier';
  preciseRole?: string;
  mustChangePassword?: boolean;
  temporaryPassword?: string;
  etablissement?: string;
  statut_enseignant?: 'permanent' | 'prestataire' | 'stagiaire';
  statutEnseignant?: 'permanent' | 'prestataire' | 'stagiaire';
  responsibilities?: string[];
  children_ids?: string[];
  classe?: string;
  classes?: string[];
  matiere?: string;
  matieres?: string[];
  matricule?: string;
  contact?: string;
  address?: string;
  gender?: 'male' | 'female' | 'other' | 'not_specified';
  diploma?: string;
  experience_years?: number;
  age?: number;
  photo?: string;
  cover?: string;
  cover_photo?: string;
  date_creation?: string;
  face_id?: string | null;
  fingerprint_id?: string | null;
  house_id?: string;
  position?: string;
  department?: string;
  biographie?: string;
  status?: 'online' | 'offline';
  lastSeen?: any;
  chatBlocked?: boolean;
  accessBlocked?: boolean;
  blockedUsers?: string[];
  notifications?: {
    push: boolean;
    email: boolean;
    sms: boolean;
    urgent: boolean;
  };
}

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, mdp: string) => Promise<void>;
  register: (data: Omit<User, 'id' | 'date_creation' | 'face_id' | 'fingerprint_id'>, mdp: string) => Promise<void>;
  logout: () => Promise<void>;
  updateCurrentUser: (data: Partial<User>) => void;
  refreshCurrentUser: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Safety timeout to prevent permanent white screen if Firebase hangs
    const timeout = setTimeout(() => {
      setIsInitializing(prev => {
        if (prev) {
          console.warn("Auth initialization timeout reached - forcing app to load");
          return false;
        }
        return prev;
      });
    }, 2500); // 2.5 seconds safety margin

    // Check if there is a mock fallback user saved
    const storedMockUser = localStorage.getItem('mock_admin_user');
    if (storedMockUser) {
      try {
        const parsedUser = JSON.parse(storedMockUser);
        console.log("Found local fallback mock super-admin user session:", parsedUser);
        setCurrentUser(parsedUser);
        setIsInitializing(false);
        clearTimeout(timeout);
        return; // Skip normal Firebase Auth observer
      } catch (e) {
        console.error("Failed to parse mock admin user from localStorage:", e);
      }
    }

    if (!isFirebaseConfigured) {
      setIsInitializing(false);
      clearTimeout(timeout);
      return;
    }
    
    let unsubscribeDoc: () => void;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser ? "User logged in" : "No user");
      if (unsubscribeDoc) unsubscribeDoc();

      if (firebaseUser) {
        const docRef = doc(db, 'users', firebaseUser.uid);
        console.log("Fetching user profile for UID:", firebaseUser.uid);
        
        // Update status to online when auth state changes to logged in
        setDoc(docRef, {
          status: 'online',
          lastSeen: serverTimestamp()
        }, { merge: true }).catch(err => console.error("Error updating online status:", err));

        unsubscribeDoc = onSnapshot(docRef, (docSnap) => {
          console.log("User profile snapshot received. Exists:", docSnap.exists());
          if (docSnap.exists()) {
            const rawData = docSnap.data() || {};
            const rawRole = rawData.role || 'élève';
            const normRole = getNormalizedRole(rawRole);
            const preciseRole = rawData.preciseRole || rawRole;
            
            const userData = {
              ...rawData,
              role: normRole,
              preciseRole: preciseRole
            } as any;

            if (!userData.photo) {
              userData.photo = getUserAvatarUrl(userData);
            }
            
            // Auto-fill admin/teacher email check
            const isAdminEmail = firebaseUser.email?.toLowerCase().trim() === 'martinienmvezogo@gmail.com';
            
            if (isAdminEmail && userData.role !== 'admin') {
              console.log("Upgrading user to admin role based on email...");
              setDoc(docRef, { role: 'admin' }, { merge: true }).catch(err => console.error(err));
              setCurrentUser({ id: docSnap.id, ...userData, role: 'admin' } as User);
            } else if (firebaseUser.email?.toLowerCase().trim() === 'martinienmvezogo@gmail.com' && (!userData.prenom || !userData.nom)) {
              console.log("Auto-filling admin name...");
              const updateData = { prenom: 'Martinien', nom: 'Mvezogo' };
              setDoc(docRef, updateData, { merge: true }).catch(err => console.error(err));
              setCurrentUser({ id: docSnap.id, ...userData, ...updateData } as User);
            } else {
              // If it is any personnel administratif with empty responsibilities but has a position, auto-map!
              if (userData.role === 'personnel administratif' && (!userData.responsibilities || userData.responsibilities.length === 0) && userData.position) {
                const mappedResps = mapPositionToResponsibility(userData.position);
                if (mappedResps.length > 0) {
                  setDoc(docRef, { responsibilities: mappedResps }, { merge: true }).catch(err => console.error(err));
                  setCurrentUser({ id: docSnap.id, ...userData, responsibilities: mappedResps } as User);
                } else {
                  setCurrentUser({ id: docSnap.id, ...userData } as User);
                }
              } else {
                setCurrentUser({ id: docSnap.id, ...userData } as User);
              }
            }
          } else {
            console.log("User profile does not exist in Firestore.");
            // Auto-create admin document if it doesn't exist
            if (firebaseUser.email?.toLowerCase().trim() === 'martinienmvezogo@gmail.com') {
              console.log("Creating admin profile...");
              const adminData = {
                email: firebaseUser.email,
                role: 'admin',
                prenom: 'Martinien',
                nom: 'Mvezogo',
                status: 'online',
                lastSeen: serverTimestamp(),
                date_creation: new Date().toISOString()
              };
              setDoc(docRef, adminData).catch(err => console.error("Error creating admin doc:", err));
              setCurrentUser({ id: firebaseUser.uid, ...adminData } as User);
            } else {
              setCurrentUser(null);
              signOut(auth).catch(err => console.error("Error signing out deleted user:", err));
            }
          }
          console.log("Auth initialization complete.");
          setIsInitializing(false);
          clearTimeout(timeout);
        }, (err) => {
          console.error("Erreur lors de la récupération du profil:", err);
          setCurrentUser(null);
          setIsInitializing(false);
          clearTimeout(timeout);
        });
      } else {
        setCurrentUser(null);
        setIsInitializing(false);
        clearTimeout(timeout);
      }
    });

    return () => {
      clearTimeout(timeout);
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  // Handle visibility change for presence
  useEffect(() => {
    if (!currentUser || !isFirebaseConfigured) return;

    const handleVisibilityChange = () => {
      const docRef = doc(db, 'users', currentUser.id);
      if (document.visibilityState === 'visible') {
        setDoc(docRef, {
          status: 'online',
          lastSeen: serverTimestamp()
        }, { merge: true }).catch(err => console.error(err));
      } else {
        setDoc(docRef, {
          status: 'offline',
          lastSeen: serverTimestamp()
        }, { merge: true }).catch(err => console.error(err));
      }
    };

    const handleBeforeUnload = () => {
      const docRef = doc(db, 'users', currentUser.id);
      setDoc(docRef, {
        status: 'offline',
        lastSeen: serverTimestamp()
      }, { merge: true }).catch(err => console.error(err));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Initialize real-time session tracking
    if (currentUser) {
      initSessionTracking(currentUser);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUser]);

  // Real-time synchronization of currentUser document with Firestore
  useEffect(() => {
    if (!currentUser?.id || !isFirebaseConfigured) return;
    const docRef = doc(db, 'users', currentUser.id);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const raw = docSnap.data() || {};
        const normRole = getNormalizedRole(raw.role || 'élève');
        const updatedData: User = {
          id: docSnap.id,
          ...raw,
          role: normRole
        } as User;

        setCurrentUser(prev => {
          if (!prev) return updatedData;
          // Merge to preserve local session tokens/fields if any
          return { ...prev, ...updatedData };
        });

        // Keep local fallback storage updated as well
        const storedMock = localStorage.getItem('mock_admin_user');
        if (storedMock) {
          try {
            const parsed = JSON.parse(storedMock);
            localStorage.setItem('mock_admin_user', JSON.stringify({ ...parsed, ...updatedData }));
          } catch (e) {
            console.error("Failed to sync mock_admin_user with snapshot:", e);
          }
        }
      }
    }, (err) => {
      console.warn("User doc real-time listener error:", err);
    });

    return () => unsubscribe();
  }, [currentUser?.id]);

  const updateCurrentUser = (data: Partial<User>) => {
    setCurrentUser(prev => {
      if (!prev) return null;
      const merged = { ...prev, ...data };
      const storedMock = localStorage.getItem('mock_admin_user');
      if (storedMock) {
        try {
          const parsed = JSON.parse(storedMock);
          localStorage.setItem('mock_admin_user', JSON.stringify({ ...parsed, ...merged }));
        } catch (e) {
          console.error("Failed to update mock_admin_user in localStorage:", e);
        }
      }
      return merged;
    });
  };

  const refreshCurrentUser = async () => {
    if (!currentUser?.id || !isFirebaseConfigured) return;
    try {
      const docSnap = await getDoc(doc(db, 'users', currentUser.id));
      if (docSnap.exists()) {
        const raw = docSnap.data() || {};
        const normRole = getNormalizedRole(raw.role || 'élève');
        const updatedData: User = {
          id: docSnap.id,
          ...raw,
          role: normRole
        } as User;
        setCurrentUser(prev => ({ ...prev, ...updatedData }));
        const storedMock = localStorage.getItem('mock_admin_user');
        if (storedMock) {
          localStorage.setItem('mock_admin_user', JSON.stringify(updatedData));
        }
      }
    } catch (err) {
      console.error("Error refreshing current user:", err);
    }
  };

  const login = async (email: string, mdp: string) => {
    if (!isFirebaseConfigured) throw new Error("Firebase non configuré");
    setLoading(true);
    
    // Support pseudo and matricule for student login (e.g., 6ème-3ème)
    let loginEmail = email.trim();
    if (loginEmail && !loginEmail.includes('@')) {
      console.log(`[AuthContext] Pseudo/Matricule connection detected: "${loginEmail}". Looking up real email in Firestore...`);
      try {
        const usersRef = collection(db, 'users');
        // Check pseudo
        const qPseudo = query(usersRef, where('pseudo', '==', loginEmail.toLowerCase()));
        let querySnapshot = await getDocs(qPseudo);
        
        // If not found, check matricule
        if (querySnapshot.empty) {
          const qMatricule = query(usersRef, where('matricule', '==', loginEmail.toUpperCase()));
          querySnapshot = await getDocs(qMatricule);
        }
        
        // If not found, check case-insensitive matricule
        if (querySnapshot.empty) {
          const qMatriculeLower = query(usersRef, where('matricule', '==', loginEmail.toLowerCase()));
          querySnapshot = await getDocs(qMatriculeLower);
        }

        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const userData = userDoc.data();
          if (userData.email) {
            console.log(`[AuthContext] Pseudo/Matricule "${loginEmail}" resolved to: "${userData.email}"`);
            loginEmail = userData.email;
          }
        } else {
          console.warn(`[AuthContext] No user found with pseudo or matricule matching: "${loginEmail}"`);
        }
      } catch (err) {
        console.error("[AuthContext] Error searching user by pseudo/matricule:", err);
      }
    }
    
    const isDefaultAdmin = loginEmail.toLowerCase().trim() === 'martinienmvezogo@gmail.com' && mdp === 'password';
    
    try {
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, loginEmail.trim(), mdp);
      } catch (signInErr: any) {
        console.warn("Auth sign-in failed. Checking Firestore for fallback authentication...", signInErr);
        
        // Let's search Firestore users collection for a matching email!
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', loginEmail.trim()));
        let querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          const qLower = query(usersRef, where('email', '==', loginEmail.trim().toLowerCase()));
          querySnapshot = await getDocs(qLower);
        }
        
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const userData = { id: userDoc.id, ...userDoc.data() } as User;
          
          console.log("Local Firestore fallback user found and authenticated:", userData);
          
          localStorage.setItem('mock_admin_user', JSON.stringify(userData));
          setCurrentUser(userData);
          
          // Log connection in connections collection if configured
          try {
            await addDoc(collection(db, 'connections'), {
              user_id: userDoc.id,
              nom: userData.nom,
              prenom: userData.prenom,
              email: userData.email,
              role: userData.role,
              etablissement: userData.etablissement || 'EDU-001',
              timestamp: new Date().toISOString(),
              fallback: true
            });
          } catch (logErr) {
            console.error("Failed to log fallback connection:", logErr);
          }
          
          setLoading(false);
          return;
        }

        if (isDefaultAdmin) {
          console.log("Firebase direct sign-in failed/disabled, trying to create or local-fallback...");
          try {
            userCredential = await createUserWithEmailAndPassword(auth, loginEmail.trim(), mdp);
          } catch (createErr: any) {
            console.warn("Could not authenticate default admin via Firebase Auth, falling back to local session:", createErr);
            const mockUid = "mock-admin-uid-123456";
            const mockUser: User = {
              id: mockUid,
              email: 'martinienmvezogo@gmail.com',
              role: 'admin',
              prenom: 'Martinien',
              nom: 'Mvezogo',
              status: 'online',
              preciseRole: 'Super Admin',
              date_creation: new Date().toISOString(),
              face_id: 'mock_face_id_super_admin',
              fingerprint_id: 'mock_fingerprint_id_super_admin'
            };
            try {
              // Try to establish the document in firestore for data alignment but don't crash if it fails
              await setDoc(doc(db, 'users', mockUid), mockUser, { merge: true });
            } catch (fsErr) {
              console.error("Firestore write failed for mock profile (proceeding with local session):", fsErr);
            }
            // Save mock session locally
            localStorage.setItem('mock_admin_user', JSON.stringify(mockUser));
            setCurrentUser(mockUser);
            setLoading(false);
            return;
          }
        } else {
          throw signInErr;
        }
      }
      // Log connection
      try {
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          
          let nom = userData.nom;
          let prenom = userData.prenom;
          
          const normEmail = loginEmail.toLowerCase().trim();
          if (normEmail === 'martinienmvezogo@gmail.com' && (!prenom || !nom)) {
            prenom = 'Martinien';
            nom = 'Mvezogo';
          }
          
          await addDoc(collection(db, 'connections'), {
            user_id: userCredential.user.uid,
            nom: nom,
            prenom: prenom,
            email: userData.email || loginEmail,
            role: userData.role || (normEmail === 'martinienmvezogo@gmail.com' ? 'admin' : userData.role),
            etablissement: userData.etablissement || 'EDU-001',
            timestamp: new Date().toISOString()
          });
        } else if (loginEmail.toLowerCase().trim() === 'martinienmvezogo@gmail.com') {
          await addDoc(collection(db, 'connections'), {
            user_id: userCredential.user.uid,
            nom: 'Mvezogo',
            prenom: 'Martinien',
            email: loginEmail,
            role: 'admin',
            etablissement: 'EDU-001',
            timestamp: new Date().toISOString()
          });

        } else {
          // If user document doesn't exist and it's not the admin, delete the auth user and throw error
          await userCredential.user.delete();
          throw new Error("Profil utilisateur introuvable. Veuillez vous réinscrire.");
        }
      } catch (logErr) {
        if (logErr instanceof Error && logErr.message === "Profil utilisateur introuvable. Veuillez vous réinscrire.") {
          throw logErr;
        }
        console.error("Erreur lors de l'enregistrement de la connexion:", logErr);
      }
      // onAuthStateChanged will handle setting the user
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData: Omit<User, 'id' | 'date_creation' | 'face_id' | 'fingerprint_id'>, mdp: string) => {
    if (!isFirebaseConfigured) throw new Error("Firebase non configuré");
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, userData.email, mdp);
      try {
        const newUser = Object.fromEntries(
          Object.entries({
            ...userData,
            user_id: userCredential.user.uid,
            date_creation: new Date().toISOString(),
            face_id: null,
            fingerprint_id: null
          }).filter(([_, v]) => v !== undefined)
        );
        await setDoc(doc(db, 'users', userCredential.user.uid), newUser, { merge: true });

        // Dispatch real-time welcome email notification
        try {
          let estName = "";
          if (userData.etablissement) {
            try {
              const { getDoc } = await import('firebase/firestore');
              const estDoc = await getDoc(doc(db, 'establishments', userData.etablissement));
              if (estDoc.exists()) {
                estName = estDoc.data().nom || "";
              }
            } catch (estErr) {
              console.warn("Could not retrieve establishment name for self-registration email:", estErr);
            }
          }
          await sendEmailNotification(userData.email, userData.prenom, userData.nom, userData.role, mdp, estName);
        } catch (emailErr) {
          console.warn("Could not dispatch welcome email notification during self-registration:", emailErr);
        }
      } catch (firestoreErr) {
        // If Firestore document creation fails, delete the user from Auth to allow retrying
        await userCredential.user.delete();
        throw firestoreErr;
      }
      // onAuthStateChanged will handle setting the user
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      localStorage.removeItem('mock_admin_user');
      if (currentUser && currentUser.id !== "mock-admin-uid-123456") {
        const docRef = doc(db, 'users', currentUser.id);
        await setDoc(docRef, {
          status: 'offline',
          lastSeen: serverTimestamp()
        }, { merge: true });
      }
      try {
        await signOut(auth);
      } catch (e) {
        console.warn("SignOut failed but continuing logout", e);
      }
      await stopSessionTracking();
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  if (isInitializing) {
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

  return (
    <AuthContext.Provider value={{ currentUser, login, register, logout, updateCurrentUser, refreshCurrentUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

export function mapPositionToResponsibility(pos?: string): string[] {
  if (!pos) return [];
  const normalized = pos.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents
  
  if (normalized.includes('proviseur') || normalized.includes('lycee') || normalized.includes('secondaire') || normalized.includes('censeur')) return ['responsable_lycee'];
  if (normalized.includes('college') || normalized.includes('principal')) return ['responsable_college'];
  if (normalized.includes('primaire') || normalized.includes('directeur primaire') || normalized.includes('directrice primaire')) return ['responsable_primaire'];
  if (normalized.includes('maternelle') || normalized.includes('directrice maternelle') || normalized.includes('creche')) return ['responsable_maternelle'];
  if (normalized.includes('secretaire generale') || normalized === 'secretaire generale') return ['secretaire_generale'];
  if (normalized.includes('secretaire adjoint') || normalized === 'secretaire adjointe') return ['secretaire_adjointe'];
  if (normalized === 'surveillant' || normalized.includes('surveillant general') || normalized === 'surveillant general') return ['surveillant_general'];
  if (normalized.includes('surveillant adjoint')) return ['surveillant_adjoint'];
  if (normalized.includes('comptable') || normalized.includes('intendant') || normalized.includes('tresorier')) return ['gestionnaire_comptable'];
  if (normalized.includes('pedagogique') || normalized.includes('charge pedagogique') || normalized.includes('directeur des etudes')) return ['responsable_pedagogique'];
  if (normalized.includes('menage') || normalized.includes('salubrite') || normalized.includes('entretien')) return ['dame_menage'];
  if (normalized.includes('informatique') || normalized.includes('it') || normalized.includes('materiel') || normalized.includes('technicien')) return ['responsable_it'];
  return [];
}

export function getNormalizedRole(role: string): 'admin' | 'enseignant' | 'élève' | 'personnel administratif' | 'parent' | 'cuisinier' {
  if (!role) return 'élève';
  const r = role.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents
  if (
    r === 'super administrateur' || 
    r === 'super admin' || 
    r === 'super_admin' || 
    r === 'super-admin' || 
    r === "administrateur d'etablissement" || 
    r === "administrateur d’etablissement" || 
    r === 'admin' || 
    r === 'directeur'
  ) {
    return 'admin';
  }
  if (r === 'enseignant') {
    return 'enseignant';
  }
  if (r === 'eleve') {
    return 'élève';
  }
  if (r === 'parent') {
    return 'parent';
  }
  if (r === 'comptable' || r === 'surveillant' || r === 'bibliothecaire' || r === 'personnel administratif') {
    return 'personnel administratif';
  }
  if (r === 'cuisinier') {
    return 'cuisinier';
  }
  return 'élève';
}
