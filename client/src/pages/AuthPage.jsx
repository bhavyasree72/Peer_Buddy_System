import React, { useState, useEffect } from 'react';
import { api, apiRequest } from '../services/api';
import { CheckCircle2, AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  confirmPasswordReset,
  verifyPasswordResetCode,
  setPersistence,
  browserLocalPersistence,
  signOut
} from 'firebase/auth';
import { auth, db } from '../firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';

export default function AuthPage({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [master, setMaster] = useState({ schools: [], programs: [], mentors: [] });

  // Complete Profile mode (for Firebase Auth users missing Firestore profiles)
  const [completeProfileMode, setCompleteProfileMode] = useState(false);
  const [completeProfileData, setCompleteProfileData] = useState(null);
  const [completeProfileRole, setCompleteProfileRole] = useState('student');
  const [completeProfileForm, setCompleteProfileForm] = useState({
    fullName: '',
    sapId: '',
    schoolId: '',
    programId: '',
    year: '',
    semester: '',
    department: '',
    designation: ''
  });

  // Login form state - ISOLATED per role (Student, Faculty, Mentor)
  const [loginRole, setLoginRole] = useState('student');
  const [loginForms, setLoginForms] = useState({
    student: { email: '', password: '' },
    faculty: { email: '', password: '' },
    mentor: { email: '', password: '' }
  });

  const currentLoginEmail = loginForms[loginRole]?.email || '';
  const currentLoginPassword = loginForms[loginRole]?.password || '';

  const updateLoginForm = (field, value) => {
    setMessage('');
    setError('');
    setLoginForms(prev => ({
      ...prev,
      [loginRole]: {
        ...prev[loginRole],
        [field]: value
      }
    }));
  };

  // Register form state - isolated state per role (Issue 7)
  const [selectedRole, setSelectedRole] = useState('student');
  const [step, setStep] = useState(1);

  const initialStudentData = {
    fullName: '',
    sapId: '',
    email: '',
    password: '',
    confirmPassword: '',
    schoolId: '',
    programId: '',
    year: '',
    semester: '',
    mentorId: ''
  };

  const initialStaffData = {
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    department: '',
    designation: ''
  };

  const [studentForm, setStudentForm] = useState(initialStudentData);
  const [facultyForm, setFacultyForm] = useState(initialStaffData);
  const [mentorForm, setMentorForm] = useState(initialStaffData);

  // Active form pointer helper
  const currentForm = selectedRole === 'student' ? studentForm : selectedRole === 'faculty' ? facultyForm : mentorForm;

  useEffect(() => {
    async function fetchMaster() {
      try {
        const data = await api.getMasterData();
        if (data && data.schools && data.schools.length > 0) {
          setMaster(data);
          return;
        }
      } catch (err) {
        console.warn('[MasterData] API fallback to Firestore:', err.message);
      }
      try {
        const schoolsSnap = await getDocs(collection(db, 'schools'));
        const programsSnap = await getDocs(collection(db, 'programs'));
        const mentorsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'mentor')));
        
        const schools = schoolsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const programs = programsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const mentors = mentorsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        setMaster(prev => ({
          ...prev,
          schools: schools.length > 0 ? schools : prev.schools,
          programs: programs.length > 0 ? programs : prev.programs,
          mentors: mentors.length > 0 ? mentors : prev.mentors
        }));
      } catch (e) {
        console.error('[MasterData] Firestore fallback error:', e);
      }
    }
    fetchMaster();
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Reset password state
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetMode, setResetMode] = useState(false);

  useEffect(() => {
    // Check if URL has reset-password in search or hash
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash || '';
    const mode = searchParams.get('mode');
    const oobCode = searchParams.get('oobCode');
    let token = searchParams.get('token') || oobCode;

    if (!token && hash.includes('token=')) {
      const hashQuery = hash.includes('?') ? hash.split('?')[1] : hash.replace(/^#/, '');
      const hashParams = new URLSearchParams(hashQuery);
      token = hashParams.get('token') || hashParams.get('oobCode');
    }

    if (mode === 'resetPassword' && oobCode) {
      setResetToken(oobCode);
      setResetMode(true);
      verifyPasswordResetCode(auth, oobCode).catch(() => {
        setError('This password reset link is invalid or has expired. Please request a new one.');
      });
    } else if (token) {
      setResetToken(token);
      setResetMode(true);
    }
  }, []);

  // Strong password checker helper (Issue 6)
  function evaluatePassword(pwd) {
    const hasMinLen = (pwd || '').length >= 8;
    const hasUpper = /[A-Z]/.test(pwd || '');
    const hasLower = /[a-z]/.test(pwd || '');
    const hasDigit = /[0-9]/.test(pwd || '');
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd || '');
    const isValid = hasMinLen && hasUpper && hasLower && hasDigit && hasSpecial;
    return { hasMinLen, hasUpper, hasLower, hasDigit, hasSpecial, isValid };
  }

  const regPwdStatus = evaluatePassword(currentForm.password);
  const resetPwdStatus = evaluatePassword(newPassword);

  // Login Email Placeholder
  const getLoginPlaceholder = () => {
    return 'Enter your Gmail address (example@gmail.com)';
  };

  // Role switch handler that isolates state and resets errors (Issue 7)
  function handleRoleSwitch(newRole) {
    setSelectedRole(newRole);
    setError('');
    setMessage('');
    setUnverifiedEmail('');
    setStep(1);
  }

  function updateActiveForm(field, value) {
    setMessage('');
    setError('');
    if (selectedRole === 'student') {
      setStudentForm(prev => ({ ...prev, [field]: value }));
    } else if (selectedRole === 'faculty') {
      setFacultyForm(prev => ({ ...prev, [field]: value }));
    } else {
      setMentorForm(prev => ({ ...prev, [field]: value }));
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setUnverifiedEmail('');
    setLoading(true);

    const trimmedEmail = currentLoginEmail.trim().toLowerCase();
    const password = currentLoginPassword;

    try {
      // Ensure persistent authentication across page refreshes and tab closures
      await setPersistence(auth, browserLocalPersistence).catch(() => {});

      // 1. Authenticate with Firebase Authentication
      let userCred;
      try {
        userCred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      } catch (fbErr) {
        if (fbErr.code === 'auth/wrong-password' || fbErr.code === 'auth/user-not-found' || fbErr.code === 'auth/invalid-credential') {
          // If not in Firebase yet (e.g. pre-existing seed account), try legacy backend
          try {
            const legacyRes = await api.login({ email: trimmedEmail, password });
            sessionStorage.setItem('token', legacyRes.accessToken);
            sessionStorage.setItem('user', JSON.stringify(legacyRes.user));
            localStorage.setItem('token', legacyRes.accessToken);
            localStorage.setItem('user', JSON.stringify(legacyRes.user));
            onLoginSuccess(legacyRes.user);
            return;
          } catch (legErr) {
            throw new Error('That email and password do not match. Please try again or reset your password.');
          }
        } else if (fbErr.code === 'auth/user-disabled') {
          throw new Error('Your account has been disabled. Please contact the administrator.');
        } else if (fbErr.code === 'auth/too-many-requests') {
          throw new Error('Too many failed login attempts. Please wait a few minutes before trying again.');
        } else {
          throw new Error(fbErr.message || 'Authentication failed. Please check your credentials.');
        }
      }

      if (userCred && userCred.user) {
        // 2. Refresh authentication state to get latest emailVerified status
        await userCred.user.reload();
        const fbUser = auth.currentUser;
        const idToken = await fbUser.getIdToken(true);

        // 3. Resolve user document and profile directly from Firestore
        let userDocData = null;
        let profileDocData = null;

        try {
          const userDocSnap = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDocSnap.exists()) {
            userDocData = userDocSnap.data();
          } else {
            // Check for UID mismatch by querying email
            const q = query(collection(db, 'users'), where('email', '==', trimmedEmail));
            const querySnap = await getDocs(q);
            if (!querySnap.empty) {
              const matchedDoc = querySnap.docs[0];
              userDocData = { ...matchedDoc.data(), user_id: fbUser.uid };
              await setDoc(doc(db, 'users', fbUser.uid), userDocData).catch(() => {});
            }
          }
        } catch (dbErr) {
          console.warn('[Login] Firestore user lookup note:', dbErr.message);
        }

        // Try backend firebaseLogin as enrichment if available
        let backendProfileRes = null;
        try {
          backendProfileRes = await api.firebaseLogin({ idToken, email: trimmedEmail });
          if (backendProfileRes && backendProfileRes.user) {
            userDocData = userDocData || backendProfileRes.user;
          }
        } catch (apiErr) {
          console.warn('[Login] Backend firebaseLogin notice:', apiErr.message);
        }

        // Check if user is suspended or deleted
        if (userDocData && (userDocData.status === 'suspended' || userDocData.status === 'deleted')) {
          await signOut(auth);
          throw new Error('Your account is no longer active. Please contact the administrator.');
        }

        const userRole = userDocData?.role || backendProfileRes?.user?.role || loginRole;

        // Fetch detailed profile (student_profiles or staff_profiles)
        try {
          const profileCollection = userRole === 'student' ? 'student_profiles' : 'staff_profiles';
          const profDocSnap = await getDoc(doc(db, profileCollection, fbUser.uid));
          if (profDocSnap.exists()) {
            profileDocData = profDocSnap.data();
          } else if (userDocData?.user_id && userDocData.user_id !== fbUser.uid) {
            const oldProfSnap = await getDoc(doc(db, profileCollection, userDocData.user_id));
            if (oldProfSnap.exists()) {
              profileDocData = { ...oldProfSnap.data(), user_id: fbUser.uid };
              await setDoc(doc(db, profileCollection, fbUser.uid), profileDocData).catch(() => {});
            }
          }
        } catch (profErr) {
          console.warn('[Login] Profile lookup notice:', profErr.message);
        }

        // If no userDoc or profile found anywhere, open safe profile completion modal
        if (!userDocData && !backendProfileRes?.user) {
          setCompleteProfileData({
            uid: fbUser.uid,
            email: trimmedEmail,
            idToken: idToken,
            emailVerified: !!fbUser.emailVerified
          });
          setCompleteProfileRole(loginRole);
          setCompleteProfileMode(true);
          return;
        }

        // 4. Block unverified users across Student, Faculty, and Mentor roles (Admin exempt)
        const isVerified = fbUser.emailVerified || userDocData?.email_verified === 1 || userDocData?.email_verified === true;
        if (!isVerified && userRole !== 'admin') {
          setUnverifiedEmail(trimmedEmail);
          setError('Email verification required. We sent a verification link to your Gmail address. Please verify your email before logging in.');
          return;
        }

        // 5. Construct resolved user object
        const resolvedUser = {
          userId: fbUser.uid,
          user_id: fbUser.uid,
          email: trimmedEmail,
          sapId: userDocData?.sap_id || userDocData?.sapId || null,
          role: userRole,
          fullName: profileDocData?.full_name || profileDocData?.fullName || userDocData?.fullName || fbUser.displayName || trimmedEmail.split('@')[0],
          photoUrl: profileDocData?.photo_url || fbUser.photoURL || null,
          semester: profileDocData?.semester || 1,
          profileCompleteness: profileDocData?.profile_completeness || 40,
          emailVerified: !!fbUser.emailVerified
        };

        // 6. Establish persistent session
        sessionStorage.setItem('token', backendProfileRes?.accessToken || idToken);
        sessionStorage.setItem('user', JSON.stringify(resolvedUser));
        localStorage.setItem('token', backendProfileRes?.accessToken || idToken);
        localStorage.setItem('user', JSON.stringify(resolvedUser));

        onLoginSuccess(resolvedUser);
      }
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('verification required')) {
        setUnverifiedEmail(trimmedEmail);
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteProfile(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const trimmedName = (completeProfileForm.fullName || '').trim();
      if (trimmedName.length < 2 || !/^[a-zA-Z\s]+$/.test(trimmedName)) {
        throw new Error('Full Name must contain letters and spaces only (minimum 2 characters).');
      }

      const payload = {
        uid: completeProfileData.uid,
        email: completeProfileData.email,
        role: completeProfileRole,
        fullName: trimmedName,
        emailVerified: !!completeProfileData.emailVerified
      };

      if (completeProfileRole === 'student') {
        const trimmedSap = (completeProfileForm.sapId || '').trim();
        if (!/^7\d{10}$/.test(trimmedSap)) {
          throw new Error('SAP ID must be exactly 11 digits, numeric only, and start with 7 (e.g. 70572400072).');
        }
        if (!completeProfileForm.schoolId) throw new Error('Please select a school.');
        if (!completeProfileForm.programId) throw new Error('Please select a program / branch.');
        if (!completeProfileForm.year) throw new Error('Please select an academic year.');
        if (!completeProfileForm.semester) throw new Error('Please select a semester.');

        payload.sapId = trimmedSap;
        payload.schoolId = completeProfileForm.schoolId;
        payload.programId = completeProfileForm.programId;
        payload.year = parseInt(completeProfileForm.year, 10);
        payload.semester = parseInt(completeProfileForm.semester, 10);
      } else {
        const trimmedDept = (completeProfileForm.department || '').trim();
        const trimmedDesig = (completeProfileForm.designation || '').trim();
        if (!trimmedDept) throw new Error('Please enter your department.');
        if (!trimmedDesig) throw new Error('Please enter your designation.');

        payload.department = trimmedDept;
        payload.designation = trimmedDesig;
      }

      // 1. Write directly to Cloud Firestore as primary persistence
      const nowStr = new Date().toISOString();
      const userDocRef = doc(db, 'users', completeProfileData.uid);
      await setDoc(userDocRef, {
        user_id: completeProfileData.uid,
        email: completeProfileData.email,
        role: completeProfileRole,
        status: 'active',
        email_verified: completeProfileData.emailVerified ? 1 : 0,
        failed_login_attempts: 0,
        lockout_until: null,
        created_at: nowStr,
        last_login: nowStr,
        ...(completeProfileRole === 'student' ? { sap_id: payload.sapId } : {})
      }, { merge: true }).catch(e => console.warn('[CompleteProfile] Firestore user notice:', e));

      const profileColl = completeProfileRole === 'student' ? 'student_profiles' : 'staff_profiles';
      const profDocRef = doc(db, profileColl, completeProfileData.uid);
      const profData = completeProfileRole === 'student' ? {
        user_id: completeProfileData.uid,
        full_name: payload.fullName,
        school_id: payload.schoolId,
        program_id: payload.programId,
        year: payload.year,
        semester: payload.semester,
        bio: null,
        photo_url: null,
        study_mode: 'both',
        open_to_requests: 1,
        show_email: 0,
        show_availability: 1,
        profile_completeness: 40,
        created_at: nowStr
      } : {
        user_id: completeProfileData.uid,
        full_name: payload.fullName,
        department: payload.department,
        designation: payload.designation,
        expertise: null,
        photo_url: null,
        created_at: nowStr
      };
      await setDoc(profDocRef, profData, { merge: true }).catch(e => console.warn('[CompleteProfile] Firestore profile notice:', e));

      // 2. Invoke backend API if available
      let res = null;
      try {
        res = await api.completeProfile(payload, completeProfileData.idToken);
      } catch (apiErr) {
        console.warn('[CompleteProfile] Backend notice:', apiErr.message);
      }

      const finalUser = res?.user || {
        userId: completeProfileData.uid,
        user_id: completeProfileData.uid,
        email: completeProfileData.email,
        sapId: payload.sapId || null,
        role: completeProfileRole,
        fullName: payload.fullName,
        photoUrl: null,
        semester: payload.semester || 1,
        profileCompleteness: 40,
        emailVerified: !!completeProfileData.emailVerified
      };

      if (!completeProfileData.emailVerified && completeProfileRole !== 'admin') {
        setUnverifiedEmail(completeProfileData.email);
        setMessage('Profile details saved successfully! Email verification is required before logging in. Please check your Gmail inbox and verify your email.');
        setCompleteProfileMode(false);
        return;
      }

      sessionStorage.setItem('token', res?.accessToken || completeProfileData.idToken);
      sessionStorage.setItem('user', JSON.stringify(finalUser));
      localStorage.setItem('token', res?.accessToken || completeProfileData.idToken);
      localStorage.setItem('user', JSON.stringify(finalUser));
      onLoginSuccess(finalUser);
    } catch (err) {
      setError(err.message || 'Failed to complete profile.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setUnverifiedEmail('');

    // Step 1 validation
    if (step === 1) {
      if (!currentForm.fullName || !currentForm.email || !currentForm.password) {
        setError('Please fill in all required fields.');
        return;
      }

      // Name validation: letters and spaces only, min 2 chars (Issue 6)
      const trimmedName = currentForm.fullName.trim();
      if (trimmedName.length < 2 || !/^[a-zA-Z\s]+$/.test(trimmedName)) {
        setError('Full Name must contain letters and spaces only (minimum 2 characters).');
        return;
      }

      // Email validation: Strictly @gmail.com for Student, Faculty, and Mentor
      const trimmedEmail = currentForm.email.trim().toLowerCase();
      const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
      if (!gmailRegex.test(trimmedEmail)) {
        setError('Please enter a valid Gmail address ending with @gmail.com.');
        return;
      }

      // SAP ID validation for students: 11 digits starting with 7 (Issue 4)
      if (selectedRole === 'student') {
        if (!currentForm.sapId) {
          setError('SAP ID is required for student registration.');
          return;
        }
        if (!/^7\d{10}$/.test(currentForm.sapId.trim())) {
          setError('SAP ID must be exactly 11 digits, numeric only, and start with 7 (e.g. 70572400072).');
          return;
        }
      }

      // Password rules: min 8, 1 uppercase, 1 lowercase, 1 digit, 1 special char (Issue 6)
      if (!regPwdStatus.isValid) {
        setError('Password does not meet the security criteria. Please follow the checklist below.');
        return;
      }

      if (currentForm.password !== currentForm.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      setStep(2);
      return;
    }

    // Step 2 validation (Issues 2 & 8: Dropdowns must not be empty/placeholder)
    if (selectedRole === 'student') {
      if (!currentForm.schoolId) {
        setError('Please select a school.');
        return;
      }
      if (!currentForm.programId) {
        setError('Please select a program/branch.');
        return;
      }
      if (!currentForm.year) {
        setError('Please select an academic year.');
        return;
      }
      if (!currentForm.semester) {
        setError('Please select a semester.');
        return;
      }
      if (!currentForm.mentorId) {
        setError('Please select a mentor to connect with.');
        return;
      }
    } else {
      if (!currentForm.department || !currentForm.department.trim()) {
        setError('Please enter your department.');
        return;
      }
      if (!currentForm.designation || !currentForm.designation.trim()) {
        setError('Please enter your designation.');
        return;
      }
    }

    setLoading(true);
    const trimmedEmail = currentForm.email.trim().toLowerCase();

    try {
      // 1. Create account in Firebase Authentication as the single source of truth
      let userCred;
      try {
        userCred = await createUserWithEmailAndPassword(auth, trimmedEmail, currentForm.password);
      } catch (fbErr) {
        if (fbErr.code === 'auth/email-already-in-use') {
          throw new Error('An account with this email address already exists. Please sign in instead.');
        } else if (fbErr.code === 'auth/weak-password') {
          throw new Error('Password does not meet Firebase security requirements.');
        } else if (fbErr.code === 'auth/invalid-email') {
          throw new Error('Invalid email address format.');
        } else {
          throw new Error(fbErr.message || 'Failed to create Firebase Authentication account.');
        }
      }

      const uid = userCred.user.uid;
      const idToken = await userCred.user.getIdToken();

      // 2. Send real verification email via Firebase Authentication
      const actionCodeSettings = {
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: false
      };
      let emailSent = false;
      try {
        await sendEmailVerification(userCred.user, actionCodeSettings);
        emailSent = true;
      } catch (emErr) {
        console.error('sendEmailVerification error:', emErr);
      }

      // 3. Write profile directly into Cloud Firestore as primary persistence
      const nowStr = new Date().toISOString();
      const userDocRef = doc(db, 'users', uid);
      await setDoc(userDocRef, {
        user_id: uid,
        email: trimmedEmail,
        role: selectedRole,
        status: 'active',
        email_verified: 0,
        failed_login_attempts: 0,
        lockout_until: null,
        created_at: nowStr,
        last_login: null,
        ...(selectedRole === 'student' ? { sap_id: currentForm.sapId.trim() } : {})
      }).catch(e => console.warn('[Register] Firestore user notice:', e));

      const profileColl = selectedRole === 'student' ? 'student_profiles' : 'staff_profiles';
      const profDocRef = doc(db, profileColl, uid);
      const profData = selectedRole === 'student' ? {
        user_id: uid,
        full_name: currentForm.fullName.trim(),
        school_id: currentForm.schoolId,
        program_id: currentForm.programId,
        year: parseInt(currentForm.year, 10),
        semester: parseInt(currentForm.semester, 10),
        mentor_id: currentForm.mentorId || null,
        bio: null,
        photo_url: null,
        study_mode: 'both',
        open_to_requests: 1,
        show_email: 0,
        show_availability: 1,
        profile_completeness: 40,
        created_at: nowStr
      } : {
        user_id: uid,
        full_name: currentForm.fullName.trim(),
        department: currentForm.department.trim(),
        designation: currentForm.designation.trim(),
        expertise: null,
        photo_url: null,
        created_at: nowStr
      };
      await setDoc(profDocRef, profData).catch(e => console.warn('[Register] Firestore profile notice:', e));

      const profilePayload = {
        uid,
        role: selectedRole,
        fullName: currentForm.fullName.trim(),
        email: trimmedEmail,
        emailVerified: false,
        ...(selectedRole === 'student' ? {
          sapId: currentForm.sapId.trim(),
          schoolId: currentForm.schoolId,
          programId: currentForm.programId,
          year: parseInt(currentForm.year, 10),
          semester: parseInt(currentForm.semester, 10),
          mentorId: currentForm.mentorId
        } : {
          department: currentForm.department.trim(),
          designation: currentForm.designation.trim()
        })
      };

      try {
        await api.syncProfile(profilePayload, idToken);
      } catch (apiErr) {
        console.warn('[Register] Backend syncProfile notice:', apiErr.message);
      }

      // Sign out immediately so unverified account does not persist in active session
      await signOut(auth);

      const successMsg = emailSent
        ? 'Account created successfully! A verification email has been sent to your Gmail address. Please verify your email before logging in.'
        : 'Account created successfully! Please click "Resend Verification Email" if you do not receive your verification link shortly.';

      setMessage(successMsg);
      setUnverifiedEmail(trimmedEmail);
      setIsRegister(false);
      setStep(1);
      setStudentForm(initialStudentData);
      setFacultyForm(initialStaffData);
      setMentorForm(initialStaffData);
      setLoginRole(selectedRole);
      setLoginForms(prev => ({
        ...prev,
        [selectedRole]: { email: trimmedEmail, password: '' }
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!unverifiedEmail && !currentLoginEmail) {
      setError('Please enter your registered Gmail address to resend the verification email.');
      return;
    }
    const targetEmail = (unverifiedEmail || currentLoginEmail).trim().toLowerCase();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      let targetUser = auth.currentUser;
      if (!targetUser && currentLoginPassword) {
        try {
          const cred = await signInWithEmailAndPassword(auth, targetEmail, currentLoginPassword);
          targetUser = cred.user;
        } catch (e) {}
      }

      if (targetUser) {
        await sendEmailVerification(targetUser, {
          url: window.location.origin + window.location.pathname,
          handleCodeInApp: false
        });
        setMessage(`Verification email has been resent to ${targetEmail}. Please check your inbox.`);
      } else {
        // Fallback to server endpoint
        await apiRequest('/auth/resend-verification', 'POST', { email: targetEmail });
        setMessage(`Verification email has been resent to ${targetEmail}. Please check your inbox.`);
      }
    } catch (err) {
      if (err.code === 'auth/too-many-requests') {
        setError('Too many verification requests. Please wait a few minutes before trying again.');
      } else {
        setError(err.message || 'Failed to resend verification email.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError('');

    if (!newPassword || !confirmNewPassword) {
      setError('Please provide and confirm your new password.');
      return;
    }
    if (!resetPwdStatus.isValid) {
      setError('New password does not satisfy strong security requirements.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // 1. Try Firebase Authentication confirmPasswordReset
      try {
        await confirmPasswordReset(auth, resetToken, newPassword);
        setMessage('Your password has been successfully reset! You can now sign in with your new password.');
        setResetMode(false);
        setNewPassword('');
        setConfirmNewPassword('');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      } catch (fbErr) {
        if (fbErr.code === 'auth/expired-action-code') {
          throw new Error('This password reset link has expired. Please request a new one.');
        } else if (fbErr.code === 'auth/invalid-action-code') {
          // Could be legacy token, fallback to server
          const res = await api.resetPassword({ token: resetToken, newPassword });
          setMessage(res.message);
          setResetMode(false);
          setNewPassword('');
          setConfirmNewPassword('');
          window.location.hash = '';
          return;
        } else {
          throw fbErr;
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    if (!forgotEmail) {
      setError('Please provide your registered Gmail address.');
      return;
    }
    const trimmed = forgotEmail.trim().toLowerCase();
    if (!trimmed.endsWith('@gmail.com')) {
      setError('Please enter a valid Gmail address ending with @gmail.com.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await sendPasswordResetEmail(auth, trimmed, {
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: false
      });
      setMessage(`Password reset email sent to ${trimmed}! Please check your Gmail inbox and spam folder.`);
      setForgotMode(false);
      setForgotEmail('');
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        setMessage(`If an account exists for ${trimmed}, a password reset link has been sent.`);
        setForgotMode(false);
        setForgotEmail('');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many password reset requests. Please wait a few minutes before trying again.');
      } else {
        // Fallback to server endpoint if needed
        try {
          const res = await api.forgotPassword(trimmed);
          setMessage(res.message);
          setForgotMode(false);
          setForgotEmail('');
        } catch (serverErr) {
          setError(err.message || 'Failed to send password reset email.');
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundColor: 'var(--bg-subtle)'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        maxWidth: '960px',
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
      }}>
        {/* Left half: Welcome brand intro */}
        <div style={{
          padding: '48px 40px',
          borderRight: '1px solid var(--border)',
          backgroundColor: '#FAFAFA',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--accent-tint)',
            color: 'var(--accent)',
            padding: '6px 14px',
            borderRadius: '999px',
            fontSize: '13px',
            fontWeight: '600',
            width: 'fit-content',
            marginBottom: '20px'
          }}>
            <ShieldCheck size={16} /> NMIMS Verified Academic Portal
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '16px', lineHeight: '1.25' }}>
            Find your study partner at NMIMS
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '28px', lineHeight: '1.5' }}>
            Connect with peers, collaborate on coursework, schedule revision sessions, and build projects within your college community.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>Multi-Buddy Collaborative Network</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Connect with multiple buddies across batches, courses, and programs.</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>Dual-Verified Study Sessions</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Real attendance confirmed by both participants for faculty oversight.</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>Role-Secured NMIMS Authentication</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Exclusive intra-college access for students, mentors, and faculty.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right half: Auth cards */}
        <div style={{ padding: '44px 38px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {error && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '12px',
              backgroundColor: 'var(--accent-tint)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent)',
              fontSize: '13px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
              {(unverifiedEmail || error.toLowerCase().includes('verification')) && (
                <div style={{ marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={loading}
                    style={{
                      background: 'none',
                      border: '1px solid var(--accent)',
                      color: 'var(--accent)',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '12px'
                    }}
                  >
                    Resend Verification Email
                  </button>
                </div>
              )}
            </div>
          )}

          {message && !isRegister && !forgotMode && !resetMode && (
            <div style={{
              padding: '12px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #DCFCE7',
              borderRadius: 'var(--radius-sm)',
              color: '#166534',
              fontSize: '13px',
              marginBottom: '20px'
            }}>
              {message}
            </div>
          )}

          {/* MODE 1: Reset Password Page */}
          {resetMode ? (
            <form onSubmit={handleResetPassword} autoComplete="off">
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Create New Password</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Please set a secure password meeting NMIMS security requirements.
              </p>
              
              <div style={{ marginBottom: '14px' }}>
                <label>New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="reset_new_password"
                  name="reset_new_password"
                  placeholder="Enter strong password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                
                {/* Password strength breakdown */}
                <div style={{ marginTop: '8px', fontSize: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  <span style={{ color: resetPwdStatus.hasMinLen ? '#166534' : 'var(--text-muted)' }}>
                    {resetPwdStatus.hasMinLen ? '✓' : '○'} Min 8 chars
                  </span>
                  <span style={{ color: resetPwdStatus.hasUpper ? '#166534' : 'var(--text-muted)' }}>
                    {resetPwdStatus.hasUpper ? '✓' : '○'} 1 Uppercase
                  </span>
                  <span style={{ color: resetPwdStatus.hasLower ? '#166534' : 'var(--text-muted)' }}>
                    {resetPwdStatus.hasLower ? '✓' : '○'} 1 Lowercase
                  </span>
                  <span style={{ color: resetPwdStatus.hasDigit ? '#166534' : 'var(--text-muted)' }}>
                    {resetPwdStatus.hasDigit ? '✓' : '○'} 1 Number
                  </span>
                  <span style={{ color: resetPwdStatus.hasSpecial ? '#166534' : 'var(--text-muted)' }}>
                    {resetPwdStatus.hasSpecial ? '✓' : '○'} 1 Special char
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label>Confirm New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="reset_confirm_password"
                  name="reset_confirm_password"
                  placeholder="Repeat new password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  id="toggle_show_pwd_reset"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <label htmlFor="toggle_show_pwd_reset" style={{ cursor: 'pointer', margin: 0 }}>Show password</label>
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '12px' }} disabled={loading}>
                {loading ? 'Updating password...' : 'Update Password'}
              </button>
              <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={() => { setResetMode(false); window.location.hash = ''; }}>
                Back to login
              </button>
            </form>
          ) : forgotMode ? (
            /* MODE 2: Forgot Password Form */
            <form onSubmit={handleForgotPassword} autoComplete="off">
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Reset Your Password</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Enter your registered NMIMS email address. A password reset link valid for 30 minutes will be sent to your inbox.
              </p>
              
              <div style={{ marginBottom: '16px' }}>
                <label>Registered Gmail Address</label>
                <input
                  type="email"
                  id="forgot_email"
                  name="forgot_email"
                  placeholder="Enter your registered Gmail address"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '12px' }} disabled={loading}>
                {loading ? 'Sending link...' : 'Send reset link'}
              </button>
              <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={() => { setForgotMode(false); setError(''); }}>
                Back to login
              </button>
            </form>
          ) : completeProfileMode ? (
            /* MODE: Complete Profile Form for authenticated users with missing profile (Requirement 3) */
            <form onSubmit={handleCompleteProfile} autoComplete="off">
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>
                Complete Your Profile
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Authenticated as <strong>{completeProfileData?.email}</strong>. Please provide your profile details to finalize your account.
              </p>

              {/* Role selector */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ marginBottom: '6px', display: 'block', fontSize: '13px' }}>Select your account role</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { id: 'student', label: 'Student' },
                    { id: 'faculty', label: 'Faculty' },
                    { id: 'mentor', label: 'Mentor' }
                  ].map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setCompleteProfileRole(r.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${completeProfileRole === r.id ? 'var(--accent)' : 'var(--border)'}`,
                        backgroundColor: completeProfileRole === r.id ? 'var(--accent-tint)' : '#FFFFFF',
                        color: completeProfileRole === r.id ? 'var(--accent)' : 'var(--text-main)',
                        fontWeight: completeProfileRole === r.id ? '600' : '500',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Full Name */}
              <div style={{ marginBottom: '12px' }}>
                <label>Full Name *</label>
                <input
                  type="text"
                  id="complete_fullname"
                  name="complete_fullname"
                  placeholder="e.g. Bhavya Sree"
                  value={completeProfileForm.fullName}
                  onChange={(e) => setCompleteProfileForm(prev => ({ ...prev, fullName: e.target.value }))}
                  required
                />
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Letters and spaces only (min 2 characters)
                </div>
              </div>

              {completeProfileRole === 'student' ? (
                <>
                  {/* SAP ID */}
                  <div style={{ marginBottom: '12px' }}>
                    <label>SAP ID (11 digits, starts with 7) *</label>
                    <input
                      type="text"
                      id="complete_sap_id"
                      name="complete_sap_id"
                      maxLength={11}
                      placeholder="70572400072"
                      value={completeProfileForm.sapId}
                      onChange={(e) => setCompleteProfileForm(prev => ({ ...prev, sapId: e.target.value.replace(/\D/g, '') }))}
                      required
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Must be exactly 11 numeric digits starting with 7
                    </div>
                  </div>

                  {/* School Dropdown */}
                  <div style={{ marginBottom: '12px' }}>
                    <label>School *</label>
                    <select
                      id="complete_school"
                      value={completeProfileForm.schoolId}
                      onChange={(e) => setCompleteProfileForm(prev => ({ ...prev, schoolId: e.target.value }))}
                      required
                    >
                      <option value="" disabled>Select school…</option>
                      {master.schools && master.schools.length > 0 ? (
                        master.schools
                          .filter(s => ['STME', 'SOL', 'SPTM', 'SBM', 'SOC'].includes((s.code || '').toUpperCase()))
                          .map(s => (
                            <option key={s.id} value={s.id}>{s.code} – {s.name.replace(/\s*\([^)]*\)$/, '')}</option>
                          ))
                      ) : (
                        <>
                          <option value="sch-stme">STME – School of Technology Management and Engineering</option>
                          <option value="sch-sol">SOL – School of Law</option>
                          <option value="sch-sptm">SPTM – School of Pharmacy & Technology Management</option>
                          <option value="sch-sbm">SBM – School of Business Management</option>
                          <option value="sch-soc">SOC – School of Commerce</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Program Dropdown */}
                  <div style={{ marginBottom: '12px' }}>
                    <label>Program / Branch *</label>
                    <select
                      id="complete_program"
                      value={completeProfileForm.programId}
                      onChange={(e) => setCompleteProfileForm(prev => ({ ...prev, programId: e.target.value }))}
                      required
                    >
                      <option value="" disabled>Select program / branch…</option>
                      {master.programs && master.programs.length > 0 ? (
                        master.programs
                          .filter(p => !completeProfileForm.schoolId || p.school_id === completeProfileForm.schoolId)
                          .map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                          ))
                      ) : (
                        <>
                          <option value="prog-csds">B.Tech Computer Science & Data Science (CSDS)</option>
                          <option value="prog-aiml">B.Tech Artificial Intelligence & Machine Learning</option>
                          <option value="prog-cse">B.Tech Computer Engineering</option>
                          <option value="prog-it">B.Tech Information Technology</option>
                          <option value="prog-mba-tech">MBA Tech Computer Science</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Year & Semester */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <label>Academic Year *</label>
                      <select
                        id="complete_year"
                        value={completeProfileForm.year}
                        onChange={(e) => setCompleteProfileForm(prev => ({ ...prev, year: e.target.value }))}
                        required
                      >
                        <option value="" disabled>Select year…</option>
                        <option value={1}>1st Year</option>
                        <option value={2}>2nd Year</option>
                        <option value={3}>3rd Year</option>
                        <option value={4}>4th Year</option>
                      </select>
                    </div>
                    <div>
                      <label>Semester *</label>
                      <select
                        id="complete_semester"
                        value={completeProfileForm.semester}
                        onChange={(e) => setCompleteProfileForm(prev => ({ ...prev, semester: e.target.value }))}
                        required
                      >
                        <option value="" disabled>Select semester…</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                          <option key={s} value={s}>Semester {s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Department */}
                  <div style={{ marginBottom: '14px' }}>
                    <label>Department *</label>
                    <input
                      type="text"
                      id="complete_department"
                      name="complete_department"
                      placeholder="e.g. Computer Science & Engineering"
                      value={completeProfileForm.department}
                      onChange={(e) => setCompleteProfileForm(prev => ({ ...prev, department: e.target.value }))}
                      required
                    />
                  </div>

                  {/* Designation */}
                  <div style={{ marginBottom: '20px' }}>
                    <label>Designation *</label>
                    <input
                      type="text"
                      id="complete_designation"
                      name="complete_designation"
                      placeholder={completeProfileRole === 'mentor' ? 'e.g. Senior Technical Mentor / Guide' : 'e.g. Assistant Professor'}
                      value={completeProfileForm.designation}
                      onChange={(e) => setCompleteProfileForm(prev => ({ ...prev, designation: e.target.value }))}
                      required
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setCompleteProfileMode(false); setError(''); }}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={loading}>
                  {loading ? 'Saving Profile...' : 'Save Profile & Continue'}
                </button>
              </div>
            </form>
          ) : !isRegister ? (
            /* MODE 3: Login Form with Role-Aware Email Placeholder (Issue 10) */
            <form onSubmit={handleLogin} autoComplete="off">
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '6px' }}>Sign in to your account</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Select your role to adapt login parameters.
              </p>

              {/* Role Toggle for Login Placeholder Awareness */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '18px' }}>
                {[
                  { id: 'student', label: 'Student' },
                  { id: 'faculty', label: 'Faculty' },
                  { id: 'mentor', label: 'Mentor' }
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setLoginRole(r.id);
                      setMessage('');
                      setError('');
                    }}
                    style={{
                      padding: '7px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${loginRole === r.id ? 'var(--accent)' : 'var(--border)'}`,
                      backgroundColor: loginRole === r.id ? 'var(--accent-tint)' : '#FFFFFF',
                      color: loginRole === r.id ? 'var(--accent)' : 'var(--text-main)',
                      fontWeight: loginRole === r.id ? '600' : '500',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label>{loginRole.charAt(0).toUpperCase() + loginRole.slice(1)} Gmail Address</label>
                <input
                  type="email"
                  id={`login_email_${loginRole}`}
                  name={`login_email_${loginRole}`}
                  autoComplete="off"
                  placeholder={getLoginPlaceholder()}
                  value={currentLoginEmail}
                  onChange={(e) => updateLoginForm('email', e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label>{loginRole.charAt(0).toUpperCase() + loginRole.slice(1)} Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id={`login_password_${loginRole}`}
                  name={`login_password_${loginRole}`}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={currentLoginPassword}
                  onChange={(e) => updateLoginForm('password', e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    id="login_show_pwd"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Show password
                </label>
                <a
                  href="#forgot"
                  onClick={(e) => { e.preventDefault(); setForgotMode(true); setMessage(''); setError(''); }}
                  style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}
                >
                  Forgot password?
                </a>
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '20px' }} disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                New to Peer Buddy?{' '}
                <a
                  href="#register"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsRegister(true);
                    setStep(1);
                    setError('');
                    setMessage('');
                  }}
                  style={{ fontWeight: '600', color: 'var(--accent)', textDecoration: 'none' }}
                >
                  Create an account
                </a>
              </div>
            </form>
          ) : (
            /* MODE 4: Registration Form (Isolated States per Role & Placeholders) */
            <form onSubmit={handleRegister} autoComplete="off">
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>
                Register as {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Step {step} of 2: {step === 1 ? 'Personal & login details' : selectedRole === 'student' ? 'Academic details & mentor' : 'Department & designation'}
              </p>

              {/* Role Selection Tabs with Form State Isolation (Issue 7) */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ marginBottom: '6px', display: 'block', fontSize: '13px' }}>I am registering as</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { id: 'student', label: 'Student' },
                    { id: 'faculty', label: 'Faculty' },
                    { id: 'mentor', label: 'Mentor' }
                  ].map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleRoleSwitch(r.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${selectedRole === r.id ? 'var(--accent)' : 'var(--border)'}`,
                        backgroundColor: selectedRole === r.id ? 'var(--accent-tint)' : '#FFFFFF',
                        color: selectedRole === r.id ? 'var(--accent)' : 'var(--text-main)',
                        fontWeight: selectedRole === r.id ? '600' : '500',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {step === 1 ? (
                <>
                  {/* Name: letters and spaces only, min 2 chars (Issue 6) */}
                  <div style={{ marginBottom: '12px' }}>
                    <label>Full Name *</label>
                    <input
                      type="text"
                      id={`${selectedRole}_fullname`}
                      name={`${selectedRole}_fullname`}
                      autoComplete="off"
                      placeholder="e.g. Bhavya Sree"
                      value={currentForm.fullName}
                      onChange={(e) => updateActiveForm('fullName', e.target.value)}
                      required
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Letters and spaces only (min 2 characters)
                    </div>
                  </div>

                  {/* SAP ID: Student only, 11 digits starting with 7 (Issue 4 & 7) */}
                  {selectedRole === 'student' && (
                    <div style={{ marginBottom: '12px' }}>
                      <label>SAP ID (11 digits, starts with 7) *</label>
                      <input
                        type="text"
                        id="student_sap_id"
                        name="student_sap_id"
                        autoComplete="off"
                        maxLength={11}
                        placeholder="70572400072"
                        value={studentForm.sapId}
                        onChange={(e) => updateActiveForm('sapId', e.target.value.replace(/\D/g, ''))}
                        required
                      />
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Must be exactly 11 numeric digits starting with 7
                      </div>
                    </div>
                  )}

                  {/* Email: Strictly Gmail address for Student, Faculty, and Mentor */}
                  <div style={{ marginBottom: '12px' }}>
                    <label>Gmail Address *</label>
                    <input
                      type="email"
                      id={`${selectedRole}_email`}
                      name={`${selectedRole}_email`}
                      autoComplete="off"
                      placeholder="Enter your Gmail address (example@gmail.com)"
                      value={currentForm.email}
                      onChange={(e) => updateActiveForm('email', e.target.value)}
                      required
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Must be a valid Gmail address ending with @gmail.com
                    </div>
                  </div>

                  {/* Password with live strength indicator (Issue 6) */}
                  <div style={{ marginBottom: '12px' }}>
                    <label>Password *</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id={`${selectedRole}_password`}
                      name={`${selectedRole}_password`}
                      autoComplete="new-password"
                      placeholder="Create a strong password"
                      value={currentForm.password}
                      onChange={(e) => updateActiveForm('password', e.target.value)}
                      required
                    />
                    
                    {/* Live Criteria Breakdown */}
                    <div style={{ marginTop: '6px', fontSize: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px' }}>
                      <span style={{ color: regPwdStatus.hasMinLen ? '#166534' : 'var(--text-muted)' }}>
                        {regPwdStatus.hasMinLen ? '✓' : '○'} Min 8 chars
                      </span>
                      <span style={{ color: regPwdStatus.hasUpper ? '#166534' : 'var(--text-muted)' }}>
                        {regPwdStatus.hasUpper ? '✓' : '○'} 1 Uppercase
                      </span>
                      <span style={{ color: regPwdStatus.hasLower ? '#166534' : 'var(--text-muted)' }}>
                        {regPwdStatus.hasLower ? '✓' : '○'} 1 Lowercase
                      </span>
                      <span style={{ color: regPwdStatus.hasDigit ? '#166534' : 'var(--text-muted)' }}>
                        {regPwdStatus.hasDigit ? '✓' : '○'} 1 Number
                      </span>
                      <span style={{ color: regPwdStatus.hasSpecial ? '#166534' : 'var(--text-muted)' }}>
                        {regPwdStatus.hasSpecial ? '✓' : '○'} 1 Special char
                      </span>
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label>Confirm Password *</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id={`${selectedRole}_confirm_password`}
                      name={`${selectedRole}_confirm_password`}
                      autoComplete="new-password"
                      placeholder="Repeat your password"
                      value={currentForm.confirmPassword}
                      onChange={(e) => updateActiveForm('confirmPassword', e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '12px' }}>
                    Continue to step 2
                  </button>
                </>
              ) : (
                /* Step 2: Academic or Department details with disabled, selected placeholders (Issues 2 & 8) */
                <>
                  {selectedRole === 'student' ? (
                    <>
                      {/* School Dropdown with Disabled Placeholder */}
                      <div style={{ marginBottom: '12px' }}>
                        <label>School *</label>
                        <select
                          id="student_school"
                          value={studentForm.schoolId}
                          onChange={(e) => updateActiveForm('schoolId', e.target.value)}
                          required
                        >
                          <option value="" disabled>Select school…</option>
                          {master.schools && master.schools.length > 0 ? (
                            master.schools
                              .filter(s => ['STME', 'SOL', 'SPTM', 'SBM', 'SOC'].includes((s.code || '').toUpperCase()))
                              .map(s => (
                                <option key={s.id} value={s.id}>{s.code} – {s.name.replace(/\s*\([^)]*\)$/, '')}</option>
                              ))
                          ) : (
                            <>
                              <option value="sch-stme">STME – School of Technology Management and Engineering</option>
                              <option value="sch-sol">SOL – School of Law</option>
                              <option value="sch-sptm">SPTM – School of Pharmacy & Technology Management</option>
                              <option value="sch-sbm">SBM – School of Business Management</option>
                              <option value="sch-soc">SOC – School of Commerce</option>
                            </>
                          )}
                        </select>
                      </div>

                      {/* Program Dropdown with Disabled Placeholder */}
                      <div style={{ marginBottom: '12px' }}>
                        <label>Program / Branch *</label>
                        <select
                          id="student_program"
                          value={studentForm.programId}
                          onChange={(e) => updateActiveForm('programId', e.target.value)}
                          required
                        >
                          <option value="" disabled>Select program / branch…</option>
                          {master.programs && master.programs.length > 0 ? (
                            master.programs
                              .filter(p => !studentForm.schoolId || p.school_id === studentForm.schoolId)
                              .map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                              ))
                          ) : (
                            <>
                              <option value="prog-csds">B.Tech Computer Science & Data Science (CSDS)</option>
                              <option value="prog-aiml">B.Tech Artificial Intelligence & Machine Learning</option>
                              <option value="prog-cse">B.Tech Computer Engineering</option>
                              <option value="prog-it">B.Tech Information Technology</option>
                              <option value="prog-mba-tech">MBA Tech Computer Science</option>
                            </>
                          )}
                        </select>
                      </div>

                      {/* Year & Semester with Disabled Placeholders */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                        <div>
                          <label>Academic Year *</label>
                          <select
                            id="student_year"
                            value={studentForm.year}
                            onChange={(e) => updateActiveForm('year', e.target.value)}
                            required
                          >
                            <option value="" disabled>Select year…</option>
                            <option value={1}>1st Year</option>
                            <option value={2}>2nd Year</option>
                            <option value={3}>3rd Year</option>
                            <option value={4}>4th Year</option>
                          </select>
                        </div>
                        <div>
                          <label>Semester *</label>
                          <select
                            id="student_semester"
                            value={studentForm.semester}
                            onChange={(e) => updateActiveForm('semester', e.target.value)}
                            required
                          >
                            <option value="" disabled>Select semester…</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                              <option key={s} value={s}>Semester {s}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Mentor Selection with Disabled Placeholder */}
                      <div style={{ marginBottom: '20px' }}>
                        <label>Select Mentor to Connect With *</label>
                        <select
                          id="student_mentor"
                          value={studentForm.mentorId}
                          onChange={(e) => updateActiveForm('mentorId', e.target.value)}
                          required
                        >
                          <option value="" disabled>Select mentor…</option>
                          {master.mentors && master.mentors.length > 0 ? (
                            master.mentors.map(m => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.full_name} {m.department ? `(${m.department})` : ''}
                              </option>
                            ))
                          ) : (
                            <option value="usr-mentor-1">Dr. Rajesh Deshmukh (Computer Engineering & Data Science)</option>
                          )}
                        </select>
                      </div>
                    </>
                  ) : (
                    /* Faculty / Mentor Department & Designation */
                    <>
                      <div style={{ marginBottom: '14px' }}>
                        <label>Department *</label>
                        <input
                          type="text"
                          id={`${selectedRole}_department`}
                          name={`${selectedRole}_department`}
                          autoComplete="off"
                          placeholder="e.g. Computer Science & Engineering"
                          value={currentForm.department}
                          onChange={(e) => updateActiveForm('department', e.target.value)}
                          required
                        />
                      </div>

                      <div style={{ marginBottom: '20px' }}>
                        <label>Designation *</label>
                        <input
                          type="text"
                          id={`${selectedRole}_designation`}
                          name={`${selectedRole}_designation`}
                          autoComplete="off"
                          placeholder={selectedRole === 'mentor' ? 'e.g. Senior Technical Mentor / Guide' : 'e.g. Assistant Professor'}
                          value={currentForm.designation}
                          onChange={(e) => updateActiveForm('designation', e.target.value)}
                          required
                        />
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <button type="button" className="btn-secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>
                      Back
                    </button>
                    <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={loading}>
                      {loading ? 'Submitting...' : 'Complete registration'}
                    </button>
                  </div>
                </>
              )}

              <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                Already registered?{' '}
                <a
                  href="#login"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsRegister(false);
                    setStep(1);
                    setError('');
                  }}
                  style={{ fontWeight: '600', color: 'var(--accent)', textDecoration: 'none' }}
                >
                  Sign in
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
