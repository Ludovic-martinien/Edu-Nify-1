import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useNotification } from '../contexts/NotificationContext';
import { auth, db, storage } from '../lib/firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { collection, doc, setDoc, updateDoc, query, where, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { User, Lock, Mail, Shield, BookOpen, Fingerprint, AlertCircle, CheckCircle2, RefreshCw, Briefcase, Target, Calendar, Edit2, Save, Camera, Plus, X, Phone, MapPin, User2, GraduationCap, History, UserCircle } from 'lucide-react';
import { resizeImage } from '../lib/imageUtils';

export default function Profile() {
  const { currentUser, updateCurrentUser } = useAuth();
  const { t, language, tData } = useLanguage();
  const { notifySuccess, notifyError } = useNotification();
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [nom, setNom] = useState(currentUser?.nom || '');
  const [prenom, setPrenom] = useState(currentUser?.prenom || '');
  const [biographie, setBiographie] = useState(currentUser?.biographie || '');
  const [matieres, setMatieres] = useState<string[]>(currentUser?.matieres || (currentUser?.matiere ? [currentUser.matiere] : []));
  const [newMatiere, setNewMatiere] = useState('');
  
  const [contact, setContact] = useState(currentUser?.contact || '');
  const [address, setAddress] = useState(currentUser?.address || '');
  const [gender, setGender] = useState(currentUser?.gender || 'not_specified');
  const [diploma, setDiploma] = useState(currentUser?.diploma || '');
  const [experienceYears, setExperienceYears] = useState(currentUser?.experience_years?.toString() || '');
  const [age, setAge] = useState(currentUser?.age?.toString() || '');

  // Synchronize local form states with currentUser whenever currentUser updates
  useEffect(() => {
    if (currentUser) {
      setNom(currentUser.nom || '');
      setPrenom(currentUser.prenom || '');
      setContact(currentUser.contact || '');
      setAddress(currentUser.address || '');
      setGender(currentUser.gender || 'not_specified');
      setDiploma(currentUser.diploma || '');
      setExperienceYears(currentUser.experience_years?.toString() || '');
      setAge(currentUser.age?.toString() || '');
      setBiographie(currentUser.biographie || '');
      setMatieres(currentUser.matieres || (currentUser.matiere ? [currentUser.matiere] : []));
    }
  }, [currentUser]);

  const [isEditingBio, setIsEditingBio] = useState(false);
  const [isEditingMatieres, setIsEditingMatieres] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const [savingMatieres, setSavingMatieres] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [viewTab, setViewTab] = useState<'info' | 'history'>('info');
  const [userLogs, setUserLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'attendance_logs'),
      where('user_id', '==', currentUser.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }) as any).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setUserLogs(logs);
    });

    return () => unsubscribe();
  }, [currentUser]);

  if (!currentUser) {
    return null;
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError(t('password_mismatch'));
      return;
    }

    if (newPassword.length < 6) {
      setError(t('password_short'));
      return;
    }

    if (!auth.currentUser || !auth.currentUser.email) {
      setError(t('unauthenticated_error'));
      return;
    }

    setLoading(true);
    try {
      // Re-authenticate user before changing password
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      // Update password
      await updatePassword(auth.currentUser, newPassword);
      
      setSuccess(t('password_updated_success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error(err);
      const errCode = err?.code || '';
      const errMsg = err?.message || '';
      const isInvalidCredential = 
        errCode === 'auth/invalid-credential' || 
        errCode === 'auth/wrong-password' ||
        errMsg.includes('auth/invalid-credential') ||
        errMsg.includes('auth/wrong-password');

      const isTooManyRequests = 
        errCode === 'auth/too-many-requests' || 
        errMsg.includes('auth/too-many-requests');

      if (isInvalidCredential) {
        setError(t('wrong_password_error'));
      } else if (isTooManyRequests) {
        setError(t('too_many_requests'));
      } else {
        setError(t('update_error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBio = async () => {
    if (!currentUser) return;
    setSavingBio(true);
    try {
      const userRef = doc(db, 'users', currentUser.id);
      await setDoc(userRef, { biographie: biographie }, { merge: true });
      updateCurrentUser({ biographie });
      setIsEditingBio(false);
      notifySuccess("Biographie mise à jour avec succès !");
    } catch (err) {
      console.error("Erreur lors de la mise à jour de la biographie:", err);
      notifyError(t('bio_update_error'));
    } finally {
      setSavingBio(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!currentUser) return;
    setSavingInfo(true);
    try {
      const userRef = doc(db, 'users', currentUser.id);
      const updatedPayload = {
        nom: nom.trim() || currentUser.nom,
        prenom: prenom.trim() || currentUser.prenom,
        contact: contact.trim(),
        address: address.trim(),
        gender: gender,
        diploma: diploma.trim(),
        experience_years: experienceYears ? parseInt(experienceYears) : null,
        age: age ? parseInt(age) : null
      };
      await setDoc(userRef, updatedPayload, { merge: true });
      updateCurrentUser(updatedPayload);
      setIsEditingInfo(false);
      notifySuccess("Profil et informations enregistrés avec succès !");
    } catch (err) {
      console.error("Erreur lors de la mise à jour des informations:", err);
      notifyError(t('info_update_error'));
    } finally {
      setSavingInfo(false);
    }
  };

  const handleSaveMatieres = async () => {
    if (!currentUser) return;
    setSavingMatieres(true);
    try {
      const userRef = doc(db, 'users', currentUser.id);
      const payload = {
        matieres: matieres,
        matiere: matieres.length > 0 ? matieres[0] : null
      };
      await setDoc(userRef, payload, { merge: true });
      updateCurrentUser(payload);
      setIsEditingMatieres(false);
      notifySuccess("Matières enregistrées avec succès !");
    } catch (err) {
      console.error("Erreur lors de la mise à jour des matières:", err);
      notifyError(t('subjects_update_error'));
    } finally {
      setSavingMatieres(false);
    }
  };

  const addMatiere = () => {
    if (newMatiere.trim() && !matieres.includes(newMatiere.trim())) {
      setMatieres([...matieres, newMatiere.trim()]);
      setNewMatiere('');
    }
  };

  const removeMatiere = (matiere: string) => {
    setMatieres(matieres.filter(m => m !== matiere));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'photo' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    if (type === 'photo') setUploadingPhoto(true);
    else setUploadingCover(true);
    setError('');
    setSuccess('');

    try {
      // Resize image before uploading
      const maxWidth = type === 'photo' ? 400 : 1200;
      const maxHeight = type === 'photo' ? 400 : 600;
      const resizedBlob = await resizeImage(file, maxWidth, maxHeight);

      const storageRef = ref(storage, `users/${currentUser.id}/${type}_${Date.now()}`);
      await uploadBytes(storageRef, resizedBlob);
      const downloadURL = await getDownloadURL(storageRef);
      
      const userRef = doc(db, 'users', currentUser.id);
      await setDoc(userRef, { [type]: downloadURL }, { merge: true });
      updateCurrentUser({ [type]: downloadURL });
      setSuccess(t('photo_updated_success').replace('{{type}}', type === 'photo' ? t('profile_photo') : t('cover_photo')));
      notifySuccess(t('photo_updated_success').replace('{{type}}', type === 'photo' ? t('profile_photo') : t('cover_photo')));
    } catch (err) {
      console.error(err);
      setError(t('upload_error'));
    } finally {
      if (type === 'photo') setUploadingPhoto(false);
      else setUploadingCover(false);
    }
  };

  const roleDetails = {
    'admin': {
      title: t('admin_role_title'),
      description: t('admin_role_desc'),
      missions: [
        t('admin_mission_1'),
        t('admin_mission_2'),
        t('admin_mission_3'),
        t('admin_mission_4'),
        t('admin_mission_5')
      ]
    },
    'enseignant': {
      title: t('teacher_role_title'),
      description: t('teacher_role_desc'),
      missions: [
        t('teacher_mission_1'),
        t('teacher_mission_2'),
        t('teacher_mission_3'),
        t('teacher_mission_4')
      ]
    },
    'élève': {
      title: t('student_role_title'),
      description: t('student_role_desc'),
      missions: [
        t('student_mission_1'),
        t('student_mission_2'),
        t('student_mission_3'),
        t('student_mission_4')
      ]
    },
    'personnel administratif': {
      title: t('admin_staff_role_title'),
      description: t('admin_staff_role_desc'),
      missions: [
        t('admin_staff_mission_1'),
        t('admin_staff_mission_2'),
        t('admin_staff_mission_3'),
        t('admin_staff_mission_4')
      ]
    }
  };

  const currentRoleInfo = roleDetails[currentUser.role as keyof typeof roleDetails] || roleDetails['élève'];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t('my_profile')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('manage_personal_info')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Info Card */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative">
            {/* Cover Photo */}
            <div className="h-32 bg-indigo-600 relative group overflow-hidden">
              {currentUser.cover ? (
                <img src={currentUser.cover} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-r from-indigo-500 to-purple-600"></div>
              )}
              <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, 'cover')} disabled={uploadingCover} />
                {uploadingCover ? <RefreshCw className="text-white animate-spin" /> : <Camera className="text-white" />}
              </label>
            </div>

            <div className="p-6 text-center border-b border-gray-100 bg-gray-50/50 relative pt-14">
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 group">
                {currentUser.photo ? (
                  <img src={currentUser.photo} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-sm bg-white" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-3xl uppercase border-4 border-white shadow-sm bg-white">
                    {currentUser.prenom?.[0] || currentUser.email?.[0] || 'U'}
                  </div>
                )}
                <label className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, 'photo')} disabled={uploadingPhoto} />
                  {uploadingPhoto ? <RefreshCw className="text-white animate-spin" /> : <Camera className="text-white" />}
                </label>
              </div>
              
              <h2 className="mt-2 text-xl font-bold text-gray-900">
                {currentUser.prenom || currentUser.nom ? `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim() : currentUser.email?.split('@')[0] || t('user')}
              </h2>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize mt-2 ${
                currentUser.role === 'élève' ? 'bg-blue-100 text-blue-700' :
                currentUser.role === 'enseignant' ? 'bg-purple-100 text-purple-700' :
                currentUser.role === 'admin' ? 'bg-red-100 text-red-700' :
                'bg-orange-100 text-orange-700'
              }`}>
                {tData(currentUser.role)}
              </span>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="text-gray-400" size={18} />
                <div className="flex-1 overflow-hidden">
                  <p className="text-gray-500 text-xs">Email</p>
                  <p className="font-medium text-gray-900 truncate">{currentUser.email}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 text-sm">
                <Phone className="text-gray-400" size={18} />
                <div className="flex-1 overflow-hidden">
                  <p className="text-gray-500 text-xs">{t('contact')}</p>
                  <p className="font-medium text-gray-900 truncate">{currentUser.contact || '-'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <MapPin className="text-gray-400" size={18} />
                <div className="flex-1 overflow-hidden">
                  <p className="text-gray-500 text-xs">{t('address')}</p>
                  <p className="font-medium text-gray-900 truncate">{currentUser.address || '-'}</p>
                </div>
              </div>

              {currentUser.matricule && (
                <div className="flex items-center gap-3 text-sm">
                  <Shield className="text-gray-400" size={18} />
                  <div>
                    <p className="text-gray-500 text-xs">{t('id_number')}</p>
                    <p className="font-mono text-gray-900">{currentUser.matricule}</p>
                  </div>
                </div>
              )}

              {currentUser.role === 'élève' && currentUser.classe && (
                <div className="flex items-center gap-3 text-sm">
                  <BookOpen className="text-gray-400" size={18} />
                  <div>
                    <p className="text-gray-500 text-xs">{t('class')}</p>
                    <p className="font-medium text-gray-900">{currentUser.classe}</p>
                  </div>
                </div>
              )}

              {currentUser.date_creation && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="text-gray-400" size={18} />
                  <div>
                    <p className="text-gray-500 text-xs">{t('member_since')}</p>
                    <p className="font-medium text-gray-900">
                      {new Date(currentUser.date_creation).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-gray-100">
                <p className="text-gray-500 text-xs mb-2">{t('biometric_status')}</p>
                {currentUser.face_id && currentUser.fingerprint_id ? (
                  <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl text-sm font-medium">
                    <Fingerprint size={16} />
                    {t('registration_complete')}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-xl text-sm font-medium">
                    <AlertCircle size={16} />
                    {t('registration_incomplete')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs for Info / History */}
        <div className="md:col-span-2">
          <div className="flex bg-white rounded-t-2xl border-x border-t border-gray-100 overflow-hidden">
            <button 
              onClick={() => setViewTab('info')}
              className={`flex-1 py-4 text-sm font-bold transition-all ${viewTab === 'info' ? 'text-indigo-600 bg-white border-b-2 border-indigo-600' : 'text-gray-500 bg-gray-50 hover:bg-gray-100'}`}
            >
              {t('my_profile')}
            </button>
            <button 
              onClick={() => setViewTab('history')}
              className={`flex-1 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 ${viewTab === 'history' ? 'text-indigo-600 bg-white border-b-2 border-indigo-600' : 'text-gray-500 bg-gray-50 hover:bg-gray-100'}`}
            >
              <History size={16} />
              {t('attendance_history')}
            </button>
          </div>

          <div className="space-y-6">
            {viewTab === 'info' ? (
              <>
                {/* Personal Info Grid Section */}
                <div className="bg-white rounded-b-2xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <UserCircle size={20} />
                </div>
                <h2 className="text-lg font-bold text-gray-900">{t('additional_info')}</h2>
              </div>
              {!isEditingInfo ? (
                <button 
                  onClick={() => setIsEditingInfo(true)}
                  className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center gap-1"
                >
                  <Edit2 size={14} /> {t('edit')}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setIsEditingInfo(false);
                      setNom(currentUser.nom || '');
                      setPrenom(currentUser.prenom || '');
                      setContact(currentUser.contact || '');
                      setAddress(currentUser.address || '');
                      setGender(currentUser.gender || 'not_specified');
                      setDiploma(currentUser.diploma || '');
                      setExperienceYears(currentUser.experience_years?.toString() || '');
                      setAge(currentUser.age?.toString() || '');
                    }}
                    className="text-gray-500 hover:text-gray-700 text-sm"
                    disabled={savingInfo}
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    onClick={handleSaveInfo}
                    disabled={savingInfo}
                    className="bg-indigo-600 text-white px-3 py-1 rounded-md text-sm flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingInfo ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                    {t('save')}
                  </button>
                </div>
              )}
            </div>

            {isEditingInfo ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Prénom</label>
                  <div className="relative">
                    <User2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                      type="text"
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      placeholder="Prénom"
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
                  <div className="relative">
                    <User2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                      type="text"
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      placeholder="Nom de famille"
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('contact')}</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                      type="text"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('address')}</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('gender')}</label>
                  <div className="relative">
                    <User2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as any)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="not_specified">{t('not_specified')}</option>
                      <option value="male">{t('male')}</option>
                      <option value="female">{t('female')}</option>
                      <option value="other">{t('other')}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('age')}</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                      type="number"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('diploma')}</label>
                  <div className="relative">
                    <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                      type="text"
                      list="profile-diplomas-list"
                      value={diploma}
                      onChange={(e) => setDiploma(e.target.value)}
                      placeholder="Sélectionner ou saisir un diplôme..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                    <datalist id="profile-diplomas-list">
                      <option value="Licence" />
                      <option value="Master" />
                      <option value="Doctorat" />
                      <option value="CPAS" />
                      <option value="CAPES" />
                      <option value="Agrégation" />
                      <option value="BTS / DUT" />
                      <option value="Baccalauréat" />
                      <option value="DNB - Brevet" />
                    </datalist>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('experience_years')}</label>
                  <div className="relative">
                    <History className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                      type="number"
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                <div className="flex flex-col items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <Phone className="text-indigo-500 mb-2" size={20} />
                  <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">{t('contact')}</span>
                  <span className="text-sm font-medium text-gray-900 mt-1">{currentUser.contact || '-'}</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <MapPin className="text-indigo-500 mb-2" size={20} />
                  <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">{t('address')}</span>
                  <span className="text-sm font-medium text-gray-900 mt-1 truncate w-full px-2">{currentUser.address || '-'}</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <User2 className="text-indigo-500 mb-2" size={20} />
                  <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">{t('gender')}</span>
                  <span className="text-sm font-medium text-gray-900 mt-1">{currentUser.gender ? t(currentUser.gender) : '-'}</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <Calendar className="text-indigo-500 mb-2" size={20} />
                  <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">{t('age')}</span>
                  <span className="text-sm font-medium text-gray-900 mt-1">{currentUser.age || '-'}</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <GraduationCap className="text-indigo-500 mb-2" size={20} />
                  <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">{t('diploma')}</span>
                  <span className="text-sm font-medium text-gray-900 mt-1 truncate w-full px-2">{currentUser.diploma || '-'}</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                  <History className="text-indigo-500 mb-2" size={20} />
                  <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">{t('experience_years')}</span>
                  <span className="text-sm font-medium text-gray-900 mt-1">{currentUser.experience_years || '-'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Role & Missions Section */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Briefcase size={20} />
                </div>
                <h2 className="text-lg font-bold text-gray-900">{t('role_missions')}</h2>
              </div>
            </div>
            
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-md font-semibold text-gray-900">{t('bio')}</h3>
                  {!isEditingBio ? (
                    <button 
                      onClick={() => setIsEditingBio(true)}
                      className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center gap-1"
                    >
                      <Edit2 size={14} /> {t('edit')}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setIsEditingBio(false);
                          setBiographie(currentUser.biographie || '');
                        }}
                        className="text-gray-500 hover:text-gray-700 text-sm"
                        disabled={savingBio}
                      >
                        {t('cancel')}
                      </button>
                      <button 
                        onClick={handleSaveBio}
                        disabled={savingBio}
                        className="bg-indigo-600 text-white px-3 py-1 rounded-md text-sm flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {savingBio ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        {t('save')}
                      </button>
                    </div>
                  )}
                </div>
                
                {isEditingBio ? (
                  <textarea
                    value={biographie}
                    onChange={(e) => setBiographie(e.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[120px] text-sm"
                    placeholder={t('biography_placeholder')}
                  />
                ) : (
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 min-h-[80px]">
                    {currentUser.biographie ? (
                      <p className="text-gray-700 text-sm whitespace-pre-wrap">{currentUser.biographie}</p>
                    ) : (
                      <p className="text-gray-400 text-sm italic">{t('no_biography')}</p>
                    )}
                  </div>
                )}
              </div>

              {currentUser.role === 'enseignant' && (
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-md font-semibold text-gray-900">{t('subjects')}</h3>
                    {!isEditingMatieres ? (
                      <button 
                        onClick={() => setIsEditingMatieres(true)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center gap-1"
                      >
                        <Edit2 size={14} /> {t('edit')}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setIsEditingMatieres(false);
                            setMatieres(currentUser.matieres || (currentUser.matiere ? [currentUser.matiere] : []));
                          }}
                          className="text-gray-500 hover:text-gray-700 text-sm"
                          disabled={savingMatieres}
                        >
                          {t('cancel')}
                        </button>
                        <button 
                          onClick={handleSaveMatieres}
                          disabled={savingMatieres}
                          className="bg-indigo-600 text-white px-3 py-1 rounded-md text-sm flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {savingMatieres ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                          {t('save')}
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditingMatieres ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newMatiere}
                          onChange={(e) => setNewMatiere(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMatiere())}
                          placeholder={t('add_subject_placeholder')}
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                        <button
                          type="button"
                          onClick={addMatiere}
                          className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100"
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {matieres.map(m => (
                          <span key={m} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm">
                            {m}
                            <button onClick={() => removeMatiere(m)} className="text-indigo-400 hover:text-indigo-600">
                              <X size={14} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(currentUser.matieres || (currentUser.matiere ? [currentUser.matiere] : [])).length > 0 ? (
                        (currentUser.matieres || (currentUser.matiere ? [currentUser.matiere] : [])).map((m: string) => (
                          <span key={m} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                            {m}
                          </span>
                        ))
                      ) : (
                        <p className="text-gray-400 text-sm italic">{t('no_subjects')}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-md font-semibold text-gray-900 mb-2">{currentRoleInfo.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {currentRoleInfo.description}
                </p>
              </div>
              
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                <div className="flex items-center gap-2 mb-4 text-gray-900 font-semibold">
                  <Target size={18} className="text-indigo-600" />
                  <h4>{t(' missions_title')}</h4>
                </div>
                <ul className="space-y-3">
                  {currentRoleInfo.missions.map((mission, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0"></div>
                      <span>{mission}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Lock size={20} />
              </div>
              <h2 className="text-lg font-bold text-gray-900">{t('security')} & {t('password')}</h2>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              
              {success && (
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl text-sm border border-emerald-100 flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('current_password')}</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('new_password')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  placeholder="••••••••"
                />
                <p className="text-xs text-gray-500 mt-1">{t('min_password_length_hint')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('confirm_new_password')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  placeholder="••••••••"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <RefreshCw className="animate-spin" size={18} /> : null}
                  {t('update_password_btn')}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : (
          <div className="bg-white rounded-b-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <History size={20} className="text-indigo-600" />
                {t('recent_scans')}
              </h2>
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{userLogs.length} {t('scans_recorded')}</span>
            </div>

            <div className="overflow-hidden border border-gray-100 rounded-2xl">
              <table className="w-full text-sm text-left text-gray-500">
                <thead className="text-[10px] text-gray-400 uppercase bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 font-black">{t('date')}</th>
                    <th className="px-4 py-3 font-black">{t('time')}</th>
                    <th className="px-4 py-3 font-black">{t('action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-medium">
                  {userLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-gray-400 italic">
                        {t('no_scans_recorded')}
                      </td>
                    </tr>
                  ) : (
                    userLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(log.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-900">
                          {log.time}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                            log.type === 'entrée' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {log.type === 'entrée' ? t('arrival') : log.type === 'sortie' ? t('departure') : tData(log.type)} {log.isLate && <span className="ml-1 text-red-600">({t('late').toUpperCase()})</span>}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
</div>
  );
}
