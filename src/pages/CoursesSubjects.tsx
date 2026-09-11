import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useEstablishment } from '../contexts/EstablishmentContext';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { recordAuditLog } from '../services/auditService';
import { 
  BookOpen, 
  GraduationCap, 
  ChevronRight, 
  FileText, 
  Search, 
  Filter, 
  Sparkles, 
  Clock, 
  User, 
  X, 
  Send, 
  Trash2, 
  Edit, 
  Plus, 
  Paperclip, 
  Download, 
  RefreshCw,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotification } from '../contexts/NotificationContext';
import { SCHOOL_CLASSES, SCHOOL_SUBJECTS } from '../constants';

interface CoursesSubjectsProps {
  initialPrepId?: string;
}

export default function CoursesSubjects({ initialPrepId }: CoursesSubjectsProps) {
  const { t } = useLanguage();
  const { currentUser } = useAuth();
  const { currentEstablishment, isSuperAdmin } = useEstablishment();
  const { notifySuccess, notifyError, notifyDelete, notifyUpdate, notifyAdd } = useNotification();
  
  const activeEstId = currentEstablishment?.id || currentUser?.etablissement || 'EDU-001';

  const [classes, setClasses] = useState<any[]>([]);
  const [preparations, setPreparations] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<{id: string, name: string, teacherId?: string, teacherName?: string, etablissement?: string}[]>([]);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectTeacherId, setNewSubjectTeacherId] = useState('');
  const [editingSubject, setEditingSubject] = useState<{id: string, name: string, teacherId?: string} | null>(null);
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [isInitializingSubjects, setIsInitializingSubjects] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedPrep, setSelectedPrep] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [activeTab, setActiveTab] = useState<'courses' | 'subjects'>('courses');
  const [addingSubjectToClass, setAddingSubjectToClass] = useState<string | null>(null);
  
  // Publish state
  const [showPublishSelect, setShowPublishSelect] = useState(false);
  const [classesToPublish, setClassesToPublish] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  
  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string>('');
  const [uploadedName, setUploadedName] = useState<string>('');
  const [savingCourse, setSavingCourse] = useState(false);
  const [allDbClasses, setAllDbClasses] = useState<any[]>([]);
  const [newCourse, setNewCourse] = useState({
    topic: '',
    subject: '',
    grade: '',
    content: '',
    type: 'course'
  });

  const isAdmin = currentUser?.role === 'admin' || 
                  isSuperAdmin ||
                  currentUser?.role === 'personnel administratif' ||
                  currentUser?.role === 'responsable_lycee' ||
                  (currentUser as any)?.poste === 'Responsable Lycée' ||
                  currentUser?.email === 'martinienmvezogo@gmail.com';
  const isStudent = currentUser?.role === 'élève' || currentUser?.role === 'eleve';

  useEffect(() => {
    if (initialPrepId && preparations.length > 0) {
      const prep = preparations.find(p => p.id === initialPrepId);
      if (prep) {
        setSelectedPrep(prep);
      }
    }
  }, [initialPrepId, preparations]);

  useEffect(() => {
    // Dynamic fetch of all registered classes in the active establishment
    const q = query(collection(db, 'classes'));
    const unsubscribe = onSnapshot(q, (snap) => {
      let loadedClasses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter by active establishment
      loadedClasses = loadedClasses.filter((c: any) => (c.etablissement || 'EDU-001') === activeEstId && !c.deleted);
      // Sort classes alphabetically by name
      loadedClasses.sort((a: any, b: any) => (a.nom || '').localeCompare(b.nom || ''));
      setAllDbClasses(loadedClasses);
    }, (error) => {
      console.error("Error loading all db classes:", error);
    });
    return () => unsubscribe();
  }, [activeEstId]);

  useEffect(() => {
    if (!currentUser) return;

    // Fetch classes for active establishment
    let classesQuery;
    if (isAdmin) {
      classesQuery = query(collection(db, 'classes'));
    } else {
      classesQuery = query(
        collection(db, 'classes'),
        where('enseignants_ids', 'array-contains', currentUser.id)
      );
    }

    const unsubscribeClasses = onSnapshot(classesQuery, (snap) => {
      let classesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      classesData = classesData.filter((c: any) => (c.etablissement || 'EDU-001') === activeEstId && !c.deleted);
      setClasses(classesData);
    }, (error) => {
      console.error("Error fetching classes:", error);
      setClasses([]);
    });

    // Fetch preparations (Courses)
    let prepsQuery;
    if (isAdmin) {
      prepsQuery = query(collection(db, 'preparations'));
    } else if (currentUser?.role === 'personnel administratif') {
      prepsQuery = query(collection(db, 'preparations'));
    } else if (isStudent) {
      // Students see published resources for their class
      prepsQuery = query(
        collection(db, 'resources'),
        where('class_name', '==', currentUser.classe || '')
      );
    } else if (currentUser?.role === 'enseignant') {
      prepsQuery = query(
        collection(db, 'preparations'),
        where('authorId', '==', currentUser.id)
      );
    } else {
      prepsQuery = query(collection(db, 'resources'));
    }

    const unsubscribePreps = onSnapshot(prepsQuery, (snap) => {
      let preps = snap.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          topic: data.topic || data.title,
          content: data.content || data.description,
          fileUrl: data.fileUrl || data.url,
          grade: data.grade || data.class_name,
          createdAt: data.createdAt || (data.timestamp ? { toDate: () => new Date(data.timestamp) } : null)
        };
      });

      // Filter by active establishment
      preps = preps.filter((p: any) => !p.etablissement || p.etablissement === activeEstId);

      preps.sort((a: any, b: any) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      setPreparations(preps);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching preps:", error);
      setPreparations([]);
      setLoading(false);
    });

    // Fetch teachers belonging to the active establishment
    const teachersQuery = query(collection(db, 'users'), where('role', '==', 'enseignant'));
    const unsubscribeTeachers = onSnapshot(teachersQuery, (snap) => {
      let teachersData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      teachersData = teachersData.filter((t: any) => (t.etablissement || 'EDU-001') === activeEstId);
      setTeachers(teachersData.sort((a, b) => (a.nom || '').localeCompare(b.nom || '')));
    });

    // Fetch Subjects strictly belonging to the active establishment
    const unsubscribeSubjects = onSnapshot(collection(db, 'subjects'), (snap) => {
      let subjectsData = snap.docs.map(doc => ({ 
        id: doc.id, 
        name: doc.data().name as string,
        teacherId: doc.data().teacherId,
        teacherName: doc.data().teacherName,
        etablissement: doc.data().etablissement || 'EDU-001'
      }));

      // Strictly filter to the current establishment
      subjectsData = subjectsData.filter(s => s.etablissement === activeEstId);
      setSubjects(subjectsData.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    }, (error) => {
      console.error("Error fetching subjects:", error);
      if (error.message.includes('permission')) {
        notifyError("Erreur de permission Firestore: Impossible de lire les matières.");
      }
      setSubjects([]);
    });

    return () => {
      unsubscribeClasses();
      unsubscribePreps();
      unsubscribeSubjects();
      unsubscribeTeachers();
    };
  }, [currentUser, activeEstId]);

  const handleInitializeSuggestedSubjects = async () => {
    if (!isAdmin) return;
    setIsInitializingSubjects(true);
    try {
      let count = 0;
      for (const subj of SCHOOL_SUBJECTS) {
        // Only add if not already in establishment's subjects
        const alreadyExists = subjects.some(s => s.name.toLowerCase() === subj.toLowerCase());
        if (!alreadyExists) {
          await addDoc(collection(db, 'subjects'), {
            name: subj,
            etablissement: activeEstId,
            teacherId: '',
            teacherName: '',
            createdAt: serverTimestamp()
          });
          count++;
        }
      }
      notifySuccess(`${count} matières recommandées ont été initialisées pour cet établissement.`);
    } catch (err) {
      console.error("Error initializing subjects:", err);
      notifyError("Erreur lors de l'initialisation des matières.");
    } finally {
      setIsInitializingSubjects(false);
    }
  };

  const handleAddSubject = async () => {
    if (!newSubjectName.trim()) return;
    
    // Find teacher name if teacherId is selected
    const selectedTeacher = teachers.find(t => t.id === newSubjectTeacherId);
    const teacherName = selectedTeacher ? `${selectedTeacher.prenom} ${selectedTeacher.nom}` : '';

    setIsAddingSubject(true);
    try {
      await addDoc(collection(db, 'subjects'), {
        name: newSubjectName.trim(),
        teacherId: newSubjectTeacherId || '',
        teacherName: teacherName,
        etablissement: activeEstId,
        createdAt: serverTimestamp()
      });
      
      if (currentUser) {
        await recordAuditLog({
          userId: currentUser.id,
          userName: `${currentUser.prenom} ${currentUser.nom}`,
          userRole: currentUser.role,
          action: "Ajout de matière",
          details: `${newSubjectName.trim()} (Établissement: ${activeEstId}, Enseignant: ${teacherName || 'Aucun'})`,
          category: 'management'
        });
      }

      setNewSubjectName('');
      setNewSubjectTeacherId('');
      notifyAdd(`La matière ${newSubjectName.trim()}`);
    } catch (error) {
      console.error("Error adding subject:", error);
      notifyError("Erreur lors de l'ajout de la matière (Vérifiez vos permissions)");
    } finally {
      setIsAddingSubject(false);
    }
  };

  const handleDeleteSubject = async (subjectId: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette matière ?')) {
      try {
        console.log("Deleting subject:", subjectId);
        const subjToDelete = subjects.find(s => s.id === subjectId);
        await deleteDoc(doc(db, 'subjects', subjectId));

        if (currentUser) {
          await recordAuditLog({
            userId: currentUser.id,
            userName: `${currentUser.prenom} ${currentUser.nom}`,
            userRole: currentUser.role,
            action: "Suppression de matière globale",
            details: `Matière supprimée: ${subjToDelete?.name || subjectId}`,
            category: 'management'
          });
        }
        notifyDelete(`La matière ${subjToDelete?.name || subjectId}`);
      } catch (error) {
        console.error("Error deleting subject:", error);
        notifyError("Erreur lors de la suppression");
      }
    }
  };

  const handleUpdateSubject = async () => {
    if (!editingSubject || !editingSubject.name.trim()) return;
    
    const selectedTeacher = teachers.find(t => t.id === editingSubject.teacherId);
    const teacherName = selectedTeacher ? `${selectedTeacher.prenom} ${selectedTeacher.nom}` : '';

    try {
      console.log("Updating subject:", editingSubject.id, editingSubject.name, "Teacher:", teacherName);
      await updateDoc(doc(db, 'subjects', editingSubject.id), {
        name: editingSubject.name.trim(),
        teacherId: editingSubject.teacherId || '',
        teacherName: teacherName
      });

      if (currentUser) {
        await recordAuditLog({
          userId: currentUser.id,
          userName: `${currentUser.prenom} ${currentUser.nom}`,
          userRole: currentUser.role,
          action: "Modification de matière globale",
          details: `Nouveau nom: ${editingSubject.name.trim()}, Enseignant: ${teacherName || 'Aucun'}`,
          category: 'management'
        });
      }
      
      notifyUpdate(`La matière ${editingSubject.name.trim()}`);
      setEditingSubject(null);
    } catch (error) {
      console.error("Error updating subject:", error);
      notifyError("Erreur lors de la mise à jour");
    }
  };

  const handleAddSubjectToClass = async (classId: string, subjectName: string) => {
    console.log("Adding subject to class:", subjectName, "Class ID:", classId);
    const cls = classes.find(c => c.id === classId);
    if (!cls) {
      console.error("Class not found:", classId);
      return;
    }
    
    const matieres = cls.matieres || [];
    if (matieres.includes(subjectName)) {
      console.log("Subject already in class");
      setAddingSubjectToClass(null);
      return;
    }

    try {
      await updateDoc(doc(db, 'classes', classId), {
        matieres: [...matieres, subjectName]
      });

      if (currentUser) {
        await recordAuditLog({
          userId: currentUser.id,
          userName: `${currentUser.prenom} ${currentUser.nom}`,
          userRole: currentUser.role,
          action: "Attribution de matière à une classe",
          details: `Classe: ${cls?.nom}, Matière: ${subjectName}`,
          category: 'management'
        });
      }

      console.log("Subject assigned to class successfully");
      notifySuccess(`Matière ${subjectName} attribuée avec succès à la classe ${cls?.nom}`);
      setAddingSubjectToClass(null);
    } catch (error) {
      console.error("Error adding subject to class:", error);
      notifyError("Erreur lors de l'attribution de la matière");
    }
  };

  const handleRemoveSubjectFromClass = async (classId: string, subjectName: string) => {
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    
    if (!window.confirm(`Retirer ${subjectName} de la classe ${cls.nom} ?`)) return;

    const matieres = cls.matieres || [];
    try {
      await updateDoc(doc(db, 'classes', classId), {
        matieres: matieres.filter((m: string) => m !== subjectName)
      });

      if (currentUser) {
        await recordAuditLog({
          userId: currentUser.id,
          userName: `${currentUser.prenom} ${currentUser.nom}`,
          userRole: currentUser.role,
          action: "Retrait de matière d'une classe",
          details: `Classe: ${cls?.nom}, Matière: ${subjectName}`,
          category: 'management'
        });
      }
      notifySuccess(`Matière ${subjectName} retirée de la classe ${cls.nom}`);
    } catch (error) {
      console.error("Error removing subject from class:", error);
      notifyError("Erreur lors de la suppression de la matière");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setSelectedFile(file);
    setUploadedUrl('');
    setUploadedName('');

    try {
      const fileRef = ref(storage, `courses/${Date.now()}_${file.name}`);
      const { uploadBytesResumable } = await import('firebase/storage');
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        },
        (error) => {
          console.error("Error uploading file:", error);
          notifyError(`Erreur de téléversement : ${error.message}`);
          setUploading(false);
          setUploadProgress(null);
          setSelectedFile(null);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setUploadedUrl(downloadURL);
          setUploadedName(file.name);
          setUploadProgress(100);
          setUploading(false);
          notifySuccess("Fichier joint et prêt à 100% !");
        }
      );
    } catch (error: any) {
      console.error("Error initiating file upload:", error);
      notifyError("Une erreur est survenue lors de l'importation.");
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!newCourse.topic || !newCourse.subject || !newCourse.grade) {
      notifyError("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    if (uploading) {
      notifyError("Veuillez attendre que le téléversement du fichier soit terminé.");
      return;
    }

    setSavingCourse(true);
    try {
      let fileData = {};
      if (uploadedUrl && uploadedName) {
        fileData = { 
          fileUrl: uploadedUrl, 
          fileName: uploadedName 
        };
      }

      await addDoc(collection(db, 'preparations'), {
        ...newCourse,
        ...fileData,
        etablissement: activeEstId,
        authorId: currentUser.id,
        authorName: `${currentUser.prenom} ${currentUser.nom}`,
        createdAt: serverTimestamp(),
      });

      await recordAuditLog({
        userId: currentUser.id,
        userName: `${currentUser.prenom} ${currentUser.nom}`,
        userRole: currentUser.role,
        action: "Création de cours",
        details: `Titre: ${newCourse.topic}, Matière: ${newCourse.subject} (${newCourse.grade}), Établissement: ${activeEstId}`,
        category: 'homework'
      });

      notifyAdd(`Le cours ${newCourse.topic}`);

      // Reset modal and inputs
      setShowAddModal(false);
      setNewCourse({ topic: '', subject: '', grade: '', content: '', type: 'course' });
      setSelectedFile(null);
      setUploadProgress(null);
      setUploadedUrl('');
      setUploadedName('');
    } catch (error) {
      console.error("Error adding course:", error);
      notifyError("Erreur lors de l'ajout du cours.");
    } finally {
      setSavingCourse(false);
    }
  };
  
  const handlePublishCourse = async () => {
    if (!selectedPrep || classesToPublish.length === 0 || !currentUser) return;
    
    setPublishing(true);
    try {
      // Create entries in 'resources' collection for each selected class
      const promises = classesToPublish.map(className => 
        addDoc(collection(db, 'resources'), {
          title: selectedPrep.topic,
          description: selectedPrep.content || "Contenu du cours",
          subject: selectedPrep.subject,
          class_name: className,
          teacher_id: currentUser.id,
          etablissement: activeEstId,
          url: selectedPrep.fileUrl || '',
          type: selectedPrep.fileUrl ? (selectedPrep.fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'document') : 'document',
          timestamp: new Date().toISOString()
        })
      );
      
      await Promise.all(promises);
      
      await recordAuditLog({
        userId: currentUser.id,
        userName: `${currentUser.prenom} ${currentUser.nom}`,
        userRole: currentUser.role,
        action: "Publication de cours à la classe",
        details: `Cours: ${selectedPrep.topic}, Classes: ${classesToPublish.join(', ')}, Établissement: ${activeEstId}`,
        category: 'homework'
      });
      
      notifySuccess(`Cours publié avec succès aux classes : ${classesToPublish.join(', ')}`);
      setShowPublishSelect(false);
      setClassesToPublish([]);
    } catch (error) {
      console.error("Error publishing course:", error);
      notifyError("Erreur lors de la publication du cours.");
    } finally {
      setPublishing(false);
    }
  };

  const filteredPreps = preparations.filter(prep => {
    const matchesSearch = prep.topic?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         prep.subject?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClassId === 'all' || prep.grade === selectedClassId;
    return matchesSearch && matchesClass;
  });

  const groupedPreps = filteredPreps.reduce((acc: any, prep) => {
    const subject = prep.subject || 'Autre';
    if (!acc[subject]) acc[subject] = [];
    acc[subject].push(prep);
    return acc;
  }, {});

  const handleDeletePrep = async (e: React.MouseEvent, prepId: string) => {
    e.stopPropagation();
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce cours ?')) {
      try {
        const prepToDelete = preparations.find(p => p.id === prepId);
        await deleteDoc(doc(db, 'preparations', prepId));

        if (currentUser) {
          await recordAuditLog({
            userId: currentUser.id,
            userName: `${currentUser.prenom} ${currentUser.nom}`,
            userRole: currentUser.role,
            action: "Suppression de cours",
            details: `Titre: ${prepToDelete?.topic || prepId}`,
            category: 'homework'
          });
        }

        notifyDelete(`Le cours ${prepToDelete?.topic || prepId}`);
        if (selectedPrep?.id === prepId) setSelectedPrep(null);
      } catch (error) {
        console.error("Error deleting preparation:", error);
        notifyError("Erreur lors de la suppression");
      }
    }
  };

  const handleStartEdit = () => {
    if (selectedPrep) {
      setEditContent(selectedPrep.content);
      setEditTopic(selectedPrep.topic);
      setIsEditing(true);
    }
  };

  const handleUpdatePrep = async () => {
    if (!selectedPrep) return;
    try {
      await updateDoc(doc(db, 'preparations', selectedPrep.id), {
        content: editContent,
        topic: editTopic
      });

      if (currentUser) {
        await recordAuditLog({
          userId: currentUser.id,
          userName: `${currentUser.prenom} ${currentUser.nom}`,
          userRole: currentUser.role,
          action: "Modification de cours",
          details: `Titre: ${editTopic}`,
          category: 'homework'
        });
      }

      notifyUpdate(`Le cours ${editTopic}`);
      setSelectedPrep({ ...selectedPrep, content: editContent, topic: editTopic });
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating preparation:", error);
      notifyError("Erreur lors de la mise à jour");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <BookOpen className="text-indigo-600" size={28} />
            {t('courses_subjects')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {isAdmin 
              ? t('courses_subjects_admin_desc')
              : isStudent
              ? t('courses_subjects_student_desc')
              : t('courses_subjects_teacher_desc')}
          </p>
        </div>
        {(isAdmin || currentUser?.role === 'enseignant') && (
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <Plus size={20} />
            {t('add_course')}
          </motion.button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('courses')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'courses'
               ? 'border-indigo-600 text-indigo-600'
               : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          {isStudent ? t('my_courses') : t('courses_preparations')}
        </button>
        <button
          onClick={() => setActiveTab('subjects')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'subjects'
               ? 'border-indigo-600 text-indigo-600'
               : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          {isStudent ? t('class_subjects_student') : t('class_subjects_teacher')}
        </button>
      </div>

      {activeTab === 'courses' ? (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un cours, un sujet..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            {!isStudent && (
              <div className="flex items-center gap-2">
                <Filter size={18} className="text-gray-400" />
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="all">Toutes les classes / niveaux</option>
                  {Array.from(new Set(preparations.map(p => p.grade))).filter(Boolean).sort().map(grade => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Content */}
          {Object.keys(groupedPreps).length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-12 text-center"
            >
              <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText size={32} />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('no_courses_found')}</h2>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                {isAdmin 
                  ? t('no_courses_admin')
                  : isStudent
                  ? t('no_courses_student')
                  : t('no_courses_teacher')}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-12">
              {Object.keys(groupedPreps).map(subject => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={subject} 
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 px-2">
                    <div className="w-2 h-6 bg-indigo-600 rounded-full"></div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-wider">{subject}</h2>
                    <span className="text-xs font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                      {groupedPreps[subject].length} {groupedPreps[subject].length > 1 ? 'cours' : 'cours'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                      {groupedPreps[subject].map((prep: any, i: number) => (
                        <motion.div 
                          key={prep.id}
                          layout
                          initial={{ opacity: 0, scale: 0.9, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -20 }}
                          transition={{ duration: 0.3, delay: i * 0.05 }}
                          className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all overflow-hidden group hover:border-indigo-200 dark:hover:border-indigo-900/50"
                        >
                          <div 
                            className="p-6 cursor-pointer"
                            onClick={() => setSelectedPrep(prep)}
                          >
                          <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl group-hover:scale-110 transition-transform">
                              <Sparkles size={24} />
                            </div>
                            <div className="flex items-center gap-2">
                              {(currentUser?.role === 'admin' || prep.authorId === currentUser?.id) && (
                                <>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedPrep(prep);
                                      setEditContent(prep.content);
                                      setEditTopic(prep.topic);
                                      setIsEditing(true);
                                    }}
                                    className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                                  >
                                    <Edit size={16} />
                                  </button>
                                  <button 
                                    onClick={(e) => handleDeletePrep(e, prep.id)}
                                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                              <div className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[10px] font-bold rounded uppercase tracking-wider">
                                {t(prep.type)}
                              </div>
                            </div>
                          </div>

                          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 line-clamp-1">{prep.topic}</h3>
                          <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 font-semibold mb-4">
                            <GraduationCap size={14} />
                            <span>{prep.grade}</span>
                          </div>

                          <div className="space-y-2 mb-6">
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <Clock size={14} />
                              <span>{isStudent ? 'Publié le' : 'Généré le'} {prep.createdAt?.toDate ? new Date(prep.createdAt.toDate()).toLocaleDateString() : 'Récemment'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <User size={14} />
                              <span>{t('by_author')} {prep.authorName || (prep.teacher_id ? t('published_by_teacher') : t('system_label'))}</span>
                            </div>
                          </div>

                          <div className="prose dark:prose-invert max-w-none text-xs text-gray-600 dark:text-gray-300 line-clamp-3 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700 italic mb-4">
                            {prep.content || (prep.fileUrl ? "Consultez le document joint pour le contenu du cours." : "Aucun contenu pré-rédigé.")}
                          </div>

                          {prep.fileUrl && (
                            <div className="mb-4">
                              <a 
                                href={prep.fileUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-bold hover:bg-indigo-100 transition-colors w-full"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Paperclip size={14} />
                                <span className="truncate flex-1">{prep.fileName || "Document joint"}</span>
                                <Download size={14} />
                              </a>
                            </div>
                          )}
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                          <button 
                            onClick={() => setSelectedPrep(prep)}
                            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            {t('details_course')}
                          </button>
                          <ChevronRight size={14} className="text-indigo-600 dark:text-indigo-400" />
                        </div>
                      </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Global Subjects Repertoire */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="text-indigo-600" size={24} />
                  {t('subjects_repertoire')}
                </h3>
                <p className="text-xs text-gray-500 mt-1 italic">
                  {isStudent
                    ? t('subjects_student_desc')
                    : t('subjects_teacher_desc')}
                </p>
              </div>
              
              {isAdmin && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full lg:w-auto">
                  <input
                    type="text"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    placeholder="Nom de la matière..."
                    className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                  <select
                    value={newSubjectTeacherId}
                    onChange={(e) => setNewSubjectTeacherId(e.target.value)}
                    className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-600 dark:text-gray-300"
                  >
                    <option value="">Sélectionner un enseignant...</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddSubject}
                    disabled={isAddingSubject || !newSubjectName.trim()}
                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {isAddingSubject ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      <Plus size={18} />
                    )}
                    Ajouter au répertoire
                  </button>
                </div>
              )}
            </div>

            {subjects.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-12">#</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Matière</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Enseignant Responsable</th>
                      {isAdmin && <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {subjects.map((subj, index) => (
                      <tr key={subj.id} className="group hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
                        <td className="px-6 py-4 text-xs text-gray-400 font-medium">{index + 1}</td>
                        <td className="px-6 py-4">
                          {editingSubject?.id === subj.id ? (
                            <input
                              autoFocus
                              type="text"
                              value={editingSubject.name}
                              onChange={(e) => setEditingSubject({ ...editingSubject, name: e.target.value })}
                              className="w-full bg-white dark:bg-gray-800 border border-indigo-500 rounded-lg px-3 py-1.5 text-sm outline-none shadow-sm"
                              onKeyDown={(e) => e.key === 'Enter' && handleUpdateSubject()}
                            />
                          ) : (
                            <span className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">{subj.name}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {editingSubject?.id === subj.id ? (
                            <select
                              value={editingSubject.teacherId || ''}
                              onChange={(e) => setEditingSubject({ ...editingSubject, teacherId: e.target.value })}
                              className="w-full bg-white dark:bg-gray-800 border border-indigo-500 rounded-lg px-3 py-1.5 text-sm outline-none shadow-sm"
                            >
                              <option value="">Non assigné</option>
                              {teachers.map(t => (
                                <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex items-center gap-2">
                              {subj.teacherName ? (
                                <>
                                  <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-black">
                                    {subj.teacherName.charAt(0)}
                                  </div>
                                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{subj.teacherName}</span>
                                </>
                              ) : (
                                <span className="text-xs text-gray-400 italic">Aucun enseignant</span>
                              )}
                            </div>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-4">
                            <div className="flex justify-end items-center gap-2">
                              {editingSubject?.id === subj.id ? (
                                <>
                                  <button 
                                    onClick={handleUpdateSubject}
                                    className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all"
                                    title="Sauvegarder"
                                  >
                                    <Send size={16} />
                                  </button>
                                  <button 
                                    onClick={() => setEditingSubject(null)}
                                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                    title="Annuler"
                                  >
                                    <X size={16} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button 
                                    onClick={() => setEditingSubject({ id: subj.id, name: subj.name, teacherId: subj.teacherId })}
                                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
                                    title="Modifier"
                                  >
                                    <Edit size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteSubject(subj.id)}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                    title="Supprimer"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-6">
                <BookOpen size={44} className="mx-auto text-indigo-400 mb-3 opacity-60" />
                <h4 className="text-base font-bold text-gray-900 dark:text-white mb-1">Aucune matière enregistrée pour cet établissement</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-5">
                  {isAdmin 
                    ? `En tant que responsable de cet établissement (${currentEstablishment?.nom || 'actif'}), vous pouvez créer vos propres matières manuellement ci-dessus ou importer les matières standards.`
                    : "Aucune matière n'a encore été configurée par l'administration de cet établissement."}
                </p>
                {isAdmin && (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={handleInitializeSuggestedSubjects}
                      disabled={isInitializingSubjects}
                      className="px-5 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm"
                    >
                      {isInitializingSubjects ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      Initialiser les matières recommandées pour cet établissement
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <div className="w-2 h-6 bg-amber-500 rounded-full"></div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-wider">Répartition par Classe</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {classes
                .filter(cls => !isStudent || cls.nom === currentUser?.classe)
                .map(cls => (
                <div key={cls.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden group hover:shadow-md transition-all">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors">{cls.nom}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-tighter">{cls.niveau}</p>
                    </div>
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600">
                      <GraduationCap size={20} />
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Matières Active</h4>
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setAddingSubjectToClass(addingSubjectToClass === cls.id ? null : cls.id);
                            }}
                            className={`p-2 rounded-xl transition-all shadow-sm ${addingSubjectToClass === cls.id ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:scale-105 active:scale-95'}`}
                            title="Ajouter une matière"
                          >
                            <Plus size={16} />
                          </button>
                        )}
                        <span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900 text-indigo-600 px-2 py-0.5 rounded-full">
                          {cls.matieres?.length || 0}
                        </span>
                      </div>
                    </div>

                    {addingSubjectToClass === cls.id && (
                      <div className="animate-in slide-in-from-top-1 duration-200">
                        {subjects.length > 0 ? (
                          <div className="flex gap-2">
                            <select
                              className="flex-1 px-3 py-2 bg-indigo-100/50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-[11px] font-bold text-indigo-700 dark:text-indigo-300 outline-none focus:ring-2 focus:ring-indigo-500"
                              onChange={(e) => {
                                if (e.target.value) handleAddSubjectToClass(cls.id, e.target.value);
                              }}
                              defaultValue=""
                            >
                              <option value="">+ Choisir une matière</option>
                              {subjects
                                .filter(s => !cls.matieres?.includes(s.name))
                                .map(s => (
                                  <option key={s.id} value={s.name}>{s.name}</option>
                                ))
                              }
                            </select>
                            <button 
                              onClick={() => setAddingSubjectToClass(null)}
                              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/50 rounded-xl text-[10px] text-amber-700 dark:text-amber-400">
                            Veuillez d'abord ajouter des matières dans le répertoire ci-dessus.
                          </div>
                        )}
                      </div>
                    )}

                    {cls.matieres && cls.matieres.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {cls.matieres.sort().map((m: string, idx: number) => (
                          <div 
                            key={idx} 
                            className="group/tag flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-[11px] font-bold rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:border-indigo-200 transition-colors"
                          >
                            <span>{m}</span>
                            {isAdmin && (
                              <button
                                onClick={() => handleRemoveSubjectFromClass(cls.id, m)}
                                className="opacity-0 group-hover/tag:opacity-100 p-0.5 hover:text-red-500 transition-all ml-1"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center gap-2">
                        <p className="text-xs text-gray-400 italic">Aucune matière définie</p>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setAddingSubjectToClass(cls.id);
                            }}
                            className="mt-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-900/40 px-3 py-1.5 rounded-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 shadow-sm border border-indigo-100"
                          >
                            <Plus size={12} />
                            Attribuer une matière
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {classes.length === 0 && !loading && (
            <div className="col-span-full bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-12 text-center">
              <BookOpen size={32} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 font-medium tracking-tight">Aucune classe n'est disponible ou ne vous est assignée.</p>
            </div>
          )}

          {loading && (
            <div className="col-span-full bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-12 text-center">
              <RefreshCw size={32} className="mx-auto text-gray-300 animate-spin mb-4" />
              <p className="text-gray-500 dark:text-gray-400 font-medium tracking-tight">Récupération des données en temps réel...</p>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedPrep && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <div className="flex-1 mr-4">
                {isEditing ? (
                  <input
                    type="text"
                    value={editTopic}
                    onChange={(e) => setEditTopic(e.target.value)}
                    className="w-full px-3 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-lg font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedPrep.topic}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{selectedPrep.subject} • {selectedPrep.grade}</p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && (isAdmin || currentUser?.role === 'enseignant') && (
                  <button 
                    onClick={handleStartEdit}
                    className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                    title="Modifier"
                  >
                    <Edit size={20} />
                  </button>
                )}
                <button 
                  onClick={() => {
                    setSelectedPrep(null);
                    setIsEditing(false);
                  }} 
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-none custom-scrollbar"
                />
              ) : (
                <div className="space-y-6">
                  {selectedPrep.fileUrl && (
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-50 dark:border-gray-700">
                          <Paperclip size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedPrep.fileName || "Document de cours"}</p>
                          <p className="text-xs text-gray-500">Document PDF ou Image</p>
                        </div>
                      </div>
                      <a 
                        href={selectedPrep.fileUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                      >
                        <Download size={14} />
                        Télécharger
                      </a>
                    </div>
                  )}
                  <div className="prose dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                    {selectedPrep.content || (!selectedPrep.fileUrl && "Aucun contenu disponible pour ce cours.")}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-medium rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleUpdatePrep}
                    className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    Enregistrer les modifications
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setSelectedPrep(null)}
                    className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-medium rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    {t('close')}
                  </button>
                  {(isAdmin || currentUser?.role === 'enseignant') && (
                    <div className="relative">
                      {showPublishSelect && (
                        <div className="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-4 animate-in slide-in-from-bottom-2 duration-200 z-10">
                          <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Publier à :</h4>
                          <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar mb-4">
                            {classes.map(cls => (
                              <label key={cls.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors">
                                <input 
                                  type="checkbox"
                                  checked={classesToPublish.includes(cls.nom)}
                                  onChange={(e) => {
                                    if (e.target.checked) setClassesToPublish([...classesToPublish, cls.nom]);
                                    else setClassesToPublish(classesToPublish.filter(c => c !== cls.nom));
                                  }}
                                  className="w-4 h-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                />
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{cls.nom}</span>
                              </label>
                            ))}
                          </div>
                          <button
                            disabled={classesToPublish.length === 0 || publishing}
                            onClick={handlePublishCourse}
                            className="w-full py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                          >
                            {publishing ? <RefreshCw className="animate-spin" size={16} /> : <Send size={16} />}
                            Confirmer la publication
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => setShowPublishSelect(!showPublishSelect)}
                        className={`px-6 py-2 rounded-xl font-medium transition-all flex items-center gap-2 ${
                          showPublishSelect ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-inner' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        <Send size={18} />
                        {showPublishSelect ? 'Annuler' : t('publish_to_class')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Course Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-xl mx-auto my-8 animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[calc(100vh-4rem)] border border-gray-100 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 sticky top-0 z-10 shrink-0">
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2 font-sans tracking-tight">
                <Plus className="text-indigo-600 dark:text-indigo-400" size={24} />
                Nouveau cours
              </h2>
              <button 
                onClick={() => {
                  if (uploading) {
                    if (!window.confirm("Un téléversement est en cours. Voulez-vous vraiment annuler ?")) return;
                  }
                  setShowAddModal(false);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateCourse} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Matière</label>
                  <select
                    required
                    value={newCourse.subject}
                    onChange={(e) => setNewCourse({ ...newCourse, subject: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-750 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-sm font-semibold text-gray-800 dark:text-gray-250 appearance-none cursor-pointer shadow-sm"
                  >
                    <option value="">Sélectionner une matière</option>
                    {(subjects.length > 0 ? subjects.map(s => s.name) : SCHOOL_SUBJECTS).map(subj => (
                      <option key={subj} value={subj}>{subj}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Classe / Niveau</label>
                  <select
                    required
                    value={newCourse.grade}
                    onChange={(e) => setNewCourse({ ...newCourse, grade: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-750 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-sm font-semibold text-gray-800 dark:text-gray-250 appearance-none cursor-pointer shadow-sm"
                  >
                    <option value="">Sélectionner une classe</option>
                    {(allDbClasses.length > 0 ? allDbClasses.map(c => c.nom) : SCHOOL_CLASSES).map(clsNom => (
                      <option key={clsNom} value={clsNom}>{clsNom}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-505 dark:text-gray-400 mb-1.5">Sujet du cours / Titre</label>
                <input
                  type="text"
                  required
                  value={newCourse.topic}
                  onChange={(e) => setNewCourse({ ...newCourse, topic: e.target.value })}
                  placeholder="Ex: Les fractions ou La Révolution Française"
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-750 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-sm font-medium text-gray-850 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-505 dark:text-gray-400 mb-1.5">Description / Contenu textuel</label>
                <textarea
                  value={newCourse.content}
                  onChange={(e) => setNewCourse({ ...newCourse, content: e.target.value })}
                  placeholder="Écrivez ou collez les instructions, le résumé ou le contenu textuel du cours..."
                  className="w-full h-28 px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-750 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-505 dark:text-gray-400 mb-1.5">Document de cours (PDF / Image)</label>
                
                {/* File input and interactive label */}
                <div className="relative">
                  <input
                    type="file"
                    id="course-file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".pdf,image/*"
                    disabled={uploading}
                  />
                  <label 
                    htmlFor="course-file"
                    className={`flex flex-col items-center justify-center w-full px-6 py-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                      uploading 
                        ? 'bg-gray-50/50 dark:bg-gray-900/10 border-indigo-200 dark:border-indigo-900/30 cursor-not-allowed opacity-70' 
                        : 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-gray-100/50 dark:hover:bg-gray-900/50'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center gap-1.5">
                      <Paperclip className="text-gray-400 dark:text-gray-500" size={24} />
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                        {selectedFile ? "Sélectionner un autre fichier" : "Cliquez ou glissez pour joindre un fichier"}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-505">
                        Formats acceptés : PDF ou Images
                      </p>
                    </div>
                  </label>
                </div>

                {/* Progress bar and successfully loaded preview card */}
                {(uploadProgress !== null || uploadedUrl) && (
                  <div className="mt-3 p-3.5 bg-indigo-50/55 dark:bg-indigo-950/20 rounded-xl border border-indigo-100/70 dark:border-indigo-950/40 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-3">
                      {uploadedUrl && uploadedName.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <img 
                          src={uploadedUrl} 
                          alt="Prévisualisation" 
                          className="w-10 h-10 object-cover rounded-lg border border-indigo-200 dark:border-indigo-900/40"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center">
                          <FileText size={20} />
                        </div>
                      )}
                      <div className="text-left">
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate max-w-[200px] sm:max-w-xs">{uploadedName || selectedFile?.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {uploadProgress !== null && uploadProgress < 100 ? (
                            <div className="flex items-center gap-2 w-32 sm:w-48">
                              <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                              </div>
                              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{uploadProgress}%</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-100/50 dark:border-emerald-900/30">
                              <Check className="text-emerald-600 dark:text-emerald-400" size={12} />
                              Joint à 100% (Prêt pour enregistrement)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setUploadProgress(null);
                        setUploadedUrl('');
                        setUploadedName('');
                      }}
                      className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 hover:text-rose-600 rounded-lg transition-colors shadow-none"
                      title="Retirer le fichier"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Action buttons (footer is inside the form, perfectly sticky/scrolling) */}
              <div className="flex gap-4 pt-3 sticky bottom-0 bg-white dark:bg-gray-800 py-3 mt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={uploading || savingCourse}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 text-sm"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={uploading || savingCourse || !newCourse.topic || !newCourse.subject || !newCourse.grade}
                  className="flex-1 py-3 bg-indigo-600 text-white font-extrabold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-150 dark:shadow-none disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                >
                  {savingCourse ? (
                    <>
                      <RefreshCw className="animate-spin" size={18} />
                      Enregistrement...
                    </>
                  ) : "Ajouter le cours"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
